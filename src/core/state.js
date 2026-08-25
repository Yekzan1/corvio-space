// ==========================================
// GLOBAL ADMIN + STATE MANAGEMENT
// ==========================================

// Doit rester IDENTIQUE a la liste de isGlobalAdmin() dans firestore.rules.
// Un test verrouille cette egalite (test/unit/regles-firestore.test.js) : si
// les deux divergent, l'interface montre des pouvoirs que le serveur refuse,
// ou — bien pire — l'inverse.
// Gele : cette constante est exportee et contient un tableau. Sans gel, un
// appelant peut la muter en place et contaminer tous les autres.
export const GLOBAL_ADMINS = Object.freeze(['contact.corvio@icloud.com']);

// Decision proprietaire (2026-07-25) : l'exigence `emailVerified` a ete retiree.
// L'app a un unique administrateur (le proprietaire), dont les adresses
// ci-dessus sont deja enregistrees sur Firebase et ne peuvent donc pas etre
// re-creees par un tiers — le risque que couvrait la verification est nul ici.
// A retablir (`&& u.emailVerified === true`, + `email_verified` dans les regles)
// si l'admin s'ouvre un jour a d'autres comptes.
export function isGlobalAdmin() {
    const u = state.currentUser;
    return !!u && GLOBAL_ADMINS.includes(u.email?.toLowerCase());
}

// ---- Free trial helpers ----
// Le type est verifie explicitement. `trialEndsAt` vient de Firestore : un
// nombre (`99999999999999`) ou un objet y passeraient `new Date(...)` et
// rendraient une date lointaine, donc un essai perpetuel. Les regles bornent
// deja ce champ a la creation ; ceci est la seconde ligne, pour les documents
// ecrits avant le durcissement des regles.
export function isTrialActive() {
    const t = state.userProfile?.trialEndsAt;
    if (typeof t !== 'string' || t === '') return false;
    const fin = new Date(t).getTime();
    return Number.isFinite(fin) && fin > Date.now();
}
// trialDaysLeft() vivait ici sans qu'aucun appelant ne l'utilise. Supprimee :
// une fonction exportee jamais appelee donne l'illusion qu'un compte a rebours
// d'essai existe quelque part dans l'interface, alors que rien n'annonce jamais
// a l'utilisateur combien de jours il lui reste. Le manque est reel — il est
// note comme une evolution a decider, pas maquille par du code mort.

export const state = {
    currentUser: null,
    userProfile: null,
    projects: [],
    tasks: [],
    archivedTasks: [],
    tags: [],
    notifications: [],
    projectMembers: [],
    templates: [],
    currentProjectId: null,
    editingTaskId: null,
    draggedTask: null,
    currentView: 'board', // board, calendar, analytics
    filters: {
        search: '',
        tags: [],
        priority: null,
        assignee: null,
        status: null,
        dateRange: null,
        showArchived: false
    },
    // `theme` a ete retire : src/ui.js l'ECRIVAIT a chaque bascule et personne
    // ne l'a jamais relu. La source de verite du theme est l'attribut
    // data-theme sur <html>, pose par ui.js et par le script anti-flash de
    // index.html — deux ecrivains pour une meme verite, c'est un de trop.
    settings: JSON.parse(localStorage.getItem('corviospace-settings')) || {
        notifications: true,
        sounds: true,
        compactMode: false
    },
    timeTracking: {},
    unsubscribers: {},
    // v5 features
    myTasks: [],            // tasks assigned to me, cross-projects
    selectedTaskIds: new Set(), // bulk selection
    presence: [],           // others currently viewing the same project
    focusedTaskId: null,
    publicView: false,      // true if viewing via ?share=
    publicProjectData: null,
    editingProjectId: null  // for project edit mode
};
