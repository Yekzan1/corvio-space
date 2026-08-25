// ==========================================
// CERVEAU DE L'ASSISTANT — LOGIQUE PURE
// ==========================================
// Le « moteur » du chatbot, entierement code a la main : aucun LLM, aucun
// appel reseau, aucune cle secrete. C'est un choix impose par l'architecture —
// Corvio Space est une application STATIQUE servie par Netlify, sans backend : une
// vraie cle d'API vivrait en clair dans le bundle public, exactement la fuite
// que la session securite a fermee. Un cerveau deterministe, ecrit ici, ne
// fuite rien et repond instantanement.
//
// Ce fichier ne touche NI au DOM NI a Firestore : il prend du texte et un
// contexte de donnees, il rend une intention, une reponse redigee, et
// eventuellement une action a executer. C'est ce qui le rend testable — on
// peut lui poser trente questions avec des donnees inventees et une date figee.
// L'interface (src/assistant.js) se charge d'afficher la reponse et d'executer
// l'action, jamais l'inverse.
//
// « Intelligent » sans LLM veut dire, concretement :
//   - comprendre le francais courant malgre les accents, la ponctuation et les
//     variantes (« en retard », « depasse », « en retard de » ) ;
//   - extraire des entites reelles : dates (« demain », « vendredi », « cette
//     semaine »), personnes (par leur nom), priorites, statuts, projets ;
//   - repondre avec les VRAIS chiffres de l'utilisateur, calcules par la meme
//     couche que le tableau de bord (core/triage.js) — jamais une phrase creuse ;
//   - ne jamais inventer : hors de son champ, il le dit et propose ce qu'il
//     sait faire, au lieu d'halluciner une reponse.

import {
    versDate, debutDuJour, finDuJour,
    PRIORITES, STATUTS, statutDe, prioriteDe,
    calculerTemps, formatDureeLongue
} from './triage.js';

// ------------------------------------------------------------------
// Normalisation
// ------------------------------------------------------------------

/**
 * Ramene un texte a une forme comparable : minuscules, sans accents, sans
 * ponctuation superflue. C'est la premiere condition de robustesse — sans ca,
 * « échéance », « echeance » et « Echeance ? » seraient trois entrees
 * differentes, et l'utilisateur qui tape vite serait puni pour ses accents.
 */
export function normaliser(texte) {
    return String(texte || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents (diacritiques combinants)
        .replace(/['’]/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Vrai si `mot` apparait comme mot entier dans `texte` normalise. */
function contient(texte, mot) {
    return new RegExp(`(^|\\s)${mot}(\\s|$)`).test(texte);
}

/** Vrai si l'un des motifs (deja normalises) est present. */
function contientUn(texte, motifs) {
    return motifs.some(m => (m.includes(' ') ? texte.includes(m) : contient(texte, m)));
}

// ------------------------------------------------------------------
// Extraction d'une plage de dates
// ------------------------------------------------------------------

const JOURS_SEMAINE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Reconnait une expression temporelle et rend `{ cle, libelle, debut, fin }`,
 * ou null si le texte n'en contient aucune. Les bornes sont en heure locale.
 *
 * Couvre ce qu'un utilisateur formule vraiment : aujourd'hui, demain, cette
 * semaine, la semaine prochaine, ce mois, un jour nomme (« vendredi »),
 * « dans 3 jours ». « en retard » n'est PAS une plage : c'est un etat
 * (echeance passee ET non termine), traite ailleurs.
 */
export function extrairePlage(texteNorm, maintenant = new Date()) {
    const jour = 24 * 60 * 60 * 1000;
    const aujDebut = debutDuJour(maintenant);
    const aujFin = finDuJour(maintenant);

    if (contientUn(texteNorm, ["aujourd hui", 'aujourdhui', 'ce jour'])) {
        return { cle: 'aujourdhui', libelle: "aujourd'hui", debut: aujDebut, fin: aujFin };
    }
    if (contient(texteNorm, 'demain')) {
        const d = new Date(aujDebut.getTime() + jour);
        return { cle: 'demain', libelle: 'demain', debut: debutDuJour(d), fin: finDuJour(d) };
    }
    if (contient(texteNorm, 'hier')) {
        const d = new Date(aujDebut.getTime() - jour);
        return { cle: 'hier', libelle: 'hier', debut: debutDuJour(d), fin: finDuJour(d) };
    }
    if (texteNorm.includes('semaine prochaine') || texteNorm.includes('la semaine prochaine')) {
        const debutSemaine = debutLundi(maintenant);
        const debut = new Date(debutSemaine.getTime() + 7 * jour);
        return { cle: 'semaine-prochaine', libelle: 'la semaine prochaine', debut, fin: finDuJour(new Date(debut.getTime() + 6 * jour)) };
    }
    if (texteNorm.includes('cette semaine') || contient(texteNorm, 'semaine')) {
        const debut = debutLundi(maintenant);
        return { cle: 'semaine', libelle: 'cette semaine', debut, fin: finDuJour(new Date(debut.getTime() + 6 * jour)) };
    }
    if (texteNorm.includes('ce mois') || contient(texteNorm, 'mois')) {
        return {
            cle: 'mois', libelle: 'ce mois-ci',
            debut: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1, 0, 0, 0, 0),
            fin: new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0, 23, 59, 59, 999)
        };
    }
    const dansX = texteNorm.match(/dans (\d+) jour/);
    if (dansX) {
        const n = parseInt(dansX[1], 10);
        const d = new Date(aujDebut.getTime() + n * jour);
        return { cle: 'dans-x', libelle: `dans ${n} jour${n > 1 ? 's' : ''}`, debut: aujDebut, fin: finDuJour(d) };
    }
    for (let i = 0; i < JOURS_SEMAINE.length; i++) {
        if (contient(texteNorm, JOURS_SEMAINE[i])) {
            const d = prochainJour(maintenant, i);
            return { cle: 'jour-nomme', libelle: JOURS_SEMAINE[i], debut: debutDuJour(d), fin: finDuJour(d) };
        }
    }
    return null;
}

/** Lundi 00h00 de la semaine contenant `d` (la semaine francaise commence lundi). */
function debutLundi(d) {
    const base = debutDuJour(d);
    const delta = (base.getDay() + 6) % 7; // 0 = lundi
    return new Date(base.getTime() - delta * 24 * 60 * 60 * 1000);
}

/** Prochaine occurrence du jour de semaine `cible` (0=dimanche), aujourd'hui inclus. */
function prochainJour(d, cible) {
    const base = debutDuJour(d);
    const delta = (cible - base.getDay() + 7) % 7;
    return new Date(base.getTime() + delta * 24 * 60 * 60 * 1000);
}

// ------------------------------------------------------------------
// Extraction des autres entites
// ------------------------------------------------------------------

/** Une priorite nommee, ou null. */
export function extrairePriorite(texteNorm) {
    if (contientUn(texteNorm, ['haute', 'urgente', 'urgent', 'importante', 'prioritaire'])) return 'high';
    if (contientUn(texteNorm, ['moyenne', 'normale'])) return 'medium';
    if (contientUn(texteNorm, ['basse', 'faible'])) return 'low';
    return null;
}

/** Un statut nomme, ou null. */
export function extraireStatut(texteNorm) {
    if (contientUn(texteNorm, ['terminee', 'terminees', 'termine', 'finie', 'finies', 'faite', 'faites', 'achevee', 'achevees'])) return 'done';
    if (texteNorm.includes('en cours')) return 'inprogress';
    if (texteNorm.includes('en revue') || texteNorm.includes('a relire')) return 'review';
    if (texteNorm.includes('a faire')) return 'todo';
    return null;
}

/**
 * La premiere personne connue citee dans le texte. On matche sur le prenom, le
 * nom complet ou l'email : « les taches de amelie » doit trouver Amélie
 * Rousseau. On exige au moins 3 lettres pour ne pas confondre un fragment.
 */
export function extrairePersonne(texteNorm, membres = []) {
    for (const m of membres) {
        const candidats = [m.nom, ...(m.nom || '').split(/\s+/), (m.email || '').split('@')[0]]
            .map(normaliser)
            .filter(x => x && x.length >= 3);
        for (const c of candidats) {
            if (contient(texteNorm, c)) return m;
        }
    }
    return null;
}

/** Le premier projet connu cite dans le texte. */
export function extraireProjet(texteNorm, projets = []) {
    for (const p of projets) {
        const nom = normaliser(p.name || p.nom);
        if (nom && nom.length >= 3 && texteNorm.includes(nom)) return p;
    }
    return null;
}

// ------------------------------------------------------------------
// Predicats sur les taches
// ------------------------------------------------------------------

const estActive = t => t.status !== 'done';
const enRetard = (t, maintenant) => {
    if (t.status === 'done') return false;
    const d = versDate(t.dueDate);
    return !!d && d < maintenant;
};
const dansPlage = (t, plage) => {
    const d = versDate(t.dueDate);
    if (!d) return false;
    if (plage.debut && d < plage.debut) return false;
    if (plage.fin && d > plage.fin) return false;
    return true;
};

/** Trie par echeance croissante, les sans-date en fin. */
function parEcheance(taches) {
    return [...taches].sort((a, b) => {
        const da = versDate(a.dueDate), db = versDate(b.dueDate);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da - db;
    });
}

/** Formulation d'une echeance relative, courte, pour une phrase. */
function echeanceCourte(t, maintenant) {
    const d = versDate(t.dueDate);
    if (!d) return 'sans échéance';
    const jours = Math.round((debutDuJour(d) - debutDuJour(maintenant)) / 86400000);
    if (jours < 0) return `en retard de ${-jours} j`;
    if (jours === 0) return "aujourd'hui";
    if (jours === 1) return 'demain';
    return `dans ${jours} j`;
}

// ------------------------------------------------------------------
// Registre des intentions
// ------------------------------------------------------------------
//
// Chaque intention declare des mots-cles qui la font marquer des points, et un
// gestionnaire qui produit la reponse a partir du contexte. On additionne les
// points plutot que d'enchainer des if : une phrase melangeant plusieurs
// signaux (« combien de taches en retard cette semaine ») est ainsi arbitree
// par la force du signal, pas par l'ordre du code. La meilleure intention
// l'emporte ; a egalite nulle, on tombe dans le repli, qui ne m
// 'invente' rien.

const SALUTATIONS = ['bonjour', 'salut', 'coucou', 'bonsoir', 'hello', 'hey', 'yo'];
const REMERCIEMENTS = ['merci', 'super', 'parfait', 'genial', 'nickel', 'top'];

// ------------------------------------------------------------------
// Perimetre : « mes taches » vs « le projet »
// ------------------------------------------------------------------
//
// L'assistant raisonne sur ce que l'application a deja en memoire, sans
// requete reseau : `mesTaches` (mes taches, tous projets confondus) et
// `tachesProjet` (le projet couramment ouvert, tous ses membres). Il choisit
// selon la question et l'ANNONCE toujours — un chiffre dont on ignore le
// perimetre ne vaut rien. Pour une vraie vue « toute l'equipe, tous projets »,
// il oriente vers le tableau de bord, qui charge tout.

function choisirPerimetre(texteNorm, ctx) {
    const versProjet = contientUn(texteNorm, ['le projet', 'ce projet', 'du projet', 'equipe', 'l equipe', 'tout le monde', 'chacun', 'qui']);
    const versMoi = contientUn(texteNorm, ['mes', 'ma', 'mon', 'je', 'moi', 'me', 'assignee']);
    if (versProjet && !versMoi) {
        return { taches: ctx.tachesProjet || [], libelle: `sur le projet « ${ctx.projetCourantNom || 'courant'} »`, estProjet: true };
    }
    return { taches: ctx.mesTaches || [], libelle: 'sur vos tâches', estProjet: false };
}

const INTENTIONS = [
    // ---- Politesse ----
    {
        nom: 'saluer',
        marquer: t => (contientUn(t, SALUTATIONS) ? 3 : 0) + (t.split(' ').length <= 3 && contientUn(t, SALUTATIONS) ? 2 : 0),
        gerer: (ctx) => ({
            texte: `Bonjour${ctx.prenom ? ' ' + ctx.prenom : ''} ! Je suis votre assistant Corvio Space. Je connais vos tâches, vos échéances et votre charge — demandez-moi ce qui est en retard, ce qui arrive cette semaine, ou dites-moi de créer une tâche.`,
            suggestions: ["Qu'est-ce qui est en retard ?", 'Mes tâches cette semaine', 'Où en est ma charge ?']
        })
    },
    {
        nom: 'remercier',
        marquer: t => (contientUn(t, REMERCIEMENTS) && t.split(' ').length <= 4 ? 4 : 0),
        gerer: () => ({
            texte: 'Avec plaisir. Autre chose ?',
            suggestions: ["Qu'est-ce qui est en retard ?", 'Ma charge de travail']
        })
    },

    // ---- Retards ----
    {
        nom: 'retards',
        // Singulier ET pluriel : le matching se fait par mot entier, « retards »
        // ne derive pas de « retard » tout seul.
        marquer: t => contientUn(t, ['en retard', 'retard', 'retards', 'depasse', 'depassee', 'depassees', 'en souffrance', 'overdue']) ? 5 : 0,
        gerer: (ctx, texteNorm) => {
            const p = choisirPerimetre(texteNorm, ctx);
            const retards = parEcheance(p.taches.filter(t => enRetard(t, ctx.maintenant)));
            if (!retards.length) {
                return { texte: `Rien en retard ${p.libelle}.`, suggestions: ["Qu'est-ce qui arrive cette semaine ?"] };
            }
            const tete = retards[0];
            const detail = retards.length === 1
                ? `« ${tete.title} », ${echeanceCourte(tete, ctx.maintenant)}.`
                : `La plus ancienne : « ${tete.title} », ${echeanceCourte(tete, ctx.maintenant)}.`;
            return {
                texte: `Vous avez **${retards.length} tâche${retards.length > 1 ? 's' : ''} en retard** ${p.libelle}. ${detail}`,
                taches: retards.slice(0, 6),
                action: { type: 'naviguer', vue: 'dashboard', rapide: 'retard', libelle: 'Voir toutes les tâches en retard' },
                suggestions: ['Ouvrir le tableau de bord', 'Ma charge de travail']
            };
        }
    },

    // ---- Echeances a venir ----
    {
        nom: 'echeances',
        marquer: (t) => {
            let s = 0;
            if (contientUn(t, ['echeance', 'echeances', 'du', 'due', 'dues', 'a rendre', 'prevu', 'prevues', 'arrive', 'arrivent'])) s += 3;
            if (extrairePlage(t)) s += 3;
            return s;
        },
        gerer: (ctx, texteNorm) => {
            const p = choisirPerimetre(texteNorm, ctx);
            const plage = extrairePlage(texteNorm, ctx.maintenant) || {
                cle: 'a-venir', libelle: 'à venir', debut: debutDuJour(ctx.maintenant), fin: null
            };
            const dans = parEcheance(p.taches.filter(t => estActive(t) && dansPlage(t, plage)));
            if (!dans.length) {
                return { texte: `Aucune tâche active ${plage.libelle} ${p.libelle}.`, suggestions: ["Qu'est-ce qui est en retard ?"] };
            }
            return {
                texte: `**${dans.length} tâche${dans.length > 1 ? 's' : ''}** ${plage.libelle} ${p.libelle}${dans[0] ? `, à commencer par « ${dans[0].title} » (${echeanceCourte(dans[0], ctx.maintenant)}).` : '.'}`,
                taches: dans.slice(0, 6),
                action: { type: 'naviguer', vue: 'calendar', libelle: 'Ouvrir le calendrier' },
                suggestions: ['Ouvrir le calendrier', "Qu'est-ce qui est en retard ?"]
            };
        }
    },

    // ---- Charge / qui ----
    {
        nom: 'charge',
        marquer: t => contientUn(t, ['charge', 'qui a le plus', 'repartition', 'combien chacun', 'qui travaille', 'surcharge', 'qui fait quoi']) ? 5 : 0,
        gerer: (ctx, texteNorm) => {
            const personne = extrairePersonne(texteNorm, ctx.membres);
            const base = ctx.tachesProjet && ctx.tachesProjet.length ? ctx.tachesProjet : ctx.mesTaches;
            if (personne) {
                const sien = base.filter(t => t.assigneeId === personne.uid);
                const actives = sien.filter(estActive).length;
                const retards = sien.filter(t => enRetard(t, ctx.maintenant)).length;
                return {
                    texte: `**${personne.nom}** a ${actives} tâche${actives > 1 ? 's' : ''} active${actives > 1 ? 's' : ''}${retards ? `, dont **${retards} en retard**` : ''}, sur le projet « ${ctx.projetCourantNom || 'courant'} ».`,
                    suggestions: ['Charge de toute l’équipe', "Qu'est-ce qui est en retard ?"]
                };
            }
            // Repartition par personne sur le projet courant
            const parUid = new Map();
            for (const t of base) {
                if (!t.assigneeId) continue;
                const e = parUid.get(t.assigneeId) || { actives: 0, retards: 0 };
                if (estActive(t)) e.actives++;
                if (enRetard(t, ctx.maintenant)) e.retards++;
                parUid.set(t.assigneeId, e);
            }
            if (!parUid.size) {
                return { texte: 'Aucune tâche assignée pour le moment. Le tableau de bord détaille la charge dès qu’une tâche est attribuée.', action: { type: 'naviguer', vue: 'dashboard', libelle: 'Ouvrir le tableau de bord' } };
            }
            const classe = [...parUid.entries()].sort((a, b) => b[1].actives - a[1].actives);
            const nom = uid => (ctx.membres.find(m => m.uid === uid)?.nom) || 'Quelqu’un';
            const tete = classe[0];
            return {
                texte: `Le plus chargé : **${nom(tete[0])}** avec ${tete[1].actives} tâche${tete[1].actives > 1 ? 's' : ''} active${tete[1].actives > 1 ? 's' : ''}${tete[1].retards ? ` (${tete[1].retards} en retard)` : ''}. Le tableau de bord donne la répartition complète.`,
                action: { type: 'naviguer', vue: 'dashboard', libelle: 'Voir la charge de l’équipe' },
                suggestions: ['Ouvrir le tableau de bord']
            };
        }
    },

    // ---- Statistiques / bilan ----
    {
        nom: 'stats',
        marquer: t => contientUn(t, ['combien', 'total', 'bilan', 'resume', 'statistiques', 'stats', 'taux', 'avancement', 'ou en est', 'ou en sont']) ? 4 : 0,
        gerer: (ctx, texteNorm) => {
            const p = choisirPerimetre(texteNorm, ctx);
            const statut = extraireStatut(texteNorm);
            const priorite = extrairePriorite(texteNorm);

            if (statut) {
                const n = p.taches.filter(t => (t.status || 'todo') === statut).length;
                // Accord au feminin : le sujet est toujours « tâche ». Le libelle
                // de STATUTS est au masculin (« Terminé »), il donnerait « tâche
                // terminé ». On passe donc par des formes accordees.
                const FEM = { todo: 'à faire', inprogress: 'en cours', review: 'en revue', done: n > 1 ? 'terminées' : 'terminée' };
                return { texte: `**${n}** tâche${n > 1 ? 's' : ''} ${FEM[statut]} ${p.libelle}.` };
            }
            if (priorite) {
                const n = p.taches.filter(t => estActive(t) && (t.priority || 'medium') === priorite).length;
                return { texte: `**${n}** tâche${n > 1 ? 's' : ''} active${n > 1 ? 's' : ''} en priorité ${PRIORITES[priorite].libelle.toLowerCase()} ${p.libelle}.` };
            }
            if (texteNorm.includes('temps')) {
                const temps = calculerTemps(p.taches);
                return temps.chronometrees
                    ? { texte: `**${formatDureeLongue(temps.total)}** suivis ${p.libelle}, sur ${temps.chronometrees} tâche${temps.chronometrees > 1 ? 's' : ''} chronométrée${temps.chronometrees > 1 ? 's' : ''}.` }
                    : { texte: `Aucun temps encore chronométré ${p.libelle}.` };
            }

            const total = p.taches.length;
            const terminees = p.taches.filter(t => t.status === 'done').length;
            const actives = total - terminees;
            const retards = p.taches.filter(t => enRetard(t, ctx.maintenant)).length;
            const taux = total ? Math.round((terminees / total) * 100) : 0;
            return {
                texte: `${p.libelle.charAt(0).toUpperCase() + p.libelle.slice(1)} : **${total} tâche${total > 1 ? 's' : ''}**, ${actives} active${actives > 1 ? 's' : ''}, ${terminees} terminée${terminees > 1 ? 's' : ''} (${taux} %)${retards ? `, **${retards} en retard**` : ''}.`,
                action: { type: 'naviguer', vue: 'dashboard', libelle: 'Ouvrir le tableau de bord' },
                suggestions: ['Ouvrir le tableau de bord', "Qu'est-ce qui est en retard ?"]
            };
        }
    },

    // ---- Sans assigne / sans echeance ----
    {
        nom: 'anomalies',
        marquer: t => (t.includes('sans assigne') || t.includes('sans personne') || t.includes('non assignee') || t.includes('sans echeance') || t.includes('sans date')) ? 5 : 0,
        gerer: (ctx, texteNorm) => {
            const p = choisirPerimetre(texteNorm, ctx);
            const sansEcheance = texteNorm.includes('echeance') || texteNorm.includes('date');
            if (sansEcheance) {
                const liste = p.taches.filter(t => estActive(t) && !versDate(t.dueDate));
                return liste.length
                    ? { texte: `**${liste.length} tâche${liste.length > 1 ? 's' : ''} active${liste.length > 1 ? 's' : ''} sans échéance** ${p.libelle}. Sans date, elles n’apparaissent ni dans le calendrier ni dans les rappels.`, taches: liste.slice(0, 6) }
                    : { texte: `Toutes vos tâches actives ont une échéance ${p.libelle}.` };
            }
            const liste = p.taches.filter(t => estActive(t) && !t.assigneeId);
            return liste.length
                ? { texte: `**${liste.length} tâche${liste.length > 1 ? 's' : ''} sans personne assignée** ${p.libelle}.`, taches: liste.slice(0, 6), action: { type: 'naviguer', vue: 'dashboard', rapide: 'sansAssigne', libelle: 'Les voir dans le tableau de bord' } }
                : { texte: `Chaque tâche active a quelqu’un dessus ${p.libelle}.` };
        }
    },

    // ---- Navigation ----
    {
        nom: 'naviguer',
        marquer: t => {
            let s = contientUn(t, ['ouvre', 'ouvrir', 'montre', 'affiche', 'affiches', 'va', 'aller', 'passe', 'bascule', 'active']) ? 2 : 0;
            if (contientUn(t, ['tableau de bord', 'dashboard', 'calendrier', 'mes taches', 'aujourd hui', 'mode nuit', 'mode jour', 'mode sombre', 'mode clair'])) s += 3;
            return s;
        },
        gerer: (ctx, texteNorm) => {
            if (texteNorm.includes('mode nuit') || texteNorm.includes('mode sombre')) {
                return { texte: 'J’active le mode nuit.', action: { type: 'theme', valeur: 'sombre' } };
            }
            if (texteNorm.includes('mode jour') || texteNorm.includes('mode clair')) {
                return { texte: 'J’active le mode jour.', action: { type: 'theme', valeur: 'clair' } };
            }
            const cibles = [
                { motifs: ['tableau de bord', 'dashboard'], vue: 'dashboard', nom: 'le tableau de bord' },
                { motifs: ['calendrier'], vue: 'calendar', nom: 'le calendrier' },
                { motifs: ['mes taches'], vue: 'mytasks', nom: 'vos tâches' },
                { motifs: ['aujourd hui', 'aujourdhui'], vue: 'today', nom: "la vue Aujourd'hui" },
                { motifs: ['tableau', 'board', 'kanban'], vue: 'board', nom: 'le tableau' }
            ];
            for (const c of cibles) {
                if (contientUn(texteNorm, c.motifs)) {
                    return { texte: `J’ouvre ${c.nom}.`, action: { type: 'naviguer', vue: c.vue, immediat: true } };
                }
            }
            return null; // pas de cible reconnue -> laisse une autre intention ou le repli gerer
        }
    },

    // ---- Creation de tache ----
    {
        nom: 'creer',
        marquer: t => contientUn(t, ['cree', 'creer', 'ajoute', 'ajouter', 'nouvelle tache', 'note', 'rappelle', 'planifie']) ? 5 : 0,
        gerer: (ctx, texteNorm, texteBrut) => {
            const brouillon = construireBrouillon(texteBrut, texteNorm, ctx);
            if (!brouillon.title) {
                return { texte: 'Bien sûr — quel est le titre de la tâche ? Par exemple : « crée une tâche Rappeler le client pour demain en priorité haute ».' };
            }
            const bouts = [`« ${brouillon.title} »`];
            if (brouillon._echeanceLibelle) bouts.push(`échéance ${brouillon._echeanceLibelle}`);
            if (brouillon.priority) bouts.push(`priorité ${PRIORITES[brouillon.priority].libelle.toLowerCase()}`);
            return {
                texte: `Je prépare une tâche : ${bouts.join(', ')}. Je la crée dans « ${ctx.projetCourantNom || 'le projet courant'} » ?`,
                action: { type: 'creer-tache', brouillon, libelle: 'Créer la tâche' },
                suggestions: []
            };
        }
    },

    // ---- Aide ----
    {
        nom: 'aide',
        marquer: t => contientUn(t, ['aide', 'comment', 'que sais tu', 'que peux tu', 'tu sais faire', 'aidez moi', 'help']) ? 3 : 0,
        gerer: () => ({
            texte: 'Je peux vous renseigner et agir. Essayez :\n• « Qu’est-ce qui est en retard ? »\n• « Mes tâches cette semaine »\n• « Qui a le plus de travail ? »\n• « Combien de tâches terminées ? »\n• « Crée une tâche Relancer le client pour vendredi en priorité haute »\n• « Ouvre le tableau de bord » · « Passe en mode nuit »',
            suggestions: ["Qu'est-ce qui est en retard ?", 'Ma charge de travail', 'Ouvrir le tableau de bord']
        })
    }
];

// ------------------------------------------------------------------
// Construction d'un brouillon de tache a partir d'une phrase
// ------------------------------------------------------------------

function construireBrouillon(texteBrut, texteNorm, ctx) {
    const plage = extrairePlage(texteNorm, ctx.maintenant);
    const priorite = extrairePriorite(texteNorm);
    const personne = extrairePersonne(texteNorm, ctx.membres);

    // Le titre est ce qui reste apres avoir retire le verbe de creation et les
    // fragments deja compris (date, priorite, liaisons). On travaille sur le
    // texte BRUT pour garder les accents et la casse du titre.
    let titre = texteBrut
        .replace(/^\s*(cr[ée]{2}r?|cr[ée]e|ajoute[r]?|nouvelle t[âa]che|note[r]?|rappelle[- ]?moi de|rappelle|planifie[r]?)\s+/i, '')
        // « (une) tâche [de/pour/:] » en tete, meme sans rien apres (« crée une
        // tâche » tout court doit laisser un titre VIDE, pas « une tâche »).
        .replace(/^\s*(une?\s+)?t[âa]che\b\s*(de\s+|pour\s+|:\s*)?/i, '')
        .replace(/\bpour\s+(demain|aujourd['’ ]?hui|hier|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|cette\s+semaine|la\s+semaine\s+prochaine|ce\s+mois([- ]ci)?|dans\s+\d+\s+jours?)\b/gi, '')
        .replace(/\b(en\s+)?priorit[ée]\s+(haute|urgente|moyenne|normale|basse|faible)\b/gi, '')
        .replace(/\b(urgent[e]?|prioritaire)\b/gi, '')
        .replace(/\bpour\s+[A-ZÀ-Ý][a-zà-ÿ]+\b/g, '') // "pour Amélie"
        .replace(/\s{2,}/g, ' ')
        .replace(/[\s,;:.]+$/, '')
        .trim();

    // Coupe une eventuelle amorce residuelle.
    titre = titre.replace(/^(de|d['’]|pour|:)\s+/i, '').trim();
    if (titre) titre = titre.charAt(0).toUpperCase() + titre.slice(1);

    const brouillon = { title: titre, priority: priorite || undefined };
    if (plage) {
        // Une echeance saisie sans heure = un jour : on stocke "AAAA-MM-JJ",
        // comme le reste de l'app (voir toLocalISODate / parseDeadline).
        const d = plage.debut;
        brouillon.dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        brouillon._echeanceLibelle = plage.libelle;
    }
    if (personne) brouillon.assigneeId = personne.uid;
    return brouillon;
}

// ------------------------------------------------------------------
// Orchestration
// ------------------------------------------------------------------

/**
 * Analyse une entree et rend la reponse de l'assistant.
 *
 * @param {string} texte
 * @param {object} contexte  { mesTaches, tachesProjet, projets, membres, uid,
 *                             prenom, projetCourantNom, maintenant }
 * @returns {{ intention, texte, action?, taches?, suggestions? }}
 */
export function analyser(texte, contexte = {}) {
    const ctx = { maintenant: new Date(), membres: [], projets: [], mesTaches: [], tachesProjet: [], ...contexte };
    const texteBrut = String(texte || '').trim();
    const texteNorm = normaliser(texteBrut);

    if (!texteNorm) {
        return { intention: 'vide', texte: 'Posez-moi une question sur vos tâches, ou dites-moi quoi faire.', suggestions: ["Qu'est-ce qui est en retard ?", 'Ma charge de travail'] };
    }

    // Score chaque intention, garde la meilleure strictement positive.
    let meilleure = null, meilleurScore = 0;
    for (const intention of INTENTIONS) {
        const score = intention.marquer(texteNorm);
        if (score > meilleurScore) { meilleurScore = score; meilleure = intention; }
    }

    if (meilleure) {
        const res = meilleure.gerer(ctx, texteNorm, texteBrut);
        // Un gestionnaire peut renoncer (rend null) s'il ne trouve pas de quoi
        // repondre precisement — on bascule alors sur le repli plutot que
        // d'afficher du vide.
        if (res) return { intention: meilleure.nom, ...res };
    }

    return repli(texteNorm, ctx);
}

/**
 * Repli quand aucune intention ne l'emporte. Ne dit JAMAIS un simple « je n'ai
 * pas compris » : il tente une supposition a partir des entites presentes, et a
 * defaut propose ce qu'il sait faire. Un assistant qui renvoie l'utilisateur a
 * lui-meme n'aide personne.
 */
function repli(texteNorm, ctx) {
    const plage = extrairePlage(texteNorm, ctx.maintenant);
    if (plage) {
        const dans = parEcheance((ctx.mesTaches || []).filter(t => estActive(t) && dansPlage(t, plage)));
        return {
            intention: 'suppose-echeances',
            texte: dans.length
                ? `Je suppose que vous parlez des échéances ${plage.libelle} : **${dans.length} tâche${dans.length > 1 ? 's' : ''}** sur vos tâches.`
                : `Aucune tâche ${plage.libelle} sur vos tâches. Reformulez si vous cherchiez autre chose.`,
            taches: dans.slice(0, 6),
            suggestions: ["Qu'est-ce qui est en retard ?", 'Ma charge de travail']
        };
    }
    const personne = extrairePersonne(texteNorm, ctx.membres);
    if (personne) {
        const base = (ctx.tachesProjet && ctx.tachesProjet.length ? ctx.tachesProjet : ctx.mesTaches) || [];
        const actives = base.filter(t => t.assigneeId === personne.uid && estActive(t)).length;
        return {
            intention: 'suppose-personne',
            texte: `**${personne.nom}** a ${actives} tâche${actives > 1 ? 's' : ''} active${actives > 1 ? 's' : ''} sur le projet courant.`,
            suggestions: ['Charge de toute l’équipe']
        };
    }
    return {
        intention: 'inconnu',
        texte: "Je n’ai pas saisi la demande — mais voici ce que je sais faire :\n• retards, échéances, charge, bilan\n• créer une tâche\n• naviguer dans l’app\nReformulez, ou choisissez ci-dessous.",
        suggestions: ["Qu'est-ce qui est en retard ?", 'Mes tâches cette semaine', 'Ouvrir le tableau de bord']
    };
}
