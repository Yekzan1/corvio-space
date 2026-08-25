// ==========================================
// FIRESTORE LISTENERS (account-wide: projects, notifications, templates, my tasks)
// ==========================================
import { collection, onSnapshot, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { el } from './core/dom.js';
import { handleError } from './core/utils.js';
import { filtreAppartenance } from './core/requetes.js';
import { afficherSquelettesProjets, squelettesDifferes } from './core/skeletons.js';
import { renderProjects, selectProject, applyRoleUI, initStarterWorkspace } from './projects.js';
import { updateEmptyState, renderMyTasks, renderToday, updateViewBadges } from './views.js';
import { renderNotifications } from './notifications.js';
import { renderTemplatesList } from './templates.js';
import { invaliderCacheDashboard } from './dashboard.js';

export function startListeners() {
    // La sidebar reste vide jusqu'au premier snapshot : sans squelette, elle
    // se lit comme "aucun projet" au lieu de "ca charge". Differe, comme le
    // board — inutile de faire clignoter une reponse venue du cache.
    const squelettesPosesParProjets = squelettesDifferes(
        () => afficherSquelettesProjets(el.projectsList),
        [el.projectsList]
    );

    // Projects
    const pq = query(
        collection(db, 'projects'),
        where('members', 'array-contains', state.currentUser?.uid || 'user_demo'),
        orderBy('createdAt', 'desc')
    );

    if (state.unsubscribers.projects) state.unsubscribers.projects();
    try {
        state.unsubscribers.projects = onSnapshot(pq, snap => {
            squelettesPosesParProjets();
            if (snap.docs && snap.docs.length > 0) {
                state.projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            } else {
                const { projects } = initStarterWorkspace(state.currentUser?.uid);
                state.projects = projects;
            }
            renderProjects();
            if (!state.currentProjectId && state.projects.length) {
                selectProject(state.projects[0].id);
            }
            updateEmptyState();
            if (state.currentProjectId) applyRoleUI();
        }, error => {
            squelettesPosesParProjets();
            const { projects } = initStarterWorkspace(state.currentUser?.uid);
            state.projects = projects;
            renderProjects();
            if (!state.currentProjectId && state.projects.length) {
                selectProject(state.projects[0].id);
            }
            updateEmptyState();
        });
    } catch(e) {
        squelettesPosesParProjets();
        const { projects } = initStarterWorkspace(state.currentUser?.uid);
        state.projects = projects;
        renderProjects();
        if (!state.currentProjectId && state.projects.length) {
            selectProject(state.projects[0].id);
        }
        updateEmptyState();
    }

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
        ...filtreAppartenance(state.currentUser.uid),
        where('assigneeId', '==', state.currentUser.uid),
        where('archived', '==', false)
    );
    if (state.unsubscribers.myTasks) state.unsubscribers.myTasks();
    state.unsubscribers.myTasks = onSnapshot(myq, snap => {
        state.myTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.currentView === 'mytasks') renderMyTasks();
        if (state.currentView === 'today') renderToday();
        updateViewBadges();
        // Ce listener est le seul a couvrir TOUS les projets : celui de
        // tasks.js ne surveille que le projet ouvert. Sans cette ligne, une
        // tache qui m'est assignee et que je modifie depuis un autre projet
        // laissait le tableau de bord sur des chiffres perimes.
        // Cela ne couvre toujours pas les ecritures des collegues sur des
        // projets que je ne regarde pas — d'ou l'heure du releve affichee
        // dans l'en-tete du tableau de bord, et le bouton Actualiser.
        invaliderCacheDashboard();
    }, () => { /* index may not be ready, ignore silently */ });
}
