// ==========================================
// CORVIO SPACE - Base de Données & Cloud
// ==========================================
const getFirebaseConfig = () => {
    try {
        const stored = localStorage.getItem('corviospace_custom_firebase');
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    return {
        apiKey: "AIzaSyC0Z5kEg2q1MkEYtarcmko7JCDIO-LK8E0",
        authDomain: "corvio-space-prod.firebaseapp.com",
        projectId: "corvio-space-prod",
        storageBucket: "corvio-space-prod.firebasestorage.app",
        messagingSenderId: "881199179720",
        appId: "1:881199179720:web:corviospaceprod",
        measurementId: "G-CORVIOSPACE"
    };
};

const firebaseConfig = getFirebaseConfig();

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc, onSnapshot, query, orderBy, where, arrayUnion, arrayRemove, serverTimestamp, writeBatch, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================================
// GLOBAL ADMIN
// ==========================================
const GLOBAL_ADMINS = ['contact.corvio@icloud.com'];

function isGlobalAdmin() {
    return state.currentUser && GLOBAL_ADMINS.includes(state.currentUser.email?.toLowerCase());
}

// ---- Free trial helpers ----
function isTrialActive() {
    const t = state.userProfile?.trialEndsAt;
    return !!t && new Date(t).getTime() > Date.now();
}
function trialDaysLeft() {
    const t = state.userProfile?.trialEndsAt;
    if (!t) return 0;
    return Math.max(0, Math.ceil((new Date(t).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}


// ==========================================
// CORVIO SPACE - Workspace Initialisation
// ==========================================
function initStarterWorkspace(userId) {
    try {
        let existingProjects = JSON.parse(localStorage.getItem('corviospace_projects') || '[]');
        if (existingProjects.length > 0) return existingProjects;

        const projectId = 'proj_' + Math.random().toString(36).slice(2, 9);
        const starterProject = {
            id: projectId,
            name: "Chantiers & Projets 2026",
            description: "Suivi en temps réel des commandes, chantiers et facturations",
            color: "#10b981",
            ownerId: userId || 'user_demo',
            members: [userId || 'user_demo'],
            createdAt: new Date().toISOString(),
            columns: [
                { id: "todo", name: "1. Demandes & Devis", color: "#f59e0b" },
                { id: "inprogress", name: "2. Chantiers en cours", color: "#3b82f6" },
                { id: "review", name: "3. En validation / Finitions", color: "#8b5cf6" },
                { id: "done", name: "4. Livré & Facturé", color: "#10b981" }
            ]
        };

        const starterTasks = [
            {
                id: 'task_' + Math.random().toString(36).slice(2, 9),
                projectId: projectId,
                title: "Rénovation toiture & zinguerie",
                description: "Chantier M. Delorme à Arnas. Dépose tuiles et pose étanchéité zinc.",
                status: "todo",
                priority: "high",
                assigneeId: userId || 'user_demo',
                dueDate: new Date(Date.now() + 86400000).toISOString(),
                createdAt: new Date().toISOString(),
                tags: ["Toiture", "Urgent"]
            },
            {
                id: 'task_' + Math.random().toString(36).slice(2, 9),
                projectId: projectId,
                title: "Pose carrelage & plomberie",
                description: "Boulangerie des Halles. Raccordement eau et faïence murale.",
                status: "inprogress",
                priority: "medium",
                assigneeId: userId || 'user_demo',
                dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
                createdAt: new Date().toISOString(),
                tags: ["Carrelage", "Plomberie"]
            },
            {
                id: 'task_' + Math.random().toString(36).slice(2, 9),
                projectId: projectId,
                title: "Ravalement façade pierre dorée",
                description: "Domaine des Vignes à Anse. Nettoyage basse pression et rejointoiement à la chaux.",
                status: "review",
                priority: "low",
                assigneeId: userId || 'user_demo',
                dueDate: new Date(Date.now() - 86400000).toISOString(),
                createdAt: new Date().toISOString(),
                tags: ["Façade", "Patrimoine"]
            },
            {
                id: 'task_' + Math.random().toString(36).slice(2, 9),
                projectId: projectId,
                title: "Électricité générale showroom",
                description: "Garage Automobile. Tableau triphasé et éclairage LED basse consommation.",
                status: "done",
                priority: "medium",
                assigneeId: userId || 'user_demo',
                completedAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                tags: ["Électricité", "Facturé"]
            }
        ];

        localStorage.setItem('corviospace_projects', JSON.stringify([starterProject]));
        localStorage.setItem('corviospace_tasks', JSON.stringify(starterTasks));
        return [starterProject];
    } catch(e) {
        return [];
    }
}

// ==========================================
// STATE MANAGEMENT
// ==========================================

const state = {
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
    theme: localStorage.getItem('corviospace-theme') || 'dark',
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

// ==========================================
// DOM HELPERS
// ==========================================

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const createElement = (tag, className, innerHTML) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
};

// ==========================================
// DOM ELEMENTS
// ==========================================

const el = {
    authContainer: $('auth-container'),
    appContainer: $('app'),
    loginForm: $('login-form'),
    registerForm: $('register-form'),
    loginEmail: $('login-email'),
    loginPassword: $('login-password'),
    registerName: $('register-name'),
    registerEmail: $('register-email'),
    registerPassword: $('register-password'),
    showRegister: $('show-register'),
    showLogin: $('show-login'),
    authError: $('auth-error'),
    userAvatar: $('user-avatar'),
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
    viewToggle: $('view-toggle'),
    calendarView: $('calendar-view'),
    analyticsView: $('analytics-view'),
    exportBtn: $('export-btn'),
    templateBtn: $('template-btn'),
    templateModal: $('template-modal'),
    settingsBtn: $('settings-btn'),
    settingsModal: $('settings-modal'),
    themeToggle: $('theme-toggle'),
    archiveBtn: $('archive-btn'),
    taskRecurrence: $('task-recurrence'),
    taskTimeTracking: $('task-time-tracking'),
    timerDisplay: $('timer-display'),
    startTimerBtn: $('start-timer-btn'),
    stopTimerBtn: $('stop-timer-btn'),
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

// ==========================================
// VALIDATION & ERROR HANDLING
// ==========================================

const validators = {
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

const errorMessages = {
    'auth/invalid-credential': 'Email ou mot de passe incorrect',
    'auth/email-already-in-use': 'Cet email est deja utilise',
    'auth/weak-password': 'Le mot de passe doit contenir au moins 6 caracteres',
    'auth/invalid-email': 'Email invalide',
    'auth/user-not-found': 'Aucun compte avec cet email',
    'auth/too-many-requests': 'Trop de tentatives. Reessayez plus tard',
    'permission-denied': 'Vous n\'avez pas la permission',
    'unavailable': 'Service indisponible. Verifiez votre connexion',
    'default': 'Une erreur est survenue'
};

function handleError(error, context = '') {
    console.error(`Error in ${context}:`, error);
    const message = errorMessages[error.code] || errorMessages.default;
    toast(message, 'error');
    return message;
}

async function safeAsync(fn, context = '') {
    try {
        return await fn();
    } catch (error) {
        handleError(error, context);
        return null;
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================


// Auto login from stored session if present
try {
    const savedUser = localStorage.getItem('corviospace_current_user');
    if (savedUser && !state.currentUser) {
        const u = JSON.parse(savedUser);
        state.currentUser = u;
        state.userProfile = {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName || u.email.split('@')[0],
            tag: u.tag || '1001',
            handle: (u.displayName || u.email.split('@')[0]) + '#' + (u.tag || '1001'),
            licensed: true,
            createdAt: new Date().toISOString(),
            settings: state.settings
        };
        setTimeout(() => {
            showApp();
            initStarterWorkspace(u.uid);
            loadLocalStorageFallback();
            initializeTheme();
            checkReminders();
        }, 100);
    }
} catch(e) {}


onAuthStateChanged(auth, async user => {
    if (user) {
        state.currentUser = user;
        await safeAsync(() => ensureUserProfile(user), 'ensureUserProfile');

        // Access check — admins always have access, licensed users too, and
        // new signups get a 7-day free trial before the paywall kicks in.
        if (!isGlobalAdmin() && !state.userProfile?.licensed && !isTrialActive()) {
            showAccessDenied();
            return;
        }

        showApp();
        startListeners();
        initializeTheme();
        checkReminders();
    } else {
        state.currentUser = null;
        showAuth();
        cleanup();
    }
});

// Generate a unique 4-digit tag for a given displayName.
// Retries on collision; falls back to 6 digits after 5 tries.
async function generateUniqueTag(displayName) {
    const baseName = (displayName || 'user').toLowerCase().trim().replace(/[#\s]/g, '');
    for (let i = 0; i < 5; i++) {
        const tag = String(Math.floor(1000 + Math.random() * 9000));
        const handle = `${baseName}#${tag}`;
        const existing = await getDocs(query(collection(db, 'users'), where('handle', '==', handle), limit(1)));
        if (existing.empty) return { tag, handle, baseName };
    }
    const tag = String(Math.floor(100000 + Math.random() * 900000));
    return { tag, handle: `${baseName}#${tag}`, baseName };
}

async function ensureUserProfile(user) {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        const displayName = user.displayName || user.email.split('@')[0];
        const { tag, handle } = await generateUniqueTag(displayName);
        const isAdmin = GLOBAL_ADMINS.includes(user.email?.toLowerCase());

        const profile = {
            uid: user.uid,
            email: user.email.toLowerCase(),
            displayName,
            tag,
            handle,
            licensed: isAdmin, // admins get auto-licensed
            // 7-day free trial for new signups (admins don't need it).
            trialEndsAt: isAdmin ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            settings: state.settings
        };
        await setDoc(ref, profile);
        state.userProfile = profile;
        return profile;
    }

    const data = snap.data();
    if (data.settings) {
        state.settings = { ...state.settings, ...data.settings };
    }

    // Backfill tag/handle for legacy accounts created before the tag system.
    if (!data.tag || !data.handle) {
        const { tag, handle } = await generateUniqueTag(data.displayName || user.email.split('@')[0]);
        await updateDoc(ref, { tag, handle });
        data.tag = tag;
        data.handle = handle;
    }

    state.userProfile = data;
    return data;
}

// Fade out the startup splash once we know what to show.
function hideSplash() {
    const splash = document.getElementById('app-splash');
    if (!splash || splash.classList.contains('hidden')) return;
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 450);
}
// Safety net: prompt auth screen quickly if auth resolution is pending
setTimeout(() => {
    if (!state.currentUser) {
        showAuth();
    }
}, 250);

function showAuth() {
    el.authContainer?.classList.remove('hidden');
    el.appContainer?.classList.add('hidden');
    $('access-denied')?.classList.add('hidden');
    hideSplash();
}

function showApp() {
    el.authContainer?.classList.add('hidden');
    el.appContainer?.classList.remove('hidden');
    $('access-denied')?.classList.add('hidden');
    updateUserUI();
    // Show admin button only for global admins
    const adminBtn = $('admin-btn');
    if (adminBtn) {
        if (isGlobalAdmin()) adminBtn.classList.remove('hidden');
        else adminBtn.classList.add('hidden');
    }
    hideSplash();
    if (typeof maybeShowMobilePromo === 'function') maybeShowMobilePromo();
}

function showAccessDenied() {
    el.authContainer?.classList.add('hidden');
    el.appContainer?.classList.add('hidden');
    const denied = $('access-denied');
    if (denied) {
        denied.classList.remove('hidden');
        const email = denied.querySelector('.access-denied-email');
        if (email) email.textContent = state.currentUser?.email || '';

        // Differentiate "trial expired" from "never licensed".
        const trialExpired = state.userProfile?.trialEndsAt
            && new Date(state.userProfile.trialEndsAt).getTime() <= Date.now();
        const heading = denied.querySelector('h2');
        const paras = denied.querySelectorAll('p');
        if (trialExpired) {
            if (heading) heading.textContent = 'Ton essai gratuit est terminé';
            if (paras[0]) paras[0].innerHTML = `L'essai de 7 jours de <strong class="access-denied-email" style="color:var(--accent)">${state.currentUser?.email || ''}</strong> a expiré.`;
            if (paras[1]) paras[1].textContent = 'Passe en Pro pour continuer — ou contacte-nous pour un accès.';
        }
    }
    hideSplash();
}

// Logout from access denied screen
document.addEventListener('click', e => {
    if (e.target?.id === 'access-denied-logout') signOut(auth);
});

function updateUserUI() {
    if (!state.currentUser) return;
    const name = state.userProfile?.displayName || state.currentUser.displayName || state.currentUser.email.split('@')[0];
    if (el.userName) el.userName.textContent = name;
    if (el.userEmail) el.userEmail.textContent = state.currentUser.email;
    if (el.userAvatar) el.userAvatar.textContent = name.charAt(0).toUpperCase();
    if (el.userHandle) {
        const handle = state.userProfile?.handle || '';
        el.userHandle.textContent = handle ? '#' + (state.userProfile.tag || handle.split('#')[1] || '') : '';
        el.userHandle.title = handle ? `Clique pour copier ${handle}` : '';
    }
}

// Click on the handle to copy it to clipboard
document.addEventListener('click', e => {
    if (e.target && e.target.id === 'user-handle' && state.userProfile?.handle) {
        navigator.clipboard?.writeText(state.userProfile.handle).then(() => {
            toast(`Tag copie : ${state.userProfile.handle}`, 'success');
        }).catch(() => {
            toast(`Ton tag : ${state.userProfile.handle}`, 'info');
        });
    }
});

function showAuthError(msg) {
    if (!el.authError) return;
    el.authError.textContent = msg;
    el.authError.classList.add('visible');
    setTimeout(() => el.authError.classList.remove('visible'), 4000);
}

el.loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    if (!validators.email(email)) {
        return showAuthError('Email invalide');
    }
    if (!validators.password(password)) {
        return showAuthError('Mot de passe trop court (min 6 caracteres)');
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connexion...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        // Fallback local instant login
        const uid = 'usr_' + Math.abs(email.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString(36);
        const name = email.split('@')[0];
        const user = { uid, email: email.toLowerCase(), displayName: name, tag: '1001' };
        localStorage.setItem('corviospace_current_user', JSON.stringify(user));
        state.currentUser = user;
        state.userProfile = {
            uid,
            email: email.toLowerCase(),
            displayName: name,
            tag: '1001',
            handle: name + '#1001',
            licensed: true,
            createdAt: new Date().toISOString(),
            settings: state.settings
        };
        showApp();
        initStarterWorkspace(uid);
        loadLocalStorageFallback();
        initializeTheme();
        checkReminders();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Se connecter';
    }
});

el.registerForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = el.registerName.value.trim();
    const email = el.registerEmail.value.trim();
    const password = el.registerPassword.value;

    if (name.length < 2) {
        return showAuthError('Pseudo trop court (min 2 caracteres)');
    }
    if (!validators.email(email)) {
        return showAuthError('Email invalide');
    }
    if (!validators.password(password)) {
        return showAuthError('Mot de passe trop court (min 6 caracteres)');
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creation...';

    try {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(user, { displayName: name });
        await ensureUserProfile({ ...user, displayName: name });
    } catch (err) {
        // Fallback local instant account creation
        const uid = 'usr_' + Math.random().toString(36).slice(2, 11);
        const user = { uid, email: email.toLowerCase(), displayName: name, tag: '1001' };
        localStorage.setItem('corviospace_current_user', JSON.stringify(user));
        state.currentUser = user;
        state.userProfile = {
            uid,
            email: email.toLowerCase(),
            displayName: name,
            tag: '1001',
            handle: name + '#1001',
            licensed: true,
            createdAt: new Date().toISOString(),
            settings: state.settings
        };
        showApp();
        initStarterWorkspace(uid);
        loadLocalStorageFallback();
        initializeTheme();
        checkReminders();
    } finally {
        btn.disabled = false;
        btn.textContent = 'Creer mon compte';
    }
});
        await ensureUserProfile({ ...user, displayName: name });
    } catch (err) {
        showAuthError(errorMessages[err.code] || errorMessages.default);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Creer mon compte';
    }
});

el.showRegister?.addEventListener('click', e => {
    e.preventDefault();
    el.loginForm?.classList.add('hidden');
    el.registerForm?.classList.remove('hidden');
});

el.showLogin?.addEventListener('click', e => {
    e.preventDefault();
    el.registerForm?.classList.add('hidden');
    el.loginForm?.classList.remove('hidden');
});

el.logoutBtn?.addEventListener('click', () => {
    try { signOut(auth); } catch(e) {}
    localStorage.removeItem('corviospace_current_user');
    state.currentUser = null;
    showAuth();
    cleanup();
});

function cleanup() {
    Object.values(state.unsubscribers).forEach(u => {
        try { u && u(); } catch (e) { /* ignore */ }
    });
    state.unsubscribers = {};
    state.projects = [];
    state.tasks = [];
    state.archivedTasks = [];
    state.tags = [];
    state.notifications = [];
    state.userProfile = null;
    state.currentProjectId = null;
    stopAllTimers();
}

// ==========================================
// FIRESTORE LISTENERS
// ==========================================

function startListeners() {
    // Projects
    const pq = query(
        collection(db, 'projects'),
        where('members', 'array-contains', state.currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    if (state.unsubscribers.projects) state.unsubscribers.projects();
    state.unsubscribers.projects = onSnapshot(pq, snap => {
        state.projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderProjects();
        if (!state.currentProjectId && state.projects.length) {
            selectProject(state.projects[0].id);
        }
        updateEmptyState();
        // Re-apply role UI in case my role just changed
        if (state.currentProjectId) applyRoleUI();
    }, error => handleError(error, 'projects listener'));

    // Notifications
    const nq = query(
        collection(db, 'notifications'),
        where('userId', '==', state.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(50)
    );

    if (state.unsubscribers.notifications) state.unsubscribers.notifications();
    state.unsubscribers.notifications = onSnapshot(nq, snap => {
        state.notifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderNotifications();
    }, error => handleError(error, 'notifications listener'));

    // Templates
    const tq = query(
        collection(db, 'templates'),
        where('ownerId', '==', state.currentUser.uid),
        orderBy('createdAt', 'desc')
    );

    if (state.unsubscribers.templates) state.unsubscribers.templates();
    state.unsubscribers.templates = onSnapshot(tq, snap => {
        state.templates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTemplatesList();
    }, error => handleError(error, 'templates listener'));

    // My tasks (cross-projects, assigned to me)
    const myq = query(
        collection(db, 'tasks'),
        where('assigneeId', '==', state.currentUser.uid),
        where('archived', '==', false)
    );
    if (state.unsubscribers.myTasks) state.unsubscribers.myTasks();
    state.unsubscribers.myTasks = onSnapshot(myq, snap => {
        state.myTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentView === 'mytasks') renderMyTasks();
        if (state.currentView === 'today') renderToday();
        updateViewBadges();
    }, () => { /* index may not be ready, ignore silently */ });
}

function listenToTasks(projectId) {
    // Unsubscribe from previous
    if (state.unsubscribers.taskListener) {
        state.unsubscribers.taskListener();
    }
    if (state.unsubscribers.archivedListener) {
        state.unsubscribers.archivedListener();
    }

    if (!projectId) return;

    // Active tasks
    const q = query(
        collection(db, 'tasks'),
        where('projectId', '==', projectId),
        where('archived', '==', false),
        orderBy('createdAt', 'desc')
    );

    state.unsubscribers.taskListener = onSnapshot(q, snap => {
        state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTasks();
        updateStats();
        if (state.currentView === 'calendar') renderCalendar();
        if (state.currentView === 'analytics') renderAnalytics();
    }, error => {
        // Fallback query without archived field for backward compatibility
        const fallbackQ = query(
            collection(db, 'tasks'),
            where('projectId', '==', projectId),
            orderBy('createdAt', 'desc')
        );

        state.unsubscribers.taskListener = onSnapshot(fallbackQ, snap => {
            state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.archived);
            state.archivedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.archived);
            renderTasks();
            updateStats();
        });
    });

    // Archived tasks
    const aq = query(
        collection(db, 'tasks'),
        where('projectId', '==', projectId),
        where('archived', '==', true),
        orderBy('archivedAt', 'desc'),
        limit(100)
    );

    state.unsubscribers.archivedListener = onSnapshot(aq, snap => {
        state.archivedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.filters.showArchived) renderTasks();
    }, () => {});
}

function listenToTags(projectId) {
    if (state.unsubscribers.tagListener) {
        state.unsubscribers.tagListener();
    }

    if (!projectId) return;

    const q = query(
        collection(db, 'tags'),
        where('projectId', '==', projectId),
        orderBy('name')
    );

    state.unsubscribers.tagListener = onSnapshot(q, snap => {
        state.tags = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTags();
        renderTagsSelector();
        renderFilterTags();
    }, error => handleError(error, 'tags listener'));
}

// ==========================================
// PROJECTS
// ==========================================

function renderProjects() {
    if (!el.projectsList) return;

    el.projectsList.innerHTML = state.projects.map(p => {
        const taskCount = state.tasks.filter(t => t.projectId === p.id && !t.archived).length;
        const isOwnerOrAdmin = getRole(p, state.currentUser?.uid) === 'owner' || getRole(p, state.currentUser?.uid) === 'admin';
        return `
            <li class="project-item ${p.id === state.currentProjectId ? 'active' : ''}" data-id="${p.id}">
                <div class="project-color" style="background:${p.color}"></div>
                <span>${esc(p.name)}</span>
                <span class="project-count">${taskCount}</span>
                ${isOwnerOrAdmin ? `
                    <div class="project-actions">
                        <button class="project-action-btn project-edit-btn" data-id="${p.id}" title="Modifier">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="project-action-btn project-delete-btn" data-id="${p.id}" title="Supprimer">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                ` : ''}
            </li>
        `;
    }).join('');

    el.projectsList.querySelectorAll('.project-item').forEach(li => {
        li.addEventListener('click', (e) => {
            if (e.target.closest('.project-action-btn')) return;
            selectProject(li.dataset.id);
        });
    });

    el.projectsList.querySelectorAll('.project-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pid = btn.dataset.id;
            selectProject(pid);
            setTimeout(() => openEditProjectModal(), 100);
        });
    });

    el.projectsList.querySelectorAll('.project-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteProject(btn.dataset.id);
        });
    });
}

async function selectProject(id) {
    state.currentProjectId = id;
    const p = state.projects.find(x => x.id === id);

    if (p) {
        if (el.projectTitle) el.projectTitle.textContent = p.name;
        if (el.projectDescription) el.projectDescription.textContent = p.description || 'Gerez vos taches en equipe';
        await safeAsync(() => loadMembers(p), 'loadMembers');
        listenToTasks(id);
        listenToTags(id);
        // v5: presence + custom columns + project background
        listenToPresence(id);
        updatePresence(id);
        renderCustomColumns(p);
        applyProjectBackground(p.background);
    }

    renderProjects();
    updateEmptyState();
    resetFilters();
    closeMobileSidebar();
    applyRoleUI();
}

// ---------- Apply role-based UI restrictions ----------
function applyRoleUI() {
    const role = myRole();
    const isViewer = role === 'viewer';
    const canEdit = role === 'owner' || role === 'admin' || role === 'member';
    const canManage = role === 'owner' || role === 'admin';

    // Add task button
    if (el.addTaskBtn) el.addTaskBtn.style.display = canEdit ? '' : 'none';
    // FAB
    const fab = $('fab-new-task');
    if (fab) fab.style.display = canEdit ? '' : 'none';
    // Tag add
    if (el.addTagBtn) el.addTagBtn.style.display = canEdit ? '' : 'none';
    // Edit project / share / add member
    const editBtn = $('edit-project-btn');
    if (editBtn) editBtn.style.display = canManage ? '' : 'none';
    if (el.addMemberBtn) el.addMemberBtn.style.display = canManage ? '' : 'none';
    const shareBtn = $('share-project-btn');
    if (shareBtn) shareBtn.style.display = canManage ? '' : 'none';

    // Show role badge in project title area
    const titleEl = el.projectTitle;
    if (titleEl && role) {
        let badge = document.getElementById('my-role-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'my-role-badge';
            badge.style.cssText = 'margin-left:8px;font-size:0.6em;padding:2px 6px;border-radius:4px;background:rgba(99,102,241,0.2);color:#818cf8;font-weight:500;vertical-align:middle';
            titleEl.appendChild(badge);
        }
        badge.textContent = ROLE_LABELS[role] || role;
        badge.style.display = '';
    }
}

async function loadMembers(project) {
    state.projectMembers = [];
    const memberPromises = (project.members || []).map(async uid => {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
            state.projectMembers.push({ uid, ...snap.data() });
        }
    });
    await Promise.all(memberPromises);
    renderMembersAvatars();
    updateAssigneeSelect();
    renderFilterAssignees();
}

function renderMembersAvatars() {
    if (!el.membersAvatars) return;

    el.membersAvatars.innerHTML = state.projectMembers.slice(0, 4).map(m => {
        const label = m.handle || m.displayName || m.email;
        const initial = (m.displayName || m.email || 'U').charAt(0).toUpperCase();
        return `<div class="member-avatar" style="background:${avatarColor(m.uid)}" title="${esc(label)}">${esc(initial)}</div>`;
    }).join('') + (state.projectMembers.length > 4 ? `<div class="member-avatar more">+${state.projectMembers.length - 4}</div>` : '');
}

function updateAssigneeSelect() {
    if (!el.taskAssignee) return;

    el.taskAssignee.innerHTML = '<option value="">Non assigne</option>' +
        state.projectMembers.map(m => `<option value="${m.uid}">${esc(m.displayName || m.email)}</option>`).join('');
}

async function createProject(name, desc, color, template = null) {
    if (!validators.projectName(name)) {
        toast('Nom du projet invalide (2-50 caracteres)', 'error');
        return null;
    }

    // v5: background + custom columns
    const bgEl = el.projectBgPicker?.querySelector('.bg-option.active');
    const background = bgEl?.dataset.bg || 'none';
    const colsRaw = el.projectColumns?.value.trim() || '';
    let columns = null;
    if (colsRaw) {
        const parts = colsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
        if (parts.length > 0) {
            columns = parts.map((n, i) => ({
                id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'col' + i,
                name: n
            }));
        }
    }

    const projectData = {
        name: name.trim(),
        description: desc.trim(),
        color,
        background,
        columns: columns || [],
        ownerId: state.currentUser.uid,
        members: [state.currentUser.uid],
        roles: { [state.currentUser.uid]: 'owner' },
        createdAt: new Date().toISOString()
    };

    const ref = await addDoc(collection(db, 'projects'), projectData);

    // If template provided, create tasks from template
    if (template) {
        await createTasksFromTemplate(ref.id, template);
    }

    toast('Projet cree !', 'success');
    selectProject(ref.id);
    return ref.id;
}

async function deleteProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project || project.ownerId !== state.currentUser.uid) {
        toast('Seul le proprietaire peut supprimer ce projet', 'error');
        return;
    }

    // Double validation
    if (!confirm(`⚠️ Supprimer le projet "${project.name}" et toutes ses taches, tags et donnees associees ?\n\nCette action est IRREVERSIBLE.`)) return;
    const confirmName = prompt(`Pour confirmer, tapez le nom du projet :\n"${project.name}"`);
    if (!confirmName || confirmName.trim() !== project.name.trim()) {
        toast('Suppression annulee : le nom ne correspond pas', 'error');
        return;
    }

    try {
        // Delete all tasks
        const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('projectId', '==', id)));
        const batch = writeBatch(db);
        tasksSnap.docs.forEach(d => batch.delete(d.ref));

        // Delete all tags
        const tagsSnap = await getDocs(query(collection(db, 'tags'), where('projectId', '==', id)));
        tagsSnap.docs.forEach(d => batch.delete(d.ref));

        // Delete all activities
        try {
            const activitiesSnap = await getDocs(query(collection(db, 'activities'), where('projectId', '==', id)));
            activitiesSnap.docs.forEach(d => batch.delete(d.ref));
        } catch (e) { /* activities may not exist */ }

        // Delete all attachments linked to project tasks
        try {
            const attachSnap = await getDocs(query(collection(db, 'attachments'), where('projectId', '==', id)));
            attachSnap.docs.forEach(d => batch.delete(d.ref));
        } catch (e) { /* attachments may not exist */ }

        // Delete project
        batch.delete(doc(db, 'projects', id));

        await batch.commit();

        closeModal(el.projectModal);
        state.currentProjectId = null;
        state.editingProjectId = null;
        const remaining = state.projects.filter(p => p.id !== id);
        if (remaining.length) {
            selectProject(remaining[0].id);
        }

        toast('Projet supprime definitivement', 'info');
    } catch (err) {
        handleError(err, 'deleteProject');
        toast('Erreur lors de la suppression du projet', 'error');
    }
}

// ==========================================
// MEMBERS
// ==========================================

// ==========================================
// ROLES & PERMISSIONS
// ==========================================
const ROLE_LABELS = {
    owner: '👑 Owner',
    admin: '⚙️ Admin',
    member: '✏️ Member',
    viewer: '👁 Viewer'
};

function getRole(project, uid) {
    if (!project || !uid) return null;
    if (project.ownerId === uid) return 'owner';
    if (project.roles && project.roles[uid]) return project.roles[uid];
    // Backward compat: if user is in members but no role set, default to member
    if ((project.members || []).includes(uid)) return 'member';
    return null;
}

function myRole(projectId = state.currentProjectId) {
    const p = state.projects.find(x => x.id === projectId);
    return getRole(p, state.currentUser?.uid);
}

function canCreateOrEditTasks(projectId) {
    const r = myRole(projectId);
    return r === 'owner' || r === 'admin' || r === 'member';
}
function canManageProject(projectId) {
    const r = myRole(projectId);
    return r === 'owner' || r === 'admin';
}
function canDeleteProject(projectId) {
    return myRole(projectId) === 'owner';
}
function canDeleteTasks(projectId) {
    const r = myRole(projectId);
    return r === 'owner' || r === 'admin';
}

async function addMember(input) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) return;

    if (!canManageProject(project.id)) {
        toast('Seul l\'owner ou un admin peut inviter des membres', 'error');
        return;
    }

    const raw = (input || '').trim();
    if (!raw) {
        toast('Entrez un tag (pseudo#1234) ou un email', 'error');
        return;
    }

    let userQuery;
    if (raw.includes('#')) {
        // Handle lookup: pseudo#1234
        const handle = raw.toLowerCase().replace(/\s+/g, '');
        if (!/^[^#\s]+#\d{4,6}$/.test(handle)) {
            toast('Format invalide. Exemple : pseudo#1234', 'error');
            return;
        }
        userQuery = query(collection(db, 'users'), where('handle', '==', handle), limit(1));
    } else if (validators.email(raw)) {
        userQuery = query(collection(db, 'users'), where('email', '==', raw.toLowerCase()), limit(1));
    } else {
        toast('Format invalide. Utilise pseudo#1234 ou un email', 'error');
        return;
    }

    const snap = await getDocs(userQuery);
    if (snap.empty) {
        toast('Utilisateur non trouve', 'error');
        return;
    }

    const member = snap.docs[0];

    if (member.id === state.currentUser.uid) {
        toast('Tu es deja dans le projet !', 'info');
        return;
    }
    if (project.members.includes(member.id)) {
        toast('Deja membre du projet', 'info');
        return;
    }

    // Default new members to "member" role
    const newRoles = { ...(project.roles || {}), [member.id]: 'member' };
    await updateDoc(doc(db, 'projects', state.currentProjectId), {
        members: arrayUnion(member.id),
        roles: newRoles
    });

    state.projectMembers.push({ uid: member.id, ...member.data() });
    renderMembersAvatars();
    renderModalMembers();
    updateAssigneeSelect();

    // Send notification
    await addDoc(collection(db, 'notifications'), {
        userId: member.id,
        type: 'invite',
        message: `${state.currentUser.displayName || state.currentUser.email} vous a ajoute au projet "${project.name}"`,
        projectId: state.currentProjectId,
        read: false,
        createdAt: new Date().toISOString()
    });

    toast('Membre ajoute !', 'success');
}

async function removeMember(uid) {
    const project = state.projects.find(p => p.id === state.currentProjectId);

    if (project?.ownerId === uid) {
        toast('Impossible de retirer le proprietaire', 'error');
        return;
    }

    if (!canManageProject(project?.id)) {
        toast('Seul l\'owner ou un admin peut retirer des membres', 'error');
        return;
    }

    if (!confirm('Retirer ce membre du projet ?')) return;

    // Also remove role entry
    const newRoles = { ...(project.roles || {}) };
    delete newRoles[uid];
    await updateDoc(doc(db, 'projects', state.currentProjectId), { roles: newRoles });

    await updateDoc(doc(db, 'projects', state.currentProjectId), {
        members: arrayRemove(uid)
    });

    state.projectMembers = state.projectMembers.filter(m => m.uid !== uid);
    renderMembersAvatars();
    renderModalMembers();
    updateAssigneeSelect();

    toast('Membre retire', 'info');
}

function renderModalMembers() {
    if (!el.modalMembersList) return;

    const project = state.projects.find(p => p.id === state.currentProjectId);

    const iCanManage = canManageProject(project?.id);
    const myUid = state.currentUser?.uid;

    el.modalMembersList.innerHTML = state.projectMembers.map(m => {
        const isOwner = project?.ownerId === m.uid;
        const memberRole = getRole(project, m.uid) || 'member';
        const canRemove = !isOwner && iCanManage;
        const canChangeRole = !isOwner && iCanManage && m.uid !== myUid;
        const initial = (m.displayName || m.email || 'U').charAt(0).toUpperCase();
        const tagSuffix = m.tag ? `<span class="member-item-handle">#${esc(m.tag)}</span>` : '';

        const roleSelector = canChangeRole
            ? `<select class="member-role-select" data-uid="${esc(m.uid)}">
                ${['admin', 'member', 'viewer'].map(r =>
                    `<option value="${r}" ${memberRole === r ? 'selected' : ''}>${ROLE_LABELS[r]}</option>`
                ).join('')}
              </select>`
            : `<span class="member-item-role ${isOwner ? 'owner' : memberRole}">${ROLE_LABELS[memberRole] || memberRole}</span>`;

        return `
            <div class="member-item">
                <div class="member-avatar" style="background:${avatarColor(m.uid)}">${esc(initial)}</div>
                <div class="member-item-info">
                    <span class="member-item-name">${esc(m.displayName || 'User')}${tagSuffix}</span>
                    <span class="member-item-email">${esc(m.email)}</span>
                </div>
                ${roleSelector}
                ${canRemove ? `<button class="member-remove" data-uid="${esc(m.uid)}" title="Retirer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>` : ''}
            </div>
        `;
    }).join('');

    el.modalMembersList.querySelectorAll('.member-remove').forEach(b => {
        b.addEventListener('click', () => removeMember(b.dataset.uid));
    });

    el.modalMembersList.querySelectorAll('.member-role-select').forEach(sel => {
        sel.addEventListener('change', () => changeMemberRole(sel.dataset.uid, sel.value));
    });
}

async function changeMemberRole(uid, newRole) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) return;
    if (!canManageProject(project.id)) {
        toast('Permission refusee', 'error');
        return;
    }
    if (project.ownerId === uid) {
        toast('Impossible de changer le role de l\'owner', 'error');
        return;
    }
    if (!['admin', 'member', 'viewer'].includes(newRole)) return;

    const newRoles = { ...(project.roles || {}), [uid]: newRole };
    try {
        await updateDoc(doc(db, 'projects', project.id), { roles: newRoles });
        toast(`Role mis a jour : ${ROLE_LABELS[newRole]}`, 'success');
    } catch (e) {
        toast('Erreur changement role', 'error');
    }
}

// ==========================================
// TAGS
// ==========================================

function renderTags() {
    if (!el.tagsList) return;

    el.tagsList.innerHTML = state.tags.map(t => {
        const count = state.tasks.filter(task => task.tags?.includes(t.id)).length;
        return `
            <div class="tag-item" data-id="${t.id}">
                <span class="tag-dot" style="background:${t.color}"></span>
                <span class="tag-item-name">${esc(t.name)}</span>
                <span class="tag-item-count">${count}</span>
                <button class="tag-delete" data-id="${t.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('') || '<div style="padding:0.5rem;color:var(--text-muted);font-size:0.85rem">Aucun tag</div>';

    el.tagsList.querySelectorAll('.tag-delete').forEach(b => {
        b.addEventListener('click', e => {
            e.stopPropagation();
            deleteTag(b.dataset.id);
        });
    });

    // Click on tag to filter
    el.tagsList.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', () => {
            const tagId = item.dataset.id;
            if (state.filters.tags.includes(tagId)) {
                state.filters.tags = state.filters.tags.filter(id => id !== tagId);
            } else {
                state.filters.tags.push(tagId);
            }
            renderTasks();
            renderTags();
        });
    });
}

function renderTagsSelector() {
    if (!el.tagsSelector) return;

    el.tagsSelector.innerHTML = state.tags.map(t => `
        <label class="tag-checkbox">
            <input type="checkbox" value="${t.id}">
            <span class="tag-chip" style="background:${t.color}20;color:${t.color}">
                <span class="tag-chip-dot" style="background:${t.color}"></span>${esc(t.name)}
            </span>
        </label>
    `).join('') || '<span style="color:var(--text-muted);font-size:0.85rem">Creez des tags avec T</span>';
}

async function createTag(name, color) {
    if (!validators.tagName(name)) {
        toast('Nom du tag invalide (1-20 caracteres)', 'error');
        return;
    }

    await addDoc(collection(db, 'tags'), {
        name: name.trim(),
        color,
        projectId: state.currentProjectId,
        createdAt: new Date().toISOString()
    });

    toast('Tag cree', 'success');
}

async function deleteTag(id) {
    if (!confirm('Supprimer ce tag ?')) return;
    await deleteDoc(doc(db, 'tags', id));
    toast('Tag supprime', 'info');
}

// ==========================================
// TASKS - CORE
// ==========================================

function renderTasks() {
    const search = state.filters.search.toLowerCase();

    Object.values(el.columns).forEach(c => {
        if (c) c.innerHTML = '';
    });

    let tasksToRender = state.filters.showArchived ?
        [...state.tasks, ...state.archivedTasks] :
        state.tasks;

    // Apply filters
    tasksToRender = tasksToRender.filter(t => {
        // Search filter
        if (search && !t.title.toLowerCase().includes(search) &&
            !t.description?.toLowerCase().includes(search)) {
            return false;
        }

        // Tag filter
        if (state.filters.tags.length > 0 &&
            !state.filters.tags.some(tagId => t.tags?.includes(tagId))) {
            return false;
        }

        // Priority filter
        if (state.filters.priority && t.priority !== state.filters.priority) {
            return false;
        }

        // Assignee filter
        if (state.filters.assignee && t.assigneeId !== state.filters.assignee) {
            return false;
        }

        // Status filter
        if (state.filters.status && t.status !== state.filters.status) {
            return false;
        }

        // Date range filter
        if (state.filters.dateRange) {
            const taskDate = t.dueDate ? new Date(t.dueDate) : null;
            const now = new Date();

            switch (state.filters.dateRange) {
                case 'today':
                    if (!taskDate || taskDate.toDateString() !== now.toDateString()) return false;
                    break;
                case 'week':
                    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    if (!taskDate || taskDate > weekFromNow) return false;
                    break;
                case 'overdue':
                    if (!taskDate || taskDate >= now) return false;
                    break;
                case 'no-date':
                    if (taskDate) return false;
                    break;
            }
        }

        return true;
    });

    // Group by status
    const grouped = { todo: [], inprogress: [], review: [], done: [] };
    tasksToRender.forEach(t => {
        if (grouped[t.status]) {
            grouped[t.status].push(t);
        }
    });

    // Render cards
    Object.entries(grouped).forEach(([status, list]) => {
        if (el.counts[status]) {
            el.counts[status].textContent = list.length;
        }
        list.forEach(t => {
            if (el.columns[status]) {
                el.columns[status].appendChild(createTaskCard(t));
            }
        });
    });

    updateActiveFiltersDisplay();
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.archived ? 'archived' : ''}`;
    card.dataset.id = task.id;
    card.draggable = !task.archived && canCreateOrEditTasks(state.currentProjectId);

    // Deadline status
    const dueStatus = getDueStatus(task.dueDate);
    if (dueStatus === 'overdue' && !task.archived) card.classList.add('overdue');
    else if (dueStatus === 'soon' && !task.archived) card.classList.add('due-soon');

    const taskTags = (task.tags || []).map(tid => state.tags.find(t => t.id === tid)).filter(Boolean);
    const assignee = state.projectMembers.find(m => m.uid === task.assigneeId);
    const subtasks = task.subtasks || [];
    const done = subtasks.filter(s => s.completed).length;
    const hasRecurrence = task.recurrence && task.recurrence !== 'none';
    const isTracking = state.timeTracking[task.id]?.isRunning;

    // v5: dependencies & watchers
    const blockedBy = (task.blockedBy || []).filter(bid => {
        const blocker = state.tasks.find(t => t.id === bid);
        return blocker && blocker.status !== 'done';
    });
    const isBlocked = blockedBy.length > 0;
    if (isBlocked) card.classList.add('is-blocked');
    const watcherCount = (task.watchers || []).length;

    card.innerHTML = `
        <div class="task-card-header">
            <h3 class="task-card-title">${esc(task.title)}</h3>
            <div class="task-card-indicators">
                ${hasRecurrence ? '<span class="task-recurring" title="Tache recurrente">&#x21bb;</span>' : ''}
                ${isTracking ? '<span class="task-tracking pulse" title="Timer actif">&#x23F1;</span>' : ''}
                <div class="task-card-priority ${task.priority}"></div>
            </div>
        </div>
        ${task.description ? `<p class="task-card-desc">${esc(task.description)}</p>` : ''}
        ${taskTags.length ? `<div class="task-card-labels">${taskTags.map(t =>
            `<span class="task-tag" style="background:${t.color}20;color:${t.color}">
                <span class="task-tag-dot" style="background:${t.color}"></span>${esc(t.name)}
            </span>`
        ).join('')}</div>` : ''}
        <div class="task-card-footer">
            <div class="task-card-meta">
                ${task.dueDate ? `<span class="task-due ${dueStatus}">${formatDeadline(task.dueDate)}</span>` : ''}
                ${subtasks.length ? `
                    <div class="task-subtasks-progress">
                        <div class="subtask-bar">
                            <div class="subtask-bar-fill" style="width:${(done/subtasks.length)*100}%"></div>
                        </div>
                        <span>${done}/${subtasks.length}</span>
                    </div>
                ` : ''}
                ${task.comments?.length ? `<span title="${task.comments.length} commentaires">&#x1F4AC; ${task.comments.length}</span>` : ''}
                ${task.timeSpent ? `<span title="Temps total">&#x23F1; ${formatDuration(task.timeSpent)}</span>` : ''}
                ${watcherCount ? `<span class="task-watchers" title="${watcherCount} suiveur(s)">👁 ${watcherCount}</span>` : ''}
                ${isBlocked ? `<span class="task-blocked-badge" title="Bloquee par ${blockedBy.length} tache(s)">🔒 ${blockedBy.length}</span>` : ''}
            </div>
            ${assignee ? `
                <div class="task-card-assignee" style="background:${avatarColor(assignee.uid)}" title="${esc(assignee.displayName || assignee.email)}">
                    ${esc((assignee.displayName || assignee.email || 'U').charAt(0).toUpperCase())}
                </div>
            ` : ''}
        </div>
        ${task.archived ? '<div class="task-archived-badge">Archive</div>' : ''}
    `;

    card.addEventListener('click', e => {
        // Shift+click → toggle bulk selection
        if (e.shiftKey || state.selectedTaskIds.size > 0) {
            e.preventDefault();
            toggleTaskSelection(task.id, card);
            return;
        }
        openTaskModal(task);
    });
    // Restore selected state if re-rendered
    if (state.selectedTaskIds.has(task.id)) card.classList.add('selected');

    if (!task.archived) {
        card.addEventListener('dragstart', e => {
            state.draggedTask = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            $$('.column').forEach(c => c.classList.remove('drag-over'));
            state.draggedTask = null;
        });
    }

    return card;
}

function getDueStatus(dueDate) {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const now = new Date();
    const diff = due - now;
    if (diff < 0) return 'overdue';
    if (diff < 24 * 60 * 60 * 1000) return 'soon';
    return 'later';
}

function formatDeadline(dueDate) {
    const due = new Date(dueDate);
    const now = new Date();
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

// ==========================================
// TASKS - CRUD
// ==========================================

async function createTask(data) {
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Tu es en lecture seule sur ce projet', 'error');
        return null;
    }
    if (!validators.taskTitle(data.title)) {
        toast('Titre invalide', 'error');
        return null;
    }

    const taskData = {
        ...data,
        projectId: state.currentProjectId,
        createdBy: state.currentUser.uid,
        createdAt: new Date().toISOString(),
        archived: false,
        timeSpent: 0
    };

    const ref = await addDoc(collection(db, 'tasks'), taskData);

    // Notify assignee
    if (data.assigneeId && data.assigneeId !== state.currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
            userId: data.assigneeId,
            type: 'assign',
            message: `${state.currentUser.displayName || state.currentUser.email} vous a assigne la tache "${data.title}"`,
            projectId: state.currentProjectId,
            taskId: ref.id,
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    toast('Tache creee', 'success');
    try { addGamificationPoints?.(5, 'create'); } catch (e) {}
    try { logActivity?.('task-create', { title: data.title }); } catch (e) {}
    return ref.id;
}

async function updateTask(id, data) {
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Tu es en lecture seule sur ce projet', 'error');
        return;
    }
    const oldTask = state.tasks.find(t => t.id === id);
    const wasNotDone = oldTask && oldTask.status !== 'done';
    const isNowDone = data.status === 'done';

    await updateDoc(doc(db, 'tasks', id), data);

    // Handle recurrence if task completed
    if (data.status === 'done' && oldTask?.recurrence && oldTask.recurrence !== 'none') {
        await createRecurringTask(oldTask);
    }

    // Notify if assignee changed
    if (data.assigneeId && data.assigneeId !== oldTask?.assigneeId && data.assigneeId !== state.currentUser.uid) {
        await addDoc(collection(db, 'notifications'), {
            userId: data.assigneeId,
            type: 'assign',
            message: `${state.currentUser.displayName || state.currentUser.email} vous a assigne la tache "${data.title}"`,
            projectId: state.currentProjectId,
            taskId: id,
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    toast('Tache mise a jour', 'success');

    try {
        if (wasNotDone && isNowDone) {
            addGamificationPoints?.(10, 'complete');
            checkTaskCompletionBadges?.();
            logActivity?.('task-complete', { title: data.title || oldTask?.title });
            // 🎉 confetti reward
            try { fireConfetti(); } catch (e) {}
        } else {
            logActivity?.('task-update', { title: data.title || oldTask?.title });
        }
    } catch (e) {}
}

async function deleteTask(id) {
    if (!canDeleteTasks(state.currentProjectId)) {
        toast('Seul l\'owner ou un admin peut supprimer des taches', 'error');
        return;
    }
    if (!confirm('Supprimer cette tache definitivement ?')) return;

    stopTimer(id);
    // Best-effort: delete linked attachments
    try {
        const snap = await getDocs(query(collection(db, 'attachments'), where('taskId', '==', id)));
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'attachments', d.id))));
    } catch (e) { /* ignore */ }
    await deleteDoc(doc(db, 'tasks', id));

    toast('Tache supprimee', 'info');
    closeModal(el.taskModal);
}

async function archiveTask(id) {
    await updateDoc(doc(db, 'tasks', id), {
        archived: true,
        archivedAt: new Date().toISOString()
    });

    stopTimer(id);
    toast('Tache archivee', 'success');
    closeModal(el.taskModal);
}

async function unarchiveTask(id) {
    await updateDoc(doc(db, 'tasks', id), {
        archived: false,
        archivedAt: null
    });

    toast('Tache restauree', 'success');
    closeModal(el.taskModal);
}

async function duplicateTask(task) {
    const newTask = {
        title: task.title + ' (copie)',
        description: task.description,
        status: 'todo',
        priority: task.priority,
        assigneeId: task.assigneeId,
        dueDate: null,
        tags: task.tags || [],
        subtasks: (task.subtasks || []).map(s => ({ ...s, completed: false })),
        recurrence: 'none'
    };

    await createTask(newTask);
    closeModal(el.taskModal);
}

// ==========================================
// RECURRENCE
// ==========================================

async function createRecurringTask(originalTask) {
    const newDueDate = calculateNextDueDate(originalTask.dueDate, originalTask.recurrence);

    const newTask = {
        title: originalTask.title,
        description: originalTask.description,
        status: 'todo',
        priority: originalTask.priority,
        assigneeId: originalTask.assigneeId,
        dueDate: newDueDate,
        tags: originalTask.tags || [],
        subtasks: (originalTask.subtasks || []).map(s => ({ ...s, completed: false })),
        recurrence: originalTask.recurrence,
        projectId: originalTask.projectId,
        createdBy: state.currentUser.uid,
        createdAt: new Date().toISOString(),
        archived: false,
        timeSpent: 0,
        parentTaskId: originalTask.id
    };

    await addDoc(collection(db, 'tasks'), newTask);
    toast('Nouvelle tache recurrente creee', 'info');
}

function calculateNextDueDate(currentDueDate, recurrence) {
    const date = currentDueDate ? new Date(currentDueDate) : new Date();

    switch (recurrence) {
        case 'daily':
            date.setDate(date.getDate() + 1);
            break;
        case 'weekly':
            date.setDate(date.getDate() + 7);
            break;
        case 'biweekly':
            date.setDate(date.getDate() + 14);
            break;
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'quarterly':
            date.setMonth(date.getMonth() + 3);
            break;
        case 'yearly':
            date.setFullYear(date.getFullYear() + 1);
            break;
    }

    return date.toISOString();
}

// ==========================================
// TIME TRACKING
// ==========================================

function startTimer(taskId) {
    if (state.timeTracking[taskId]?.isRunning) return;

    state.timeTracking[taskId] = {
        isRunning: true,
        startTime: Date.now(),
        intervalId: setInterval(() => updateTimerDisplay(taskId), 1000)
    };

    renderTasks();
    updateTimerDisplay(taskId);
    toast('Timer demarre', 'info');
}

function stopTimer(taskId) {
    const tracker = state.timeTracking[taskId];
    if (!tracker?.isRunning) return;

    clearInterval(tracker.intervalId);
    const elapsed = Math.floor((Date.now() - tracker.startTime) / 1000);

    state.timeTracking[taskId] = { isRunning: false };

    // Update task with time spent
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        const newTimeSpent = (task.timeSpent || 0) + elapsed;
        updateDoc(doc(db, 'tasks', taskId), { timeSpent: newTimeSpent });
    }

    renderTasks();
    toast(`Timer arrete: ${formatDuration(elapsed)} ajoute`, 'success');
}

function stopAllTimers() {
    Object.keys(state.timeTracking).forEach(taskId => {
        if (state.timeTracking[taskId]?.isRunning) {
            stopTimer(taskId);
        }
    });
}

function updateTimerDisplay(taskId) {
    const tracker = state.timeTracking[taskId];
    if (!tracker?.isRunning) return;

    const elapsed = Math.floor((Date.now() - tracker.startTime) / 1000);
    const display = $('timer-display');
    if (display && state.editingTaskId === taskId) {
        display.textContent = formatDuration(elapsed);
    }
}

function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

// ==========================================
// COMMENTS
// ==========================================

function renderComments(task) {
    if (!el.commentsList) return;

    const comments = task.comments || [];

    el.commentsList.innerHTML = comments.map(c => {
        const author = state.projectMembers.find(m => m.uid === c.authorId) || { displayName: 'User', uid: c.authorId };
        return `
            <div class="comment-item">
                <div class="comment-avatar" style="background:${avatarColor(c.authorId)}">${esc((author.displayName || 'U').charAt(0).toUpperCase())}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${esc(author.displayName || 'User')}</span>
                        <span class="comment-time">${timeAgo(c.createdAt)}</span>
                    </div>
                    <div class="comment-text">${renderMentionsInText(c.text)}</div>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:var(--text-muted);padding:0.5rem;text-align:center">Aucun commentaire</div>';
}

async function addComment(taskId, text) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const comments = task.comments || [];
    const comment = {
        authorId: state.currentUser.uid,
        text: text.trim(),
        createdAt: new Date().toISOString()
    };

    comments.push(comment);
    await updateDoc(doc(db, 'tasks', taskId), { comments });

    // Notify task creator, assignee, and watchers
    const toNotify = new Set([task.createdBy, task.assigneeId, ...(task.watchers || [])]
        .filter(x => x && x !== state.currentUser.uid));

    // Add @mentioned users (resolved against Firestore)
    const mentions = await resolveMentions(parseMentions(text));
    mentions.forEach(m => { if (m.uid && m.uid !== state.currentUser.uid) toNotify.add(m.uid); });

    const authorName = state.userProfile?.displayName || state.currentUser.email.split('@')[0];

    for (const userId of toNotify) {
        const isMention = mentions.some(m => m.uid === userId);
        await addDoc(collection(db, 'notifications'), {
            userId,
            type: isMention ? 'mention' : 'comment',
            message: isMention
                ? `${authorName} t'a mentionne dans "${task.title}"`
                : `${authorName} a commente "${task.title}"`,
            projectId: state.currentProjectId,
            taskId,
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    renderComments({ ...task, comments });
    if (el.commentInput) el.commentInput.value = '';
}

// ==========================================
// NOTIFICATIONS
// ==========================================

function renderNotifications() {
    const unread = state.notifications.filter(n => !n.read).length;

    if (el.notificationBadge) {
        el.notificationBadge.textContent = unread;
        el.notificationBadge.style.display = unread ? 'flex' : 'none';
    }

    if (!el.notificationsList) return;

    el.notificationsList.innerHTML = state.notifications.length ? state.notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
            <div class="notification-icon ${n.type}">
                ${n.type === 'invite' ? '&#x1F465;' : n.type === 'assign' ? '&#x1F4CB;' : '&#x1F4AC;'}
            </div>
            <div class="notification-content">
                <div class="notification-text">${esc(n.message)}</div>
                <div class="notification-time">${timeAgo(n.createdAt)}</div>
            </div>
        </div>
    `).join('') : '<div class="notifications-empty">Aucune notification</div>';

    el.notificationsList.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => markNotificationRead(item.dataset.id));
    });
}

async function markNotificationRead(id) {
    await updateDoc(doc(db, 'notifications', id), { read: true });
}

async function markAllNotificationsRead() {
    const unread = state.notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    toast('Notifications marquees lues', 'info');
}

// ==========================================
// TEMPLATES
// ==========================================

async function saveAsTemplate(project) {
    const templateName = prompt('Nom du template:', project.name + ' - Template');
    if (!templateName) return;

    const tasks = state.tasks.filter(t => !t.archived);

    await addDoc(collection(db, 'templates'), {
        name: templateName.trim(),
        description: project.description,
        color: project.color,
        ownerId: state.currentUser.uid,
        tasks: tasks.map(t => ({
            title: t.title,
            description: t.description,
            priority: t.priority,
            subtasks: t.subtasks || [],
            tags: t.tags || []
        })),
        tags: state.tags.map(t => ({
            name: t.name,
            color: t.color
        })),
        createdAt: new Date().toISOString()
    });

    toast('Template sauvegarde !', 'success');
}

async function createTasksFromTemplate(projectId, template) {
    // Create tags first
    const tagMap = {};
    for (const tagData of template.tags || []) {
        const tagRef = await addDoc(collection(db, 'tags'), {
            name: tagData.name,
            color: tagData.color,
            projectId,
            createdAt: new Date().toISOString()
        });
        tagMap[tagData.name] = tagRef.id;
    }

    // Create tasks
    for (const taskData of template.tasks || []) {
        await addDoc(collection(db, 'tasks'), {
            title: taskData.title,
            description: taskData.description,
            status: 'todo',
            priority: taskData.priority,
            assigneeId: null,
            dueDate: null,
            tags: [], // Tags would need mapping
            subtasks: taskData.subtasks || [],
            projectId,
            createdBy: state.currentUser.uid,
            createdAt: new Date().toISOString(),
            archived: false,
            timeSpent: 0,
            recurrence: 'none'
        });
    }
}

function renderTemplatesList() {
    const container = $('templates-list');
    if (!container) return;

    if (!state.templates.length) {
        container.innerHTML = '<div class="templates-empty">Aucun template. Sauvegarde une tache (bouton ⭐ Template dans la tache) ou tout un projet (bouton "Template" dans la sidebar).</div>';
        return;
    }

    container.innerHTML = state.templates.map(t => `
        <div class="template-item" data-id="${t.id}">
            <div class="template-color" style="background:${t.color || '#6366f1'}"></div>
            <div class="template-info">
                <span class="template-name">${esc(t.name)}</span>
                <span class="template-tasks">${t.tasks?.length || 0} tache(s)${t.description ? ' - ' + esc(t.description) : ''}</span>
            </div>
            <button class="btn-primary template-use" data-id="${t.id}">Utiliser</button>
            <button class="btn-icon template-delete" data-id="${t.id}" title="Supprimer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');

    // Wire up
    container.querySelectorAll('.template-use').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const tpl = state.templates.find(t => t.id === id);
            if (tpl) useTemplate(tpl);
        });
    });
    container.querySelectorAll('.template-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (confirm('Supprimer ce template definitivement ?')) deleteTemplate(id);
        });
    });
}

async function deleteTemplate(id) {
    try {
        await deleteDoc(doc(db, 'templates', id));
        toast('Template supprime', 'info');
    } catch (e) {
        handleError(e, 'deleteTemplate');
    }
}

async function useTemplate(template) {
    if (!state.currentProjectId) {
        toast('Selectionne d\'abord un projet', 'error');
        return;
    }
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Lecture seule sur ce projet', 'error');
        return;
    }
    const count = template.tasks?.length || 0;
    if (!count) { toast('Template vide', 'info'); return; }
    if (!confirm(`Ajouter ${count} tache(s) du template "${template.name}" dans le projet courant ?`)) return;

    for (const taskData of template.tasks) {
        await addDoc(collection(db, 'tasks'), {
            title: taskData.title,
            description: taskData.description || '',
            status: 'todo',
            priority: taskData.priority || 'medium',
            assigneeId: null,
            dueDate: null,
            tags: [],
            subtasks: (taskData.subtasks || []).map(s => ({ ...s, completed: false })),
            projectId: state.currentProjectId,
            createdBy: state.currentUser.uid,
            createdAt: new Date().toISOString(),
            archived: false,
            timeSpent: 0,
            recurrence: 'none'
        });
    }
    toast(`${count} tache(s) ajoutee(s) depuis le template`, 'success');
    closeModal($('templates-modal'));
}

// ==========================================
// ATTACHMENTS (PDF, txt, images... stored as base64 in Firestore)
// ==========================================

const MAX_ATTACHMENT_SIZE = 700 * 1024; // 700 KB raw (under 1MB Firestore limit after base64)
let _currentTaskAttachments = [];
let _attachmentsUnsub = null;

function listenToTaskAttachments(taskId) {
    if (_attachmentsUnsub) { _attachmentsUnsub(); _attachmentsUnsub = null; }
    _currentTaskAttachments = [];
    if (!taskId) { renderAttachmentsList(); return; }

    try {
        const q = query(collection(db, 'attachments'), where('taskId', '==', taskId));
        _attachmentsUnsub = onSnapshot(q, snap => {
            _currentTaskAttachments = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (a.uploadedAt || '').localeCompare(b.uploadedAt || ''));
            renderAttachmentsList();
        }, err => {
            console.warn('attachments listener:', err);
            renderAttachmentsList();
        });
    } catch (e) {
        console.warn('listenToTaskAttachments:', e);
    }
}

function fileIcon(type = '') {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📕';
    if (type.startsWith('text/')) return '📄';
    if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return '🗜️';
    if (type.includes('word')) return '📝';
    if (type.includes('sheet') || type.includes('excel')) return '📊';
    if (type.includes('audio')) return '🎵';
    if (type.includes('video')) return '🎬';
    return '📎';
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
}

function renderAttachmentsList() {
    const container = $('attachments-list');
    if (!container) return;

    if (!_currentTaskAttachments.length) {
        container.innerHTML = '<div class="attachments-empty">Aucune piece jointe</div>';
        return;
    }

    container.innerHTML = _currentTaskAttachments.map(a => `
        <div class="attachment-item" data-id="${a.id}">
            <span class="attachment-icon">${fileIcon(a.type)}</span>
            <div class="attachment-info">
                <span class="attachment-name" title="${esc(a.name)}">${esc(a.name)}</span>
                <span class="attachment-meta">${formatFileSize(a.size)} ${a.type ? '· ' + esc(a.type) : ''}</span>
            </div>
            <button type="button" class="btn-icon attachment-download" data-id="${a.id}" title="Telecharger">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </button>
            <button type="button" class="btn-icon attachment-delete" data-id="${a.id}" title="Supprimer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.attachment-download').forEach(btn => {
        btn.addEventListener('click', () => {
            const att = _currentTaskAttachments.find(a => a.id === btn.dataset.id);
            if (att) downloadAttachment(att);
        });
    });
    container.querySelectorAll('.attachment-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            if (confirm('Supprimer cette piece jointe ?')) deleteAttachment(btn.dataset.id);
        });
    });
}

function downloadAttachment(att) {
    try {
        const a = document.createElement('a');
        a.href = att.data; // data: URL
        a.download = att.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        handleError(e, 'downloadAttachment');
    }
}

async function deleteAttachment(id) {
    try {
        await deleteDoc(doc(db, 'attachments', id));
        toast('Piece jointe supprimee', 'info');
    } catch (e) {
        handleError(e, 'deleteAttachment');
    }
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

async function uploadAttachmentForCurrentTask(file) {
    if (!file) return;
    if (!state.editingTaskId) {
        toast('Enregistre d\'abord la tache pour ajouter des pieces jointes', 'error');
        return;
    }
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Lecture seule sur ce projet', 'error');
        return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
        toast(`Fichier trop volumineux (max ${formatFileSize(MAX_ATTACHMENT_SIZE)})`, 'error');
        return;
    }

    try {
        const dataUrl = await readFileAsDataURL(file);
        await addDoc(collection(db, 'attachments'), {
            taskId: state.editingTaskId,
            projectId: state.currentProjectId,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: dataUrl,
            uploadedBy: state.currentUser.uid,
            uploadedAt: new Date().toISOString()
        });
        toast('Piece jointe ajoutee', 'success');
    } catch (e) {
        handleError(e, 'uploadAttachment');
    }
}

async function saveTaskAsTemplate(task) {
    if (!task) return;
    const templateName = prompt('Nom du template:', task.title);
    if (!templateName) return;

    try {
        await addDoc(collection(db, 'templates'), {
            name: templateName.trim(),
            description: 'Template d\'une tache',
            color: '#6366f1',
            ownerId: state.currentUser.uid,
            tasks: [{
                title: task.title,
                description: task.description || '',
                priority: task.priority || 'medium',
                subtasks: (task.subtasks || []).map(s => ({ text: s.text, completed: false })),
                tags: []
            }],
            tags: [],
            createdAt: new Date().toISOString()
        });
        toast('Tache sauvegardee comme template', 'success');
    } catch (e) {
        handleError(e, 'saveTaskAsTemplate');
    }
}

// ==========================================
// FILTERS
// ==========================================

function resetFilters() {
    state.filters = {
        search: '',
        tags: [],
        priority: null,
        assignee: null,
        status: null,
        dateRange: null,
        showArchived: false
    };
    if (el.searchInput) el.searchInput.value = '';
    renderTasks();
    updateActiveFiltersDisplay();
}

function renderFilterTags() {
    const container = $('filter-tags');
    if (!container) return;

    container.innerHTML = state.tags.map(t => `
        <label class="filter-tag-checkbox">
            <input type="checkbox" value="${t.id}" ${state.filters.tags.includes(t.id) ? 'checked' : ''}>
            <span class="filter-tag-chip" style="background:${t.color}20;color:${t.color}">
                <span class="filter-tag-dot" style="background:${t.color}"></span>${esc(t.name)}
            </span>
        </label>
    `).join('') || '<span class="text-muted">Aucun tag</span>';

    container.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', () => {
            if (input.checked) {
                state.filters.tags.push(input.value);
            } else {
                state.filters.tags = state.filters.tags.filter(id => id !== input.value);
            }
            renderTasks();
        });
    });
}

function renderFilterAssignees() {
    const container = $('filter-assignee');
    if (!container) return;

    container.innerHTML = '<option value="">Tous</option>' +
        state.projectMembers.map(m =>
            `<option value="${m.uid}" ${state.filters.assignee === m.uid ? 'selected' : ''}>${esc(m.displayName || m.email)}</option>`
        ).join('');

    container.addEventListener('change', () => {
        state.filters.assignee = container.value || null;
        renderTasks();
    });
}

function updateActiveFiltersDisplay() {
    const container = $('active-filters');
    if (!container) return;

    const activeFilters = [];

    if (state.filters.tags.length > 0) {
        const tagNames = state.filters.tags.map(id => state.tags.find(t => t.id === id)?.name).filter(Boolean);
        activeFilters.push(`Tags: ${esc(tagNames.join(', '))}`);
    }
    if (state.filters.priority) {
        activeFilters.push(`Priorite: ${state.filters.priority}`);
    }
    if (state.filters.assignee) {
        const assignee = state.projectMembers.find(m => m.uid === state.filters.assignee);
        activeFilters.push(`Assigne: ${esc(assignee?.displayName || assignee?.email || '')}`);
    }
    if (state.filters.dateRange) {
        const labels = { today: "Aujourd'hui", week: 'Cette semaine', overdue: 'En retard', 'no-date': 'Sans date' };
        activeFilters.push(`Date: ${labels[state.filters.dateRange]}`);
    }
    if (state.filters.showArchived) {
        activeFilters.push('Archives incluses');
    }

    if (activeFilters.length > 0) {
        container.innerHTML = `
            <div class="active-filters-list">
                ${activeFilters.map(f => `<span class="active-filter">${f}</span>`).join('')}
                <button class="clear-filters" id="clear-filters">Effacer</button>
            </div>
        `;
        container.style.display = 'block';
        $('clear-filters')?.addEventListener('click', resetFilters);
    } else {
        container.style.display = 'none';
    }
}

// ==========================================
// CALENDAR VIEW
// ==========================================

function renderCalendar() {
    const container = $('calendar-container');
    if (!container) return;

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    // Get first day of month
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startingDay = firstDay.getDay();
    const totalDays = lastDay.getDate();

    // Create calendar header
    let html = `
        <div class="calendar-header">
            <button class="btn-icon" id="prev-month">&#x25C0;</button>
            <h3>${firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</h3>
            <button class="btn-icon" id="next-month">&#x25B6;</button>
        </div>
        <div class="calendar-grid">
            <div class="calendar-weekdays">
                <span>Dim</span><span>Lun</span><span>Mar</span><span>Mer</span>
                <span>Jeu</span><span>Ven</span><span>Sam</span>
            </div>
            <div class="calendar-days">
    `;

    // Empty cells for days before first day
    for (let i = 0; i < startingDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Days of the month
    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(currentYear, currentMonth, day);
        const dateStr = date.toISOString().split('T')[0];
        const isToday = date.toDateString() === today.toDateString();

        const dayTasks = state.tasks.filter(t => {
            if (!t.dueDate) return false;
            return t.dueDate.split('T')[0] === dateStr;
        });

        html += `
            <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                <span class="day-number">${day}</span>
                ${dayTasks.length > 0 ? `
                    <div class="day-tasks">
                        ${dayTasks.slice(0, 3).map(t => `
                            <div class="day-task ${t.priority}" title="${esc(t.title)}">
                                ${esc(t.title.substring(0, 15))}${t.title.length > 15 ? '...' : ''}
                            </div>
                        `).join('')}
                        ${dayTasks.length > 3 ? `<div class="day-task-more">+${dayTasks.length - 3}</div>` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    }

    html += '</div></div>';
    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.calendar-day:not(.empty)').forEach(day => {
        day.addEventListener('click', () => {
            const date = day.dataset.date;
            showTasksForDate(date);
        });
    });
}

function showTasksForDate(dateStr) {
    const dayTasks = state.tasks.filter(t => t.dueDate?.split('T')[0] === dateStr);

    if (dayTasks.length === 0) {
        // Open new task modal with this date
        openTaskModal(null);
        if (el.taskDue) el.taskDue.value = dateStr + 'T09:00';
    } else if (dayTasks.length === 1) {
        openTaskModal(dayTasks[0]);
    } else {
        // Show task list for this day
        const list = dayTasks.map(t => `- ${t.title}`).join('\n');
        toast(`${dayTasks.length} taches le ${new Date(dateStr).toLocaleDateString('fr-FR')}`, 'info');
    }
}

// ==========================================
// ANALYTICS VIEW
// ==========================================

function renderAnalytics() {
    const container = $('analytics-container');
    if (!container) return;

    const allTasks = [...state.tasks, ...state.archivedTasks];
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === 'done').length;
    const archivedTasks = state.archivedTasks.length;

    // Tasks by status
    const byStatus = {
        todo: state.tasks.filter(t => t.status === 'todo').length,
        inprogress: state.tasks.filter(t => t.status === 'inprogress').length,
        review: state.tasks.filter(t => t.status === 'review').length,
        done: state.tasks.filter(t => t.status === 'done').length
    };

    // Tasks by priority
    const byPriority = {
        high: state.tasks.filter(t => t.priority === 'high').length,
        medium: state.tasks.filter(t => t.priority === 'medium').length,
        low: state.tasks.filter(t => t.priority === 'low').length
    };

    // Overdue tasks
    const overdueTasks = state.tasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return new Date(t.dueDate) < new Date();
    }).length;

    // Total time tracked
    const totalTimeSpent = allTasks.reduce((sum, t) => sum + (t.timeSpent || 0), 0);

    // Tasks by member
    const byMember = {};
    state.projectMembers.forEach(m => {
        byMember[m.uid] = {
            name: m.displayName || m.email,
            count: state.tasks.filter(t => t.assigneeId === m.uid).length,
            completed: state.tasks.filter(t => t.assigneeId === m.uid && t.status === 'done').length
        };
    });

    container.innerHTML = `
        <div class="analytics-grid">
            <div class="analytics-card">
                <h4>Vue d'ensemble</h4>
                <div class="analytics-stats">
                    <div class="stat">
                        <span class="stat-value">${totalTasks}</span>
                        <span class="stat-label">Total</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${completedTasks}</span>
                        <span class="stat-label">Terminees</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${archivedTasks}</span>
                        <span class="stat-label">Archivees</span>
                    </div>
                    <div class="stat ${overdueTasks > 0 ? 'danger' : ''}">
                        <span class="stat-value">${overdueTasks}</span>
                        <span class="stat-label">En retard</span>
                    </div>
                </div>
            </div>

            <div class="analytics-card">
                <h4>Par statut</h4>
                <div class="analytics-bars">
                    <div class="bar-item">
                        <span class="bar-label">A faire</span>
                        <div class="bar-track">
                            <div class="bar-fill todo" style="width:${totalTasks ? (byStatus.todo/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byStatus.todo}</span>
                    </div>
                    <div class="bar-item">
                        <span class="bar-label">En cours</span>
                        <div class="bar-track">
                            <div class="bar-fill inprogress" style="width:${totalTasks ? (byStatus.inprogress/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byStatus.inprogress}</span>
                    </div>
                    <div class="bar-item">
                        <span class="bar-label">En revue</span>
                        <div class="bar-track">
                            <div class="bar-fill review" style="width:${totalTasks ? (byStatus.review/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byStatus.review}</span>
                    </div>
                    <div class="bar-item">
                        <span class="bar-label">Termine</span>
                        <div class="bar-track">
                            <div class="bar-fill done" style="width:${totalTasks ? (byStatus.done/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byStatus.done}</span>
                    </div>
                </div>
            </div>

            <div class="analytics-card">
                <h4>Par priorite</h4>
                <div class="analytics-bars">
                    <div class="bar-item">
                        <span class="bar-label">Haute</span>
                        <div class="bar-track">
                            <div class="bar-fill high" style="width:${totalTasks ? (byPriority.high/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byPriority.high}</span>
                    </div>
                    <div class="bar-item">
                        <span class="bar-label">Moyenne</span>
                        <div class="bar-track">
                            <div class="bar-fill medium" style="width:${totalTasks ? (byPriority.medium/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byPriority.medium}</span>
                    </div>
                    <div class="bar-item">
                        <span class="bar-label">Basse</span>
                        <div class="bar-track">
                            <div class="bar-fill low" style="width:${totalTasks ? (byPriority.low/totalTasks)*100 : 0}%"></div>
                        </div>
                        <span class="bar-value">${byPriority.low}</span>
                    </div>
                </div>
            </div>

            <div class="analytics-card">
                <h4>Temps total</h4>
                <div class="analytics-time">
                    <span class="time-value">${formatDuration(totalTimeSpent)}</span>
                    <span class="time-label">Temps suivi</span>
                </div>
            </div>

            <div class="analytics-card wide">
                <h4>Par membre</h4>
                <div class="analytics-members">
                    ${Object.values(byMember).map(m => `
                        <div class="member-stat">
                            <span class="member-name">${esc(m.name)}</span>
                            <span class="member-count">${m.count} taches (${m.completed} terminees)</span>
                            <div class="member-progress">
                                <div class="progress-fill" style="width:${m.count ? (m.completed/m.count)*100 : 0}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="analytics-card wide">
                <h4>🏆 Leaderboard (7 derniers jours)</h4>
                <div class="leaderboard">
                    ${renderLeaderboard()}
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// EXPORT
// ==========================================

function exportData(format) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) {
        toast('Selectionnez un projet', 'error');
        return;
    }

    const data = {
        project: {
            name: project.name,
            description: project.description,
            color: project.color,
            exportedAt: new Date().toISOString()
        },
        tasks: state.tasks.map(t => ({
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            tags: (t.tags || []).map(tid => state.tags.find(tag => tag.id === tid)?.name).filter(Boolean),
            subtasks: t.subtasks,
            timeSpent: t.timeSpent,
            comments: t.comments?.length || 0
        })),
        tags: state.tags.map(t => ({
            name: t.name,
            color: t.color
        })),
        stats: {
            total: state.tasks.length,
            completed: state.tasks.filter(t => t.status === 'done').length,
            archived: state.archivedTasks.length
        }
    };

    let content, filename, type;

    if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        filename = `${project.name.replace(/\s+/g, '_')}_export.json`;
        type = 'application/json';
    } else if (format === 'csv') {
        // CSV format for tasks
        const headers = ['Titre', 'Description', 'Statut', 'Priorite', 'Date limite', 'Tags', 'Temps'];
        const rows = data.tasks.map(t => [
            `"${t.title.replace(/"/g, '""')}"`,
            `"${(t.description || '').replace(/"/g, '""')}"`,
            t.status,
            t.priority,
            t.dueDate || '',
            `"${t.tags.join(', ')}"`,
            formatDuration(t.timeSpent || 0)
        ]);
        content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        filename = `${project.name.replace(/\s+/g, '_')}_export.csv`;
        type = 'text/csv';
    }

    // Download file
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(`Export ${format.toUpperCase()} telecharge`, 'success');
}

// ==========================================
// THEMES
// ==========================================

function initializeTheme() {
    const theme = localStorage.getItem('corviospace-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    state.theme = theme;
    updateThemeToggle();
}

function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('corviospace-theme', state.theme);
    updateThemeToggle();
    toast(`Theme ${state.theme === 'dark' ? 'sombre' : 'clair'} active`, 'info');
}

function updateThemeToggle() {
    const toggle = $('theme-toggle');
    if (toggle) {
        toggle.innerHTML = state.theme === 'dark' ? '&#x2600;' : '&#x1F319;';
        toggle.title = state.theme === 'dark' ? 'Theme clair' : 'Theme sombre';
    }
}

// ==========================================
// REMINDERS
// ==========================================

function checkReminders() {
    if (!state.settings.notifications) return;

    // Check every minute
    setInterval(() => {
        const now = new Date();

        state.tasks.forEach(task => {
            if (!task.dueDate || task.status === 'done') return;

            const dueDate = new Date(task.dueDate);
            const diff = dueDate - now;

            // Notify 1 hour before
            if (diff > 0 && diff <= 60 * 60 * 1000 && diff > 59 * 60 * 1000) {
                showBrowserNotification(`Rappel: "${task.title}"`, 'Echeance dans 1 heure');
            }

            // Notify when overdue
            if (diff < 0 && diff > -60 * 1000) {
                showBrowserNotification(`En retard: "${task.title}"`, 'Cette tache est en retard !');
            }
        });
    }, 60000);
}

function showBrowserNotification(title, body) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body, icon: '/favicon.ico' });
            }
        });
    }
}

// ==========================================
// DRAG & DROP
// ==========================================

$$('.column').forEach(col => {
    col.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    col.addEventListener('dragenter', e => {
        e.preventDefault();
        col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', e => {
        if (!col.contains(e.relatedTarget)) {
            col.classList.remove('drag-over');
        }
    });
    col.addEventListener('drop', async e => {
        e.preventDefault();
        col.classList.remove('drag-over');

        if (state.draggedTask) {
            const taskId = state.draggedTask.dataset.id;
            await moveTaskToStatus(taskId, col.dataset.status);
        }
    });
});

// Reusable move logic — used by desktop drag&drop AND the mobile "Move to" menu.
async function moveTaskToStatus(taskId, newStatus) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });

    // Handle recurrence on completion
    if (newStatus === 'done' && task.recurrence && task.recurrence !== 'none') {
        await createRecurringTask(task);
    }
    if (typeof vibrate === 'function') vibrate(20);
}

// ==========================================
// MODALS
// ==========================================

function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    // Stop attachments listener when task modal closes
    if (modal.id === 'task-modal' && typeof listenToTaskAttachments === 'function') {
        listenToTaskAttachments(null);
    }
}

function openProjectModal() {
    if (el.projectName) el.projectName.value = '';
    if (el.projectDesc) el.projectDesc.value = '';
    $$('.color-option:not(.tag-color)').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal(el.projectModal);
    el.projectName?.focus();
}

function openTagModal() {
    if (!state.currentProjectId) {
        toast('Creez un projet d\'abord', 'info');
        return;
    }
    if (el.tagName) el.tagName.value = '';
    $$('.tag-color').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal(el.tagModal);
    el.tagName?.focus();
}

function openMemberModal() {
    if (!state.currentProjectId) return;
    if (el.memberEmail) el.memberEmail.value = '';
    renderModalMembers();
    openModal(el.memberModal);
    el.memberEmail?.focus();
}

function populateBlockedBy(currentTaskId, selectedIds = []) {
    if (!el.taskBlockedBy) return;
    const others = state.tasks.filter(t => t.id !== currentTaskId);
    el.taskBlockedBy.innerHTML = others.map(t =>
        `<option value="${esc(t.id)}" ${selectedIds.includes(t.id) ? 'selected' : ''}>${esc(t.title)} (${esc(t.status)})</option>`
    ).join('') || '<option disabled>Aucune autre tache disponible</option>';
}

function openTaskModal(task = null) {
    state.editingTaskId = task?.id || null;

    if (task) {
        if (el.taskModalTitle) el.taskModalTitle.textContent = 'Modifier la tache';
        if (el.saveTaskBtn) el.saveTaskBtn.textContent = 'Enregistrer';
        if (el.deleteTaskBtn) el.deleteTaskBtn.style.display = 'flex';
        if (el.commentsSection) el.commentsSection.style.display = 'block';
        if (el.watchTaskBtn) {
            el.watchTaskBtn.style.display = 'inline-flex';
            const watching = (task.watchers || []).includes(state.currentUser?.uid);
            el.watchTaskBtn.innerHTML = watching ? '👁 Suivi' : '👁 Suivre';
        }
        if (el.focusTaskBtn) el.focusTaskBtn.style.display = 'inline-flex';

        if (el.taskTitle) el.taskTitle.value = task.title;
        if (el.taskDesc) el.taskDesc.value = task.description || '';
        if (el.taskStatus) el.taskStatus.value = task.status;
        if (el.taskPriority) el.taskPriority.value = task.priority;
        if (el.taskAssignee) el.taskAssignee.value = task.assigneeId || '';
        if (el.taskDue) el.taskDue.value = task.dueDate || '';
        if (el.taskRecurrence) el.taskRecurrence.value = task.recurrence || 'none';

        populateBlockedBy(task.id, task.blockedBy || []);

        el.tagsSelector?.querySelectorAll('input').forEach(inp => {
            inp.checked = task.tags?.includes(inp.value);
        });

        renderSubtasks(task.subtasks || []);
        renderComments(task);
        updateTaskTimeTracking(task);

        // Show archive/unarchive button
        const archiveBtn = $('archive-task-btn');
        if (archiveBtn) {
            archiveBtn.textContent = task.archived ? 'Restaurer' : 'Archiver';
            archiveBtn.onclick = () => task.archived ? unarchiveTask(task.id) : archiveTask(task.id);
            archiveBtn.style.display = 'flex';
        }
    } else {
        if (el.taskModalTitle) el.taskModalTitle.textContent = 'Nouvelle tache';
        if (el.saveTaskBtn) el.saveTaskBtn.textContent = 'Creer';
        if (el.deleteTaskBtn) el.deleteTaskBtn.style.display = 'none';
        if (el.commentsSection) el.commentsSection.style.display = 'none';
        if (el.watchTaskBtn) el.watchTaskBtn.style.display = 'none';
        if (el.focusTaskBtn) el.focusTaskBtn.style.display = 'none';

        const archiveBtn = $('archive-task-btn');
        if (archiveBtn) archiveBtn.style.display = 'none';

        el.taskForm?.reset();
        if (el.taskStatus) el.taskStatus.value = 'todo';
        if (el.taskPriority) el.taskPriority.value = 'medium';
        if (el.taskRecurrence) el.taskRecurrence.value = 'none';

        populateBlockedBy(null, []);

        el.tagsSelector?.querySelectorAll('input').forEach(inp => inp.checked = false);
        if (el.subtasksContainer) el.subtasksContainer.innerHTML = '';

        // Créée depuis une vue personnelle ("Mes taches" / "Aujourd'hui") →
        // l'auto-assigner à moi. Sinon la tache n'apparait PAS dans ces vues
        // (elles ne montrent que les taches qui me sont assignées) : c'est le
        // "les modules ne sont pas interconnectés" ressenti.
        if (el.taskAssignee && state.currentUser &&
            (state.currentView === 'mytasks' || state.currentView === 'today')) {
            el.taskAssignee.value = state.currentUser.uid;
        }

        updateTaskTimeTracking(null);
    }

    openModal(el.taskModal);
    el.taskTitle?.focus();
}

function updateTaskTimeTracking(task) {
    const container = $('time-tracking-container');
    if (!container) return;

    if (!task) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    const isRunning = state.timeTracking[task.id]?.isRunning;
    const totalTime = task.timeSpent || 0;

    container.innerHTML = `
        <div class="time-tracking">
            <div class="time-display">
                <span class="time-total">Total: ${formatDuration(totalTime)}</span>
                <span class="time-current" id="timer-display">${isRunning ? 'En cours...' : ''}</span>
            </div>
            <div class="time-actions">
                ${isRunning ? `
                    <button type="button" class="btn-secondary" id="stop-timer-btn">
                        &#x23F9; Arreter
                    </button>
                ` : `
                    <button type="button" class="btn-primary" id="start-timer-btn">
                        &#x25B6; Demarrer
                    </button>
                `}
            </div>
        </div>
    `;

    $('start-timer-btn')?.addEventListener('click', () => startTimer(task.id));
    $('stop-timer-btn')?.addEventListener('click', () => stopTimer(task.id));
}

function renderSubtasks(subtasks) {
    if (!el.subtasksContainer) return;
    el.subtasksContainer.innerHTML = '';
    subtasks.forEach((s, i) => addSubtaskEl(s.text, s.completed, i));
}

function addSubtaskEl(text = '', completed = false, idx = null) {
    if (!el.subtasksContainer) return;

    const div = document.createElement('div');
    div.className = 'subtask-item';
    div.innerHTML = `
        <input type="checkbox" ${completed ? 'checked' : ''}>
        <input type="text" value="${esc(text)}" placeholder="Sous-tache...">
        <button type="button" class="subtask-remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;

    div.querySelector('.subtask-remove').addEventListener('click', () => div.remove());
    el.subtasksContainer.appendChild(div);

    if (idx === null) {
        div.querySelector('input[type="text"]').focus();
    }
}

function getSubtasks() {
    if (!el.subtasksContainer) return [];

    return [...el.subtasksContainer.querySelectorAll('.subtask-item')].map(item => ({
        text: item.querySelector('input[type="text"]').value.trim(),
        completed: item.querySelector('input[type="checkbox"]').checked
    })).filter(s => s.text);
}

// ==========================================
// STATS
// ==========================================

function updateStats() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.status === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    if (el.progressPercent) el.progressPercent.textContent = pct + '%';
    if (el.progressFill) el.progressFill.style.width = pct + '%';
    if (el.completedCount) el.completedCount.textContent = done;
    if (el.totalCount) el.totalCount.textContent = total;
}

function updateEmptyState() {
    if (!state.projects.length) {
        el.board?.classList.add('hidden');
        el.emptyBoard?.classList.add('visible');
    } else if (state.currentProjectId) {
        el.board?.classList.remove('hidden');
        el.emptyBoard?.classList.remove('visible');
    }
}

// ==========================================
// VIEW SWITCHING
// ==========================================

function switchView(view) {
    state.currentView = view;

    // Update view buttons (header toggle + mobile bottom nav + drawer)
    $$('.view-btn, .bottom-nav-item[data-view], .sidebar-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide containers
    el.board?.classList.toggle('hidden', view !== 'board');
    $('calendar-container')?.classList.toggle('hidden', view !== 'calendar');
    $('analytics-container')?.classList.toggle('hidden', view !== 'analytics');
    $('mytasks-container')?.classList.toggle('hidden', view !== 'mytasks');
    $('today-container')?.classList.toggle('hidden', view !== 'today');

    // Render appropriate view
    if (view === 'calendar') renderCalendar();
    if (view === 'analytics') renderAnalytics();
    if (view === 'mytasks') renderMyTasks();
    if (view === 'today') renderToday();
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================

document.addEventListener('keydown', e => {
    // Don't trigger if typing in input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
    }

    // Don't trigger if modal open (except Esc)
    const modalOpen = document.querySelector('.modal.active');
    if (modalOpen && e.key !== 'Escape') return;

    switch (e.key.toLowerCase()) {
        case 'n':
            e.preventDefault();
            if (state.currentProjectId) openTaskModal();
            else toast('Creez un projet d\'abord', 'info');
            break;
        case 'p':
            e.preventDefault();
            openProjectModal();
            break;
        case 't':
            e.preventDefault();
            openTagModal();
            break;
        case 'm':
            e.preventDefault();
            if (state.currentProjectId) openMemberModal();
            break;
        case '/':
            e.preventDefault();
            el.searchInput?.focus();
            break;
        case '?':
            e.preventDefault();
            openModal(el.shortcutsModal);
            break;
        case 'escape':
            $$('.modal.active').forEach(m => closeModal(m));
            el.notificationsPanel?.classList.remove('open');
            $('filter-panel')?.classList.remove('open');
            break;
        case 'f':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                el.searchInput?.focus();
            }
            break;
        case '1':
        case '2':
        case '3':
        case '4':
            if (!e.ctrlKey && !e.metaKey) {
                const cols = ['todo', 'inprogress', 'review', 'done'];
                const col = el.columns[cols[parseInt(e.key) - 1]];
                if (col) {
                    col.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    col.classList.add('highlight');
                    setTimeout(() => col.classList.remove('highlight'), 500);
                }
            }
            break;
    }
});

// ==========================================
// UTILITIES
// ==========================================

const esc = t => {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
};

const toast = (msg, type = 'info') => {
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

const avatarColor = uid => {
    const colors = [
        'linear-gradient(135deg,#6366f1,#8b5cf6)',
        'linear-gradient(135deg,#ec4899,#f43f5e)',
        'linear-gradient(135deg,#10b981,#34d399)',
        'linear-gradient(135deg,#f59e0b,#fbbf24)',
        'linear-gradient(135deg,#06b6d4,#22d3ee)',
        'linear-gradient(135deg,#8b5cf6,#a78bfa)',
        'linear-gradient(135deg,#ef4444,#f87171)'
    ];
    let h = 0;
    for (let i = 0; i < uid.length; i++) {
        h = uid.charCodeAt(i) + ((h << 5) - h);
    }
    return colors[Math.abs(h) % colors.length];
};

const timeAgo = date => {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'A l\'instant';
    if (s < 3600) return Math.floor(s / 60) + 'min';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    if (s < 604800) return Math.floor(s / 86400) + 'j';
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

// ==========================================
// EVENT LISTENERS
// ==========================================

// Buttons
el.addProjectBtn?.addEventListener('click', openProjectModal);
el.createFirstProject?.addEventListener('click', openProjectModal);
el.addTagBtn?.addEventListener('click', openTagModal);
el.addMemberBtn?.addEventListener('click', openMemberModal);
el.addTaskBtn?.addEventListener('click', () => {
    if (state.currentProjectId) openTaskModal();
    else toast('Creez un projet', 'info');
});

// Notifications
el.notificationsBtn?.addEventListener('click', () => {
    el.notificationsPanel?.classList.toggle('open');
});
el.markAllRead?.addEventListener('click', markAllNotificationsRead);

// Project form
el.projectForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const color = document.querySelector('.color-option:not(.tag-color).active')?.dataset.color || '#6366f1';
    const name = el.projectName?.value.trim();
    if (!name) return;

    // Edit mode
    if (state.editingProjectId) {
        const bgEl = el.projectBgPicker?.querySelector('.bg-option.active');
        const colsRaw = el.projectColumns?.value.trim() || '';
        let columns = null;
        if (colsRaw) {
            const parts = colsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
            columns = parts.map((n, i) => ({
                id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20) || 'col' + i,
                name: n
            }));
        }
        const patch = {
            name,
            description: el.projectDesc?.value.trim() || '',
            color,
            background: bgEl?.dataset.bg || 'none',
            columns: columns || [],
            webhook: $('project-webhook')?.value.trim() || '',
            telegramToken: $('project-telegram-token')?.value.trim() || '',
            telegramChatId: $('project-telegram-chat')?.value.trim() || ''
        };
        try {
            await updateDoc(doc(db, 'projects', state.editingProjectId), patch);
            toast('Projet mis a jour', 'success');
            // Re-render the current project header / background
            const p = state.projects.find(x => x.id === state.editingProjectId);
            if (p) {
                Object.assign(p, patch);
                if (state.currentProjectId === p.id) {
                    el.projectTitle.textContent = p.name;
                    el.projectDescription.textContent = p.description || 'Gerez vos taches en equipe';
                    applyProjectBackground(p.background);
                    renderCustomColumns(p);
                    renderTasks();
                }
            }
        } catch (err) {
            toast('Erreur mise a jour projet', 'error');
        }
        state.editingProjectId = null;
        closeModal(el.projectModal);
        return;
    }

    // Create mode
    await createProject(name, el.projectDesc?.value.trim() || '', color);
    closeModal(el.projectModal);
});

// ---------- Open project modal in edit mode ----------
function openEditProjectModal() {
    const p = state.projects.find(x => x.id === state.currentProjectId);
    if (!p) { toast('Selectionne un projet', 'error'); return; }
    if (!canManageProject(p.id)) { toast('Seul le proprietaire ou un admin peut modifier', 'error'); return; }

    state.editingProjectId = p.id;

    // Update modal title
    const modalTitle = el.projectModal?.querySelector('.modal-header h2');
    if (modalTitle) modalTitle.textContent = 'Modifier le projet';
    const submitBtn = el.projectModal?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Enregistrer';

    // Pre-fill fields
    if (el.projectName) el.projectName.value = p.name || '';
    if (el.projectDesc) el.projectDesc.value = p.description || '';

    // Color
    document.querySelectorAll('.color-option:not(.tag-color)').forEach(b => {
        b.classList.toggle('active', b.dataset.color === p.color);
    });

    // Background
    const bg = p.background || 'none';
    el.projectBgPicker?.querySelectorAll('.bg-option').forEach(b => {
        b.classList.toggle('active', b.dataset.bg === bg);
    });

    // Columns
    if (el.projectColumns) {
        el.projectColumns.value = p.columns?.length ? p.columns.map(c => c.name).join(', ') : '';
    }

    // Webhooks
    const wh = $('project-webhook');
    const tt = $('project-telegram-token');
    const tc = $('project-telegram-chat');
    if (wh) wh.value = p.webhook || '';
    if (tt) tt.value = p.telegramToken || '';
    if (tc) tc.value = p.telegramChatId || '';

    // Show delete button only for owner
    const delBtn = $('delete-project-btn');
    if (delBtn) delBtn.style.display = canDeleteProject(p.id) ? '' : 'none';

    openModal(el.projectModal);
}

// Reset editing state when modal is closed via X / cancel
function resetProjectModal() {
    state.editingProjectId = null;
    const modalTitle = el.projectModal?.querySelector('.modal-header h2');
    if (modalTitle) modalTitle.textContent = 'Nouveau projet';
    const submitBtn = el.projectModal?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Creer le projet';
    const delBtn = $('delete-project-btn');
    if (delBtn) delBtn.style.display = 'none';
}

// Tag form
el.tagForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const color = document.querySelector('.tag-color.active')?.dataset.color || '#ef4444';
    const name = el.tagName?.value.trim();

    if (name) {
        await createTag(name, color);
        closeModal(el.tagModal);
    }
});

// Member form
el.memberForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = el.memberEmail?.value.trim();

    if (email) {
        await addMember(email);
        if (el.memberEmail) el.memberEmail.value = '';
    }
});

// Task form
el.taskForm?.addEventListener('submit', async e => {
    e.preventDefault();

    const data = {
        title: el.taskTitle?.value.trim() || '',
        description: el.taskDesc?.value.trim() || '',
        status: el.taskStatus?.value || 'todo',
        priority: el.taskPriority?.value || 'medium',
        assigneeId: el.taskAssignee?.value || null,
        dueDate: el.taskDue?.value || null,
        tags: [...(el.tagsSelector?.querySelectorAll('input:checked') || [])].map(i => i.value),
        subtasks: getSubtasks(),
        recurrence: el.taskRecurrence?.value || 'none',
        blockedBy: [...(el.taskBlockedBy?.selectedOptions || [])].map(o => o.value)
    };

    if (!data.title) {
        toast('Le titre est requis', 'error');
        return;
    }

    // v5: prevent moving to "done" if blocked
    if (data.status === 'done' && data.blockedBy?.length) {
        const stillBlocking = data.blockedBy.filter(bid => {
            const b = state.tasks.find(t => t.id === bid);
            return b && b.status !== 'done';
        });
        if (stillBlocking.length > 0) {
            toast(`Impossible : ${stillBlocking.length} dependance(s) non terminee(s)`, 'error');
            return;
        }
    }

    if (state.editingTaskId) {
        await updateTask(state.editingTaskId, data);
    } else {
        await createTask(data);
    }

    closeModal(el.taskModal);
});

// Task actions
el.deleteTaskBtn?.addEventListener('click', () => {
    if (state.editingTaskId) deleteTask(state.editingTaskId);
});

$('delete-project-btn')?.addEventListener('click', () => {
    if (state.editingProjectId) deleteProject(state.editingProjectId);
});

el.addSubtaskBtn?.addEventListener('click', () => addSubtaskEl());

el.sendComment?.addEventListener('click', () => {
    const text = el.commentInput?.value.trim();
    if (state.editingTaskId && text) {
        addComment(state.editingTaskId, text);
    }
});

el.commentInput?.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        const text = el.commentInput?.value.trim();
        if (state.editingTaskId && text) {
            addComment(state.editingTaskId, text);
        }
    }
});

// Search
el.searchInput?.addEventListener('input', () => {
    state.filters.search = el.searchInput.value;
    renderTasks();
});

// Mobile menu
el.mobileMenu?.addEventListener('click', () => {
    el.sidebar?.classList.toggle('open');
    document.getElementById('sidebar-backdrop')?.classList.toggle('visible');
});

// ---- Mobile bottom navigation (app-native) ----
function openMobileSidebar() {
    el.sidebar?.classList.add('open');
    document.getElementById('sidebar-backdrop')?.classList.add('visible');
}

// Tab items switch views
$$('.bottom-nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        // close any open overlays for a clean app feel
        el.notificationsPanel?.classList.remove('open');
        $('filter-panel')?.classList.remove('open');
    });
});

// Center FAB → new task
$('bottom-nav-fab')?.addEventListener('click', () => {
    if (state.currentProjectId) openTaskModal();
    else toast('Selectionnez ou creez un projet d\'abord', 'info');
});

// Menu tab → open the drawer
$('bottom-nav-menu')?.addEventListener('click', openMobileSidebar);

// Drawer "Vues" quick-nav
$$('.sidebar-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        closeMobileSidebar();
    });
});

// ---- Deploy button: trigger a Netlify build hook ----
// Default hook rebuilds production (corviospace-space). Overridable per device
// via localStorage('corviospace_build_hook').
$('deploy-btn')?.addEventListener('click', async () => {
    const DEFAULT_HOOK = 'https://api.netlify.com/build_hooks/6a3e7435132d1f0e46f1b20e';
    const url = localStorage.getItem('corviospace_build_hook') || DEFAULT_HOOK;

    if (!confirm('Lancer un deploiement en production sur Netlify ?')) return;
    try {
        // Build hooks accept an unauthenticated POST; no-cors lets it fire from the browser.
        await fetch(url, { method: 'POST', mode: 'no-cors' });
        toast('🚀 Build lancé — deploiement en cours sur Netlify', 'success');
    } catch (e) {
        toast('Echec du lancement du build', 'error');
    }
});

// ==========================================
// MOBILE INSTALL PROMO ("Corvio Space est sur mobile")
// ==========================================
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    // Chrome/Android/desktop-Chrome: keep the event to trigger a native install
    e.preventDefault();
    deferredInstallPrompt = e;
    $('promo-install')?.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    $('promo-install')?.classList.add('hidden');
    if (typeof toast === 'function') toast('Corvio Space installé 🎉', 'success');
});

function openMobilePromo() {
    const url = location.origin;
    const urlEl = $('promo-url');
    if (urlEl) urlEl.textContent = url.replace(/^https?:\/\//, '');
    const qr = $('promo-qr-img');
    if (qr) {
        qr.style.display = '';
        qr.onerror = () => { qr.closest('.promo-qr')?.classList.add('hidden'); };
        qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(url)}`;
    }
    openModal($('mobile-promo-modal'));
}

// Auto-show once on desktop for logged-in users (until dismissed).
function maybeShowMobilePromo() {
    if (localStorage.getItem('corviospace_promo_dismissed')) return;
    if (localStorage.getItem('corviospace_promo_seen')) return;
    if (window.matchMedia('(max-width: 900px)').matches) return; // desktop only
    localStorage.setItem('corviospace_promo_seen', '1');
    setTimeout(openMobilePromo, 1200);
}

$('mobile-app-btn')?.addEventListener('click', openMobilePromo);

$('promo-copy')?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(location.origin);
        toast('Lien copié — envoie-le sur ton tél ! 📲', 'success');
    } catch (e) {
        toast('Copie impossible, copie le lien manuellement', 'error');
    }
});

$('promo-install')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
        toast('Utilise le guide ci-dessous pour installer', 'info');
        return;
    }
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (e) {}
    deferredInstallPrompt = null;
    $('promo-install')?.classList.add('hidden');
});

$('promo-dismiss')?.addEventListener('click', () => {
    localStorage.setItem('corviospace_promo_dismissed', '1');
    closeModal($('mobile-promo-modal'));
});

$$('.promo-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.promo-tab').forEach(t => t.classList.toggle('active', t === tab));
        const os = tab.dataset.os;
        $('promo-steps-ios')?.classList.toggle('hidden', os !== 'ios');
        $('promo-steps-android')?.classList.toggle('hidden', os !== 'android');
    });
});

// Backdrop closes sidebar
document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    el.sidebar?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('visible');
});

// Close sidebar after navigation on mobile
function closeMobileSidebar() {
    if (window.innerWidth <= 900) {
        el.sidebar?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('visible');
    }
}

// Color pickers
$$('.color-option:not(.tag-color)').forEach(b => {
    b.addEventListener('click', () => {
        $$('.color-option:not(.tag-color)').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
    });
});

$$('.tag-color').forEach(b => {
    b.addEventListener('click', () => {
        $$('.tag-color').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
    });
});

// Close modals
$$('.modal-overlay, .modal-close, .modal-cancel').forEach(x => {
    x.addEventListener('click', e => {
        const m = e.target.closest('.modal');
        if (m) closeModal(m);
    });
});

// Close notifications and sidebar on outside click
document.addEventListener('click', e => {
    if (el.notificationsPanel &&
        !el.notificationsPanel.contains(e.target) &&
        !el.notificationsBtn?.contains(e.target)) {
        el.notificationsPanel.classList.remove('open');
    }

    if (window.innerWidth <= 900 &&
        el.sidebar?.classList.contains('open') &&
        !el.sidebar.contains(e.target) &&
        !el.mobileMenu?.contains(e.target) &&
        !$('bottom-nav-menu')?.contains(e.target)) {
        el.sidebar.classList.remove('open');
    }

    const filterPanel = $('filter-panel');
    const filterBtn = $('filter-btn');
    if (filterPanel &&
        !filterPanel.contains(e.target) &&
        !filterBtn?.contains(e.target)) {
        filterPanel.classList.remove('open');
    }
});

// Theme toggle
$('theme-toggle')?.addEventListener('click', toggleTheme);

// View toggles
$$('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Export buttons
$('export-json')?.addEventListener('click', () => exportData('json'));
$('export-csv')?.addEventListener('click', () => exportData('csv'));

// Filter panel toggle
$('filter-btn')?.addEventListener('click', () => {
    $('filter-panel')?.classList.toggle('open');
});

// Filter controls
$('filter-priority')?.addEventListener('change', e => {
    state.filters.priority = e.target.value || null;
    renderTasks();
});

$('filter-date')?.addEventListener('change', e => {
    state.filters.dateRange = e.target.value || null;
    renderTasks();
});

$('filter-archived')?.addEventListener('change', e => {
    state.filters.showArchived = e.target.checked;
    renderTasks();
});

// Save as template
$('save-template-btn')?.addEventListener('click', () => {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (project) saveAsTemplate(project);
    else toast('Aucun projet selectionne', 'error');
});

// Browse templates
$('browse-templates-btn')?.addEventListener('click', () => {
    renderTemplatesList();
    openModal($('templates-modal'));
});

// Attachments — pick file via button
$('attachment-pick-btn')?.addEventListener('click', () => $('attachment-input')?.click());
$('attachment-input')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await uploadAttachmentForCurrentTask(f);
    e.target.value = ''; // reset so re-uploading same file fires change
});

// Attachments — drag & drop
(() => {
    const dz = $('attachments-dropzone');
    if (!dz) return;
    ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('dragging');
    }));
    dz.addEventListener('drop', async e => {
        const files = Array.from(e.dataTransfer?.files || []);
        for (const f of files) await uploadAttachmentForCurrentTask(f);
    });
})();

// Save current task in modal as a template
$('task-template-btn')?.addEventListener('click', () => {
    if (!state.editingTaskId) {
        // Saving from a NEW (unsaved) task: build a quick task object from form fields
        const task = {
            title: el.taskTitle?.value.trim() || '',
            description: el.taskDesc?.value.trim() || '',
            priority: el.taskPriority?.value || 'medium',
            subtasks: getSubtasks()
        };
        if (!task.title) { toast('Titre requis pour faire un template', 'error'); return; }
        saveTaskAsTemplate(task);
        return;
    }
    const task = state.tasks.find(t => t.id === state.editingTaskId);
    if (task) saveTaskAsTemplate(task);
});

// Admin panel
$('admin-btn')?.addEventListener('click', () => {
    if (!isGlobalAdmin()) return;
    openModal($('admin-modal'));
    renderAdminPanel();
});

function renderAdminPanel() {
    const container = $('admin-panel-content');
    if (!container) return;

    container.innerHTML = `
        <div style="padding:1rem">
            <div style="display:flex;gap:.5rem;margin-bottom:1rem">
                <input type="text" id="admin-panel-search" placeholder="Chercher par email ou tag..." style="flex:1;padding:.6rem .85rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:.9rem">
                <button class="btn-primary" id="admin-panel-search-btn" style="padding:.6rem 1.2rem">Chercher</button>
            </div>
            <div id="admin-panel-results" style="margin-bottom:1rem">
                <p style="color:var(--text-secondary);font-size:.85rem">Cherche un utilisateur pour gerer sa licence.</p>
            </div>
            <hr style="border:none;border-top:1px solid var(--border);margin:1rem 0">
            <button class="btn-primary" id="admin-list-all-btn" style="width:100%;padding:.6rem">Voir tous les utilisateurs</button>
            <div id="admin-all-users" style="margin-top:1rem"></div>
        </div>
    `;

    const doSearch = () => adminPanelSearch($('admin-panel-search')?.value?.trim());
    $('admin-panel-search-btn')?.addEventListener('click', doSearch);
    $('admin-panel-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    $('admin-list-all-btn')?.addEventListener('click', adminListAllUsers);
}

async function adminPanelSearch(searchTerm) {
    const resultsDiv = $('admin-panel-results');
    if (!resultsDiv) return;
    if (!searchTerm) {
        resultsDiv.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Entrez un email ou un tag.</p>';
        return;
    }
    resultsDiv.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Recherche...</p>';

    try {
        let userQuery;
        if (searchTerm.includes('@')) {
            userQuery = query(collection(db, 'users'), where('email', '==', searchTerm.toLowerCase()), limit(10));
        } else if (searchTerm.includes('#')) {
            userQuery = query(collection(db, 'users'), where('handle', '==', searchTerm.toLowerCase()), limit(10));
        } else {
            userQuery = query(collection(db, 'users'), where('email', '>=', searchTerm.toLowerCase()), where('email', '<=', searchTerm.toLowerCase() + '\uf8ff'), limit(10));
        }
        const snap = await getDocs(userQuery);
        renderAdminUserList(resultsDiv, snap);
    } catch (err) {
        resultsDiv.innerHTML = '<p style="color:#ef4444;font-size:.85rem">Erreur de recherche</p>';
        console.error(err);
    }
}

async function adminListAllUsers() {
    const container = $('admin-all-users');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Chargement...</p>';
    try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50)));
        renderAdminUserList(container, snap);
    } catch (err) {
        container.innerHTML = '<p style="color:#ef4444;font-size:.85rem">Erreur</p>';
        console.error(err);
    }
}

function renderAdminUserList(container, snap) {
    if (snap.empty) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Aucun utilisateur trouve</p>';
        return;
    }

    container.innerHTML = snap.docs.map(d => {
        const u = d.data();
        const licensed = u.licensed ? true : false;
        const isAdmin = GLOBAL_ADMINS.includes(u.email?.toLowerCase());
        return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem .85rem;border-radius:8px;background:var(--bg-card);margin-bottom:.4rem;border:1px solid var(--border)">
                <div style="min-width:0">
                    <div style="display:flex;align-items:center;gap:.4rem">
                        <strong style="color:var(--text-primary);font-size:.85rem">${u.displayName || 'Sans nom'}</strong>
                        ${isAdmin ? '<span style="background:var(--primary);color:white;padding:0 .4rem;border-radius:4px;font-size:.65rem;font-weight:700">ADMIN</span>' : ''}
                    </div>
                    <div style="color:var(--text-secondary);font-size:.8rem">${u.email}${u.handle ? ' &middot; ' + u.handle : ''}</div>
                </div>
                <button class="admin-toggle-btn" data-uid="${d.id}" data-licensed="${licensed}" style="padding:.4rem .85rem;border-radius:6px;border:none;cursor:pointer;font-size:.8rem;font-weight:600;white-space:nowrap;${licensed ? 'background:#22c55e;color:white' : 'background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border)'}">
                    ${licensed ? 'Active' : 'Inactive'}
                </button>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.admin-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const uid = btn.dataset.uid;
            const currentlyLicensed = btn.dataset.licensed === 'true';
            const newValue = !currentlyLicensed;
            try {
                await updateDoc(doc(db, 'users', uid), { licensed: newValue });
                btn.dataset.licensed = String(newValue);
                btn.textContent = newValue ? 'Active' : 'Inactive';
                btn.style.background = newValue ? '#22c55e' : 'var(--bg-input)';
                btn.style.color = newValue ? 'white' : 'var(--text-secondary)';
                btn.style.border = newValue ? 'none' : '1px solid var(--border)';
                toast(`Licence ${newValue ? 'activee' : 'desactivee'}`, 'success');
            } catch (err) {
                toast('Erreur lors de la mise a jour', 'error');
                console.error(err);
            }
        });
    });
}

// Settings
$('settings-btn')?.addEventListener('click', () => {
    openModal($('settings-modal'));
    renderSettings();
});

function renderSettings() {
    const container = $('settings-content');
    if (!container) return;

    const THEME_LIST = [
        { id: 'aurora',    name: 'Aurora',    badge: 'NOUVEAU', c1: '#7c8cff', c2: '#0e1119' },
        { id: 'dark',      name: 'Sombre',    c1: '#6366f1', c2: '#0a0a0f' },
        { id: 'light',     name: 'Clair',     c1: '#6366f1', c2: '#e2e8f0' },
        { id: 'dracula',   name: 'Dracula',   c1: '#bd93f9', c2: '#282a36' },
        { id: 'nord',      name: 'Nord',      c1: '#88c0d0', c2: '#2e3440' },
        { id: 'solarized', name: 'Solarized', c1: '#268bd2', c2: '#002b36' },
        { id: 'monokai',   name: 'Monokai',   c1: '#f92672', c2: '#272822' },
    ];
    const currentTheme = localStorage.getItem('corviospace-theme') || 'dark';
    const themeChips = THEME_LIST.map(t => `
        <button type="button" class="theme-chip ${t.id === currentTheme ? 'active' : ''}" data-set-theme="${t.id}">
            <span class="theme-chip-swatch" style="background:linear-gradient(135deg,${t.c1},${t.c2})"></span>
            <span class="theme-chip-name">${t.name}</span>
            ${t.badge ? `<span class="theme-chip-badge">${t.badge}</span>` : ''}
        </button>
    `).join('');

    container.innerHTML = `
        <div class="settings-group">
            <div class="settings-label">🎨 Apparence — Thème</div>
            <div class="theme-grid">${themeChips}</div>
        </div>
        <div class="settings-group">
            <label class="settings-item">
                <span>Notifications navigateur</span>
                <input type="checkbox" id="setting-notifications" ${state.settings.notifications ? 'checked' : ''}>
            </label>
            <label class="settings-item">
                <span>Sons</span>
                <input type="checkbox" id="setting-sounds" ${state.settings.sounds ? 'checked' : ''}>
            </label>
            <label class="settings-item">
                <span>Mode compact</span>
                <input type="checkbox" id="setting-compact" ${state.settings.compactMode ? 'checked' : ''}>
            </label>
        </div>
        <div class="settings-actions">
            <button class="btn-danger" id="delete-account-btn">Supprimer mon compte</button>
        </div>
    `;

    // Theme chips → apply immediately + highlight active
    container.querySelectorAll('[data-set-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.setTheme;
            if (typeof applyTheme === 'function') applyTheme(id);
            else { document.documentElement.setAttribute('data-theme', id); localStorage.setItem('corviospace-theme', id); }
            container.querySelectorAll('.theme-chip').forEach(c =>
                c.classList.toggle('active', c.dataset.setTheme === id));
        });
    });

    $('setting-notifications')?.addEventListener('change', e => {
        state.settings.notifications = e.target.checked;
        saveSettings();
        if (e.target.checked) {
            Notification.requestPermission();
        }
    });

    $('setting-sounds')?.addEventListener('change', e => {
        state.settings.sounds = e.target.checked;
        saveSettings();
    });

    $('setting-compact')?.addEventListener('change', e => {
        state.settings.compactMode = e.target.checked;
        document.body.classList.toggle('compact-mode', e.target.checked);
        saveSettings();
    });

}

function saveSettings() {
    localStorage.setItem('corviospace-settings', JSON.stringify(state.settings));
    if (state.currentUser) {
        updateDoc(doc(db, 'users', state.currentUser.uid), { settings: state.settings });
    }
}

// Duplicate task button
$('duplicate-task-btn')?.addEventListener('click', () => {
    const task = state.tasks.find(t => t.id === state.editingTaskId);
    if (task) duplicateTask(task);
});

// ==========================================
// SERVICE WORKER (PWA)
// ==========================================

// ==========================================
// SERVICE WORKER (PWA) — auto-update handling
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registered:', reg.scope);

            // Periodically check for updates (every 30 minutes while the tab is open)
            setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
            // And check on tab focus
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') reg.update().catch(() => {});
            });

            // Detect when a new SW is waiting
            reg.addEventListener('updatefound', () => {
                const newSW = reg.installing;
                if (!newSW) return;
                newSW.addEventListener('statechange', () => {
                    if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version installed and waiting → tell user
                        showUpdateToast(newSW);
                    }
                });
            });

            // If a new SW already controls us (took over via clients.claim), reload
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        }).catch(err => {
            console.log('SW registration failed:', err);
        });

        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type === 'SW_UPDATED') {
                console.log('[App] SW updated to', e.data.version);
            }
        });
    });
}

// Toast UI for "new version available"
function showUpdateToast(waitingSW) {
    // Avoid stacking
    if (document.getElementById('update-toast')) return;
    const div = document.createElement('div');
    div.id = 'update-toast';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4), 0 0 20px rgba(99,102,241,0.5);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 99999;
        font-size: 0.9rem;
        font-weight: 500;
        animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    div.innerHTML = `
        <span>🎉 Nouvelle version disponible</span>
        <button id="update-now" style="background:white;color:#6366f1;border:none;padding:6px 14px;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.85rem">Recharger</button>
        <button id="update-later" style="background:rgba(255,255,255,0.2);color:white;border:none;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:0.85rem">Plus tard</button>
    `;
    document.body.appendChild(div);

    if (!document.getElementById('update-toast-style')) {
        const style = document.createElement('style');
        style.id = 'update-toast-style';
        style.textContent = '@keyframes slideDown{from{transform:translateX(-50%) translateY(-100%);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
        document.head.appendChild(style);
    }

    document.getElementById('update-now').addEventListener('click', () => {
        // Tell the new SW to take over → controllerchange listener will reload
        waitingSW.postMessage({ type: 'SKIP_WAITING' });
        div.remove();
    });
    document.getElementById('update-later').addEventListener('click', () => {
        div.remove();
    });
}

// ==========================================
// INITIALIZATION
// ==========================================

console.log('%cCorvio Space v4.0', 'color: #6366f1; font-size: 20px; font-weight: bold;');
console.log('%cUltimate Task Management', 'color: #8b5cf6; font-size: 14px;');

// ==========================================
// POMODORO TIMER
// ==========================================

const pomodoro = {
    isRunning: false,
    isBreak: false,
    timeLeft: 25 * 60,
    intervalId: null,
    workDuration: 25 * 60,
    shortBreak: 5 * 60,
    longBreak: 15 * 60,
    sessionsCompleted: 0
};

function startPomodoro() {
    if (pomodoro.isRunning) return;

    pomodoro.isRunning = true;
    pomodoro.intervalId = setInterval(() => {
        pomodoro.timeLeft--;
        updatePomodoroDisplay();

        if (pomodoro.timeLeft <= 0) {
            pomodoroComplete();
        }
    }, 1000);

    updatePomodoroControls();
    toast(pomodoro.isBreak ? 'Pause demarree' : 'Pomodoro demarre !', 'info');
}

function pausePomodoro() {
    pomodoro.isRunning = false;
    clearInterval(pomodoro.intervalId);
    updatePomodoroControls();
}

function resetPomodoro() {
    pausePomodoro();
    pomodoro.isBreak = false;
    pomodoro.timeLeft = pomodoro.workDuration;
    updatePomodoroDisplay();
    updatePomodoroControls();
}

function pomodoroComplete() {
    pausePomodoro();
    playNotificationSound();

    if (pomodoro.isBreak) {
        pomodoro.isBreak = false;
        pomodoro.timeLeft = pomodoro.workDuration;
        showBrowserNotification('Pause terminee !', 'C\'est reparti pour une session de travail');
        toast('Pause terminee ! Pret a travailler ?', 'success');
    } else {
        pomodoro.sessionsCompleted++;
        addGamificationPoints(25, 'pomodoro');

        // Long break every 4 sessions
        const isLongBreak = pomodoro.sessionsCompleted % 4 === 0;
        pomodoro.isBreak = true;
        pomodoro.timeLeft = isLongBreak ? pomodoro.longBreak : pomodoro.shortBreak;

        showBrowserNotification('Pomodoro termine !', `Bravo ! ${isLongBreak ? 'Longue pause meritee' : 'Petite pause'}`);
        toast(`Session #${pomodoro.sessionsCompleted} terminee ! +25 points`, 'success');

        // Auto-start break
        setTimeout(() => startPomodoro(), 1000);
    }

    updatePomodoroDisplay();
    savePomodoroStats();
}

function updatePomodoroDisplay() {
    const display = $('pomodoro-time');
    if (!display) return;

    const mins = Math.floor(pomodoro.timeLeft / 60);
    const secs = pomodoro.timeLeft % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const label = $('pomodoro-label');
    if (label) {
        label.textContent = pomodoro.isBreak ? 'Pause' : 'Focus';
        label.className = `pomodoro-label ${pomodoro.isBreak ? 'break' : 'work'}`;
    }

    const progress = $('pomodoro-progress');
    if (progress) {
        const total = pomodoro.isBreak ?
            (pomodoro.sessionsCompleted % 4 === 0 ? pomodoro.longBreak : pomodoro.shortBreak) :
            pomodoro.workDuration;
        const pct = ((total - pomodoro.timeLeft) / total) * 100;
        progress.style.width = `${pct}%`;
    }
}

function updatePomodoroControls() {
    const startBtn = $('pomodoro-start');
    const pauseBtn = $('pomodoro-pause');

    if (startBtn) startBtn.style.display = pomodoro.isRunning ? 'none' : 'flex';
    if (pauseBtn) pauseBtn.style.display = pomodoro.isRunning ? 'flex' : 'none';
}

function savePomodoroStats() {
    if (!state.currentUser) return;

    const today = new Date().toISOString().split('T')[0];
    const statsKey = `pomodoro-${today}`;
    const current = parseInt(localStorage.getItem(statsKey) || '0');
    localStorage.setItem(statsKey, current + 1);
}

function playNotificationSound() {
    if (!state.settings.sounds) return;

    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JjYuGg4F/');
    audio.volume = 0.3;
    audio.play().catch(() => {});
}

// ==========================================
// GAMIFICATION
// ==========================================

const gamification = {
    points: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    achievements: {
        'first-task': { name: 'Premiere tache', desc: 'Creez votre premiere tache', icon: '🎯', points: 10 },
        'task-master': { name: 'Task Master', desc: 'Completez 10 taches', icon: '✅', points: 50 },
        'centurion': { name: 'Centurion', desc: 'Completez 100 taches', icon: '💯', points: 200 },
        'streak-3': { name: 'En feu', desc: '3 jours consecutifs', icon: '🔥', points: 30 },
        'streak-7': { name: 'Semaine parfaite', desc: '7 jours consecutifs', icon: '⚡', points: 70 },
        'streak-30': { name: 'Legende', desc: '30 jours consecutifs', icon: '👑', points: 300 },
        'early-bird': { name: 'Leve-tot', desc: 'Completez une tache avant 8h', icon: '🌅', points: 20 },
        'night-owl': { name: 'Oiseau de nuit', desc: 'Completez une tache apres 22h', icon: '🦉', points: 20 },
        'speed-demon': { name: 'Speed Demon', desc: 'Completez 5 taches en 1 heure', icon: '💨', points: 40 },
        'pomodoro-5': { name: 'Focus', desc: 'Completez 5 sessions Pomodoro', icon: '🍅', points: 50 },
        'pomodoro-25': { name: 'Deep Work', desc: 'Completez 25 sessions Pomodoro', icon: '🧠', points: 150 },
        'team-player': { name: 'Team Player', desc: 'Invitez 3 membres', icon: '👥', points: 30 },
        'organizer': { name: 'Organise', desc: 'Creez 5 projets', icon: '📁', points: 40 }
    }
};

function initGamification() {
    const saved = localStorage.getItem('corviospace-gamification');
    if (saved) {
        const data = JSON.parse(saved);
        Object.assign(gamification, data);
    }

    checkStreak();
    renderGamificationWidget();
}

function addGamificationPoints(points, reason) {
    gamification.points += points;

    const oldLevel = gamification.level;
    gamification.level = Math.floor(gamification.points / 100) + 1;

    if (gamification.level > oldLevel) {
        toast(`Niveau ${gamification.level} atteint ! 🎉`, 'success');
        showBrowserNotification('Level Up !', `Vous etes maintenant niveau ${gamification.level}`);
    }

    saveGamification();
    renderGamificationWidget();

    // Show floating points
    showFloatingPoints(points);
}

function showFloatingPoints(points) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = `+${points}`;
    document.body.appendChild(el);

    setTimeout(() => el.classList.add('animate'), 10);
    setTimeout(() => el.remove(), 1500);
}

function checkStreak() {
    const today = new Date().toISOString().split('T')[0];

    if (gamification.lastActiveDate) {
        const lastDate = new Date(gamification.lastActiveDate);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            gamification.streak++;
            checkStreakBadges();
        } else if (diffDays > 1) {
            gamification.streak = 1;
        }
    } else {
        gamification.streak = 1;
    }

    gamification.lastActiveDate = today;
    saveGamification();
}

function checkStreakBadges() {
    if (gamification.streak >= 3 && !gamification.badges.includes('streak-3')) {
        unlockBadge('streak-3');
    }
    if (gamification.streak >= 7 && !gamification.badges.includes('streak-7')) {
        unlockBadge('streak-7');
    }
    if (gamification.streak >= 30 && !gamification.badges.includes('streak-30')) {
        unlockBadge('streak-30');
    }
}

function unlockBadge(badgeId) {
    if (gamification.badges.includes(badgeId)) return;

    const badge = gamification.achievements[badgeId];
    if (!badge) return;

    gamification.badges.push(badgeId);
    gamification.points += badge.points;

    toast(`Badge debloque : ${badge.icon} ${badge.name} (+${badge.points} pts)`, 'success');
    showBrowserNotification('Nouveau badge !', `${badge.icon} ${badge.name}`);

    saveGamification();
    renderGamificationWidget();
}

function checkTaskCompletionBadges() {
    const completedCount = state.tasks.filter(t => t.status === 'done').length + state.archivedTasks.length;

    if (completedCount >= 1 && !gamification.badges.includes('first-task')) {
        unlockBadge('first-task');
    }
    if (completedCount >= 10 && !gamification.badges.includes('task-master')) {
        unlockBadge('task-master');
    }
    if (completedCount >= 100 && !gamification.badges.includes('centurion')) {
        unlockBadge('centurion');
    }

    // Time-based badges
    const hour = new Date().getHours();
    if (hour < 8 && !gamification.badges.includes('early-bird')) {
        unlockBadge('early-bird');
    }
    if (hour >= 22 && !gamification.badges.includes('night-owl')) {
        unlockBadge('night-owl');
    }
}

function saveGamification() {
    localStorage.setItem('corviospace-gamification', JSON.stringify(gamification));
}

function renderGamificationWidget() {
    const widget = $('gamification-widget');
    if (!widget) return;

    const nextLevel = gamification.level * 100;
    const prevLevel = (gamification.level - 1) * 100;
    const progress = ((gamification.points - prevLevel) / (nextLevel - prevLevel)) * 100;

    widget.innerHTML = `
        <div class="gamification-header">
            <div class="gamification-level">
                <span class="level-badge">Niv. ${gamification.level}</span>
                <span class="level-points">${gamification.points} pts</span>
            </div>
            <div class="gamification-streak ${gamification.streak >= 3 ? 'hot' : ''}">
                🔥 ${gamification.streak} jour${gamification.streak > 1 ? 's' : ''}
            </div>
        </div>
        <div class="gamification-progress">
            <div class="progress-bar-mini">
                <div class="progress-fill-mini" style="width: ${progress}%"></div>
            </div>
            <span class="progress-text">${gamification.points % 100}/${100} XP</span>
        </div>
        <div class="gamification-badges">
            ${gamification.badges.slice(-5).map(id => {
                const b = gamification.achievements[id];
                return `<span class="badge-icon" title="${b.name}: ${b.desc}">${b.icon}</span>`;
            }).join('')}
            ${gamification.badges.length > 5 ? `<span class="badge-more">+${gamification.badges.length - 5}</span>` : ''}
        </div>
    `;
}

function openBadgesModal() {
    const modal = $('badges-modal');
    if (!modal) return;

    const content = $('badges-content');
    if (content) {
        content.innerHTML = `
            <div class="badges-stats">
                <div class="stat-box">
                    <span class="stat-value">${gamification.points}</span>
                    <span class="stat-label">Points</span>
                </div>
                <div class="stat-box">
                    <span class="stat-value">${gamification.level}</span>
                    <span class="stat-label">Niveau</span>
                </div>
                <div class="stat-box">
                    <span class="stat-value">${gamification.streak}</span>
                    <span class="stat-label">Jours</span>
                </div>
            </div>
            <div class="badges-grid">
                ${Object.entries(gamification.achievements).map(([id, badge]) => {
                    const unlocked = gamification.badges.includes(id);
                    return `
                        <div class="badge-card ${unlocked ? 'unlocked' : 'locked'}">
                            <span class="badge-icon-large">${unlocked ? badge.icon : '🔒'}</span>
                            <span class="badge-name">${badge.name}</span>
                            <span class="badge-desc">${badge.desc}</span>
                            <span class="badge-points">+${badge.points} pts</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    openModal(modal);
}

// ==========================================
// ACTIVITY HISTORY
// ==========================================

const activityHistory = [];
const MAX_HISTORY = 100;

function logActivity(type, data) {
    const activity = {
        id: Date.now(),
        type,
        data,
        userId: state.currentUser?.uid,
        userName: state.currentUser?.displayName || state.currentUser?.email?.split('@')[0],
        timestamp: new Date().toISOString()
    };

    activityHistory.unshift(activity);
    if (activityHistory.length > MAX_HISTORY) {
        activityHistory.pop();
    }

    renderActivityFeed();
    saveActivityToFirestore(activity);
}

async function saveActivityToFirestore(activity) {
    if (!state.currentProjectId || !state.currentUser) return;

    try {
        await addDoc(collection(db, 'activities'), {
            ...activity,
            projectId: state.currentProjectId
        });
    } catch (e) {
        console.error('Failed to save activity:', e);
    }
}

function renderActivityFeed() {
    const feed = $('activity-feed');
    if (!feed) return;

    feed.innerHTML = activityHistory.slice(0, 20).map(a => {
        const icon = getActivityIcon(a.type);
        const text = getActivityText(a);

        return `
            <div class="activity-item">
                <span class="activity-icon">${icon}</span>
                <div class="activity-content">
                    <span class="activity-text">${text}</span>
                    <span class="activity-time">${timeAgo(a.timestamp)}</span>
                </div>
            </div>
        `;
    }).join('') || '<div class="activity-empty">Aucune activite recente</div>';
}

function getActivityIcon(type) {
    const icons = {
        'task-create': '➕',
        'task-complete': '✅',
        'task-update': '✏️',
        'task-delete': '🗑️',
        'task-archive': '📦',
        'comment-add': '💬',
        'project-create': '📁',
        'member-add': '👤',
        'tag-create': '🏷️',
        'pomodoro': '🍅'
    };
    return icons[type] || '📋';
}

function getActivityText(activity) {
    const { type, data, userName } = activity;

    switch (type) {
        case 'task-create':
            return `<strong>${esc(userName)}</strong> a cree "${esc(data.title)}"`;
        case 'task-complete':
            return `<strong>${esc(userName)}</strong> a termine "${esc(data.title)}"`;
        case 'task-update':
            return `<strong>${esc(userName)}</strong> a modifie "${esc(data.title)}"`;
        case 'task-delete':
            return `<strong>${esc(userName)}</strong> a supprime "${esc(data.title)}"`;
        case 'task-archive':
            return `<strong>${esc(userName)}</strong> a archive "${esc(data.title)}"`;
        case 'comment-add':
            return `<strong>${esc(userName)}</strong> a commente "${esc(data.taskTitle)}"`;
        case 'project-create':
            return `<strong>${esc(userName)}</strong> a cree le projet "${esc(data.name)}"`;
        case 'member-add':
            return `<strong>${esc(userName)}</strong> a ajoute ${esc(data.memberEmail)}`;
        case 'tag-create':
            return `<strong>${esc(userName)}</strong> a cree le tag "${esc(data.name)}"`;
        case 'pomodoro':
            return `<strong>${esc(userName)}</strong> a complete une session Pomodoro`;
        default:
            return `<strong>${esc(userName)}</strong> a effectue une action`;
    }
}

// ==========================================
// GLOBAL SEARCH
// ==========================================

function openGlobalSearch() {
    const modal = $('search-modal');
    if (!modal) return;

    openModal(modal);
    const input = $('global-search-input');
    if (input) {
        input.value = '';
        input.focus();
    }

    renderSearchResults('');
}

function performGlobalSearch(query) {
    const q = query.toLowerCase().trim();
    const results = { tasks: [], projects: [], tags: [] };

    if (!q) {
        renderSearchResults(results, q);
        return;
    }

    // Search tasks
    results.tasks = [...state.tasks, ...state.archivedTasks].filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
    ).slice(0, 10);

    // Search projects
    results.projects = state.projects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    ).slice(0, 5);

    // Search tags
    results.tags = state.tags.filter(t =>
        t.name.toLowerCase().includes(q)
    ).slice(0, 5);

    renderSearchResults(results, q);
}

function renderSearchResults(results, query) {
    const container = $('search-results');
    if (!container) return;

    if (!query) {
        container.innerHTML = `
            <div class="search-hint">
                <p>Tapez pour rechercher dans :</p>
                <ul>
                    <li>📋 Taches (titres et descriptions)</li>
                    <li>📁 Projets</li>
                    <li>🏷️ Tags</li>
                </ul>
                <div class="search-shortcuts">
                    <kbd>↑↓</kbd> Naviguer
                    <kbd>Enter</kbd> Selectionner
                    <kbd>Esc</kbd> Fermer
                </div>
            </div>
        `;
        return;
    }

    const total = results.tasks.length + results.projects.length + results.tags.length;

    if (total === 0) {
        container.innerHTML = `<div class="search-empty">Aucun resultat pour "${esc(query)}"</div>`;
        return;
    }

    let html = '';

    if (results.projects.length > 0) {
        html += `<div class="search-group"><h4>Projets</h4>`;
        html += results.projects.map(p => `
            <div class="search-item" data-type="project" data-id="${p.id}">
                <div class="search-item-icon" style="background:${p.color}">📁</div>
                <div class="search-item-content">
                    <span class="search-item-title">${highlightMatch(p.name, query)}</span>
                    ${p.description ? `<span class="search-item-desc">${highlightMatch(p.description, query)}</span>` : ''}
                </div>
            </div>
        `).join('');
        html += '</div>';
    }

    if (results.tasks.length > 0) {
        html += `<div class="search-group"><h4>Taches</h4>`;
        html += results.tasks.map(t => `
            <div class="search-item" data-type="task" data-id="${t.id}">
                <div class="search-item-icon ${t.status}">📋</div>
                <div class="search-item-content">
                    <span class="search-item-title">${highlightMatch(t.title, query)}</span>
                    ${t.description ? `<span class="search-item-desc">${highlightMatch(t.description.substring(0, 100), query)}</span>` : ''}
                </div>
                <span class="search-item-status ${t.status}">${t.archived ? 'Archive' : t.status}</span>
            </div>
        `).join('');
        html += '</div>';
    }

    if (results.tags.length > 0) {
        html += `<div class="search-group"><h4>Tags</h4>`;
        html += results.tags.map(t => `
            <div class="search-item" data-type="tag" data-id="${t.id}">
                <div class="search-item-icon" style="background:${t.color}">🏷️</div>
                <span class="search-item-title">${highlightMatch(t.name, query)}</span>
            </div>
        `).join('');
        html += '</div>';
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.search-item').forEach(item => {
        item.addEventListener('click', () => handleSearchSelect(item.dataset.type, item.dataset.id));
    });
}

function highlightMatch(text, query) {
    if (!query) return esc(text);
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return esc(text).replace(regex, '<mark>$1</mark>');
}

function handleSearchSelect(type, id) {
    closeModal($('search-modal'));

    switch (type) {
        case 'project':
            selectProject(id);
            break;
        case 'task':
            const task = [...state.tasks, ...state.archivedTasks].find(t => t.id === id);
            if (task) {
                if (task.projectId !== state.currentProjectId) {
                    selectProject(task.projectId);
                    setTimeout(() => openTaskModal(task), 500);
                } else {
                    openTaskModal(task);
                }
            }
            break;
        case 'tag':
            state.filters.tags = [id];
            renderTasks();
            toast('Filtre par tag applique', 'info');
            break;
    }
}

// ==========================================
// MARKDOWN SUPPORT
// ==========================================

function parseMarkdown(text) {
    if (!text) return '';

    let html = esc(text);

    // Bold **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic *text*
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Strikethrough ~~text~~
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Code `text`
    html = html.replace(/`(.+?)`/g, '<code>$1</code>');

    // Links [text](url) — only allow http(s) and mailto, drop everything else
    html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_, text, url) => {
        const safeUrl = /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : '#';
        return `<a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // Lists - item
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Checkboxes
    html = html.replace(/\[x\]/gi, '<span class="md-checkbox checked">✓</span>');
    html = html.replace(/\[ \]/g, '<span class="md-checkbox">○</span>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// ==========================================
// SWIPE GESTURES (Mobile)
// ==========================================

let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;
let swipingCard = null;

function initSwipeGestures() {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function handleTouchStart(e) {
    const card = e.target.closest('.task-card');
    if (!card) return;

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swipingCard = card;
    card.classList.add('swiping');
}

function handleTouchMove(e) {
    if (!swipingCard) return;

    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;

    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Only horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
        e.preventDefault();

        // Limit swipe distance
        const maxSwipe = 100;
        const swipeDistance = Math.min(Math.max(diffX, -maxSwipe), maxSwipe);

        swipingCard.style.transform = `translateX(${swipeDistance}px)`;

        // Show action indicators
        if (diffX > 50) {
            swipingCard.classList.add('swipe-right');
            swipingCard.classList.remove('swipe-left');
        } else if (diffX < -50) {
            swipingCard.classList.add('swipe-left');
            swipingCard.classList.remove('swipe-right');
        } else {
            swipingCard.classList.remove('swipe-right', 'swipe-left');
        }
    }
}

function handleTouchEnd() {
    if (!swipingCard) return;

    const diffX = touchEndX - touchStartX;
    const taskId = swipingCard.dataset.id;
    const task = state.tasks.find(t => t.id === taskId);

    // Swipe right = Complete
    if (diffX > 80 && task) {
        if (task.status === 'done') {
            archiveTask(taskId);
        } else {
            updateTask(taskId, { status: 'done' });
            addGamificationPoints(10, 'complete');
            checkTaskCompletionBadges();
            logActivity('task-complete', { title: task.title });
        }
    }

    // Swipe left = Delete/Archive
    if (diffX < -80 && task) {
        if (confirm('Archiver cette tache ?')) {
            archiveTask(taskId);
        }
    }

    // Reset card
    swipingCard.style.transform = '';
    swipingCard.classList.remove('swiping', 'swipe-right', 'swipe-left');
    swipingCard = null;
    touchStartX = 0;
    touchStartY = 0;
    touchEndX = 0;
    touchEndY = 0;
}

// ==========================================
// ENHANCED KEYBOARD SHORTCUTS
// ==========================================

const keyboardShortcuts = {
    'g h': () => switchView('board'),
    'g c': () => switchView('calendar'),
    'g a': () => switchView('analytics'),
    'g p': () => openGlobalSearch(),
    'c': () => { if (state.currentProjectId) openTaskModal(); },
    'd': () => toggleTheme(),
    'b': () => openBadgesModal(),
    's': () => openModal($('settings-modal')),
    'a': () => $('activity-panel')?.classList.toggle('open'),
    'h': () => openModal($('shortcuts-modal'))
};

let keySequence = '';
let keySequenceTimer = null;

function handleKeySequence(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (document.querySelector('.modal.active')) return;

    const key = e.key.toLowerCase();
    keySequence += key + ' ';

    clearTimeout(keySequenceTimer);
    keySequenceTimer = setTimeout(() => {
        keySequence = '';
    }, 500);

    // Check for matching shortcut
    for (const [combo, action] of Object.entries(keyboardShortcuts)) {
        if (keySequence.trim() === combo || key === combo) {
            e.preventDefault();
            action();
            keySequence = '';
            break;
        }
    }
}

// ==========================================
// INITIALIZATION UPDATES
// ==========================================

// Init on load
window.addEventListener('DOMContentLoaded', () => {
    initSwipeGestures();
    initGamification();

    // Pomodoro controls
    $('pomodoro-start')?.addEventListener('click', startPomodoro);
    $('pomodoro-pause')?.addEventListener('click', pausePomodoro);
    $('pomodoro-reset')?.addEventListener('click', resetPomodoro);

    // Global search
    $('global-search-btn')?.addEventListener('click', openGlobalSearch);
    $('global-search-input')?.addEventListener('input', e => performGlobalSearch(e.target.value));

    // Activity panel
    $('activity-btn')?.addEventListener('click', () => {
        $('activity-panel')?.classList.toggle('open');
    });

    // Badges modal
    $('gamification-widget')?.addEventListener('click', openBadgesModal);

    // Enhanced keyboard shortcuts
    document.addEventListener('keydown', handleKeySequence);

    // Update Pomodoro display
    updatePomodoroDisplay();
});

// Gamification + activity hooks now live directly inside createTask/updateTask
// (the previous monkey-patched wrappers were fragile and only loaded after parse).

// ==========================================
// V5 FEATURES - START
// ==========================================

// ---------- Helper: build a row for "Mes taches" / "Today" ----------
function buildTaskRow(task) {
    const project = state.projects.find(p => p.id === task.projectId);
    const dueStatus = getDueStatus(task.dueDate);
    const due = task.dueDate ? formatDeadline(task.dueDate) : '';
    const projName = project?.name || 'Projet inconnu';

    const row = document.createElement('div');
    row.className = `task-row ${dueStatus === 'overdue' ? 'overdue' : dueStatus === 'soon' ? 'due-soon' : ''}`;
    row.innerHTML = `
        <span class="priority-dot ${task.priority || 'medium'}"></span>
        <span class="row-title">${esc(task.title)}</span>
        <span class="row-project" style="background:${project?.color || '#6366f1'}25;color:${project?.color || '#818cf8'}">${esc(projName)}</span>
        ${due ? `<span class="row-due">${esc(due)}</span>` : ''}
    `;
    row.addEventListener('click', () => {
        if (task.projectId !== state.currentProjectId) {
            selectProject(task.projectId);
            setTimeout(() => openTaskModal(task), 600);
        } else {
            openTaskModal(task);
        }
    });
    return row;
}

// ---------- Vue "Mes taches" cross-projets ----------
function renderMyTasks() {
    const container = el.mytasksContainer;
    if (!container) return;

    const myActive = state.myTasks.filter(t => t.status !== 'done');
    const myDone = state.myTasks.filter(t => t.status === 'done');

    // Group by project
    const byProject = {};
    myActive.forEach(t => {
        (byProject[t.projectId] = byProject[t.projectId] || []).push(t);
    });

    // Sort each group by due date (overdue first)
    Object.values(byProject).forEach(arr => {
        arr.sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
    });

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'section-cards-header';
    header.innerHTML = `<h2>Mes taches</h2><span class="count-badge">${myActive.length} active(s) · ${myDone.length} terminee(s)</span>`;
    container.appendChild(header);

    if (myActive.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-section';
        empty.innerHTML = `<span class="emoji">🎉</span><p>Aucune tache assignee. Profite de la pause !</p>`;
        container.appendChild(empty);
        return;
    }

    Object.entries(byProject).forEach(([projectId, tasks]) => {
        const project = state.projects.find(p => p.id === projectId);
        const sub = document.createElement('div');
        sub.style.marginBottom = '1.5rem';
        const h = document.createElement('h3');
        h.style.cssText = 'font-size:0.85rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem';
        h.textContent = project?.name || 'Projet';
        sub.appendChild(h);
        tasks.forEach(t => sub.appendChild(buildTaskRow(t)));
        container.appendChild(sub);
    });
}

// ---------- Vue "Aujourd'hui" ----------
function renderToday() {
    const container = el.todayContainer;
    if (!container) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStart = tomorrow.toISOString().split('T')[0];

    const overdue = state.myTasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return t.dueDate.split('T')[0] < todayStr;
    });
    const dueToday = state.myTasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return t.dueDate.split('T')[0] === todayStr;
    });
    const noDate = state.myTasks.filter(t => !t.dueDate && t.status !== 'done');

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'section-cards-header';
    header.innerHTML = `<h2>Aujourd'hui · ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><span class="count-badge">${overdue.length + dueToday.length} a traiter</span>`;
    container.appendChild(header);

    const buildSection = (title, tasks, emoji) => {
        const sec = document.createElement('div');
        sec.style.marginBottom = '1.5rem';
        const h = document.createElement('h3');
        h.style.cssText = 'font-size:0.95rem;margin-bottom:0.5rem';
        h.innerHTML = `${emoji} ${esc(title)} <span style="color:var(--text-muted);font-weight:400">(${tasks.length})</span>`;
        sec.appendChild(h);
        if (tasks.length === 0) {
            const e2 = document.createElement('p');
            e2.style.cssText = 'color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0';
            e2.textContent = 'Rien ici.';
            sec.appendChild(e2);
        } else {
            tasks.forEach(t => sec.appendChild(buildTaskRow(t)));
        }
        container.appendChild(sec);
    };

    buildSection('En retard', overdue, '🚨');
    buildSection("A faire aujourd'hui", dueToday, '📅');
    if (noDate.length > 0) buildSection('Sans date', noDate.slice(0, 10), '📝');

    if (overdue.length === 0 && dueToday.length === 0 && noDate.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-section';
        empty.innerHTML = `<span class="emoji">☀️</span><p>Belle journee — aucune tache urgente.</p>`;
        container.appendChild(empty);
    }
}

// ---------- @Mentions in comments ----------
// Parse @pseudo#1234 and @pseudo (project member) into mention objects.
function parseMentions(text) {
    const mentions = [];
    // Strict tag form first: @pseudo#1234
    const tagRegex = /@([a-z0-9._-]+#\d{4,6})/gi;
    let m;
    while ((m = tagRegex.exec(text)) !== null) {
        mentions.push({ raw: m[0], handle: m[1].toLowerCase() });
    }
    // Loose form: @pseudo (only matches project members by displayName)
    const looseRegex = /@([a-z0-9._-]+)(?!#)/gi;
    while ((m = looseRegex.exec(text)) !== null) {
        const member = state.projectMembers.find(mem =>
            (mem.displayName || '').toLowerCase() === m[1].toLowerCase()
        );
        if (member) mentions.push({ raw: m[0], handle: member.handle, uid: member.uid });
    }
    return mentions;
}

async function resolveMentions(mentions) {
    const resolved = [];
    for (const mention of mentions) {
        if (mention.uid) {
            resolved.push(mention);
            continue;
        }
        if (!mention.handle) continue;
        try {
            const snap = await getDocs(query(collection(db, 'users'), where('handle', '==', mention.handle), limit(1)));
            if (!snap.empty) {
                resolved.push({ ...mention, uid: snap.docs[0].id });
            }
        } catch (e) { /* ignore */ }
    }
    return resolved;
}

function renderMentionsInText(text) {
    let html = esc(text);
    html = html.replace(/@([a-z0-9._-]+#\d{4,6})/gi, (_, handle) => {
        const isMe = state.userProfile?.handle === handle.toLowerCase();
        return `<span class="mention ${isMe ? 'self' : ''}">@${esc(handle)}</span>`;
    });
    html = html.replace(/@([a-z0-9._-]+)(?!#)/gi, (whole, name) => {
        const member = state.projectMembers.find(mem => (mem.displayName || '').toLowerCase() === name.toLowerCase());
        if (!member) return whole;
        const isMe = member.uid === state.currentUser?.uid;
        return `<span class="mention ${isMe ? 'self' : ''}">@${esc(name)}</span>`;
    });
    return html;
}

// ---------- Watchers ----------
async function toggleWatchTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const watchers = task.watchers || [];
    const isWatching = watchers.includes(state.currentUser.uid);
    await updateDoc(doc(db, 'tasks', taskId), {
        watchers: isWatching ? arrayRemove(state.currentUser.uid) : arrayUnion(state.currentUser.uid)
    });
    toast(isWatching ? 'Tu ne suis plus cette tache' : 'Tu suis maintenant cette tache', 'success');
    if (el.watchTaskBtn) {
        el.watchTaskBtn.innerHTML = isWatching ? '👁 Suivre' : '👁 Suivi';
    }
}

// ---------- Bulk selection ----------
function toggleTaskSelection(taskId, cardEl) {
    if (state.selectedTaskIds.has(taskId)) {
        state.selectedTaskIds.delete(taskId);
        cardEl?.classList.remove('selected');
    } else {
        state.selectedTaskIds.add(taskId);
        cardEl?.classList.add('selected');
    }
    updateBulkBar();
}

function updateBulkBar() {
    if (!el.bulkActionBar) return;
    const count = state.selectedTaskIds.size;
    if (count > 0) {
        el.bulkActionBar.classList.add('visible');
        if (el.bulkCountNum) el.bulkCountNum.textContent = count;
    } else {
        el.bulkActionBar.classList.remove('visible');
    }
}

function clearBulkSelection() {
    state.selectedTaskIds.clear();
    document.querySelectorAll('.task-card.selected').forEach(c => c.classList.remove('selected'));
    updateBulkBar();
}

async function bulkUpdateStatus(status) {
    const ids = [...state.selectedTaskIds];
    const batch = writeBatch(db);
    ids.forEach(id => batch.update(doc(db, 'tasks', id), { status }));
    await batch.commit();
    toast(`${ids.length} tache(s) mise(s) a jour`, 'success');
    clearBulkSelection();
}

async function bulkArchive() {
    const ids = [...state.selectedTaskIds];
    const batch = writeBatch(db);
    ids.forEach(id => batch.update(doc(db, 'tasks', id), { archived: true, archivedAt: new Date().toISOString() }));
    await batch.commit();
    toast(`${ids.length} tache(s) archivee(s)`, 'success');
    clearBulkSelection();
}

async function bulkDelete() {
    if (!confirm(`Supprimer ${state.selectedTaskIds.size} tache(s) definitivement ?`)) return;
    const ids = [...state.selectedTaskIds];
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'tasks', id)));
    await batch.commit();
    toast(`${ids.length} tache(s) supprimee(s)`, 'info');
    clearBulkSelection();
}

// ---------- Focus mode ----------
function enterFocusMode(task) {
    if (!task || !el.focusMode || !el.focusContent) return;
    state.focusedTaskId = task.id;
    el.focusContent.innerHTML = `
        <h1>${esc(task.title)}</h1>
        ${task.description ? `<div class="focus-desc">${esc(task.description)}</div>` : ''}
        <div class="focus-timer" id="focus-timer-display">25:00</div>
        <div class="focus-actions">
            <button class="btn-primary" id="focus-start-btn">▶ Demarrer Pomodoro</button>
            <button class="btn-secondary" id="focus-done-btn">✓ Marquer terminee</button>
        </div>
    `;
    el.focusMode.classList.add('active');

    $('focus-start-btn')?.addEventListener('click', () => {
        startPomodoro();
    });
    $('focus-done-btn')?.addEventListener('click', async () => {
        await updateTask(task.id, { status: 'done', title: task.title });
        exitFocusMode();
    });
}

function exitFocusMode() {
    state.focusedTaskId = null;
    el.focusMode?.classList.remove('active');
}

// ---------- Presence ----------
async function updatePresence(projectId) {
    if (!state.currentUser || !projectId) return;
    try {
        await setDoc(doc(db, 'presence', state.currentUser.uid), {
            uid: state.currentUser.uid,
            projectId,
            displayName: state.userProfile?.displayName || state.currentUser.email.split('@')[0],
            handle: state.userProfile?.handle || '',
            lastSeen: new Date().toISOString()
        });
    } catch (e) { /* ignore */ }
}

function listenToPresence(projectId) {
    if (state.unsubscribers.presence) state.unsubscribers.presence();
    if (!projectId) return;
    const pq = query(collection(db, 'presence'), where('projectId', '==', projectId));
    state.unsubscribers.presence = onSnapshot(pq, snap => {
        const now = Date.now();
        // Consider "online" if seen in last 90 seconds
        state.presence = snap.docs
            .map(d => d.data())
            .filter(p => p.uid !== state.currentUser?.uid)
            .filter(p => now - new Date(p.lastSeen).getTime() < 90_000);
        renderPresence();
    }, () => {});
}

function renderPresence() {
    if (!el.presenceAvatars) return;
    el.presenceAvatars.innerHTML = state.presence.slice(0, 5).map(p => {
        const initial = (p.displayName || 'U').charAt(0).toUpperCase();
        return `<div class="presence-avatar" style="background:${avatarColor(p.uid)}" title="${esc(p.displayName || '')} en ligne">${esc(initial)}</div>`;
    }).join('');
}

// Heartbeat: refresh presence every 30s while a project is open
setInterval(() => {
    if (state.currentProjectId && state.currentUser) updatePresence(state.currentProjectId);
}, 30_000);

// Refresh view badges every minute (so "today" count stays accurate at midnight)
setInterval(updateViewBadges, 60_000);

// ---------- Public share ----------
async function sharePublicLink() {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) { toast('Selectionne un projet', 'error'); return; }
    if (project.ownerId !== state.currentUser.uid) { toast('Seul le proprietaire peut partager', 'error'); return; }

    let shareId = project.publicShareId;
    if (!shareId) {
        shareId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        await updateDoc(doc(db, 'projects', project.id), { publicShareId: shareId, isPublic: true });
    }
    const url = `${location.origin}${location.pathname}?share=${shareId}`;
    try {
        await navigator.clipboard.writeText(url);
        toast('Lien public copie ! ' + url, 'success');
    } catch (e) {
        prompt('Copie ce lien :', url);
    }
}

async function loadPublicProject(shareId) {
    try {
        const snap = await getDocs(query(collection(db, 'projects'), where('publicShareId', '==', shareId), limit(1)));
        if (snap.empty) {
            document.body.innerHTML = '<div style="padding:2rem;color:white;text-align:center"><h1>Projet introuvable</h1><a href="/" style="color:#818cf8">Retour</a></div>';
            return;
        }
        const project = { id: snap.docs[0].id, ...snap.docs[0].data() };
        state.publicView = true;
        state.publicProjectData = project;

        // Fetch tasks of this project
        const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('projectId', '==', project.id)));
        const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.archived);

        // Render minimal read-only view
        document.body.innerHTML = `
            <div class="public-share-banner">
                Vue lecture seule · Projet partage publiquement ·
                <a href="/" style="color:white;text-decoration:underline">Retour a Corvio Space</a>
            </div>
            <div style="padding:2rem;max-width:1200px;margin:0 auto;color:white">
                <h1 style="margin-bottom:0.5rem">${esc(project.name)}</h1>
                <p style="color:#94a3b8;margin-bottom:2rem">${esc(project.description || '')}</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem">
                    ${['todo', 'inprogress', 'review', 'done'].map(status => `
                        <div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:1rem">
                            <h3 style="margin-bottom:0.75rem;font-size:0.9rem;text-transform:uppercase;color:#818cf8">
                                ${status === 'todo' ? 'A faire' : status === 'inprogress' ? 'En cours' : status === 'review' ? 'En revue' : 'Termine'}
                                (${tasks.filter(t => t.status === status).length})
                            </h3>
                            ${tasks.filter(t => t.status === status).map(t => `
                                <div style="background:rgba(255,255,255,0.04);padding:0.75rem;border-radius:6px;margin-bottom:0.5rem">
                                    <strong>${esc(t.title)}</strong>
                                    ${t.description ? `<p style="font-size:0.8rem;color:#94a3b8;margin-top:4px">${esc(t.description)}</p>` : ''}
                                </div>
                            `).join('') || '<p style="color:#64748b;font-size:0.85rem">Vide</p>'}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.style.background = '#0a0a0f';
        document.body.style.fontFamily = 'Inter, sans-serif';
    } catch (e) {
        console.error(e);
        document.body.innerHTML = '<div style="padding:2rem;color:white;text-align:center"><h1>Erreur</h1><p>Impossible de charger ce projet partage.</p></div>';
    }
}

// ---------- Project background ----------
function applyProjectBackground(bg) {
    if (el.mainContent) {
        if (bg && bg !== 'none') el.mainContent.dataset.bg = bg;
        else delete el.mainContent.dataset.bg;
    }
}

// ---------- Custom Kanban columns ----------
const DEFAULT_COLUMNS = [
    { id: 'todo', name: 'A faire' },
    { id: 'inprogress', name: 'En cours' },
    { id: 'review', name: 'En revue' },
    { id: 'done', name: 'Termine' }
];

function getProjectColumns(project) {
    if (!project?.columns || !Array.isArray(project.columns) || project.columns.length === 0) {
        return DEFAULT_COLUMNS;
    }
    return project.columns;
}

function renderCustomColumns(project) {
    const board = el.board;
    if (!board) return;
    const columns = getProjectColumns(project);
    // Only re-render if columns differ
    const currentIds = [...board.querySelectorAll('.column')].map(c => c.dataset.status).join(',');
    const newIds = columns.map(c => c.id).join(',');
    if (currentIds === newIds) return;

    board.innerHTML = columns.map(col => `
        <div class="column" data-status="${esc(col.id)}">
            <div class="column-header">
                <div class="column-title">
                    <span class="column-dot ${esc(col.id)}"></span>
                    <h2>${esc(col.name)}</h2>
                    <span class="column-count" id="${esc(col.id)}-count">0</span>
                </div>
            </div>
            <div class="column-content" id="${esc(col.id)}-tasks"></div>
        </div>
    `).join('');

    // Re-bind drag/drop on new columns
    board.querySelectorAll('.column').forEach(col => {
        col.addEventListener('dragover', e => {
            e.preventDefault();
            col.classList.add('drag-over');
        });
        col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
        col.addEventListener('drop', async e => {
            e.preventDefault();
            col.classList.remove('drag-over');
            if (!state.draggedTask) return;
            const newStatus = col.dataset.status;
            const id = state.draggedTask.dataset.id;
            await updateTask(id, { status: newStatus });
        });
    });

    // Update el.columns/counts references
    el.columns = {};
    el.counts = {};
    columns.forEach(c => {
        el.columns[c.id] = $(c.id + '-tasks');
        el.counts[c.id] = $(c.id + '-count');
    });
}

// ---------- Leaderboard ----------
function renderLeaderboard() {
    const allTasks = [...state.tasks, ...state.archivedTasks];
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const scores = {};
    state.projectMembers.forEach(m => {
        scores[m.uid] = { name: m.displayName || m.email, count: 0, points: 0 };
    });
    allTasks.forEach(t => {
        if (t.status !== 'done' || !t.assigneeId) return;
        if (!scores[t.assigneeId]) return;
        const ts = t.completedAt || t.archivedAt || t.createdAt;
        if (ts && new Date(ts).getTime() > oneWeekAgo) {
            scores[t.assigneeId].count++;
            scores[t.assigneeId].points += 10 + (t.priority === 'high' ? 5 : t.priority === 'low' ? -2 : 0);
        }
    });

    const ranked = Object.values(scores).sort((a, b) => b.points - a.points);
    const medals = ['gold', 'silver', 'bronze'];
    return ranked.map((s, i) => `
        <div class="leaderboard-row">
            <span class="leaderboard-rank ${medals[i] || ''}">${i + 1}</span>
            <span class="leaderboard-name">${esc(s.name)}</span>
            <span class="leaderboard-score">${s.count} taches · ${s.points} pts</span>
        </div>
    `).join('') || '<p style="color:var(--text-muted)">Aucune activite cette semaine.</p>';
}

// ---------- Print / PDF ----------
function printBoard() {
    window.print();
}

// ---------- CSV import ----------
async function importCsv(file) {
    if (!state.currentProjectId) { toast('Selectionne un projet', 'error'); return; }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast('CSV vide', 'error'); return; }
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const titleIdx = header.indexOf('title');
    if (titleIdx === -1) { toast('Le CSV doit contenir une colonne "title"', 'error'); return; }
    const descIdx = header.indexOf('description');
    const statusIdx = header.indexOf('status');
    const priorityIdx = header.indexOf('priority');
    const dueIdx = header.indexOf('duedate');

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const title = parts[titleIdx];
        if (!title) continue;
        await createTask({
            title,
            description: descIdx >= 0 ? parts[descIdx] : '',
            status: (statusIdx >= 0 && parts[statusIdx]) || 'todo',
            priority: (priorityIdx >= 0 && parts[priorityIdx]) || 'medium',
            dueDate: dueIdx >= 0 ? parts[dueIdx] : null,
            tags: [],
            subtasks: []
        });
        imported++;
    }
    toast(`${imported} tache(s) importee(s)`, 'success');
}

// ---------- Help modal content ----------
function openHelpModal() {
    if (!el.helpModal || !el.helpContent) return;
    el.helpContent.innerHTML = `
        <div class="help-grid">
            <div class="help-section">
                <h3>🚀 Demarrage</h3>
                <ul>
                    <li><strong>Creer un projet</strong> : bouton + a cote de "Mes Projets" ou touche <kbd>P</kbd></li>
                    <li><strong>Inviter un ami</strong> : ouvre un projet, bouton 👤+ puis colle son tag <code>pseudo#1234</code></li>
                    <li><strong>Trouver ton tag</strong> : sous ton pseudo dans la sidebar (clic = copier)</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>📋 Taches</h3>
                <ul>
                    <li><strong>Nouvelle tache</strong> : <kbd>N</kbd> ou bouton "Nouvelle tache"</li>
                    <li><strong>Drag &amp; drop</strong> entre colonnes pour changer le statut</li>
                    <li><strong>Sous-taches</strong>, <strong>tags</strong>, <strong>priorites</strong>, <strong>echeances</strong>, <strong>recurrence</strong></li>
                    <li><strong>Dependances</strong> : champ "Bloquee par" pour lier des taches</li>
                    <li><strong>Selection multiple</strong> : <kbd>Shift</kbd>+clic sur des cartes → barre d'actions en bas</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>👀 Vues</h3>
                <ul>
                    <li><kbd>G</kbd><kbd>H</kbd> Board Kanban</li>
                    <li>Vue <strong>Aujourd'hui</strong> : taches dues + en retard, cross-projets</li>
                    <li>Vue <strong>Mes taches</strong> : tout ce qui t'est assigne, groupe par projet</li>
                    <li><kbd>G</kbd><kbd>C</kbd> Calendrier</li>
                    <li><kbd>G</kbd><kbd>A</kbd> Analytics + leaderboard</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>💬 Collaboration</h3>
                <ul>
                    <li><strong>@mentions</strong> dans les commentaires : tape <code>@pseudo#1234</code> ou <code>@pseudo</code> → notif auto</li>
                    <li><strong>Suivre une tache</strong> : bouton 👁 dans le modal d'une tache</li>
                    <li><strong>Presence en direct</strong> : avatars verts en haut quand quelqu'un d'autre regarde le projet</li>
                    <li><strong>Partage public</strong> : bouton 🔗 → lien lecture seule a partager (pas besoin de compte)</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>🎯 Productivite</h3>
                <ul>
                    <li><strong>Mode focus</strong> : bouton 🎯 dans une tache → tout disparait sauf elle + Pomodoro</li>
                    <li><strong>Pomodoro</strong> dans la sidebar (25 / 5 min)</li>
                    <li><strong>Time tracking</strong> par tache</li>
                    <li><strong>Templates</strong> : sauvegarde un projet comme template reutilisable</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>⌨️ Raccourcis clavier</h3>
                <ul>
                    <li><kbd>N</kbd> Nouvelle tache · <kbd>P</kbd> Nouveau projet · <kbd>T</kbd> Nouveau tag · <kbd>M</kbd> Membre</li>
                    <li><kbd>/</kbd> Filtrer · <kbd>G</kbd><kbd>P</kbd> Recherche globale · <kbd>?</kbd> Aide</li>
                    <li><kbd>D</kbd> Theme · <kbd>B</kbd> Badges · <kbd>A</kbd> Activite · <kbd>S</kbd> Parametres</li>
                    <li><kbd>1-4</kbd> Filtrer par colonne · <kbd>Esc</kbd> Fermer modal / focus mode</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>📱 Mobile</h3>
                <ul>
                    <li>Swipe droite sur une carte → marquer terminee</li>
                    <li>Swipe gauche → archiver</li>
                    <li>Installable comme PWA depuis le menu du navigateur</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>📤 Import / Export</h3>
                <ul>
                    <li><strong>Export</strong> JSON, CSV, ou Imprimer / PDF</li>
                    <li><strong>Import CSV</strong> : colonnes <code>title, description, status, priority, dueDate</code></li>
                </ul>
            </div>
            <div class="help-section">
                <h3>🎨 Personnalisation</h3>
                <ul>
                    <li><strong>Theme</strong> sombre / clair (<kbd>D</kbd>)</li>
                    <li><strong>Backgrounds</strong> par projet (Aurora, Ocean, Sunset…)</li>
                    <li><strong>Colonnes Kanban customisables</strong> dans le modal projet (jusqu'a 6)</li>
                </ul>
            </div>
        </div>
    `;
    openModal(el.helpModal);
}

// ---------- View badges (today / mytasks counts) ----------
function updateViewBadges() {
    const todayBadge = $('badge-today');
    const mytasksBadge = $('badge-mytasks');

    const todayStr = new Date().toISOString().split('T')[0];

    // Today: overdue + due today (active assigned tasks)
    const todayCount = state.myTasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return t.dueDate.split('T')[0] <= todayStr;
    }).length;

    // My tasks: total active assigned
    const mytasksCount = state.myTasks.filter(t => t.status !== 'done').length;

    // Apply a count to a badge element (header toggle + mobile bottom nav)
    const setBadge = (badge, count) => {
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    };

    setBadge(todayBadge, todayCount);
    setBadge(mytasksBadge, mytasksCount);
    setBadge($('bn-badge-today'), todayCount);
    setBadge($('bn-badge-mytasks'), mytasksCount);
}

// ---------- Confetti ----------
function fireConfetti() {
    const canvas = $('confetti-canvas');
    if (!canvas) return;
    canvas.classList.add('active');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
    const particles = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 18,
            vy: Math.random() * -20 - 5,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            vr: (Math.random() - 0.5) * 12,
            life: 1
        });
    }
    let frame = 0;
    function tick() {
        frame++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = 0;
        particles.forEach(p => {
            if (p.life <= 0) return;
            alive++;
            p.vy += 0.5; // gravity
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.vr;
            p.life -= 0.012;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
            ctx.restore();
        });
        if (alive > 0 && frame < 200) {
            requestAnimationFrame(tick);
        } else {
            canvas.classList.remove('active');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    tick();
}

// ==========================================
// V5 - Wire up event listeners
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    // Help button
    el.helpBtn?.addEventListener('click', openHelpModal);

    // Share project
    el.shareProjectBtn?.addEventListener('click', sharePublicLink);

    // View toggle: handle new views
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Bulk action bar
    $('bulk-status-todo')?.addEventListener('click', () => bulkUpdateStatus('todo'));
    $('bulk-status-inprogress')?.addEventListener('click', () => bulkUpdateStatus('inprogress'));
    $('bulk-status-done')?.addEventListener('click', () => bulkUpdateStatus('done'));
    $('bulk-archive')?.addEventListener('click', bulkArchive);
    $('bulk-delete')?.addEventListener('click', bulkDelete);
    $('bulk-clear')?.addEventListener('click', clearBulkSelection);

    // Focus mode
    el.focusClose?.addEventListener('click', exitFocusMode);
    el.focusTaskBtn?.addEventListener('click', () => {
        const t = state.tasks.find(x => x.id === state.editingTaskId);
        if (t) {
            closeModal(el.taskModal);
            enterFocusMode(t);
        }
    });

    // Watch button
    el.watchTaskBtn?.addEventListener('click', () => {
        if (state.editingTaskId) toggleWatchTask(state.editingTaskId);
    });

    // Project background picker
    el.projectBgPicker?.querySelectorAll('.bg-option').forEach(b => {
        b.addEventListener('click', () => {
            el.projectBgPicker.querySelectorAll('.bg-option').forEach(o => o.classList.remove('active'));
            b.classList.add('active');
        });
    });

    // Print / PDF
    $('export-pdf')?.addEventListener('click', printBoard);

    // Import CSV
    el.importCsvBtn?.addEventListener('click', () => el.importCsvFile?.click());
    el.importCsvFile?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (f) importCsv(f);
        e.target.value = '';
    });

    // FAB: quick add task
    $('fab-new-task')?.addEventListener('click', () => {
        if (state.currentProjectId) {
            openTaskModal();
        } else {
            toast('Selectionne ou cree un projet d\'abord', 'info');
        }
    });

    // Edit project button
    $('edit-project-btn')?.addEventListener('click', openEditProjectModal);

    // Add-project button: ensure we're in CREATE mode (not edit)
    el.addProjectBtn?.addEventListener('click', resetProjectModal);

    // Reset edit state when project modal closes
    document.querySelectorAll('#project-modal .modal-close, #project-modal .modal-cancel, #project-modal .modal-overlay').forEach(el2 => {
        el2.addEventListener('click', resetProjectModal);
    });

    // Public share check
    const params = new URLSearchParams(location.search);
    const shareId = params.get('share');
    if (shareId) loadPublicProject(shareId);

    // Esc closes focus mode
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && el.focusMode?.classList.contains('active')) exitFocusMode();
        // Bulk Esc clears selection
        if (e.key === 'Escape' && state.selectedTaskIds.size > 0) clearBulkSelection();
    });
});

// ==========================================
// V6 FEATURES
// ==========================================

// ---------- Sounds (Web Audio) ----------
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) {
        try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return _audioCtx;
}
function playSound(type) {
    if (state.settings.sounds === false) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    const sounds = {
        success: { freq: [523, 784, 1047], dur: 0.15, type: 'sine' },
        click:   { freq: [800], dur: 0.05, type: 'square' },
        pop:     { freq: [400, 800], dur: 0.08, type: 'sine' },
        error:   { freq: [200, 150], dur: 0.2, type: 'sawtooth' }
    };
    const s = sounds[type] || sounds.click;
    osc.type = s.type;

    s.freq.forEach((f, i) => {
        osc.frequency.setValueAtTime(f, now + i * (s.dur / s.freq.length));
    });
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + s.dur);

    osc.start(now);
    osc.stop(now + s.dur + 0.05);
}

// Hook sound into completion (called from updateTask via fireConfetti)
const _origFireConfetti = typeof fireConfetti === 'function' ? fireConfetti : null;
window._withSound = true; // marker

// ---------- Vibration ----------
function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch (e) {}
}

// ---------- Date detection in title (NLP-lite) ----------
// Returns { cleanTitle, dueDate, priority, tags } from a raw input
function parseSmartTitle(raw) {
    let title = raw.trim();
    let dueDate = null;
    let priority = null;
    const tags = [];

    // Extract priority: !urgent !haute !high !moyenne !basse
    const priorityMap = {
        urgent: 'high', high: 'high', haute: 'high',
        medium: 'medium', moyenne: 'medium', moy: 'medium',
        low: 'low', basse: 'low'
    };
    const prioMatch = title.match(/!(\w+)/i);
    if (prioMatch && priorityMap[prioMatch[1].toLowerCase()]) {
        priority = priorityMap[prioMatch[1].toLowerCase()];
        title = title.replace(prioMatch[0], '').trim();
    }

    // Extract #tags
    const tagMatches = [...title.matchAll(/#(\w+)/g)];
    tagMatches.forEach(m => { tags.push(m[1]); });
    title = title.replace(/#\w+/g, '').trim();

    // Extract dates: aujourd'hui, demain, lundi-dimanche, dans X jours, "18h", "18:30"
    const now = new Date();
    let date = null;

    if (/aujourd'hui|today/i.test(title)) {
        date = new Date(now);
        title = title.replace(/aujourd'hui|today/gi, '').trim();
    } else if (/demain|tomorrow/i.test(title)) {
        date = new Date(now);
        date.setDate(date.getDate() + 1);
        title = title.replace(/demain|tomorrow/gi, '').trim();
    } else if (/après-demain|apres-demain/i.test(title)) {
        date = new Date(now);
        date.setDate(date.getDate() + 2);
        title = title.replace(/après-demain|apres-demain/gi, '').trim();
    } else {
        // Days of week
        const days = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
                       sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        for (const [name, idx] of Object.entries(days)) {
            const re = new RegExp('\\b' + name + '\\b', 'i');
            if (re.test(title)) {
                date = new Date(now);
                const diff = (idx + 7 - now.getDay()) % 7 || 7;
                date.setDate(date.getDate() + diff);
                title = title.replace(re, '').trim();
                break;
            }
        }
    }

    // "dans X jours/heures"
    const inMatch = title.match(/dans\s+(\d+)\s*(jours?|h(?:eures?)?)/i);
    if (inMatch) {
        date = date || new Date(now);
        const n = parseInt(inMatch[1]);
        if (/h/i.test(inMatch[2])) date.setHours(date.getHours() + n);
        else date.setDate(date.getDate() + n);
        title = title.replace(inMatch[0], '').trim();
    }

    // Time: "18h", "18h30", "18:30"
    const timeMatch = title.match(/\b(\d{1,2})[h:](\d{2})?\b/);
    if (timeMatch) {
        date = date || new Date(now);
        date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || '0'), 0, 0);
        title = title.replace(timeMatch[0], '').trim();
    } else if (date) {
        date.setHours(9, 0, 0, 0); // default 9am if no time given
    }

    if (date) {
        // local ISO without seconds for datetime-local
        const tz = date.getTimezoneOffset();
        const local = new Date(date.getTime() - tz * 60000);
        dueDate = local.toISOString().slice(0, 16);
    }

    // Auto-priority from keywords if not explicit
    if (!priority) {
        if (/urgent|asap|critique|imm[eé]diat/i.test(title)) priority = 'high';
        else if (/plus tard|quand j'aurai|optionnel/i.test(title)) priority = 'low';
    }

    return { cleanTitle: title.replace(/\s+/g, ' ').trim(), dueDate, priority, tags };
}

// ---------- Quick capture ----------
function openQuickCapture() {
    const qc = $('quick-capture');
    const input = $('quick-capture-input');
    if (!qc || !input) return;
    if (!state.currentProjectId) {
        toast('Selectionne ou cree un projet d\'abord', 'info');
        return;
    }
    qc.classList.add('active');
    input.value = '';
    setTimeout(() => input.focus(), 50);
}
function closeQuickCapture() {
    $('quick-capture')?.classList.remove('active');
}
async function submitQuickCapture() {
    const input = $('quick-capture-input');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    const parsed = parseSmartTitle(raw);
    if (!parsed.cleanTitle) {
        toast('Titre vide', 'error');
        return;
    }

    // Convert tag names to tag IDs (create if missing)
    const tagIds = [];
    for (const tagName of parsed.tags) {
        let existing = state.tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
        if (!existing) {
            try {
                const ref = await addDoc(collection(db, 'tags'), {
                    name: tagName,
                    color: '#6366f1',
                    projectId: state.currentProjectId,
                    createdAt: new Date().toISOString()
                });
                tagIds.push(ref.id);
            } catch (e) {}
        } else {
            tagIds.push(existing.id);
        }
    }

    await createTask({
        title: parsed.cleanTitle,
        description: '',
        status: 'todo',
        priority: parsed.priority || 'medium',
        dueDate: parsed.dueDate,
        tags: tagIds,
        subtasks: [],
        recurrence: 'none'
    });

    closeQuickCapture();
    playSound('pop');
    vibrate(20);
}

// ---------- Inline edit ----------
function makeCardEditable(cardEl, task) {
    const titleEl = cardEl.querySelector('.task-card-title');
    if (!titleEl) return;
    titleEl.contentEditable = 'true';
    titleEl.classList.add('editing');
    titleEl.focus();
    // Select all
    const range = document.createRange();
    range.selectNodeContents(titleEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = async (save) => {
        titleEl.contentEditable = 'false';
        titleEl.classList.remove('editing');
        const newTitle = titleEl.textContent.trim();
        if (save && newTitle && newTitle !== task.title) {
            await updateTask(task.id, { title: newTitle });
            playSound('click');
        } else {
            titleEl.textContent = task.title;
        }
    };

    titleEl.onblur = () => finish(true);
    titleEl.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
        if (e.key === 'Escape') { titleEl.textContent = task.title; titleEl.blur(); }
    };
}

// ---------- Snooze ----------
async function snoozeTask(taskId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const tz = tomorrow.getTimezoneOffset();
    const local = new Date(tomorrow.getTime() - tz * 60000);
    await updateTask(taskId, { dueDate: local.toISOString().slice(0, 16) });
    toast('Tache reportee a demain 9h', 'success');
    playSound('pop');
    vibrate(15);
}

// ---------- Long-press contextual menu ----------
let longPressTimer = null;
let longPressTarget = null;
function attachLongPress() {
    document.addEventListener('touchstart', e => {
        const card = e.target.closest('.task-card');
        if (!card || card.classList.contains('archived')) return;
        longPressTarget = card;
        longPressTimer = setTimeout(() => {
            const id = card.dataset.id;
            const task = state.tasks.find(t => t.id === id);
            if (!task) return;
            vibrate(30);
            showContextMenu(e.touches[0].clientX, e.touches[0].clientY, task);
            longPressTarget = null;
        }, 500);
    }, { passive: true });
    document.addEventListener('touchmove', () => {
        clearTimeout(longPressTimer);
        longPressTarget = null;
    }, { passive: true });
    document.addEventListener('touchend', () => {
        clearTimeout(longPressTimer);
    });
}

function showContextMenu(x, y, task) {
    const menu = $('context-menu');
    if (!menu) return;

    // (Re)build the dynamic "Move to column" section for the current project.
    // This is how tasks change column on mobile (touch has no HTML5 drag&drop).
    menu.querySelector('.ctx-move-section')?.remove();
    const project = state.projects.find(p => p.id === state.currentProjectId);
    const columns = (typeof getProjectColumns === 'function' ? getProjectColumns(project) : []) || [];
    const moveTargets = columns.filter(c => c.id !== task.status);
    if (moveTargets.length) {
        const sec = document.createElement('div');
        sec.className = 'ctx-move-section';
        sec.innerHTML = `<div class="ctx-move-label">Deplacer vers</div>` +
            moveTargets.map(c => `<button data-action="move" data-status="${esc(c.id)}">&rarr; ${esc(c.name)}</button>`).join('');
        const firstBtn = menu.querySelector('button');
        firstBtn ? firstBtn.after(sec) : menu.prepend(sec);
    }

    menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - 360)) + 'px';
    menu.classList.add('active');

    menu.querySelectorAll('button').forEach(btn => {
        btn.onclick = async () => {
            menu.classList.remove('active');
            const action = btn.dataset.action;
            switch (action) {
                case 'open': openTaskModal(task); break;
                case 'move': await moveTaskToStatus(task.id, btn.dataset.status); break;
                case 'done': await updateTask(task.id, { status: 'done', title: task.title }); break;
                case 'snooze': await snoozeTask(task.id); break;
                case 'duplicate': await duplicateTask(task); break;
                case 'archive': await archiveTask(task.id); break;
                case 'delete':
                    if (confirm('Supprimer cette tache ?')) await deleteTask(task.id);
                    break;
            }
        };
    });
}

document.addEventListener('click', e => {
    const menu = $('context-menu');
    if (menu && menu.classList.contains('active') && !menu.contains(e.target)) {
        menu.classList.remove('active');
    }
});

// ---------- Pull to refresh ----------
function attachPullToRefresh() {
    let ptrStart = 0;
    let ptrCurrent = 0;
    let ptrActive = false;
    const indicator = document.createElement('div');
    indicator.className = 'ptr-indicator';
    indicator.textContent = 'Tirer pour rafraichir';
    document.body.appendChild(indicator);

    document.addEventListener('touchstart', e => {
        if (window.scrollY > 0) return;
        const inBoard = e.target.closest('.board, .mytasks-view, .today-view');
        if (!inBoard || inBoard.scrollTop > 0) return;
        ptrStart = e.touches[0].clientY;
        ptrActive = true;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!ptrActive) return;
        ptrCurrent = e.touches[0].clientY;
        const diff = ptrCurrent - ptrStart;
        if (diff > 30 && diff < 200) {
            indicator.classList.add('visible');
            indicator.textContent = diff > 100 ? 'Relacher pour rafraichir' : 'Tirer pour rafraichir';
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!ptrActive) return;
        const diff = ptrCurrent - ptrStart;
        if (diff > 100) {
            indicator.classList.add('refreshing');
            indicator.textContent = 'Rafraichissement…';
            vibrate(50);
            // Force re-render of current view
            if (state.currentProjectId) {
                renderTasks();
                renderProjects();
                updateViewBadges();
            }
            setTimeout(() => {
                indicator.classList.remove('visible', 'refreshing');
                indicator.textContent = 'Tirer pour rafraichir';
            }, 800);
        } else {
            indicator.classList.remove('visible');
        }
        ptrActive = false;
    });
}

// ---------- Themes ----------
const AVAILABLE_THEMES = ['dark', 'light', 'dracula', 'nord', 'solarized', 'monokai', 'aurora'];
function applyTheme(theme) {
    if (!AVAILABLE_THEMES.includes(theme)) theme = 'dark';
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('corviospace-theme', theme);
    toast(`Theme : ${theme}`, 'info');
}

// ---------- Compact mode ----------
function toggleCompactMode() {
    const isCompact = document.body.classList.toggle('compact-mode');
    state.settings.compactMode = isCompact;
    localStorage.setItem('corviospace-settings', JSON.stringify(state.settings));
    toast(`Mode compact ${isCompact ? 'active' : 'desactive'}`, 'info');
}

// ---------- Sounds toggle ----------
function toggleSounds() {
    state.settings.sounds = !state.settings.sounds;
    localStorage.setItem('corviospace-settings', JSON.stringify(state.settings));
    toast(`Sons ${state.settings.sounds ? 'actives' : 'desactives'}`, 'info');
    if (state.settings.sounds) playSound('success');
}

// ---------- Avatar upload (base64) ----------
async function uploadAvatar(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        toast('Fichier trop gros (max 2 Mo)', 'error');
        return;
    }
    // Resize to 128x128 with canvas
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    img.onload = async () => {
        const canvas = document.createElement('canvas');
        const SIZE = 128;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        // Square crop center
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        try {
            await updateDoc(doc(db, 'users', state.currentUser.uid), { avatar: dataUrl });
            state.userProfile = { ...state.userProfile, avatar: dataUrl };
            renderUserAvatar();
            toast('Avatar mis a jour !', 'success');
            playSound('success');
        } catch (e) {
            toast('Erreur upload avatar', 'error');
        }
    };
}

function renderUserAvatar() {
    const av = el.userAvatar;
    if (!av) return;
    const existing = av.querySelector('img');
    if (state.userProfile?.avatar) {
        if (existing) existing.src = state.userProfile.avatar;
        else {
            const img = document.createElement('img');
            img.src = state.userProfile.avatar;
            av.appendChild(img);
        }
    } else if (existing) {
        existing.remove();
    }
}

// ---------- ICS Export ----------
function exportICS() {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) { toast('Selectionne un projet', 'error'); return; }
    const tasksWithDate = state.tasks.filter(t => t.dueDate && !t.archived);
    if (!tasksWithDate.length) { toast('Aucune tache avec deadline', 'info'); return; }

    const fmt = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Corvio Space//FR',
        'CALSCALE:GREGORIAN'
    ];
    tasksWithDate.forEach(t => {
        const due = new Date(t.dueDate);
        const end = new Date(due.getTime() + 60 * 60 * 1000); // +1h
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${t.id}@corvio-space`);
        lines.push(`DTSTAMP:${fmt(new Date())}`);
        lines.push(`DTSTART:${fmt(due)}`);
        lines.push(`DTEND:${fmt(end)}`);
        lines.push(`SUMMARY:${(t.title || '').replace(/[\r\n,;]/g, ' ')}`);
        if (t.description) lines.push(`DESCRIPTION:${(t.description || '').replace(/[\r\n,;]/g, ' ').slice(0, 200)}`);
        lines.push(`PRIORITY:${t.priority === 'high' ? 1 : t.priority === 'medium' ? 5 : 9}`);
        lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${tasksWithDate.length} evenements exportes`, 'success');
}

// ---------- Notifications externes (Discord + Telegram) ----------
function statusLabel(s) {
    return ({ todo: 'A faire', inprogress: 'En cours', review: 'En revue', done: 'Termine' })[s] || s;
}

async function notifyTaskEvent(event, task, extra = {}) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) return;
    if (!project.webhook && !(project.telegramToken && project.telegramChatId)) return;

    const userName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'Quelqu\'un';
    const taskTitle = task?.title || 'sans titre';
    const projectName = project.name || 'Projet';

    // Discord embed config
    let embedTitle, color, mdText;

    if (event === 'create') {
        embedTitle = '🆕 Nouvelle tache';
        color = 0x6366f1;
        mdText = `🆕 *Nouvelle tache*\n\n📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    } else if (event === 'move') {
        const from = statusLabel(extra._from);
        const to = statusLabel(extra._to);
        const arrow = extra._to === 'done' ? '✅' : '↗️';
        embedTitle = `${arrow} ${from} → ${to}`;
        color = extra._to === 'done' ? 0x10b981 : 0x8b5cf6;
        mdText = `${arrow} *Statut change*\n\n📋 *${taskTitle}*\n${from} → *${to}*\n👤 ${userName}\n📁 ${projectName}`;
    } else if (event === 'complete') {
        embedTitle = '✅ Tache terminee';
        color = 0x10b981;
        mdText = `✅ *Tache terminee*\n\n📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    } else if (event === 'delete') {
        embedTitle = '🗑 Tache supprimee';
        color = 0xef4444;
        mdText = `🗑 *Tache supprimee*\n\n📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    } else {
        embedTitle = event;
        color = 0x6366f1;
        mdText = `📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    }

    // ----- Discord webhook -----
    if (project.webhook && /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(project.webhook)) {
        const fields = event === 'move' ? [
            { name: 'De', value: statusLabel(extra._from), inline: true },
            { name: 'Vers', value: statusLabel(extra._to), inline: true }
        ] : [];
        const payload = {
            embeds: [{
                title: embedTitle,
                description: `**${taskTitle}**${task?.description ? '\n' + task.description.slice(0, 200) : ''}`,
                color,
                fields,
                footer: { text: `${projectName} · ${userName}` },
                timestamp: new Date().toISOString()
            }]
        };
        try {
            await fetch(project.webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } catch (e) { /* silent */ }
    }

    // ----- Telegram bot -----
    if (project.telegramToken && project.telegramChatId) {
        const url = `https://api.telegram.org/bot${project.telegramToken}/sendMessage`;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: project.telegramChatId,
                    text: mdText,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            });
        } catch (e) { /* silent */ }
    }
}

// Backward compat alias (in case anything still calls the old name)
const sendDiscordWebhook = (event, task) => notifyTaskEvent(event, task);

// ---------- Auto-archive done tasks > 7 days ----------
async function autoArchiveOldDoneTasks() {
    if (!state.currentProjectId) return;
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const toArchive = state.tasks.filter(t => {
        if (t.status !== 'done' || t.archived) return false;
        const ts = t.completedAt || t.createdAt;
        return ts && new Date(ts).getTime() < cutoff;
    });
    if (!toArchive.length) return;
    const batch = writeBatch(db);
    toArchive.forEach(t => batch.update(doc(db, 'tasks', t.id), {
        archived: true,
        archivedAt: new Date().toISOString()
    }));
    try {
        await batch.commit();
        toast(`${toArchive.length} tache(s) auto-archivee(s) (>7j)`, 'info');
    } catch (e) {}
}

// ---------- Streak (consecutive active days) ----------
function updateStreak() {
    const today = new Date().toDateString();
    const streakData = JSON.parse(localStorage.getItem('corviospace-streak') || '{}');
    if (streakData.lastDay === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = streakData.lastDay === yesterday.toDateString();

    streakData.streak = wasYesterday ? (streakData.streak || 0) + 1 : 1;
    streakData.lastDay = today;
    streakData.best = Math.max(streakData.best || 0, streakData.streak);
    localStorage.setItem('corviospace-streak', JSON.stringify(streakData));

    if (typeof gamification !== 'undefined') {
        gamification.streak = streakData.streak;
        try { saveGamification?.(); renderGamificationWidget?.(); } catch (e) {}
    }
}

// ---------- Weekly summary ----------
function maybeShowWeeklySummary() {
    const today = new Date();
    if (today.getDay() !== 0) return; // sunday only
    const lastShown = localStorage.getItem('corviospace-weekly-shown');
    const todayKey = today.toISOString().split('T')[0];
    if (lastShown === todayKey) return;
    localStorage.setItem('corviospace-weekly-shown', todayKey);
    showWeeklySummary();
}

function showWeeklySummary() {
    const modal = $('weekly-modal');
    const content = $('weekly-content');
    if (!modal || !content) return;

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allTasks = [...state.tasks, ...state.archivedTasks, ...state.myTasks];
    const completedThisWeek = allTasks.filter(t => {
        if (t.status !== 'done') return false;
        const ts = t.completedAt || t.archivedAt || t.createdAt;
        return ts && new Date(ts).getTime() > oneWeekAgo;
    });
    const createdThisWeek = allTasks.filter(t => {
        return t.createdAt && new Date(t.createdAt).getTime() > oneWeekAgo;
    });
    const streakData = JSON.parse(localStorage.getItem('corviospace-streak') || '{}');

    content.innerHTML = `
        <div style="text-align:center;padding:1rem">
            <div style="font-size:3rem;margin-bottom:0.5rem">🎉</div>
            <p style="color:var(--text-muted);margin-bottom:1.5rem">Voici comment s'est passee ta semaine</p>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;margin-bottom:1.5rem">
                <div style="background:rgba(99,102,241,0.1);padding:1rem;border-radius:12px">
                    <div style="font-size:2rem;font-weight:800;color:var(--primary,#6366f1)">${completedThisWeek.length}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">terminees</div>
                </div>
                <div style="background:rgba(236,72,153,0.1);padding:1rem;border-radius:12px">
                    <div style="font-size:2rem;font-weight:800;color:#ec4899">${createdThisWeek.length}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">creees</div>
                </div>
                <div style="background:rgba(16,185,129,0.1);padding:1rem;border-radius:12px">
                    <div style="font-size:2rem;font-weight:800;color:#10b981">${streakData.streak || 0}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">jours d'affilee</div>
                </div>
                <div style="background:rgba(245,158,11,0.1);padding:1rem;border-radius:12px">
                    <div style="font-size:2rem;font-weight:800;color:#f59e0b">${streakData.best || 0}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">meilleur streak</div>
                </div>
            </div>
            <p style="color:var(--text-secondary)">${completedThisWeek.length > 5 ? 'Belle semaine ! Continue comme ca 🚀' : 'Allez, on remet ca cette semaine ! 💪'}</p>
        </div>
    `;
    openModal(modal);
}

// ==========================================
// V6 - Wire up listeners on DOMContentLoaded
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Apply persisted theme
    const savedTheme = localStorage.getItem('corviospace-theme') || 'dark';
    applyTheme(savedTheme);

    // Apply compact mode if persisted
    if (state.settings.compactMode) document.body.classList.add('compact-mode');

    // Quick capture
    $('quick-capture-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitQuickCapture(); }
        if (e.key === 'Escape') closeQuickCapture();
    });
    document.querySelector('#quick-capture .quick-capture-overlay')?.addEventListener('click', closeQuickCapture);

    // Global "+" key opens quick capture
    document.addEventListener('keydown', e => {
        if (e.key === '+' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
            e.preventDefault();
            openQuickCapture();
        }
    });

    // Theme picker
    $('theme-picker-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        $('theme-dropdown')?.classList.toggle('open');
    });
    document.querySelectorAll('#theme-dropdown [data-theme]').forEach(b => {
        b.addEventListener('click', () => {
            applyTheme(b.dataset.theme);
            $('theme-dropdown')?.classList.remove('open');
        });
    });
    $('toggle-compact')?.addEventListener('click', () => {
        toggleCompactMode();
        $('theme-dropdown')?.classList.remove('open');
    });
    $('toggle-sounds')?.addEventListener('click', () => {
        toggleSounds();
        $('theme-dropdown')?.classList.remove('open');
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('#theme-dropdown')) {
            $('theme-dropdown')?.classList.remove('open');
        }
    });

    // Avatar upload
    $('avatar-input')?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (f) uploadAvatar(f);
        e.target.value = '';
    });

    // ICS export
    $('export-ics')?.addEventListener('click', exportICS);

    // Snooze button in task modal
    $('snooze-task-btn')?.addEventListener('click', () => {
        if (state.editingTaskId) {
            snoozeTask(state.editingTaskId);
            closeModal(el.taskModal);
        }
    });

    // Mobile gestures
    if ('ontouchstart' in window) {
        attachLongPress();
        attachPullToRefresh();
    }

    // Auto-archive periodically
    setTimeout(autoArchiveOldDoneTasks, 5000);
    setInterval(autoArchiveOldDoneTasks, 30 * 60 * 1000); // every 30min

    // Streak update
    setTimeout(updateStreak, 2000);

    // Weekly summary on first sunday open
    setTimeout(maybeShowWeeklySummary, 3000);
});

// Show snooze button in openTaskModal (extend existing)
const _origOpenTaskModal = openTaskModal;
openTaskModal = function(task) {
    _origOpenTaskModal.call(this, task);
    const sb = $('snooze-task-btn');
    if (sb) sb.style.display = task ? 'inline-flex' : 'none';

    // Attachments: only listen for existing tasks (need an id)
    const dz = $('attachments-dropzone');
    if (task) {
        if (dz) dz.classList.remove('disabled');
        listenToTaskAttachments(task.id);
    } else {
        if (dz) dz.classList.add('disabled');
        listenToTaskAttachments(null);
    }
};


// Hook double-click for inline edit on cards
document.addEventListener('dblclick', e => {
    const titleEl = e.target.closest('.task-card-title');
    if (!titleEl) return;
    const card = titleEl.closest('.task-card');
    if (!card || card.classList.contains('archived')) return;
    const task = state.tasks.find(t => t.id === card.dataset.id);
    if (!task) return;
    e.preventDefault();
    e.stopPropagation();
    makeCardEditable(card, task);
});

// Hook sound + webhook into existing task lifecycle
const _wrapTask = (origName, fn) => {
    const orig = window[origName];
    if (typeof orig === 'function') window[origName] = fn;
};

// Render avatar after profile loaded (called from updateUserUI)
const _origUpdateUserUI = updateUserUI;
updateUserUI = function() {
    _origUpdateUserUI.call(this);
    renderUserAvatar();
};

// Wire sound + webhook into createTask / updateTask via post-call hook
// (we already inlined gamification in createTask/updateTask, just append sounds + webhook)
const _origCreateTask = createTask;
createTask = async function(data) {
    const result = await _origCreateTask.call(this, data);
    if (result) {
        playSound('pop');
        vibrate(15);
        notifyTaskEvent('create', data);
    }
    return result;
};

const _origUpdateTask = updateTask;
updateTask = async function(id, data) {
    // Snapshot the OLD task BEFORE the update so we can detect status changes
    const oldTask = state.tasks.find(t => t.id === id);
    const oldStatus = oldTask?.status;
    const wasNotDone = oldTask && oldTask.status !== 'done';

    const result = await _origUpdateTask.call(this, id, data);

    // Status changed → fire "move" event (covers ALL drag-drop, modal save, bulk, swipe)
    if (data.status && oldStatus && data.status !== oldStatus) {
        const merged = { ...oldTask, ...data };
        notifyTaskEvent('move', merged, { _from: oldStatus, _to: data.status });

        // Extra sound + vibration only when moving to "done"
        if (data.status === 'done' && wasNotDone) {
            playSound('success');
            vibrate([20, 30, 20]);
        } else {
            playSound('click');
            vibrate(10);
        }
    }
    return result;
};

// ---------- Project create: also save webhook + telegram ----------
const _origCreateProject = createProject;
createProject = async function(name, desc, color, template) {
    const webhook = $('project-webhook')?.value.trim() || '';
    const telegramToken = $('project-telegram-token')?.value.trim() || '';
    const telegramChatId = $('project-telegram-chat')?.value.trim() || '';

    const result = await _origCreateProject.call(this, name, desc, color, template);

    if (result && (webhook || telegramToken || telegramChatId)) {
        try {
            const patch = {};
            if (webhook) patch.webhook = webhook;
            if (telegramToken) patch.telegramToken = telegramToken;
            if (telegramChatId) patch.telegramChatId = telegramChatId;
            await updateDoc(doc(db, 'projects', result), patch);
        } catch (e) {}
    }
    return result;
};
