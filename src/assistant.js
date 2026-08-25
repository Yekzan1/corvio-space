// ==========================================
// ASSISTANT — INTERFACE
// ==========================================
// La partie visible du chatbot : le bouton flottant, le panneau qui glisse, la
// conversation, et l'EXECUTION des actions que le cerveau propose. Le cerveau
// (core/assistant-cerveau.js) decide et redige ; ce fichier affiche et agit.
// La separation est stricte : ici on ne calcule aucune statistique, la-bas on
// ne touche jamais au DOM. C'est ce qui garde le cerveau testable.
//
// Regle de securite du produit, respectee ici : toute action qui ECRIT
// (creation de tache) passe par une confirmation explicite. L'assistant peut
// naviguer et changer de thème sans demander — c'est sans consequence et
// reversible — mais il ne cree jamais rien dans la base sans un « oui » clair.

import { state } from './core/state.js';
import { $, el } from './core/dom.js';
import { esc } from './core/utils.js';
import { icone } from './core/icones.js';
import { couleurSure, couleurTexteTag } from './core/couleurs.js';
import { analyser } from './core/assistant-cerveau.js';
import { switchView } from './views.js';
import { selectProject } from './projects.js';
import { createTask } from './tasks.js';
import { basculerApparence, definirApparence } from './ui.js';
import { appliquerVueRapide } from './dashboard.js';
import { PRIORITES } from './core/triage.js';

const CLE_HISTORIQUE = 'corviospace-assistant-vu';

let _ouvert = false;
let _monte = false;

// ------------------------------------------------------------------
// Contexte transmis au cerveau
// ------------------------------------------------------------------

/**
 * Rassemble ce que le cerveau a besoin de savoir, a partir de l'etat DEJA en
 * memoire — aucune requete reseau. `myTasks` couvre mes taches tous projets
 * confondus ; `state.tasks` le projet courant. Le cerveau choisit et annonce
 * son perimetre.
 */
function contexte() {
    const projet = state.projects.find(p => p.id === state.currentProjectId);
    const membres = (state.projectMembers || []).map(m => ({
        uid: m.uid || m.id,
        nom: m.displayName || m.name || m.email || 'Membre',
        email: m.email || ''
    }));
    // Se garantir soi-meme dans la liste des membres, pour « mes taches » et la
    // resolution d'un prenom.
    const moi = state.currentUser;
    if (moi && !membres.some(m => m.uid === moi.uid)) {
        membres.push({ uid: moi.uid, nom: moi.displayName || moi.email || 'Vous', email: moi.email || '' });
    }
    const prenom = (moi?.displayName || '').split(' ')[0] || '';

    return {
        mesTaches: state.myTasks || [],
        tachesProjet: state.tasks || [],
        projets: state.projects || [],
        membres,
        uid: moi?.uid || null,
        prenom,
        projetCourantNom: projet?.name || null,
        maintenant: new Date()
    };
}

// ------------------------------------------------------------------
// Montage
// ------------------------------------------------------------------

export function initAssistant() {
    if (_monte) return;
    _monte = true;

    const bouton = document.createElement('button');
    bouton.className = 'assistant-fab';
    bouton.id = 'assistant-fab';
    bouton.type = 'button';
    bouton.setAttribute('aria-label', 'Ouvrir l’aide');
    bouton.setAttribute('aria-haspopup', 'dialog');
    bouton.setAttribute('aria-expanded', 'false');
    // Le bouton porte le mot « Aide » plutot qu'une icone : il se lit sans
    // interpretation, et l'aria-label le double pour les lecteurs d'ecran.
    bouton.innerHTML = `<span class="assistant-fab-texte">Aide</span><span class="assistant-fab-pastille" hidden></span>`;

    const panneau = document.createElement('aside');
    panneau.className = 'assistant-panneau';
    panneau.id = 'assistant-panneau';
    panneau.setAttribute('role', 'dialog');
    panneau.setAttribute('aria-modal', 'false');
    panneau.setAttribute('aria-labelledby', 'assistant-titre');
    panneau.setAttribute('aria-hidden', 'true');
    panneau.innerHTML = `
        <header class="assistant-entete">
            <div class="assistant-identite">
                <span class="assistant-avatar">${icone('eclair', { taille: 18 })}</span>
                <div>
                    <p class="assistant-nom" id="assistant-titre">Aide</p>
                    <p class="assistant-etat">Réponses instantanées</p>
                </div>
            </div>
            <div class="assistant-actions">
                <button type="button" class="btn-icon" id="assistant-reinit" aria-label="Réinitialiser la conversation" title="Nouvelle conversation">
                    ${icone('reprise', { taille: 16 })}
                </button>
                <button type="button" class="btn-icon" id="assistant-fermer" aria-label="Fermer l’aide">
                    ${icone('croix', { taille: 18 })}
                </button>
            </div>
        </header>
        <div class="assistant-fil" id="assistant-fil" role="log" aria-live="polite" aria-atomic="false"></div>
        <form class="assistant-saisie" id="assistant-form" autocomplete="off">
            <input type="text" id="assistant-input" name="message"
                   placeholder="Posez une question, ou dites-moi quoi faire…"
                   aria-label="Votre message" autocomplete="off">
            <button type="submit" class="btn-icon assistant-envoyer" aria-label="Envoyer">
                ${icone('flecheDroite', { taille: 18 })}
            </button>
        </form>`;

    // Dans .app pour heriter du contexte d'empilement et du re-scope des jetons
    // en mode nuit, comme les autres surfaces flottantes.
    const hote = $('app') || document.body;
    hote.appendChild(bouton);
    hote.appendChild(panneau);

    bouton.addEventListener('click', basculer);
    panneau.querySelector('#assistant-fermer').addEventListener('click', fermer);
    panneau.querySelector('#assistant-reinit').addEventListener('click', reinitialiser);
    panneau.querySelector('#assistant-form').addEventListener('submit', e => {
        e.preventDefault();
        const input = panneau.querySelector('#assistant-input');
        const texte = input.value.trim();
        if (!texte) return;
        input.value = '';
        envoyer(texte);
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _ouvert) fermer();
    });

    // Message d'accueil, pose une seule fois par montage.
    poserAccueil();

    // Surveille en continu que le bouton ne recouvre aucun contenu actionnable.
    demarrerAntiGene();
}

// ------------------------------------------------------------------
// Ouverture / fermeture
// ------------------------------------------------------------------

function basculer() {
    _ouvert ? fermer() : ouvrir();
}

function ouvrir() {
    _ouvert = true;
    const panneau = $('assistant-panneau');
    const fab = $('assistant-fab');
    panneau.classList.add('ouvert');
    panneau.setAttribute('aria-hidden', 'false');
    fab.setAttribute('aria-expanded', 'true');
    fab.querySelector('.assistant-fab-pastille').hidden = true;
    try { localStorage.setItem(CLE_HISTORIQUE, '1'); } catch { /* stockage refuse */ }
    // Le focus part sur le champ : un assistant qu'on ouvre pour parler doit
    // etre pret a recevoir la frappe sans clic supplementaire.
    setTimeout(() => $('assistant-input')?.focus(), 60);
}

function fermer() {
    _ouvert = false;
    const panneau = $('assistant-panneau');
    const fab = $('assistant-fab');
    panneau.classList.remove('ouvert');
    panneau.setAttribute('aria-hidden', 'true');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
    planifierAntiGene();
}

// ------------------------------------------------------------------
// Anti-gene : le bouton s'efface quand il recouvre du contenu actionnable
// ------------------------------------------------------------------
//
// Le bouton est en `position: fixed` en bas a droite : il flotte AU-DESSUS de
// la page et peut donc masquer un controle (« + Ajouter » d'une colonne, une
// carte, un champ). La regle demandee : des qu'il gene, il disparait ; des que
// la zone est degagee, il revient.
//
// On sonde ce qui se trouve reellement SOUS le bouton, en cinq points (centre
// et quatre coins), via elementsFromPoint — en ecartant les elements de
// l'assistant lui-meme. Si l'un de ces points tombe sur un element
// ACTIONNABLE, il y a gene. On ne compte pas le simple fond d'une colonne ou
// un pave de texte : masquer le bouton en permanence n'aiderait personne. Ce
// qu'on protege, c'est ce sur quoi on clique.

const SELECTEUR_ACTIONNABLE = [
    'button', 'a[href]', 'input', 'textarea', 'select',
    '[role="button"]', '[tabindex]:not([tabindex="-1"])',
    '.task-card', '.task-row', '.dash-ligne', '.dash-project-row', '.dash-kpi',
    // L'etat vide d'une colonne. La regle generale dit qu'un pave de texte ne
    // compte pas — et elle a raison pour un paragraphe, ou masquer un coin est
    // sans consequence. Celui-ci est l'exception : c'est la PHRASE QUI DIT QUOI
    // FAIRE d'une colonne vide (« Déposez ici ce qui attend un second
    // regard. »), elle tient sur deux lignes, et la bulle en recouvrait la fin.
    // Constate sur l'appareil de Yekzan, sur le projet « Moi », colonne
    // « En revue » a zero.
    '.colonne-vide'
].join(',');

let _timerReeval = null;
let _timerReapparition = null;

/** Le premier element sous (x, y) qui n'appartient pas a l'assistant. */
function elementSous(x, y) {
    const pile = document.elementsFromPoint(x, y);
    for (const el of pile) {
        if (!el.closest('#assistant-fab, #assistant-panneau')) return el;
    }
    return null;
}

/**
 * Vrai si le bouton recouvre VRAIMENT un element actionnable — pas s'il en
 * effleure un par un coin. On sonde le centre et les quatre coins, et on ne
 * conclut a la gene que si le CENTRE est couvert, ou si la MAJORITE des points
 * le sont. Sans ce seuil, le bouton se cachait en permanence sur le tableau :
 * son bord haut chevauche de quelques pixels le « + Ajouter » d'une colonne,
 * ce qui ne l'empeche pas de cliquer ailleurs — ce n'est pas de la gene.
 * Une carte reellement posee sous le bouton, elle, couvre les cinq points.
 */
function boutonGene() {
    const fab = $('assistant-fab');
    if (!fab) return false;
    const r = fab.getBoundingClientRect();
    if (r.width === 0) return false;
    const m = 6;
    const centre = [r.left + r.width / 2, r.top + r.height / 2];
    const coins = [
        [r.left + m, r.top + m],
        [r.right - m, r.top + m],
        [r.left + m, r.bottom - m],
        [r.right - m, r.bottom - m]
    ];

    const couvert = ([x, y]) => {
        if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
        const el = elementSous(x, y);
        return !!(el && el.closest(SELECTEUR_ACTIONNABLE));
    };

    if (couvert(centre)) return true;
    const nbCoins = coins.reduce((n, p) => n + (couvert(p) ? 1 : 0), 0);
    return nbCoins >= 3;
}

function reevaluerGene() {
    const fab = $('assistant-fab');
    if (!fab || _ouvert) return; // panneau ouvert : le bouton est deja masque par le CSS

    if (boutonGene()) {
        // Disparait tout de suite : ne jamais laisser une frame ou il bloque un
        // clic.
        clearTimeout(_timerReapparition);
        fab.classList.add('gene');
        fab.setAttribute('aria-hidden', 'true');
    } else {
        // Reapparait apres un court calme. Sans cette hysteresis, un contenu qui
        // affleure le bord ferait clignoter le bouton pendant le defilement.
        clearTimeout(_timerReapparition);
        _timerReapparition = setTimeout(() => {
            fab.classList.remove('gene');
            fab.removeAttribute('aria-hidden');
        }, 300);
    }
}

/**
 * Anti-rebond des reevaluations — le defilement en declenche des dizaines par
 * seconde. On utilise `setTimeout` et NON `requestAnimationFrame` : rAF est
 * suspendu quand l'onglet n'est pas composite (arriere-plan, ou volet non
 * affiche), et un drapeau « rAF en attente » resterait alors bloque, tuant
 * toute reevaluation ulterieure. setTimeout se declenche toujours.
 */
function planifierAntiGene() {
    if (_timerReeval) return;
    _timerReeval = setTimeout(() => { _timerReeval = null; reevaluerGene(); }, 80);
}

function demarrerAntiGene() {
    // `capture: true` attrape aussi le defilement des conteneurs internes
    // (colonnes, listes), pas seulement celui de la fenetre.
    window.addEventListener('scroll', planifierAntiGene, { passive: true, capture: true });
    window.addEventListener('resize', planifierAntiGene);

    // Filet pour les changements de DOM qui n'emettent ni scroll ni resize :
    // une carte ajoutee, une vue changee.
    //
    // C'etait `setInterval(planifierAntiGene, 600)` — soit une centaine de
    // lectures de geometrie par minute, A VIE, y compris onglet en arriere-plan
    // et meme quand rien ne bouge. Sur un portable c'est de la batterie brulee
    // pour rien : le sondage periodique DEVINE qu'il s'est peut-etre passe
    // quelque chose, la ou l'evenement le SAIT.
    //
    // MutationObserver donne exactement le signal recherche, et seulement
    // quand il se produit. On observe #app plutot que document.body pour
    // ignorer les mutations de la zone d'annonce et des toasts.
    const racine = $('app') || document.body;
    if (typeof MutationObserver === 'function') {
        new MutationObserver(planifierAntiGene)
            .observe(racine, { childList: true, subtree: true });
    }
    // La visibilite ne declenche ni scroll ni mutation : un onglet revenu au
    // premier plan a pu changer de taille entre-temps.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') planifierAntiGene();
    });
    planifierAntiGene();
}

// ------------------------------------------------------------------
// Conversation
// ------------------------------------------------------------------

function poserAccueil() {
    const heure = new Date().getHours();
    const salut = heure < 18 ? 'Bonjour' : 'Bonsoir';
    ajouterMessage('assistant', {
        texte: `${salut} ! Je suis là pour vous aider. Je connais vos tâches et vos échéances — posez une question, ou dites-moi quoi faire.`,
        suggestions: ["Qu'est-ce qui est en retard ?", 'Mes tâches cette semaine', 'Ma charge de travail', 'Aide']
    });
}

/** Vide le fil et repart de l'accueil, sans fermer le panneau. */
function reinitialiser() {
    const fil = $('assistant-fil');
    if (fil) fil.innerHTML = '';
    poserAccueil();
    $('assistant-input')?.focus();
}

function envoyer(texte) {
    ajouterMessage('utilisateur', { texte });
    // Petit temps de « frappe » : une reponse rigoureusement instantanee se lit
    // comme un formulaire, pas comme un interlocuteur. 250 ms suffisent a poser
    // l'echange sans donner l'impression d'attendre.
    const attente = afficherFrappe();
    setTimeout(() => {
        attente.remove();
        let reponse;
        try {
            reponse = analyser(texte, contexte());
        } catch (e) {
            console.error('assistant:', e);
            reponse = { texte: 'Désolé, je n’ai pas pu traiter cette demande. Réessayez avec une formulation plus simple.' };
        }
        ajouterMessage('assistant', reponse);
        if (reponse.action) executerOuProposer(reponse.action);
    }, 250);
}

function afficherFrappe() {
    const fil = $('assistant-fil');
    const bulle = document.createElement('div');
    bulle.className = 'assistant-msg assistant';
    bulle.innerHTML = `<div class="assistant-bulle assistant-frappe"><span></span><span></span><span></span></div>`;
    fil.appendChild(bulle);
    fil.scrollTop = fil.scrollHeight;
    return bulle;
}

/**
 * Ajoute un message au fil.
 * @param {'utilisateur'|'assistant'} rôle
 * @param {{texte, taches?, suggestions?, action?}} data
 */
function ajouterMessage(role, data) {
    const fil = $('assistant-fil');
    const bloc = document.createElement('div');
    bloc.className = `assistant-msg ${role}`;

    const bulle = document.createElement('div');
    bulle.className = 'assistant-bulle';
    bulle.innerHTML = miseEnForme(data.texte || '');
    bloc.appendChild(bulle);

    // Apercu de taches, si le cerveau en a joint.
    if (data.taches && data.taches.length) {
        bloc.appendChild(listeTaches(data.taches));
    }

    // Bouton d'action (naviguer / creer), quand il y en a un a proposer.
    if (data.action && data.action.libelle && !data.action.immediat) {
        bloc.appendChild(boutonAction(data.action));
    }

    // Suggestions de suivi, cliquables.
    if (data.suggestions && data.suggestions.length) {
        bloc.appendChild(suggestions(data.suggestions));
    }

    fil.appendChild(bloc);
    fil.scrollTop = fil.scrollHeight;
}

/** Gras `**…**` et retours a la ligne, sur un texte deja echappe. Volontairement
 *  minimal : le cerveau n'emet que ces deux marques. */
function miseEnForme(texte) {
    return esc(texte)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function listeTaches(taches) {
    const boite = document.createElement('div');
    boite.className = 'assistant-taches';
    taches.forEach(t => {
        const projet = state.projects.find(p => p.id === t.projectId);
        const prio = PRIORITES[t.priority || 'medium'] || PRIORITES.medium;
        const ligne = document.createElement('button');
        ligne.type = 'button';
        ligne.className = 'assistant-tache';
        ligne.innerHTML = `
            <span class="assistant-tache-prio ${prio.classe}"></span>
            <span class="assistant-tache-titre">${esc(t.title || 'Sans titre')}</span>
            ${projet ? `<span class="assistant-tache-projet" style="background:${couleurSure(projet.color)}22;color:${couleurTexteTag(couleurSure(projet.color))}">${esc(projet.name)}</span>` : ''}`;
        ligne.addEventListener('click', () => {
            fermer();
            if (t.projectId && t.projectId !== state.currentProjectId) selectProject(t.projectId);
            switchView('board');
        });
        boite.appendChild(ligne);
    });
    return boite;
}

function boutonAction(action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'assistant-action';
    b.innerHTML = `${icone(action.type === 'creer-tache' ? 'coche' : 'flecheDroite', { taille: 15 })} ${esc(action.libelle)}`;
    b.addEventListener('click', () => {
        b.disabled = true;
        executer(action, b);
    });
    return b;
}

function suggestions(liste) {
    const boite = document.createElement('div');
    boite.className = 'assistant-suggestions';
    liste.forEach(s => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'assistant-chip';
        chip.textContent = s;
        chip.addEventListener('click', () => envoyer(s));
        boite.appendChild(chip);
    });
    return boite;
}

// ------------------------------------------------------------------
// Execution des actions
// ------------------------------------------------------------------

// Navigation et thème s'executent tout de suite (reversibles, sans
// consequence). La creation attend le clic sur le bouton d'action — c'est la
// confirmation exigee avant toute ecriture.
function executerOuProposer(action) {
    if (action.type === 'naviguer' && action.immediat) return executer(action);
    if (action.type === 'theme') return executer(action);
    // creer-tache et naviguer non-immediat : le bouton d'action a deja ete
    // ajoute par ajouterMessage, on attend le clic.
}

async function executer(action, bouton) {
    switch (action.type) {
        case 'naviguer':
            fermer();
            if (action.rapide) appliquerVueRapide(action.rapide);
            else if (action.vue === 'dashboard') appliquerVueRapide(null);
            switchView(action.vue);
            break;

        case 'theme':
            definirApparence(action.valeur);
            break;

        case 'creer-tache':
            await creerTache(action.brouillon, bouton);
            break;
    }
}

async function creerTache(brouillon, bouton) {
    // On retire les champs internes (prefixes _) avant d'ecrire.
    const data = {
        title: brouillon.title,
        priority: brouillon.priority || 'medium',
        status: 'todo',
        dueDate: brouillon.dueDate || null,
        assigneeId: brouillon.assigneeId || null,
        description: ''
    };

    if (!state.currentProjectId) {
        remplacerBouton(bouton, 'Aucun projet ouvert — ouvrez-en un d’abord.');
        return;
    }

    const res = await createTask(data);
    // createTask affiche deja un toast d'erreur (droits, titre) et rend null.
    if (res) {
        remplacerBouton(bouton, `Tâche créée : « ${brouillon.title} »`);
        ajouterMessage('assistant', {
            texte: 'C’est fait. Voulez-vous l’ouvrir sur le tableau ?',
            action: { type: 'naviguer', vue: 'board', immediat: false, libelle: 'Voir sur le tableau' }
        });
    } else {
        remplacerBouton(bouton, 'La création n’a pas abouti (droits ou titre). Réessayez.');
    }
}

/** Remplace un bouton d'action par une ligne d'etat, pour qu'on ne puisse pas
 *  recliquer et pour montrer le resultat a sa place. */
function remplacerBouton(bouton, texte) {
    if (!bouton) return;
    const etat = document.createElement('p');
    etat.className = 'assistant-action-resultat';
    etat.textContent = texte;
    bouton.replaceWith(etat);
    const fil = $('assistant-fil');
    if (fil) fil.scrollTop = fil.scrollHeight;
}

// ------------------------------------------------------------------
// Pastille « nouveau » sur le bouton, tant qu'il n'a jamais ete ouvert
// ------------------------------------------------------------------

export function signalerAssistant() {
    let vu = false;
    try { vu = localStorage.getItem(CLE_HISTORIQUE) === '1'; } catch { vu = false; }
    if (vu) return;
    const pastille = $('assistant-fab')?.querySelector('.assistant-fab-pastille');
    if (pastille) pastille.hidden = false;
}
