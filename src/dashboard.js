// ==========================================
// TABLEAU DE BORD CUMULE — TOUS PROJETS, AVEC TRIAGE
// ==========================================
// Remplace l'ancien couple « Tableau de bord » / « Analytics », dont aucun
// des deux n'etait cumulatif : le premier lisait `state.myTasks` (les taches
// assignees a l'utilisateur, donc sa to-do list personnelle presentee comme
// une vision d'entreprise), le second `state.tasks` (le projet couramment
// ouvert, uniquement). Les deux repetaient les memes cartes.
//
// Ici, une seule source : TOUTES les taches de TOUS les projets dont
// l'utilisateur est membre, chargees une fois, gardees en memoire, et
// re-filtrees a chaque interaction sans nouvel acces reseau. Filtrer sur un
// projet unique redonne exactement l'ancienne vue Analytics.
//
// La logique de filtrage, de tri et de calcul vit dans core/triage.js — sans
// DOM ni Firestore, donc testable. Ce fichier ne fait que la chercher, la
// brancher a l'interface, et l'afficher.

import { getDocs, getDoc, collection, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $ } from './core/dom.js';
import { esc, toast, formatDeadline, getDueStatus } from './core/utils.js';
import { icone } from './core/icones.js';
import { couleurSure, couleurTexteTag } from './core/couleurs.js';
import { filtreAppartenance } from './core/requetes.js';
import { ROLE_LABELS, getRole } from './core/roles.js';
import { gamification } from './productivity.js';
import { openTaskModal } from './tasks.js';
import { selectProject } from './projects.js';
import { switchView } from './views.js';
import {
    CHAMPS_DATE, PERIODES, STATUTS, PRIORITES, TRIS, VUES_RAPIDES,
    TRIAGE_PAR_DEFAUT, normaliserTriage, triageEstVierge, nombreDeFiltresActifs,
    filtrerTaches, trierTaches, calculerIndicateurs, repartir,
    chargeParPersonne, avancementParProjet, calculerTemps, formatDureeLongue,
    statutDe, prioriteDe
} from './core/triage.js';

// ------------------------------------------------------------------
// Etat du module
// ------------------------------------------------------------------

const CLE_TRIAGE = 'corviospace-dashboard-triage';
const TTL_CACHE = 60_000;
const PAR_PAGE = 25;

let _cache = null;          // { taches, profils, cleProjets, horodatage }
let _triage = null;
let _pageTaille = PAR_PAGE;
let _chargement = null;     // promesse en cours, pour ne pas charger deux fois
let _minuteurRecherche = null;

/** Lecture defensive du triage sauvegarde. Une valeur illisible ne doit pas
 *  empecher le tableau de bord de s'ouvrir : l'utilisateur n'aurait aucun
 *  moyen de la corriger depuis l'interface. */
function lireTriage() {
    if (_triage) return _triage;
    let brut = null;
    try {
        brut = JSON.parse(localStorage.getItem(CLE_TRIAGE) || 'null');
    } catch { brut = null; }
    _triage = normaliserTriage(brut);
    return _triage;
}

function ecrireTriage() {
    try {
        localStorage.setItem(CLE_TRIAGE, JSON.stringify(_triage));
    } catch { /* quota plein ou stockage refuse : le triage vit alors le temps de la session */ }
}

// ------------------------------------------------------------------
// Chargement des donnees
// ------------------------------------------------------------------

/**
 * Charge toutes les taches de tous les projets, plus le profil des personnes
 * assignees, et decore chaque tache de `_nomProjet` / `_nomAssigne` pour que
 * le tri et l'affichage n'aient plus a faire de recherche croisee.
 *
 * Une requete par projet, sur `projectId` seul : c'est un champ unique, donc
 * aucun index composite n'est requis, et cela ramene aussi les taches
 * archivees — indispensable des qu'on veut un taux d'achevement ou une
 * periode retrospective, que l'ancienne requete (`archived == false`)
 * rendait structurellement impossibles a calculer.
 */
async function chargerDonnees({ force = false } = {}) {
    const cleProjets = state.projects.map(p => p.id).sort().join(',');

    if (!force && _cache
        && _cache.cleProjets === cleProjets
        && (Date.now() - _cache.horodatage) < TTL_CACHE) {
        return _cache;
    }

    // Deux rendus rapprochés (ouverture de la vue puis changement de filtre)
    // ne doivent pas declencher deux vagues de requetes.
    if (_chargement) return _chargement;

    _chargement = (async () => {
        const snaps = await Promise.all(
            state.projects.map(p =>
                getDocs(query(
                    collection(db, 'tasks'),
                    ...filtreAppartenance(state.currentUser?.uid),
                    where('projectId', '==', p.id),
                )).catch(() => null)
            )
        );

        const taches = [];
        let projetsEnEchec = 0;
        snaps.forEach((snap, i) => {
            if (!snap) { projetsEnEchec++; return; }
            snap.docs.forEach(d => taches.push({ id: d.id, ...d.data() }));
        });

        const uids = [...new Set(taches.map(t => t.assigneeId).filter(Boolean))];
        const profils = {};
        await Promise.all(uids.map(async uid => {
            try {
                const snap = await getDoc(doc(db, 'users', uid));
                if (snap.exists()) profils[uid] = snap.data();
            } catch { /* un profil illisible ne doit pas faire tomber la vue */ }
        }));

        const nomsProjets = new Map(state.projects.map(p => [p.id, p.name || 'Projet']));
        taches.forEach(t => {
            t._nomProjet = nomsProjets.get(t.projectId) || 'Projet inconnu';
            t._nomAssigne = t.assigneeId
                ? (profils[t.assigneeId]?.displayName || profils[t.assigneeId]?.email || 'Utilisateur')
                : '';
        });

        _cache = { taches, profils, cleProjets, horodatage: Date.now(), projetsEnEchec };
        return _cache;
    })();

    try {
        return await _chargement;
    } finally {
        _chargement = null;
    }
}

/** Vide le cache — appele quand une tache change ailleurs dans l'app. */
export function invaliderCacheDashboard() {
    _cache = null;
}

/**
 * Applique une vue rapide (« retard », « sansAssigne »…) puis laisse
 * l'appelant afficher le tableau de bord. Utilise par l'assistant : sans ce
 * point d'entree, ecrire dans localStorage ne suffirait pas — `_triage` est
 * mis en cache au premier `lireTriage()` et n'aurait pas ete relu. On mute donc
 * l'etat en memoire ET on le persiste, pour que l'ouverture reflete vraiment le
 * filtre demande au lieu d'ouvrir une vue sans rapport avec ce qui a ete
 * annonce.
 * @param {string|null} rapide  cle de VUES_RAPIDES, ou null pour tout effacer
 */
export function appliquerVueRapide(rapide) {
    const t = lireTriage();
    t.rapide = (rapide && VUES_RAPIDES[rapide]) ? rapide : null;
    ecrireTriage();
}

// ------------------------------------------------------------------
// Entree principale
// ------------------------------------------------------------------

export async function renderDashboard() {
    const conteneur = $('dashboard-container');
    if (!conteneur) return;

    if (!state.projects.length) {
        conteneur.innerHTML = enTete(0) + `
            <div class="empty-section">
                ${icone('dossier', { taille: 28 })}
                <p>Aucun projet pour le moment.</p>
                <p class="empty-section-aide">Le tableau de bord rassemble les tâches de tous vos projets. Créez un premier projet depuis la barre latérale pour le voir se remplir.</p>
            </div>`;
        brancherEnTete(conteneur);
        return;
    }

    // Squelette pendant le chargement : un conteneur vide se lit « il n'y a
    // rien » alors qu'il faut lire « ça charge ».
    conteneur.innerHTML = enTete(state.projects.length) + `
        <div class="dash-chargement" aria-busy="true">
            <div class="skeleton skeleton-line" style="width:38%"></div>
            <div class="skeleton skeleton-card" style="height:96px"></div>
            <div class="skeleton skeleton-card" style="height:220px"></div>
        </div>`;
    brancherEnTete(conteneur);

    let donnees;
    try {
        donnees = await chargerDonnees();
    } catch {
        if (state.currentView !== 'dashboard') return;
        conteneur.innerHTML = enTete(state.projects.length) + `
            <div class="empty-section">
                ${icone('alerte', { taille: 28 })}
                <p>Les tâches n'ont pas pu être chargées.</p>
                <p class="empty-section-aide">Vérifiez votre connexion, puis utilisez le bouton Actualiser ci-dessus.</p>
            </div>`;
        brancherEnTete(conteneur);
        return;
    }

    // L'utilisateur a pu changer de vue pendant la requete : ne pas ecrire
    // dans un conteneur que plus personne ne regarde.
    if (state.currentView !== 'dashboard') return;

    construireVue(conteneur, donnees);
}

// ------------------------------------------------------------------
// En-tete
// ------------------------------------------------------------------

function enTete(nbProjets) {
    // Heure du releve. Les taches sont gardees en memoire 60 secondes, et rien
    // ne nous previent quand un collegue ecrit sur un projet que nous ne
    // regardons pas : afficher l'heure des donnees vaut mieux que laisser
    // croire a du temps reel. C'est ce que font les outils de pilotage serieux.
    const heure = _cache
        ? new Date(_cache.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : null;

    return `
        <div class="section-cards-header">
            <div class="dash-titre">
                <h2>Tableau de bord</h2>
                <span class="count-badge">${nbProjets} projet${nbProjets > 1 ? 's' : ''}</span>
            </div>
            <div class="dash-actions">
                ${heure ? `<span class="dash-fraicheur">Données de ${esc(heure)}</span>` : ''}
                <button type="button" class="btn-text" id="dash-refresh">
                    ${icone('reprise', { taille: 16 })} Actualiser
                </button>
                <button type="button" class="btn-text" id="dash-close" title="Revenir au tableau du projet">
                    ${icone('flecheGauche', { taille: 16 })} Quitter
                </button>
            </div>
        </div>`;
}

function brancherEnTete(conteneur) {
    conteneur.querySelector('#dash-close')?.addEventListener('click', () => switchView('board'));
    conteneur.querySelector('#dash-refresh')?.addEventListener('click', async () => {
        _cache = null;
        toast('Actualisation du tableau de bord…', 'info');
        await renderDashboard();
    });
}

// ------------------------------------------------------------------
// Construction de la vue
// ------------------------------------------------------------------

function construireVue(conteneur, donnees) {
    const t = lireTriage();

    conteneur.innerHTML = enTete(state.projects.length)
        + barreDeTriage(t, donnees)
        + '<div id="dash-resultats"></div>';

    brancherEnTete(conteneur);
    brancherBarre(conteneur, donnees);
    rendreResultats(donnees);
}

// ---------- Barre de triage ----------

function barreDeTriage(t, donnees) {
    const personnes = personnesConnues(donnees);
    const nbFiltres = nombreDeFiltresActifs(t);
    const avanceOuvert = nbFiltres > 0 && !t.rapide;

    const optionsPeriode = () => {
        const groupes = new Map();
        for (const [cle, def] of Object.entries(PERIODES)) {
            const g = def.groupe || '';
            if (!groupes.has(g)) groupes.set(g, []);
            groupes.get(g).push(
                `<option value="${cle}"${t.periode === cle ? ' selected' : ''}>${esc(def.libelle)}</option>`
            );
        }
        return [...groupes.entries()].map(([g, opts]) =>
            g ? `<optgroup label="${esc(g)}">${opts.join('')}</optgroup>` : opts.join('')
        ).join('');
    };

    const puces = (nom, entrees, selection) => entrees.map(([valeur, libelle, couleur]) => {
        const actif = selection.includes(valeur);
        const pastille = couleur
            ? `<span class="puce-pastille" style="background:${couleurSure(couleur)}"></span>`
            : '';
        return `<button type="button" class="triage-puce${actif ? ' active' : ''}"
                    data-groupe="${nom}" data-valeur="${esc(valeur)}"
                    aria-pressed="${actif ? 'true' : 'false'}">${pastille}${esc(libelle)}</button>`;
    }).join('');

    return `
    <section class="triage" aria-label="Triage des tâches">
        <div class="triage-rapides" role="group" aria-label="Vues rapides">
            <button type="button" class="triage-rapide${!t.rapide ? ' active' : ''}"
                    data-rapide="" aria-pressed="${!t.rapide ? 'true' : 'false'}">
                ${icone('liste', { taille: 15 })} Tout
            </button>
            ${Object.entries(VUES_RAPIDES).map(([cle, def]) => `
                <button type="button" class="triage-rapide${t.rapide === cle ? ' active' : ''}"
                        data-rapide="${cle}" aria-pressed="${t.rapide === cle ? 'true' : 'false'}">
                    ${icone(def.icone, { taille: 15 })} ${esc(def.libelle)}
                </button>`).join('')}
        </div>

        <div class="triage-principale">
            <div class="triage-champ triage-champ--recherche">
                <label for="dash-recherche">Rechercher</label>
                <div class="triage-recherche-boite">
                    ${icone('recherche', { taille: 15 })}
                    <input type="search" id="dash-recherche" value="${esc(t.recherche)}"
                           placeholder="Titre ou description" autocomplete="off">
                </div>
            </div>

            <div class="triage-champ">
                <label for="dash-periode">Période</label>
                <select id="dash-periode">${optionsPeriode()}</select>
            </div>

            <div class="triage-champ">
                <label for="dash-champ-date">Dates portant sur</label>
                <select id="dash-champ-date">
                    ${Object.entries(CHAMPS_DATE).map(([cle, def]) =>
                        `<option value="${cle}"${t.champDate === cle ? ' selected' : ''}>${esc(def.libelle)}</option>`
                    ).join('')}
                </select>
            </div>

            <div class="triage-champ triage-champ--perso${t.periode === 'perso' ? '' : ' hidden'}" id="dash-perso">
                <label for="dash-du">Du</label>
                <input type="date" id="dash-du" value="${esc(t.perso.du)}">
                <label for="dash-au">au</label>
                <input type="date" id="dash-au" value="${esc(t.perso.au)}">
            </div>

            <div class="triage-champ triage-champ--tri">
                <label for="dash-tri">Trier par</label>
                <div class="triage-tri-boite">
                    <select id="dash-tri">
                        ${Object.entries(TRIS).map(([cle, libelle]) =>
                            `<option value="${cle}"${t.tri === cle ? ' selected' : ''}>${esc(libelle)}</option>`
                        ).join('')}
                    </select>
                    <button type="button" class="btn-icon triage-ordre" id="dash-ordre"
                            aria-label="${t.ordre === 'asc' ? 'Ordre croissant, cliquer pour inverser' : 'Ordre décroissant, cliquer pour inverser'}"
                            title="${t.ordre === 'asc' ? 'Croissant' : 'Décroissant'}">
                        ${icone(t.ordre === 'asc' ? 'flecheDroite' : 'flecheGauche', { taille: 16 })}
                        <span class="triage-ordre-texte">${t.ordre === 'asc' ? 'Croissant' : 'Décroissant'}</span>
                    </button>
                </div>
            </div>

            <div class="triage-champ triage-champ--perimetre">
                <span class="triage-legende" id="dash-perimetre-legende">Périmètre</span>
                <div class="triage-segmente" role="group" aria-labelledby="dash-perimetre-legende">
                    <button type="button" data-perimetre="equipe" class="${t.perimetre === 'equipe' ? 'active' : ''}"
                            aria-pressed="${t.perimetre === 'equipe' ? 'true' : 'false'}">Toute l'équipe</button>
                    <button type="button" data-perimetre="moi" class="${t.perimetre === 'moi' ? 'active' : ''}"
                            aria-pressed="${t.perimetre === 'moi' ? 'true' : 'false'}">Mes tâches</button>
                </div>
            </div>

            <div class="triage-boutons">
                <button type="button" class="btn-secondary" id="dash-plus-filtres"
                        aria-expanded="${avanceOuvert ? 'true' : 'false'}" aria-controls="dash-avance">
                    ${icone('reglages', { taille: 15 })} Filtres${nbFiltres ? ` <span class="triage-compteur">${nbFiltres}</span>` : ''}
                </button>
                <button type="button" class="btn-text" id="dash-reset"${triageEstVierge(t) ? ' hidden' : ''}>
                    ${icone('croix', { taille: 14 })} Tout effacer
                </button>
            </div>
        </div>

        <div class="triage-avance" id="dash-avance"${avanceOuvert ? '' : ' hidden'}>
            <div class="triage-groupe">
                <span class="triage-legende" id="lg-projets">Projets</span>
                <div class="triage-puces" role="group" aria-labelledby="lg-projets">
                    ${puces('projets', state.projects.map(p => [p.id, p.name || 'Projet', p.color]), t.projets)
                      || '<span class="triage-vide">Aucun projet</span>'}
                </div>
            </div>

            <div class="triage-groupe">
                <span class="triage-legende" id="lg-assignes">Personne assignée</span>
                <div class="triage-puces" role="group" aria-labelledby="lg-assignes">
                    ${puces('assignes', personnes, t.assignes)
                      || '<span class="triage-vide">Aucune tâche assignée</span>'}
                </div>
            </div>

            <div class="triage-groupe">
                <span class="triage-legende" id="lg-statuts">Statut</span>
                <div class="triage-puces" role="group" aria-labelledby="lg-statuts">
                    ${puces('statuts', Object.entries(STATUTS).map(([c, d]) => [c, d.libelle]), t.statuts)}
                </div>
            </div>

            <div class="triage-groupe">
                <span class="triage-legende" id="lg-priorites">Priorité</span>
                <div class="triage-puces" role="group" aria-labelledby="lg-priorites">
                    ${puces('priorites', Object.entries(PRIORITES).map(([c, d]) => [c, d.libelle]), t.priorites)}
                </div>
            </div>

            <div class="triage-groupe">
                <label class="triage-bascule">
                    <input type="checkbox" id="dash-archivees"${t.avecArchivees ? ' checked' : ''}>
                    <span>Inclure les tâches archivées</span>
                </label>
            </div>
        </div>

        <p class="triage-resume" id="dash-resume" role="status" aria-live="polite"></p>
    </section>`;
}

/** Les personnes reellement presentes dans les donnees, plus l'entree
 *  « Non assignée » si des taches n'ont personne dessus. On ne propose pas de
 *  filtrer sur quelqu'un qui n'a aucune tache : un filtre qui ne peut rendre
 *  que zero resultat n'a pas sa place dans la liste. */
function personnesConnues(donnees) {
    const vues = new Map();
    let sansPersonne = false;
    for (const t of donnees.taches) {
        if (!t.assigneeId) { sansPersonne = true; continue; }
        if (!vues.has(t.assigneeId)) vues.set(t.assigneeId, t._nomAssigne || 'Utilisateur');
    }
    const liste = [...vues.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'fr'))
        .map(([uid, nom]) => [uid, nom]);
    if (sansPersonne) liste.push(['aucun', 'Non assignée']);
    return liste;
}

// ---------- Branchement des evenements ----------

function brancherBarre(conteneur, donnees) {
    const t = lireTriage();

    const appliquer = ({ rebatirBarre = false } = {}) => {
        _pageTaille = PAR_PAGE;
        ecrireTriage();
        if (rebatirBarre) {
            construireVue(conteneur, donnees);
        } else {
            rendreResultats(donnees);
            majEtatBarre(conteneur);
        }
    };

    // Recherche : differee, et SANS reconstruire la barre — sinon le champ
    // perd le focus a chaque frappe et l'utilisateur ne peut pas saisir un
    // deuxieme caractere.
    conteneur.querySelector('#dash-recherche')?.addEventListener('input', e => {
        const valeur = e.target.value;
        clearTimeout(_minuteurRecherche);
        _minuteurRecherche = setTimeout(() => {
            t.recherche = valeur;
            appliquer();
        }, 200);
    });

    conteneur.querySelector('#dash-periode')?.addEventListener('change', e => {
        t.periode = e.target.value;
        conteneur.querySelector('#dash-perso')?.classList.toggle('hidden', t.periode !== 'perso');
        appliquer();
    });

    conteneur.querySelector('#dash-champ-date')?.addEventListener('change', e => {
        t.champDate = e.target.value;
        appliquer();
    });

    conteneur.querySelector('#dash-du')?.addEventListener('change', e => {
        t.perso.du = e.target.value;
        appliquer();
    });
    conteneur.querySelector('#dash-au')?.addEventListener('change', e => {
        t.perso.au = e.target.value;
        appliquer();
    });

    conteneur.querySelector('#dash-tri')?.addEventListener('change', e => {
        t.tri = e.target.value;
        appliquer();
    });

    conteneur.querySelector('#dash-ordre')?.addEventListener('click', () => {
        t.ordre = t.ordre === 'asc' ? 'desc' : 'asc';
        appliquer({ rebatirBarre: true });
    });

    conteneur.querySelectorAll('[data-perimetre]').forEach(b => {
        b.addEventListener('click', () => {
            t.perimetre = b.dataset.perimetre;
            appliquer({ rebatirBarre: true });
        });
    });

    conteneur.querySelectorAll('[data-rapide]').forEach(b => {
        b.addEventListener('click', () => {
            t.rapide = b.dataset.rapide || null;
            appliquer({ rebatirBarre: true });
        });
    });

    conteneur.querySelectorAll('.triage-puce').forEach(b => {
        b.addEventListener('click', () => {
            const groupe = b.dataset.groupe;
            const valeur = b.dataset.valeur;
            const liste = t[groupe];
            const i = liste.indexOf(valeur);
            if (i === -1) liste.push(valeur); else liste.splice(i, 1);
            b.classList.toggle('active', i === -1);
            b.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
            appliquer();
        });
    });

    conteneur.querySelector('#dash-archivees')?.addEventListener('change', e => {
        t.avecArchivees = e.target.checked;
        appliquer();
    });

    conteneur.querySelector('#dash-plus-filtres')?.addEventListener('click', e => {
        const panneau = conteneur.querySelector('#dash-avance');
        if (!panneau) return;
        const ouvert = panneau.hasAttribute('hidden');
        panneau.toggleAttribute('hidden', !ouvert);
        e.currentTarget.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    });

    conteneur.querySelector('#dash-reset')?.addEventListener('click', () => {
        _triage = normaliserTriage(null);
        _pageTaille = PAR_PAGE;
        ecrireTriage();
        construireVue(conteneur, donnees);
        conteneur.querySelector('#dash-recherche')?.focus();
    });
}

/** Met a jour les seuls elements de la barre qui dependent du triage sans
 *  qu'on ait reconstruit le balisage — evite de reecrire la barre entiere
 *  pendant une saisie. */
function majEtatBarre(conteneur) {
    const t = lireTriage();
    const n = nombreDeFiltresActifs(t);
    const bouton = conteneur.querySelector('#dash-plus-filtres');
    if (bouton) {
        const compteur = bouton.querySelector('.triage-compteur');
        if (n && compteur) compteur.textContent = n;
        else if (n && !compteur) bouton.insertAdjacentHTML('beforeend', ` <span class="triage-compteur">${n}</span>`);
        else if (!n && compteur) compteur.remove();
    }
    conteneur.querySelector('#dash-reset')?.toggleAttribute('hidden', triageEstVierge(t));
}

// ------------------------------------------------------------------
// Resultats
// ------------------------------------------------------------------

function rendreResultats(donnees) {
    const cible = $('dash-resultats');
    if (!cible) return;

    const t = lireTriage();
    const maintenant = new Date();
    const { retenues, horsPeriode } = filtrerTaches(donnees.taches, t, {
        uid: state.currentUser?.uid,
        maintenant
    });
    const triees = trierTaches(retenues, t.tri, t.ordre);
    const ind = calculerIndicateurs(retenues, maintenant);

    majResume(retenues.length, horsPeriode, t, donnees);

    // Temps porte par les taches ARCHIVEES que le triage courant ecarte.
    // Sans ce calcul, le total du temps baissait silencieusement des qu'une
    // tache etait archivee : l'ancienne carte de l'onglet Statistiques, elle,
    // sommait les archivees. Quelqu'un qui facture des heures verrait son
    // total fondre sans explication. On le calcule pour pouvoir le DIRE.
    let tempsArchive = null;
    if (!t.avecArchivees) {
        const avecArchivees = filtrerTaches(donnees.taches, { ...t, avecArchivees: true }, {
            uid: state.currentUser?.uid,
            maintenant
        });
        const archivees = avecArchivees.retenues.filter(x => x.archived);
        const calc = calculerTemps(archivees);
        if (calc.total > 0) tempsArchive = calc;
    }

    cible.innerHTML = `
        ${bandeauIndicateurs(ind, t)}
        <div class="analytics-grid">
            ${carteTemps(calculerTemps(retenues), tempsArchive)}
            ${carteRepartition('Répartition par statut', repartir(retenues, 'status', Object.keys(STATUTS)), STATUTS, retenues.length)}
            ${carteRepartition('Répartition par priorité', repartir(retenues.filter(x => x.status !== 'done'), 'priority', Object.keys(PRIORITES)), PRIORITES, ind.actives)}
            ${carteProjets(retenues)}
            ${carteCharge(retenues, maintenant)}
            ${carteListe(triees)}
            ${carteGamification()}
        </div>`;

    brancherResultats(cible, donnees, triees);
}

function majResume(nb, horsPeriode, t, donnees) {
    const resume = $('dash-resume');
    if (!resume) return;

    const total = donnees.taches.length;
    let texte = `${nb} tâche${nb > 1 ? 's' : ''} retenue${nb > 1 ? 's' : ''} sur ${total}`;

    // Le piege des filtres par date : poser une periode sur l'echeance fait
    // disparaitre toutes les taches SANS echeance, en silence. Le total
    // affiche devient faux sans que rien ne le signale. On le dit.
    if (horsPeriode > 0) {
        const champ = CHAMPS_DATE[t.champDate].libelle.toLowerCase();
        texte += ` · ${horsPeriode} écartée${horsPeriode > 1 ? 's' : ''} faute de date d'${champ}`;
    }
    if (donnees.projetsEnEchec > 0) {
        texte += ` · ${donnees.projetsEnEchec} projet${donnees.projetsEnEchec > 1 ? 's' : ''} illisible${donnees.projetsEnEchec > 1 ? 's' : ''}`;
    }
    resume.textContent = texte;
}

// ---------- Indicateurs ----------

function bandeauIndicateurs(ind, t) {
    const tuile = (cle, valeur, libelle, danger = false) => {
        const actif = t.rapide === cle;
        const cliquable = !!cle;
        const balise = cliquable ? 'button' : 'div';
        const attrs = cliquable
            ? `type="button" data-kpi="${cle}" aria-pressed="${actif ? 'true' : 'false'}"`
            : '';
        return `<${balise} class="dash-kpi${danger && valeur > 0 ? ' danger' : ''}${actif ? ' active' : ''}" ${attrs}>
            <span class="dash-kpi-valeur">${valeur}</span>
            <span class="dash-kpi-libelle">${esc(libelle)}</span>
        </${balise}>`;
    };

    return `
        <div class="dash-kpis" role="group" aria-label="Indicateurs, cliquables pour filtrer">
            ${tuile('retard', ind.enRetard, 'En retard', true)}
            ${tuile('proche', ind.echeanceProche, 'Sous 7 jours')}
            ${tuile('sansAssigne', ind.sansAssigne, 'Sans assigné')}
            ${tuile('sansEcheance', ind.sansEcheance, 'Sans échéance')}
            ${tuile('terminees', ind.terminees, 'Terminées')}
            ${tuile('', ind.tauxAchevement + '%', 'Taux d\'achèvement')}
        </div>`;
}

// ---------- Cartes ----------

/**
 * Temps suivi. Reprend la carte « Temps total » de l'ancien onglet
 * Statistiques, qui ne sommait que le projet ouvert et n'affichait qu'un
 * chiffre nu. Ici le total porte sur le perimetre filtre — donc sur tous les
 * projets par defaut — et il est qualifie : sur combien de tâches, en
 * moyenne combien, et laquelle a coûté le plus.
 */
function carteTemps(temps, tempsArchive) {
    // Ce que la carte ne compte PAS, dit explicitement. Un total de temps est
    // le genre de chiffre qu'on refacture : s'il omet quelque chose, il doit
    // le declarer, sinon il n'est pas utilisable.
    const reserves = [];

    if (tempsArchive) {
        // Tournure choisie pour supprimer tout accord piegeux : le complement
        // porte le nombre, la duree arrive apres le deux-points et reste
        // invariable. « 33 h 15 … ne sont pas comptes » accordait le participe
        // sur le nombre de taches au lieu des heures — faute visible par
        // n'importe quel lecteur francophone, sur le chiffre le plus sensible
        // de la page.
        const n = tempsArchive.chronometrees;
        const complement = n === 1 ? "d'une tâche archivée" : `de ${n} tâches archivées`;
        reserves.push(`
            <p class="dash-temps-reserve">
                ${icone('archive', { taille: 13 })}
                <span>
                    Ce total exclut le temps ${complement} :
                    <strong>${esc(formatDureeLongue(tempsArchive.total))}</strong>.
                </span>
                <button type="button" class="btn-text dash-temps-inclure" id="dash-inclure-archivees">
                    Les inclure
                </button>
            </p>`);
    }

    // Les chronometres en cours ne sont nulle part en base : `timeSpent` n'est
    // ecrit qu'a l'ARRET du minuteur (stopTimer). On ne peut donc pas les
    // compter — et on ne peut voir que les siens, jamais ceux des collegues.
    // La regle est enoncee plutot que devinee.
    const enCours = Object.values(state.timeTracking || {}).filter(x => x?.isRunning).length;
    reserves.push(`
        <p class="dash-temps-reserve dash-temps-reserve--regle">
            ${icone('horloge', { taille: 13 })}
            <span>
                Temps validé à l'arrêt du chronomètre : les minutes en cours ne sont pas encore comptées.
                ${enCours ? `<strong>Vous avez ${enCours} chronomètre${enCours > 1 ? 's' : ''} en cours.</strong>` : ''}
            </span>
        </p>`);

    if (!temps.chronometrees) {
        return `
            <div class="analytics-card dash-carte-temps">
                <h4>Temps suivi</h4>
                <div class="notifications-empty">
                    Aucun temps enregistré sur ce périmètre. Lancez le chronomètre depuis une tâche pour commencer à mesurer.
                </div>
                ${reserves.join('')}
            </div>`;
    }

    return `
        <div class="analytics-card dash-carte-temps">
            <h4>Temps suivi</h4>
            <div class="dash-temps-total">
                <span class="dash-temps-valeur">${esc(formatDureeLongue(temps.total))}</span>
                <span class="dash-temps-legende">sur ${temps.chronometrees} tâche${temps.chronometrees > 1 ? 's' : ''} chronométrée${temps.chronometrees > 1 ? 's' : ''}</span>
            </div>
            <div class="dash-temps-details">
                <div class="stat">
                    <span class="stat-value">${esc(formatDureeLongue(temps.moyenne))}</span>
                    <span class="stat-label">Moyenne par tâche suivie</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${temps.sansSuivi}</span>
                    <span class="stat-label">Tâches sans suivi</span>
                </div>
            </div>
            ${temps.plusLongue ? `
                <p class="dash-temps-record">
                    La plus longue : <strong>${esc(temps.plusLongue.titre)}</strong>
                    — ${esc(formatDureeLongue(temps.plusLongue.secondes))}
                </p>` : ''}
            ${reserves.join('')}
        </div>`;
}

function carteRepartition(titre, repartition, vocabulaire, total) {
    const { compte, autres } = repartition;

    const barre = (libelle, classe, n) => {
        const pct = total ? (n / total) * 100 : 0;
        return `
            <div class="bar-item">
                <span class="bar-label">${esc(libelle)}</span>
                <div class="bar-track"><div class="bar-fill ${classe}" style="width:${pct}%"></div></div>
                <span class="bar-value">${n}</span>
            </div>`;
    };

    let lignes = Object.entries(compte)
        .map(([cle, n]) => barre(vocabulaire[cle].libelle, vocabulaire[cle].classe, n))
        .join('');

    // Colonnes personnalisees : sans cette barre, les valeurs affichees ne
    // sommaient pas au total annonce juste au-dessus.
    if (autres > 0) lignes += barre('Autres', 'autre', autres);

    return `
        <div class="analytics-card">
            <h4>${esc(titre)}</h4>
            ${total ? `<div class="analytics-bars">${lignes}</div>`
                    : '<div class="notifications-empty">Aucune tâche dans ce périmètre.</div>'}
        </div>`;
}

function carteProjets(retenues) {
    const lignes = avancementParProjet(retenues, state.projects);
    if (!lignes.length) {
        return `<div class="analytics-card wide">
            <h4>Par projet</h4>
            <div class="notifications-empty">Aucun projet ne contient de tâche dans ce périmètre.</div>
        </div>`;
    }

    return `
        <div class="analytics-card wide">
            <h4>Par projet</h4>
            ${lignes.map(p => {
                const projet = state.projects.find(x => x.id === p.id);
                const role = projet ? getRole(projet, state.currentUser?.uid) : null;
                const pct = p.total ? (p.terminees / p.total) * 100 : 0;
                return `
                    <div class="member-stat dash-project-row" data-project-id="${esc(p.id)}"
                         role="button" tabindex="0"
                         aria-label="Ouvrir le projet ${esc(p.nom)}">
                        <span class="member-name">
                            <span class="project-color" style="background:${couleurSure(p.couleur)}"></span>
                            ${esc(p.nom)}
                            ${role ? `<span class="dash-role-badge">${esc(ROLE_LABELS[role] || role)}</span>` : ''}
                        </span>
                        <span class="member-count">
                            ${p.terminees}/${p.total} terminée${p.total > 1 ? 's' : ''}${p.enRetard ? ` · ${p.enRetard} en retard` : ''}${p.temps ? ` · ${esc(formatDureeLongue(p.temps))}` : ''}
                        </span>
                        <div class="member-progress"><div class="progress-fill" style="width:${pct}%"></div></div>
                    </div>`;
            }).join('')}
        </div>`;
}

function carteCharge(retenues, maintenant) {
    const lignes = chargeParPersonne(retenues, maintenant);
    if (!lignes.length) {
        return `<div class="analytics-card wide">
            <h4>Charge par personne</h4>
            <div class="notifications-empty">Aucune tâche dans ce périmètre. Assignez une tâche pour voir la répartition.</div>
        </div>`;
    }

    const maxActives = Math.max(...lignes.map(l => l.actives), 1);

    return `
        <div class="analytics-card wide">
            <h4>Charge par personne</h4>
            ${lignes.map(l => `
                <div class="member-stat${l.uid === 'aucun' ? ' dash-non-assigne' : ''}">
                    <span class="member-name">${esc(l.nom)}</span>
                    <span class="member-count">
                        ${l.actives} active${l.actives > 1 ? 's' : ''}${l.enRetard ? ` · ${l.enRetard} en retard` : ''} · ${l.terminees} terminée${l.terminees > 1 ? 's' : ''}${l.temps ? ` · ${esc(formatDureeLongue(l.temps))}` : ''}
                    </span>
                    <div class="member-progress" role="img"
                         aria-label="${l.actives} tâche${l.actives > 1 ? 's' : ''} active${l.actives > 1 ? 's' : ''}">
                        <div class="progress-fill${l.enRetard ? ' en-retard' : ''}" style="width:${(l.actives / maxActives) * 100}%"></div>
                    </div>
                </div>`).join('')}
        </div>`;
}

function carteListe(triees) {
    const t = lireTriage();
    const visibles = triees.slice(0, _pageTaille);
    const reste = triees.length - visibles.length;

    return `
        <div class="analytics-card wide dash-carte-liste">
            <h4>
                Tâches
                <span class="dash-liste-compte">${triees.length} · triées par ${esc(TRIS[t.tri].toLowerCase())}, ${t.ordre === 'asc' ? 'croissant' : 'décroissant'}</span>
            </h4>
            ${triees.length
                ? `<div class="dash-liste" id="dash-liste">${visibles.map(ligneTache).join('')}</div>
                   ${reste > 0
                        ? `<button type="button" class="btn-secondary dash-plus" id="dash-plus">
                             Afficher ${Math.min(reste, PAR_PAGE)} tâche${Math.min(reste, PAR_PAGE) > 1 ? 's' : ''} de plus (${reste} restante${reste > 1 ? 's' : ''})
                           </button>`
                        : ''}`
                : `<div class="empty-section">
                     ${icone('recherche', { taille: 24 })}
                     <p>Aucune tâche ne correspond à ce triage.</p>
                     <p class="empty-section-aide">Élargissez la période, retirez un filtre, ou utilisez « Tout effacer » pour repartir de zéro.</p>
                   </div>`}
        </div>`;
}

function ligneTache(tache) {
    const statutEcheance = tache.status === 'done' ? null : getDueStatus(tache.dueDate);
    const echeance = tache.dueDate ? formatDeadline(tache.dueDate) : '';
    // statutDe / prioriteDe et non un acces direct : une colonne personnalisee
    // donnait `undefined`, et le `.classe` qui suivait interrompait le template
    // litteral — l'affectation de innerHTML n'avait jamais lieu et TOUT le
    // tableau de bord restait fige sur son rendu precedent.
    const priorite = prioriteDe(tache);
    const statut = statutDe(tache);
    const couleurProjet = couleurSure(state.projects.find(p => p.id === tache.projectId)?.color);

    return `
        <div class="task-row dash-ligne${statutEcheance === 'overdue' ? ' overdue' : statutEcheance === 'soon' ? ' due-soon' : ''}${tache.archived ? ' dash-ligne--archivee' : ''}"
             data-task-id="${esc(tache.id)}" data-project-id="${esc(tache.projectId || '')}"
             role="button" tabindex="0">
            <span class="priority-dot ${priorite.classe}" title="Priorité ${esc(priorite.libelle.toLowerCase())}"></span>
            <span class="row-title">${esc(tache.title || 'Sans titre')}</span>
            <span class="row-meta">
                <span class="dash-statut ${statut.classe}">${esc(statut.libelle)}</span>
                <span class="row-project" style="background:${couleurProjet}25;color:${couleurTexteTag(couleurProjet)}">${esc(tache._nomProjet)}</span>
                ${tache._nomAssigne
                    ? `<span class="dash-assigne">${esc(tache._nomAssigne)}</span>`
                    : '<span class="dash-assigne dash-assigne--vide">Non assignée</span>'}
                ${tache.timeSpent > 0
                    ? `<span class="dash-temps-tache" title="Temps passé sur cette tâche">${icone('horloge', { taille: 12 })} ${esc(formatDureeLongue(tache.timeSpent))}</span>`
                    : ''}
                ${echeance ? `<span class="row-due">${esc(echeance)}</span>` : ''}
                ${tache.archived ? `<span class="dash-archivee">${icone('archive', { taille: 12 })} Archivée</span>` : ''}
            </span>
        </div>`;
}

function carteGamification() {
    const debloques = gamification.badges || [];
    const total = Object.keys(gamification.achievements || {}).length;
    let serie = {};
    try { serie = JSON.parse(localStorage.getItem('corviospace-streak') || '{}'); } catch { serie = {}; }

    return `
        <div class="analytics-card wide dash-carte-perso">
            <h4>Votre progression</h4>
            <p class="dash-perso-aide">Ces chiffres sont personnels et ne dépendent pas du triage ci-dessus.</p>
            <div class="dash-perso-chiffres">
                <div class="stat"><span class="stat-value">${gamification.points}</span><span class="stat-label">Points</span></div>
                <div class="stat"><span class="stat-value">${gamification.level}</span><span class="stat-label">Niveau</span></div>
                <div class="stat"><span class="stat-value">${debloques.length}/${total}</span><span class="stat-label">Badges</span></div>
                <div class="stat"><span class="stat-value">${serie.streak || 0}</span><span class="stat-label">Jours d'affilée</span></div>
                <div class="stat"><span class="stat-value">${serie.best || 0}</span><span class="stat-label">Meilleure série</span></div>
            </div>
            ${debloques.length ? `
                <div class="gamification-badges">
                    ${debloques.map(id => {
                        const b = gamification.achievements[id];
                        return b ? `<span class="badge-icon" title="${esc(b.name)}">${icone(b.icon, { taille: 15 })}</span>` : '';
                    }).join('')}
                </div>` : ''}
        </div>`;
}

// ---------- Branchement des resultats ----------

function brancherResultats(cible, donnees, triees) {
    const t = lireTriage();

    cible.querySelectorAll('[data-kpi]').forEach(b => {
        b.addEventListener('click', () => {
            const cle = b.dataset.kpi;
            t.rapide = t.rapide === cle ? null : cle;
            _pageTaille = PAR_PAGE;
            ecrireTriage();
            construireVue($('dashboard-container'), donnees);
        });
    });

    cible.querySelector('#dash-inclure-archivees')?.addEventListener('click', () => {
        t.avecArchivees = true;
        _pageTaille = PAR_PAGE;
        ecrireTriage();
        // Reconstruction complete : la case a cocher du panneau de filtres
        // doit refleter le changement, sinon l'interface se contredit.
        construireVue($('dashboard-container'), donnees);
    });

    cible.querySelector('#dash-plus')?.addEventListener('click', () => {
        _pageTaille += PAR_PAGE;
        rendreResultats(donnees);
        // Le focus retombe sur la premiere tache nouvellement affichee :
        // sans cela, l'utilisateur au clavier repart du haut de la page a
        // chaque « Afficher plus », et ne peut pas atteindre le bas d'une
        // longue liste.
        const lignes = $('dash-liste')?.children;
        lignes?.[Math.max(0, _pageTaille - PAR_PAGE)]?.focus();
    });

    const ouvrirProjet = id => {
        if (!id) return;
        selectProject(id);
        switchView('board');
    };
    cible.querySelectorAll('.dash-project-row').forEach(ligne => {
        ligne.addEventListener('click', () => ouvrirProjet(ligne.dataset.projectId));
        ligne.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                ouvrirProjet(ligne.dataset.projectId);
            }
        });
    });

    const parId = new Map(triees.map(x => [x.id, x]));
    const ouvrirTache = ligne => {
        const tache = parId.get(ligne.dataset.taskId);
        if (!tache) return;
        // Ouvrir une tache d'un autre projet suppose d'y basculer d'abord :
        // la modale lit les tags et les membres du projet COURANT.
        if (tache.projectId !== state.currentProjectId) {
            selectProject(tache.projectId);
            switchView('board');
            setTimeout(() => openTaskModal(tache), 600);
        } else {
            openTaskModal(tache);
        }
    };
    cible.querySelectorAll('.dash-ligne').forEach(ligne => {
        ligne.addEventListener('click', () => ouvrirTache(ligne));
        ligne.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                ouvrirTache(ligne);
            }
        });
    });
}
