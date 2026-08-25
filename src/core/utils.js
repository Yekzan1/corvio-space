// ==========================================
// VALIDATION, ERROR HANDLING & SHARED UI/DATE UTILITIES
// ==========================================
import { el } from './dom.js';
import { state } from './state.js';
// triage.js n'importe RIEN : module feuille, aucun cycle possible.
import { versDate } from './triage.js';

export const validators = {
    email: (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    password: (password) => {
        return password.length >= 6;
    },
    projectName: (name) => {
        return name.trim().length >= 2 && name.trim().length <= 50;
    },
    taskTitle: (title) => {
        return title.trim().length >= 1 && title.trim().length <= 200;
    },
    tagName: (name) => {
        return name.trim().length >= 1 && name.trim().length <= 20;
    }
};

// Un message d'erreur doit dire ce qui s'est passe ET quoi faire ensuite.
// Les libelles precedents s'arretaient au constat (« Email invalide »,
// « Une erreur est survenue »), ce qui laisse l'utilisateur sans action.
export const errorMessages = {
    'auth/invalid-credential': 'Adresse e-mail ou mot de passe incorrect. Vérifiez votre saisie, ou réinitialisez votre mot de passe.',
    'auth/email-already-in-use': 'Un compte existe déjà avec cette adresse. Connectez-vous plutôt que de créer un compte.',
    'auth/weak-password': 'Choisissez un mot de passe d\'au moins 6 caractères.',
    'auth/invalid-email': 'Cette adresse e-mail n\'est pas valide. Vérifiez le format : nom@domaine.fr',
    'auth/user-not-found': 'Aucun compte n\'est associé à cette adresse.',
    'auth/too-many-requests': 'Trop de tentatives depuis cet appareil. Patientez quelques minutes avant de réessayer.',
    'auth/network-request-failed': 'La connexion au serveur a échoué. Vérifiez votre accès à Internet, puis réessayez.',
    'permission-denied': 'Vous n\'avez pas les droits nécessaires sur ce projet.',
    'unavailable': 'Le service est momentanément injoignable. Vos modifications repartiront dès le retour de la connexion.',
    'default': 'L\'opération n\'a pas abouti. Réessayez ; si le problème persiste, rechargez la page.'
};

export function handleError(error, context = '') {
    console.warn(`[Corvio Space] ${context}:`, error?.message || error);
    if (context.includes('listener') || context.includes('loadMembers') || error?.code === 'permission-denied' || error?.code === 'unavailable') {
        return;
    }
    const message = errorMessages[error?.code] || errorMessages.default;
    toast(message, 'error');
    return message;
}

export async function safeAsync(fn, context = '') {
    try {
        return await fn();
    } catch (error) {
        handleError(error, context);
        return null;
    }
}

/* La serialisation HTML n'echappe les guillemets que dans les attributs qu'elle
   ecrit elle-meme ; dans un noeud texte elle ne traite que & < > . Un innerHTML
   pris depuis textContent laisse donc passer " et ' tels quels. Or esc() sert
   massivement en position d'ATTRIBUT (`title="${esc(nom)}"`) : sans les
   guillemets, un nom de projet valant `" onmouseover=... x="` sort de
   l'attribut et fabrique un gestionnaire d'evenement, sans avoir besoin du
   moindre < ou >. On complete donc la sortie. Pas de double echappement
   possible : & < > sont deja traites au-dessus, les guillemets restants sont
   ceux de l'entree. */
export const esc = t => {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

export const toast = (msg, type = 'info') => {
    if (!el.toastContainer) return;

    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: '&#x2713;', error: '&#x2717;', info: '&#x2139;', warning: '&#x26A0;' };
    t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${esc(msg)}</span>`;
    el.toastContainer.appendChild(t);

    // Play sound if enabled
    if (state.settings.sounds && type === 'success') {
        // Could add sound here
    }

    setTimeout(() => {
        t.classList.add('removing');
        setTimeout(() => t.remove(), 300);
    }, 3000);
};

// Couleurs d'avatar. Deux problemes avec la palette precedente :
//
// 1. Lisibilite. Les avatars portent des initiales BLANCHES, et aucun des
//    sept degrades n'atteignait le seuil WCAG AA de 4.5:1 — l'ambre tombait
//    a 1.67:1, le cyan a 1.81, l'emeraude a 1.92. Les initiales etaient
//    illisibles sur la majorite des comptes.
// 2. Identite. Le magenta, le cyan et le rouge vif etaient les elements les
//    plus satures de tout le board : les avatars criaient plus fort que les
//    taches. Un avatar sert a reconnaitre quelqu'un, pas a attirer l'oeil.
//
// Nouvelle palette : sept teintes distinctes tirees de la famille HF (vert
// foret, sable, sauge, brun, bleu-vert, olive, encre), toutes assez foncees
// pour porter du blanc. Pire contraste mesure : 5.11:1.
export const avatarColor = uid => {
    const colors = [
        'linear-gradient(135deg,#46615C,#2F3F3C)',
        'linear-gradient(135deg,#7E6A42,#56462B)',
        'linear-gradient(135deg,#56746B,#3A4E4A)',
        'linear-gradient(135deg,#6D5D38,#4A3F26)',
        'linear-gradient(135deg,#4A6670,#31454C)',
        'linear-gradient(135deg,#5F6B45,#3F472E)',
        'linear-gradient(135deg,#283533,#141C1B)'
    ];
    // Garde indispensable : la fonction faisait `uid.length` sans verifier.
    // Un commentaire dont l'auteur manque — donnee ancienne, ecriture
    // partielle — levait un TypeError dans renderComments, et l'exception
    // remontait jusqu'a openTaskModal : la tache entiere devenait
    // IMPOSSIBLE A OUVRIR. Un avatar est un detail, il ne doit jamais empecher
    // de lire la tache qui le contient.
    const cle = typeof uid === 'string' && uid ? uid : 'inconnu';
    let h = 0;
    for (let i = 0; i < cle.length; i++) {
        h = cle.charCodeAt(i) + ((h << 5) - h);
    }
    return colors[Math.abs(h) % colors.length];
};

export const timeAgo = date => {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'A l\'instant';
    if (s < 3600) return Math.floor(s / 60) + 'min';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'j';
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/**
 * Rend une date au format "AAAA-MM-JJ" dans le fuseau de l'utilisateur.
 *
 * A utiliser partout ou l'on compare une date a une echeance stockee en
 * "AAAA-MM-JJ". Le reflexe `date.toISOString().split('T')[0]` est faux : il
 * reconvertit la date en UTC. `new Date(2026, 6, 21)` vaut le 21 juillet a
 * 00h00 LOCALE, soit le 20 juillet 22h00 UTC en France — toISOString rend
 * donc "2026-07-20".
 *
 * C'est ce qui decalait TOUTES les tâches d'un jour dans le calendrier pour
 * quiconque se trouve a l'est de Greenwich, et qui faisait passer "today"
 * pour la veille entre minuit et le decalage horaire.
 */
export function toLocalISODate(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Convertit une echeance en Date exploitable.
 *
 * Les echeances sont saisies via <input type="date"> et stockees en
 * "AAAA-MM-JJ", sans heure. Or `new Date('2026-07-21')` est interprete par
 * la specification comme MINUIT UTC — ce qui produisait deux bugs :
 *
 *  1. Une tache due aujourd'hui etait declaree en retard des 00h01, puisque
 *     l'echeance etait comprise comme le DEBUT du jour au lieu de sa fin. La
 *     vue "Aujourd'hui" affichait ainsi "En retard de 19h" sur des taches
 *     rangees dans sa section "A faire aujourd'hui".
 *  2. Le parsing en UTC decalait la date selon le fuseau : a l'est de
 *     Greenwich, une date sans heure tombait la veille au soir.
 *
 * On interprete donc une date seule comme la FIN de la journee, en heure
 * locale. Une echeance qui porte deja une heure est laissee telle quelle.
 */
/**
 * Echeance d'une tache, en Date locale. Une date seule ("AAAA-MM-JJ") designe
 * un JOUR : elle est ramenee a la fin de la journee LOCALE, jamais a minuit UTC.
 *
 * Ce corps etait une COPIE affaiblie de versDate() : il ne traitait que les
 * chaines, et retombait sur `new Date(valeur)` pour tout le reste — ce qui rend
 * `Invalid Date` sur un Timestamp Firestore ({seconds, nanoseconds}), la forme
 * que prennent les dates ecrites par le SDK. La tache disparaissait alors
 * silencieusement des rappels et du tri, sans qu'aucune erreur ne le signale.
 *
 * On delegue desormais a versDate(), qui applique la MEME regle de fin de
 * journee locale et couvre les quatre formes coexistant en base. triage.js
 * n'importe rien : aucun cycle possible.
 */
export function parseDeadline(dueDate) {
    return versDate(dueDate);
}

export function getDueStatus(dueDate) {
    if (!dueDate) return null;
    const due = parseDeadline(dueDate);
    if (!due) return null;
    const diff = due - new Date();
    if (diff < 0) return 'overdue';
    if (diff < 24 * 60 * 60 * 1000) return 'soon';
    return 'later';
}

// Nombre de jours calendaires entre deux dates, en heure locale.
function ecartEnJours(a, b) {
    const jour = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((jour(a) - jour(b)) / 86400000);
}

export function formatDeadline(dueDate) {
    const due = parseDeadline(dueDate);
    if (!due) return '';
    const now = new Date();

    // Une echeance saisie sans heure designe un JOUR, pas un instant. On la
    // formule donc en jours : dire "Dans 3h" pour une tache due aujourd'hui
    // laisserait croire a une heure limite qui n'existe pas, et compter les
    // retards en heures faussait le nombre de jours maintenant que
    // l'echeance tombe en fin de journee.
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate).trim())) {
        const j = ecartEnJours(due, now);
        if (j < -1) return `En retard de ${-j}j`;
        if (j === -1) return 'En retard d\'1j';
        if (j === 0) return 'Aujourd\'hui';
        if (j === 1) return 'Demain';
        if (j < 7) return `Dans ${j}j`;
        return due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    const diff = due - now;
    if (diff < 0) {
        const hours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
        if (hours < 24) return `En retard de ${hours}h`;
        return `En retard de ${Math.floor(hours / 24)}j`;
    }
    if (diff < 60 * 60 * 1000) return `Dans ${Math.floor(diff / (1000 * 60))}min`;
    if (diff < 24 * 60 * 60 * 1000) return `Dans ${Math.floor(diff / (1000 * 60 * 60))}h`;
    if (diff < 7 * 24 * 60 * 60 * 1000) return `Dans ${Math.floor(diff / (1000 * 60 * 60 * 24))}j`;
    return due.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function highlightMatch(text, query) {
    if (!query) return esc(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return esc(text).replace(regex, '<mark>$1</mark>');
}

// parseMarkdown() vivait ici, jamais appelee par personne. Supprimee : 60
// lignes d'expressions regulieres qui produisent du HTML — donc une surface
// d'injection entretenue a cout nul de vigilance, pour une fonction que rien
// n'exerce. Si le Markdown revient dans les commentaires, il reviendra avec
// des tests.
