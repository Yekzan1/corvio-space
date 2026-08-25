// ==========================================
// DOM HELPERS + DOM ELEMENT CACHE
// ==========================================

export const $ = id => document.getElementById(id);
export const $$ = sel => document.querySelectorAll(sel);
export const createElement = (tag, className, innerHTML) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
};

// Cache of frequently-used DOM references, captured once at module load
// (index.html is fully parsed by then: app.js loads as `type="module"` at
// the end of <body>). Mutated in place elsewhere (e.g. el.columns/el.counts
// get reassigned by renderCustomColumns) — never reassign `el` itself.
export const el = {
    authContainer: $('auth-container'),
    appContainer: $('app'),
    loginForm: $('login-form'),
    registerForm: $('register-form'),
    loginEmail: $('login-email'),
    loginPassword: $('login-password'),
    registerName: $('register-name'),
    registerEmail: $('register-email'),
    registerPassword: $('register-password'),
    registerPasswordConfirm: $('register-password-confirm'),
    showRegister: $('show-register'),
    showLogin: $('show-login'),
    authError: $('auth-error'),
    userAvatar: $('user-avatar'),
    userAvatarInitiale: $('user-avatar-initiale'),
    userName: $('user-name'),
    userHandle: $('user-handle'),
    userEmail: $('user-email'),
    logoutBtn: $('logout-btn'),
    projectsList: $('projects-list'),
    addProjectBtn: $('add-project-btn'),
    progressPercent: $('progress-percent'),
    progressFill: $('progress-fill'),
    completedCount: $('completed-count'),
    totalCount: $('total-count'),
    sidebar: document.querySelector('.sidebar'),
    projectTitle: $('project-title'),
    projectDescription: $('project-description'),
    searchInput: $('search-input'),
    addTaskBtn: $('add-task-btn'),
    mobileMenu: $('mobile-menu'),
    membersAvatars: $('members-avatars'),
    addMemberBtn: $('add-member-btn'),
    notificationsBtn: $('notifications-btn'),
    notificationBadge: $('notification-badge'),
    notificationsPanel: $('notifications-panel'),
    notificationsList: $('notifications-list'),
    markAllRead: $('mark-all-read'),
    board: $('board'),
    emptyBoard: $('empty-board'),
    createFirstProject: $('create-first-project'),
    columns: {
        todo: $('todo-tasks'),
        inprogress: $('inprogress-tasks'),
        review: $('review-tasks'),
        done: $('done-tasks')
    },
    counts: {
        todo: $('todo-count'),
        inprogress: $('inprogress-count'),
        review: $('review-count'),
        done: $('done-count')
    },
    projectModal: $('project-modal'),
    projectForm: $('project-form'),
    projectName: $('project-name'),
    projectDesc: $('project-desc'),
    memberModal: $('member-modal'),
    memberForm: $('member-form'),
    memberEmail: $('member-email'),
    modalMembersList: $('modal-members-list'),
    tagModal: $('tag-modal'),
    tagForm: $('tag-form'),
    tagName: $('tag-name'),
    tagsList: $('tags-list'),
    addTagBtn: $('add-tag-btn'),
    taskModal: $('task-modal'),
    taskForm: $('task-form'),
    taskModalTitle: $('task-modal-title'),
    taskTitle: $('task-title'),
    taskDesc: $('task-desc'),
    taskStatus: $('task-status'),
    taskPriority: $('task-priority'),
    taskAssignee: $('task-assignee'),
    taskDue: $('task-due'),
    tagsSelector: $('tags-selector'),
    subtasksContainer: $('subtasks-container'),
    addSubtaskBtn: $('add-subtask'),
    deleteTaskBtn: $('delete-task-btn'),
    saveTaskBtn: $('save-task-btn'),
    commentsSection: $('comments-section'),
    commentsList: $('comments-list'),
    commentInput: $('comment-input'),
    sendComment: $('send-comment'),
    shortcutsModal: $('shortcuts-modal'),
    toastContainer: $('toast-container'),
    // New elements
    filterBtn: $('filter-btn'),
    filterPanel: $('filter-panel'),
    settingsBtn: $('settings-btn'),
    settingsModal: $('settings-modal'),
    taskRecurrence: $('task-recurrence'),
    // DIX entrees ont ete retirees d'ici : viewToggle, calendarView,
    // analyticsView, templateBtn, templateModal, archiveBtn, taskTimeTracking,
    // timerDisplay, startTimerBtn, stopTimerBtn.
    //
    // Les identifiants correspondants n'existent PLUS dans index.html : elles
    // rendaient donc `null` a chaque chargement, et aucune n'etait relue via
    // `el.*` — verifie. Deux causes distinctes :
    //   - des vestiges de fonctions retirees (onglet Analytics, bascule de
    //     vues du header) ;
    //   - trois elements du suivi du temps que updateTaskTimeTracking()
    //     CONSTRUIT a l'execution. `el` met en cache a l'import : un element
    //     cree plus tard ne peut par construction jamais y figurer. Le code
    //     qui les utilise fait deja `$('start-timer-btn')` au moment du clic,
    //     ce qui est la seule facon correcte de les atteindre.
    //
    // test/unit/chargement-modules.test.js echoue desormais si une entree de
    // `el` retombe a null : une reference morte ne casse rien a l'import (tout
    // est en `?.`) mais la fonctionnalite associee est silencieusement perdue.
    // v5 features
    presenceAvatars: $('presence-avatars'),
    shareProjectBtn: $('share-project-btn'),
    helpBtn: $('help-btn'),
    helpModal: $('help-modal'),
    helpContent: $('help-content'),
    mytasksContainer: $('mytasks-container'),
    todayContainer: $('today-container'),
    bulkActionBar: $('bulk-action-bar'),
    bulkCountNum: $('bulk-count-num'),
    focusMode: $('focus-mode'),
    focusContent: $('focus-content'),
    focusClose: $('focus-close'),
    taskBlockedBy: $('task-blocked-by'),
    watchTaskBtn: $('watch-task-btn'),
    focusTaskBtn: $('focus-task-btn'),
    projectBgPicker: $('project-bg-picker'),
    projectColumns: $('project-columns'),
    exportPdf: $('export-pdf'),
    importCsvBtn: $('import-csv-btn'),
    importCsvFile: $('import-csv-file'),
    mainContent: document.querySelector('.main-content')
};
