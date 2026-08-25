// ==========================================
// TASKS — listener, board rendering, CRUD, recurrence, time tracking, comments,
// subtasks, blocked-by, task modal, watchers, inline edit, snooze, context menu
// ==========================================
import {
    collection, addDoc, updateDoc, deleteDoc, doc, getDocs, onSnapshot, query, orderBy, where,
    arrayUnion, arrayRemove, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $, $$, el } from './core/dom.js';
import { esc, toast, handleError, validators, avatarColor, getDueStatus, formatDeadline, formatDuration, parseDeadline, toLocalISODate } from './core/utils.js';
import { canCreateOrEditTasks, canDeleteTasks } from './core/roles.js';
import { membershipFields } from './core/membership.js';
import { filtreAppartenance } from './core/requetes.js';
import { couleurSure, couleurTexteTag } from './core/couleurs.js';
import { icone } from './core/icones.js';
import { confirmDialog } from './core/confirm.js';
import { afficherSquelettesBoard, squelettesDifferes } from './core/skeletons.js';
import { openModal, closeModal } from './core/modal.js';
import { updateStats, renderCalendar, toggleTaskSelection, updateActiveFiltersDisplay } from './views.js';
import { invaliderCacheDashboard } from './dashboard.js';
// prioriteDe rend une classe CSS TOUJOURS sure : `task.priority` vient de
// Firestore, l'injecter brut dans un attribut `class` ouvrait un XSS stocke.
import { prioriteDe } from './core/triage.js';
import { statutVoisin, annonceDeplacement, annonceBord } from './core/clavier-plateau.js';
import { rafraichirPlateauMobile } from './plateauMobile.js';
import { playSound, vibrate } from './mobile.js';
import { addGamificationPoints, checkTaskCompletionBadges, logActivity, fireConfetti } from './productivity.js';
import { notifyTaskEvent } from './webhooks.js';
import { listenToTaskAttachments } from './attachments.js';
import { renderComments, addComment } from './comments.js';
import { getProjectColumns } from './projects.js';
import { saveTaskAsTemplate } from './templates.js';

// ==========================================
// FIRESTORE LISTENER (per-project tasks)
// ==========================================

export function listenToTasks(projectId) {
    // Unsubscribe from previous
    if (state.unsubscribers.taskListener) {
        state.unsubscribers.taskListener();
    }
    if (state.unsubscribers.archivedListener) {
        state.unsubscribers.archivedListener();
    }

    if (!projectId) return;

    // Cartes fantomes, mais seulement si le snapshot tarde : Firestore repond
    // souvent depuis son cache local en quelques millisecondes, et un squelette
    // qui apparait pour disparaitre aussitot cligne plus qu'il ne rassure.
    const squelettesPosesParBoard = squelettesDifferes(
        () => afficherSquelettesBoard(el.columns, el.counts),
        Object.values(el.columns)
    );

    // Active tasks
    const q = query(
        collection(db, 'tasks'),
        ...filtreAppartenance(state.currentUser?.uid),
        where('projectId', '==', projectId),
        where('archived', '==', false),
        orderBy('createdAt', 'desc')
    );

    state.unsubscribers.taskListener = onSnapshot(q, snap => {
        squelettesPosesParBoard();
        state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTasks();
        updateStats();
        if (state.currentView === 'calendar') renderCalendar();
        // Le tableau de bord garde en memoire les taches de TOUS les projets :
        // une modification ici rend ce cache perime. On l'invalide sans
        // re-rendre — la vue n'est pas a l'ecran, et la recharger a chaque
        // snapshot declencherait une requete par projet a chaque frappe.
        invaliderCacheDashboard();
    }, error => {
        // Fallback query without archived field for backward compatibility
        const fallbackQ = query(
            collection(db, 'tasks'),
            ...filtreAppartenance(state.currentUser?.uid),
            where('projectId', '==', projectId),
            orderBy('createdAt', 'desc')
        );

        state.unsubscribers.taskListener = onSnapshot(fallbackQ, snap => {
            squelettesPosesParBoard();
            state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.archived);
            state.archivedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.archived);
            renderTasks();
            updateStats();
        }, () => squelettesPosesParBoard());
    });

    // Archived tasks
    const aq = query(
        collection(db, 'tasks'),
        ...filtreAppartenance(state.currentUser?.uid),
        where('projectId', '==', projectId),
        where('archived', '==', true),
        orderBy('archivedAt', 'desc')
    );

    state.unsubscribers.archivedListener = onSnapshot(aq, snap => {
        state.archivedTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (state.filters.showArchived) renderTasks();
    }, () => {});
}

// ==========================================
// TASKS - CORE (board rendering)
// ==========================================

export function renderTasks() {
    const search = state.filters.search.toLowerCase();

    Object.values(el.columns).forEach(c => {
        if (!c) return;
        c.innerHTML = '';
        // Efface aussi les squelettes eventuels ; aria-busy doit tomber en
        // meme temps qu'eux, sinon un lecteur d'ecran annonce une zone en
        // chargement perpetuel.
        c.removeAttribute('aria-busy');
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

        // Date range filter.
        // parseDeadline (fin de journee LOCALE) et toLocalISODate, jamais
        // `new Date(t.dueDate)` : sur une echeance "AAAA-MM-JJ", `new Date`
        // parse en minuit UTC. Le filtre « en retard » classait alors une tache
        // due AUJOURD'HUI comme en retard des 00:00 UTC (02:00 en France), et le
        // filtre « aujourd'hui » l'excluait a l'ouest de Greenwich. On aligne
        // sur renderToday, qui compare deja correctement les jours locaux.
        if (state.filters.dateRange) {
            const due = t.dueDate ? parseDeadline(t.dueDate) : null;
            const now = new Date();
            const todayStr = toLocalISODate(now);
            const dueJour = t.dueDate ? String(t.dueDate).split('T')[0] : null;

            switch (state.filters.dateRange) {
                case 'today':
                    if (dueJour !== todayStr) return false;
                    break;
                case 'week': {
                    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    if (!due || due > weekFromNow) return false;
                    break;
                }
                case 'overdue':
                    if (!due || due >= now) return false;
                    break;
                case 'no-date':
                    if (t.dueDate) return false;
                    break;
            }
        }

        return true;
    });

    // Group by status — built from the current columns (default or custom per
    // project), not a hardcoded set, so custom column ids actually get their tasks.
    const grouped = {};
    const colonnesIds = Object.keys(el.columns);
    colonnesIds.forEach(status => { grouped[status] = []; });
    // Filet de securite : une tache dont le `status` ne correspond a AUCUNE
    // colonne (statut legacy, colonne renommee/supprimee, tache creee avant le
    // fix du select) tombait dans le vide — sauvegardee mais jamais rendue. On
    // la rattache a la premiere colonne pour qu'elle reste visible et deplacable
    // plutot que perdue.
    const premiereColonne = colonnesIds[0];
    tasksToRender.forEach(t => {
        const cible = grouped[t.status] ? t.status : premiereColonne;
        if (grouped[cible]) grouped[cible].push(t);
    });

    // Render cards — manual drag order first (see reorderTask()), falling back
    // to the incoming createdAt-desc order for tasks that were never reordered.
    Object.entries(grouped).forEach(([status, list]) => {
        list.sort((a, b) => {
            const ao = typeof a.order === 'number' ? a.order : Infinity;
            const bo = typeof b.order === 'number' ? b.order : Infinity;
            return ao === bo ? 0 : ao - bo;
        });
        const colonne = el.columns[status];
        if (el.counts[status]) {
            el.counts[status].textContent = list.length;
            // Le compteur seul ne dit pas de quoi il parle a un lecteur d'ecran.
            const nom = colonne?.closest('.column')?.querySelector('h2')?.textContent || '';
            el.counts[status].setAttribute(
                'aria-label',
                `${list.length} tâche${list.length > 1 ? 's' : ''}${nom ? ` dans « ${nom} »` : ''}`
            );
        }
        if (!colonne) return;

        if (list.length === 0) {
            colonne.appendChild(construireColonneVide(status));
            return;
        }

        list.forEach((t, i) => {
            const carte = createTaskCard(t);
            // Sert au decalage en cascade de l'animation d'entree.
            carte.style.setProperty('--rang', i);
            colonne.appendChild(carte);
        });
    });

    // Une carte deplacee au clavier vient d'etre detruite et recreee par ce
    // rendu : on lui rend le focus, sinon il retombe sur <body> et il faut
    // re-parcourir tout le plateau pour enchainer un second deplacement.
    restaurerFocusCarte();

    // Les compteurs viennent de changer : le libelle du bouton de repli les
    // annonce (« Replier "A faire", 3 taches »), il doit suivre. Sur
    // ordinateur cet appel ne fait rien.
    rafraichirPlateauMobile();

    // La cascade ne joue qu'au PREMIER rendu. renderTasks() est appele depuis
    // le onSnapshot Firestore et reconstruit tout le DOM : sans ce garde-fou,
    // modifier une seule tache re-animait toutes les cartes de l'ecran.
    if (el.board && !_premierRenduFait) {
        _premierRenduFait = true;
        el.board.classList.add('anime-entree');
        // On retire la classe une fois la cascade jouee, pour qu'un rendu
        // ulterieur ne la rejoue pas.
        setTimeout(() => el.board?.classList.remove('anime-entree'), 900);
    }

    updateActiveFiltersDisplay();
}

/** Remis a false au changement de projet : le nouveau tableau merite sa cascade. */
let _premierRenduFait = false;
export function reinitialiserAnimationBoard() {
    _premierRenduFait = false;
}

/** Etat vide d'une colonne : dit ce qu'elle accueille, pas juste qu'elle est vide. */
function construireColonneVide(status) {
    const PHRASES = {
        todo: ['Rien à faire ici', 'Les nouvelles tâches arrivent dans cette colonne.'],
        inprogress: ['Aucune tâche en cours', 'Glissez-y ce sur quoi vous travaillez.'],
        review: ['Rien à relire', 'Déposez ici ce qui attend un second regard.'],
        done: ['Rien de terminé', 'Les tâches achevées viendront s\'accumuler ici.'],
    };
    const [titre, aide] = PHRASES[status] || ['Colonne vide', 'Glissez-y une tâche, ou utilisez « Ajouter ».'];
    const bloc = document.createElement('p');
    bloc.className = 'colonne-vide';
    bloc.innerHTML = `<strong>${esc(titre)}</strong>${esc(aide)}`;
    return bloc;
}

export function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.archived ? 'archived' : ''}`;
    card.dataset.id = task.id;
    card.draggable = !task.archived && canCreateOrEditTasks(state.currentProjectId);

    // Accessible au clavier. Sans tabindex, une carte n'etait meme pas
    // ATTEIGNABLE au clavier : ni lisible en parcourant la page, ni
    // deplacable. Le statut est recopie sur la carte pour que le gestionnaire
    // delegue sache d'ou elle part sans remonter le DOM.
    card.tabIndex = 0;
    card.dataset.status = task.status || '';

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

    // La priorite etait une pastille de 8px : une COULEUR, et rien d'autre.
    // Elle devient une forme a trois crans, remplie de un a trois — lisible en
    // niveaux de gris, comprehensible sans legende, et doublee d'un libelle.
    // La couleur ne fait plus que confirmer ce que la forme dit deja.
    const NIVEAUX = { high: 3, medium: 2, low: 1 };
    const LIBELLE_PRIORITE = { high: 'Priorité haute', medium: 'Priorité moyenne', low: 'Priorité basse' };
    const niveau = NIVEAUX[task.priority] || 2;
    const crans = [1, 2, 3]
        .map(i => `<span class="prio-cran${i <= niveau ? ' est-plein' : ''}"></span>`)
        .join('');

    // L'alerte d'echeance remonte EN TETE de carte. Elle etait en pied, a
    // egalite de poids avec le nombre de commentaires, alors que c'est
    // l'information qui doit declencher une action.
    const alerte = !task.archived && (dueStatus === 'overdue' || dueStatus === 'soon')
        ? `<p class="task-card-alerte ${dueStatus}">
               ${icone(dueStatus === 'overdue' ? 'alerte' : 'horloge', { taille: 12 })}
               <span>${esc(formatDeadline(task.dueDate))}</span>
           </p>`
        : '';

    // Le pied de carte etait ecrit INCONDITIONNELLEMENT. Une tache sans
    // echeance, sans sous-tache, sans commentaire ni personne assignee portait
    // donc quand meme un filet de separation et une rangee vide : ~28px de
    // decor pur, sur chaque carte, sur un ecran de telephone qui n'en montre
    // qu'une poignee. On construit les morceaux d'abord, et le pied n'existe
    // que s'il porte quelque chose.
    const meta = [
        task.dueDate && !alerte ? `<span class="task-due ${dueStatus}">${icone('calendrier', { taille: 12 })} ${esc(formatDeadline(task.dueDate))}</span>` : '',
        subtasks.length ? `
            <div class="task-subtasks-progress">
                <div class="subtask-bar">
                    <div class="subtask-bar-fill" style="width:${(done/subtasks.length)*100}%"></div>
                </div>
                <span>${done}/${subtasks.length}</span>
            </div>
        ` : '',
        task.comments?.length ? `<span title="${task.comments.length} commentaire${task.comments.length > 1 ? 's' : ''}">${icone('bulle', { taille: 13 })} ${task.comments.length}</span>` : '',
        task.timeSpent ? `<span title="Temps passé sur cette tâche">${icone('horloge', { taille: 13 })} ${formatDuration(task.timeSpent)}</span>` : '',
        watcherCount ? `<span class="task-watchers" title="${watcherCount} personne${watcherCount > 1 ? 's suivent' : ' suit'} cette tâche">${icone('oeil', { taille: 13 })} ${watcherCount}</span>` : '',
        isBlocked ? `<span class="task-blocked-badge" title="Bloquée par ${blockedBy.length} tâche${blockedBy.length > 1 ? 's' : ''} non terminée${blockedBy.length > 1 ? 's' : ''}">${icone('cadenas', { taille: 13 })} ${blockedBy.length}</span>` : '',
    ].filter(Boolean).join('');

    const avatar = assignee ? `
        <div class="task-card-assignee" style="background:${avatarColor(assignee.uid)}" title="${esc(assignee.displayName || assignee.email)}">
            ${esc((assignee.displayName || assignee.email || 'U').charAt(0).toUpperCase())}
        </div>
    ` : '';

    // `sans-filet` quand il n'y a que l'avatar : un trait de separation qui ne
    // separe rien de rien est du bruit.
    const pied = meta || avatar
        ? `<div class="task-card-footer${meta ? '' : ' sans-filet'}">
               ${meta ? `<div class="task-card-meta">${meta}</div>` : ''}${avatar}
           </div>`
        : '';

    card.innerHTML = `
        ${alerte}
        <div class="task-card-header">
            <h3 class="task-card-title">${esc(task.title)}</h3>
            <div class="task-card-indicators">
                ${hasRecurrence ? `<span class="task-recurring" title="Tâche récurrente">${icone('reprise', { taille: 13 })}</span>` : ''}
                ${isTracking ? `<span class="task-tracking pulse" title="Chronomètre en cours">${icone('horloge', { taille: 13 })}</span>` : ''}
                <span class="task-card-priority ${prioriteDe(task).classe}" role="img" aria-label="${LIBELLE_PRIORITE[task.priority] || 'Priorité moyenne'}" title="${LIBELLE_PRIORITE[task.priority] || 'Priorité moyenne'}">${crans}</span>
            </div>
        </div>
        ${task.description ? `<p class="task-card-desc">${esc(task.description)}</p>` : ''}
        ${taskTags.length ? `<div class="task-card-labels">${taskTags.map(t =>
            // Le texte est assombri juste assez pour rester lisible sur la
            // teinte a 12.5% : la couleur brute d'un tag clair ressortait a
            // 2.48:1. La pastille ronde garde la couleur exacte, donc la
            // vraie couleur du tag reste visible.
            `<span class="task-tag" style="background:${couleurSure(t.color)}20;color:${couleurTexteTag(t.color)}">
                <span class="task-tag-dot" style="background:${couleurSure(t.color)}"></span>${esc(t.name)}
            </span>`
        ).join('')}</div>` : ''}
        ${pied}
        ${task.archived ? '<div class="task-archived-badge">Archivée</div>' : ''}
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
            card.classList.remove('drag-over-top', 'drag-over-bottom');
            state.draggedTask = null;
        });

        // Drop on another card → reorder within (or into) that card's column,
        // instead of just appending at the end via the column-level drop.
        card.addEventListener('dragover', e => {
            if (!state.draggedTask || state.draggedTask === card) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = card.getBoundingClientRect();
            const before = (e.clientY - rect.top) < rect.height / 2;
            card.classList.toggle('drag-over-top', before);
            card.classList.toggle('drag-over-bottom', !before);
        });
        card.addEventListener('dragleave', () => {
            card.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        card.addEventListener('drop', async e => {
            if (!state.draggedTask || state.draggedTask === card) return;
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('drag-over-top', 'drag-over-bottom');
            const draggedId = state.draggedTask.dataset.id;
            const targetStatus = card.closest('.column')?.dataset.status;
            if (!targetStatus) return;
            const rect = card.getBoundingClientRect();
            const before = (e.clientY - rect.top) < rect.height / 2;
            await reorderTask(draggedId, targetStatus, task.id, before);
        });
    }

    return card;
}

// Drag-to-reorder within a column (or into a specific position of another
// column). Reindexes the target column and writes in one batch.
// NOTE (fix vs the original branch version): the order is computed from
// `state.tasks`, NOT from the DOM — so reordering while a search/tag filter
// is active can't corrupt the order of the currently-hidden tasks.
export async function reorderTask(draggedId, targetStatus, referenceTaskId, insertBefore) {
    if (draggedId === referenceTaskId) return;
    const dragged = state.tasks.find(t => t.id === draggedId);
    if (!dragged) return;

    const ids = state.tasks
        .filter(t => t.status === targetStatus && !t.archived && t.id !== draggedId)
        .sort((a, b) => {
            const ao = typeof a.order === 'number' ? a.order : Infinity;
            const bo = typeof b.order === 'number' ? b.order : Infinity;
            return ao === bo ? 0 : ao - bo;
        })
        .map(t => t.id);

    const refIndex = ids.indexOf(referenceTaskId);
    if (refIndex === -1) return;
    ids.splice(insertBefore ? refIndex : refIndex + 1, 0, draggedId);

    const batch = writeBatch(db);
    ids.forEach((id, i) => {
        const patch = { order: i };
        if (id === draggedId && dragged.status !== targetStatus) patch.status = targetStatus;
        batch.update(doc(db, 'tasks', id), patch);
    });
    await batch.commit();

    if (targetStatus === 'done' && dragged.status !== 'done' && dragged.recurrence && dragged.recurrence !== 'none') {
        await createRecurringTask(dragged);
    }
    if (typeof vibrate === 'function') vibrate(20);
}

// ==========================================
// TASKS - CRUD
// (createTask/updateTask below already include the sound/vibrate/webhook
// behavior that the original app.js grafted on later via reassignment —
// merged here as one function instead of a runtime monkey-patch.)
// ==========================================

export async function createTask(data) {
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Vous êtes en lecture seule sur ce projet.', 'error');
        return null;
    }
    if (!validators.taskTitle(data.title)) {
        toast('Le titre est obligatoire et ne peut pas dépasser 200 caractères.', 'error');
        return null;
    }

    const taskData = {
        ...data,
        projectId: state.currentProjectId,
        // Appartenance recopiee depuis le projet : indispensable pour pouvoir
        // refermer `allow list: if true` sur tasks (voir core/membership.js).
        ...membershipFields(state.projects.find(p => p.id === state.currentProjectId), state.currentUser.uid),
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
            message: `${state.currentUser.displayName || state.currentUser.email} vous a assigné la tâche "${data.title}"`,
            projectId: state.currentProjectId,
            taskId: ref.id,
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    toast('Tâche créée.', 'success');
    try { addGamificationPoints(5, 'create'); } catch (e) {}
    try { logActivity('task-create', { title: data.title }); } catch (e) {}

    playSound('pop');
    vibrate(15);
    notifyTaskEvent('create', data);

    return ref.id;
}

export async function updateTask(id, data) {
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Vous êtes en lecture seule sur ce projet.', 'error');
        return;
    }
    const oldTask = state.tasks.find(t => t.id === id);
    const oldStatus = oldTask?.status;
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
            message: `${state.currentUser.displayName || state.currentUser.email} vous a assigné la tâche "${data.title}"`,
            projectId: state.currentProjectId,
            taskId: id,
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    toast('Tâche mise à jour.', 'success');

    try {
        if (wasNotDone && isNowDone) {
            addGamificationPoints(10, 'complete');
            checkTaskCompletionBadges();
            logActivity('task-complete', { title: data.title || oldTask?.title });
            try { fireConfetti(); } catch (e) {}
        } else {
            logActivity('task-update', { title: data.title || oldTask?.title });
        }
    } catch (e) {}

    if (data.status && oldStatus && data.status !== oldStatus) {
        const merged = { ...oldTask, ...data };
        notifyTaskEvent('move', merged, { _from: oldStatus, _to: data.status });

        if (data.status === 'done' && wasNotDone) {
            playSound('success');
            vibrate([20, 30, 20]);
        } else {
            playSound('click');
            vibrate(10);
        }
    }
}

export async function deleteTask(id) {
    if (!canDeleteTasks(state.currentProjectId)) {
        toast('Seuls le propriétaire ou un administrateur peuvent supprimer des tâches.', 'error');
        return;
    }
    const tache = state.tasks.find(t => t.id === id) || state.archivedTasks.find(t => t.id === id);
    if (!await confirmDialog({
        titre: 'Supprimer cette tâche ?',
        message: tache?.title
            ? `« ${tache.title} » sera supprimée, avec ses commentaires et ses pièces jointes. Cette action est définitive.`
            : 'Cette tâche sera supprimée, avec ses commentaires et ses pièces jointes. Cette action est définitive.',
        valider: 'Supprimer',
        danger: true,
    })) return;

    stopTimer(id);
    // Best-effort: delete linked attachments
    try {
        const snap = await getDocs(query(
            collection(db, 'attachments'),
            ...filtreAppartenance(state.currentUser?.uid),
            where('taskId', '==', id),
        ));
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'attachments', d.id))));
    } catch (e) { /* ignore */ }
    await deleteDoc(doc(db, 'tasks', id));

    toast('Tâche supprimée.', 'info');
    closeModal(el.taskModal);
}

export async function archiveTask(id) {
    await updateDoc(doc(db, 'tasks', id), {
        archived: true,
        archivedAt: new Date().toISOString()
    });

    stopTimer(id);
    toast('Tâche archivée.', 'success');
    closeModal(el.taskModal);
}

export async function unarchiveTask(id) {
    await updateDoc(doc(db, 'tasks', id), {
        archived: false,
        archivedAt: null
    });

    toast('Tâche restaurée.', 'success');
    closeModal(el.taskModal);
}

export async function duplicateTask(task) {
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

export async function createRecurringTask(originalTask) {
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
        ...membershipFields(state.projects.find(p => p.id === originalTask.projectId), state.currentUser.uid),
        createdBy: state.currentUser.uid,
        createdAt: new Date().toISOString(),
        archived: false,
        timeSpent: 0,
        parentTaskId: originalTask.id
    };

    await addDoc(collection(db, 'tasks'), newTask);
    toast('Nouvelle tâche récurrente créée.', 'info');
}

/**
 * L'echeance de la prochaine occurrence d'une tache recurrente.
 * Rend une date au format "AAAA-MM-JJ", comme toutes les echeances du projet.
 *
 * ⚠️ Cette fonction rendait `date.toISOString()`, soit
 * "2026-07-28T00:00:00.000Z". Enchainement du defaut, silencieux de bout en
 * bout :
 *   1. createRecurringTask ecrivait cette chaine dans `dueDate` ;
 *   2. openTaskModal fait `el.taskDue.value = task.dueDate` — or un
 *      <input type="date"> REFUSE un horodatage complet et retombe a "" ;
 *   3. le champ s'affichait donc VIDE, sans que rien ne le signale ;
 *   4. au premier enregistrement, `dueDate: el.taskDue?.value || null`
 *      remettait l'echeance a null.
 * Autrement dit : toute tache recurrente perdait son echeance des qu'on
 * l'ouvrait et qu'on l'enregistrait. Verifie : `input.value = '...Z'` rend "".
 *
 * On passe par parseDeadline (fin de journee LOCALE) et toLocalISODate, comme
 * partout ailleurs dans le projet — jamais `new Date("AAAA-MM-JJ")`, qui vaut
 * minuit UTC et decale le jour.
 */
export function calculateNextDueDate(currentDueDate, recurrence) {
    const date = currentDueDate ? parseDeadline(currentDueDate) : new Date();
    if (!date) return null;

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

    return toLocalISODate(date);
}

// ==========================================
// TIME TRACKING
// ==========================================

export function startTimer(taskId) {
    if (state.timeTracking[taskId]?.isRunning) return;

    state.timeTracking[taskId] = {
        isRunning: true,
        startTime: Date.now(),
        intervalId: setInterval(() => updateTimerDisplay(taskId), 1000)
    };

    renderTasks();
    updateTimerDisplay(taskId);
    toast('Chronomètre lancé.', 'info');
}

export function stopTimer(taskId) {
    const tracker = state.timeTracking[taskId];
    if (!tracker?.isRunning) return;

    clearInterval(tracker.intervalId);
    const elapsed = Math.floor((Date.now() - tracker.startTime) / 1000);

    state.timeTracking[taskId] = { isRunning: false };

    // Update task with time spent
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        const newTimeSpent = (task.timeSpent || 0) + elapsed;
        // .catch explicite : sans lui, un refus (droits, reseau) devenait une
        // promesse rejetee non geree, sans le moindre retour a l'utilisateur —
        // qui croyait son temps enregistre. On le previent au lieu d'echouer en
        // silence.
        updateDoc(doc(db, 'tasks', taskId), { timeSpent: newTimeSpent })
            .catch(e => handleError(e, 'enregistrement du temps'));
        // Le tableau de bord additionne `timeSpent` sur tous les projets a
        // partir d'un cache de 60 secondes. Sans cette invalidation, le temps
        // qu'on vient d'enregistrer pouvait ne pas apparaitre pendant une
        // minute — et c'est precisement apres avoir arrete un chronometre
        // qu'on va verifier son total.
        invaliderCacheDashboard();
    }

    renderTasks();
    toast(`Chronomètre arrêté : ${formatDuration(elapsed)} ajouté.`, 'success');
}

export function stopAllTimers() {
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

// ==========================================
// DEPLACEMENT D'UNE CARTE AU CLAVIER
// ==========================================
// Le glisser-deposer ci-dessus est souris et tactile uniquement. Deplacer une
// tache est la fonction centrale du produit : sans equivalent clavier, le
// plateau est inutilisable pour qui n'a pas de souris (docs/PLAN-BOARD.md,
// lot 5, « le manque le plus important de cette session »).
//
// Les touches : Ctrl+Flèche gauche/droite deplacent, Entree ouvre la tache.
// Ctrl plutot que la fleche seule, parce que la fleche seule doit continuer de
// faire defiler le plateau — et parce que ui.js porte des raccourcis a une
// seule touche : un raccourci de deplacement sans modificateur y entrerait en
// collision.

/** Zone d'annonce, creee a la demande. Une seule pour toute l'application. */
function zoneAnnonce() {
    let zone = $('annonce-plateau');
    if (!zone) {
        zone = document.createElement('div');
        zone.id = 'annonce-plateau';
        zone.setAttribute('role', 'status');
        zone.setAttribute('aria-live', 'polite');
        zone.setAttribute('aria-atomic', 'true');
        // Visible pour les lecteurs d'ecran, invisible a l'oeil. On ne peut
        // PAS utiliser display:none ni visibility:hidden : les deux retirent
        // le contenu de l'arbre d'accessibilite, donc plus rien n'est annonce.
        zone.className = 'sr-only';
        document.body.appendChild(zone);
    }
    return zone;
}

export function annoncer(message) {
    const zone = zoneAnnonce();
    // Vider d'abord : reecrire le MEME texte ne declenche aucune annonce.
    // Deplacer deux fois de suite vers la meme colonne resterait silencieux.
    zone.textContent = '';
    zone.textContent = message;
}

/** L'ordre des colonnes actuellement affichees. */
function statutsAffiches() {
    return Object.keys(el.columns).filter(s => el.columns[s]);
}

/** Le nom lisible d'une colonne, tel qu'affiche dans son en-tete. */
function nomColonne(statut) {
    const col = el.columns[statut]?.closest('.column');
    return col?.querySelector('h2')?.textContent?.trim() || statut;
}

// Le rendu reconstruit tout le DOM depuis le onSnapshot Firestore : la carte
// deplacee est detruite et recreee. Sans cette memoire, le focus retombait sur
// <body> apres chaque deplacement et il fallait re-parcourir tout le plateau a
// la tabulation pour enchainer un second mouvement.
let _carteAFocaliser = null;

export function restaurerFocusCarte() {
    if (!_carteAFocaliser) return;
    const id = _carteAFocaliser;
    _carteAFocaliser = null;
    const carte = el.board?.querySelector(`.task-card[data-id="${CSS.escape(id)}"]`);
    carte?.focus({ preventScroll: false });
}

el.board?.addEventListener('keydown', async e => {
    const carte = e.target.closest?.('.task-card');
    if (!carte || !el.board.contains(carte)) return;

    // Entree ouvre la tache. Une <div tabindex="0"> n'emet pas de clic sur
    // Entree comme le ferait un <button> : il faut le faire explicitement.
    if (e.key === 'Enter') {
        const tache = state.tasks.find(t => t.id === carte.dataset.id);
        if (tache) { e.preventDefault(); openTaskModal(tache); }
        return;
    }

    if (!e.ctrlKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();

    if (carte.classList.contains('archived')) {
        annoncer('Une tâche archivée ne peut pas être déplacée.');
        return;
    }
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        annoncer('Vous êtes en lecture seule sur ce projet.');
        return;
    }

    const statuts = statutsAffiches();
    const depart = carte.dataset.status;
    const direction = e.key === 'ArrowRight' ? 1 : -1;
    const cible = statutVoisin(statuts, depart, direction);

    if (!cible) {
        annoncer(annonceBord(nomColonne(depart), direction));
        return;
    }

    const tache = state.tasks.find(t => t.id === carte.dataset.id);
    if (!tache) return;

    _carteAFocaliser = tache.id;
    try {
        await moveTaskToStatus(tache.id, cible);
        annoncer(annonceDeplacement(
            tache.title, nomColonne(cible), statuts.indexOf(cible) + 1, statuts.length
        ));
    } catch (err) {
        // Le rendu n'aura pas lieu : on rend le focus tout de suite, sinon
        // l'utilisateur se retrouve nulle part apres un echec reseau.
        _carteAFocaliser = null;
        carte.focus({ preventScroll: true });
        annoncer('Le déplacement a échoué. Vérifiez votre connexion, puis réessayez.');
    }
});

// Bouton « Ajouter » en pied de colonne, en DELEGATION sur le plateau.
// Un cablage par rendu ne couvrirait pas les colonnes du gabarit statique
// d'index.html, que renderCustomColumns() laisse en place quand la structure
// est deja a jour. La delegation survit a toutes les reconstructions.
el.board?.addEventListener('click', e => {
    const btn = e.target.closest('.column-ajout');
    if (!btn || !el.board.contains(btn)) return;
    e.stopPropagation();
    if (!state.currentProjectId) {
        toast('Ouvrez d\'abord un projet.', 'info');
        return;
    }
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Vous êtes en lecture seule sur ce projet.', 'error');
        return;
    }
    openTaskModal(null, { statut: btn.dataset.status });
});

// Reusable move logic — used by desktop drag&drop AND the mobile "Move to" menu.
export async function moveTaskToStatus(taskId, newStatus) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;

    await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });

    // Handle recurrence on completion
    if (newStatus === 'done' && task.recurrence && task.recurrence !== 'none') {
        await createRecurringTask(task);
    }
    vibrate(20);
}

// ==========================================
// TASK MODAL
// ==========================================

export function populateBlockedBy(currentTaskId, selectedIds = []) {
    if (!el.taskBlockedBy) return;
    const others = state.tasks.filter(t => t.id !== currentTaskId);
    el.taskBlockedBy.innerHTML = others.map(t =>
        `<option value="${esc(t.id)}" ${selectedIds.includes(t.id) ? 'selected' : ''}>${esc(t.title)} (${esc(t.status)})</option>`
    ).join('') || '<option disabled>Aucune autre tâche disponible</option>';
}

// NOTE: this already includes the snooze-button + attachments-listener
// behavior that the original grafted on via `openTaskModal = function(){...}`.
/**
 * @param {object|null} task    tâche à éditer, ou null pour une création
 * @param {object} options
 * @param {string} options.statut  colonne de destination, pour le bouton
 *        « Ajouter » en pied de colonne. Sans lui, toute création retombait
 *        sur « À faire » quelle que soit la colonne d'où l'on partait.
 */
// Repeuple le <select> de statut avec les VRAIES colonnes du projet (defaut ou
// personnalisees). Sans ca, le select gardait ses options codees en dur
// (todo/inprogress/review/done) : sur un projet aux colonnes renommees, la
// tache creee recevait un statut inexistant -> invisible sur le board bien que
// sauvegardee. (bug remonte 2026-08).
function remplirSelectStatut() {
    if (!el.taskStatus) return;
    const projet = state.projects.find(p => p.id === state.currentProjectId);
    const colonnes = getProjectColumns(projet) || [];
    if (!colonnes.length) return;
    el.taskStatus.innerHTML = colonnes
        .map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`)
        .join('');
}

export function openTaskModal(task = null, { statut = null } = {}) {
    state.editingTaskId = task?.id || null;
    remplirSelectStatut();

    if (task) {
        if (el.taskModalTitle) el.taskModalTitle.textContent = 'Modifier la tâche';
        if (el.saveTaskBtn) el.saveTaskBtn.textContent = 'Enregistrer';
        if (el.deleteTaskBtn) el.deleteTaskBtn.style.display = 'flex';
        if (el.commentsSection) el.commentsSection.style.display = 'block';
        if (el.watchTaskBtn) {
            el.watchTaskBtn.style.display = 'inline-flex';
            const watching = (task.watchers || []).includes(state.currentUser?.uid);
            el.watchTaskBtn.innerHTML = `${icone(watching ? 'oeil' : 'oeil')} ${watching ? 'Suivie' : 'Suivre'}`;
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
        if (el.taskModalTitle) el.taskModalTitle.textContent = 'Nouvelle tâche';
        if (el.saveTaskBtn) el.saveTaskBtn.textContent = 'Créer';
        if (el.deleteTaskBtn) el.deleteTaskBtn.style.display = 'none';
        if (el.commentsSection) el.commentsSection.style.display = 'none';
        if (el.watchTaskBtn) el.watchTaskBtn.style.display = 'none';
        if (el.focusTaskBtn) el.focusTaskBtn.style.display = 'none';

        const archiveBtn = $('archive-task-btn');
        if (archiveBtn) archiveBtn.style.display = 'none';

        el.taskForm?.reset();
        // `statut` vient du bouton d'ajout d'une colonne ; sinon on retombe
        // sur la premiere colonne du projet, pas sur 'todo' en dur — un projet
        // aux colonnes personnalisees n'a pas forcement de colonne 'todo'.
        if (el.taskStatus) {
            const colonnes = getProjectColumns(state.projects.find(p => p.id === state.currentProjectId));
            el.taskStatus.value = statut || colonnes[0]?.id || 'todo';
        }
        if (el.taskPriority) el.taskPriority.value = 'medium';
        if (el.taskRecurrence) el.taskRecurrence.value = 'none';

        populateBlockedBy(null, []);

        el.tagsSelector?.querySelectorAll('input').forEach(inp => inp.checked = false);
        if (el.subtasksContainer) el.subtasksContainer.innerHTML = '';

        // Créée depuis une vue personnelle ("Mes tâches" / "Aujourd'hui") →
        // l'auto-assigner à moi. Sinon la tâche n'apparait PAS dans ces vues
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

    // ---- merged from the later snooze-button / attachments hook ----
    const sb = $('snooze-task-btn');
    if (sb) sb.style.display = task ? 'inline-flex' : 'none';

    const dz = $('attachments-dropzone');
    if (task) {
        if (dz) dz.classList.remove('disabled');
        listenToTaskAttachments(task.id);
    } else {
        if (dz) dz.classList.add('disabled');
        listenToTaskAttachments(null);
    }
}

export function updateTaskTimeTracking(task) {
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
                <span class="time-current" id="timer-display">${isRunning ? 'En cours…' : ''}</span>
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

export function renderSubtasks(subtasks) {
    if (!el.subtasksContainer) return;
    el.subtasksContainer.innerHTML = '';
    subtasks.forEach((s, i) => addSubtaskEl(s.text, s.completed, s.assigneeId || '', i));
}

function subtaskAssigneeOptionsHtml(selectedUid) {
    const options = state.projectMembers.map(m =>
        `<option value="${esc(m.uid)}" ${m.uid === selectedUid ? 'selected' : ''}>${esc(m.displayName || m.email)}</option>`
    ).join('');
    return `<option value="">Personne</option>${options}`;
}

export function addSubtaskEl(text = '', completed = false, assigneeId = '', idx = null) {
    if (!el.subtasksContainer) return;

    const div = document.createElement('div');
    div.className = 'subtask-item';
    div.innerHTML = `
        <input type="checkbox" ${completed ? 'checked' : ''}>
        <input type="text" value="${esc(text)}" placeholder="Sous-tâche...">
        <select class="subtask-assignee" title="Assigner cette sous-tâche">
            ${subtaskAssigneeOptionsHtml(assigneeId)}
        </select>
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

export function getSubtasks() {
    if (!el.subtasksContainer) return [];

    return [...el.subtasksContainer.querySelectorAll('.subtask-item')].map(item => ({
        text: item.querySelector('input[type="text"]').value.trim(),
        completed: item.querySelector('input[type="checkbox"]').checked,
        assigneeId: item.querySelector('.subtask-assignee')?.value || ''
    })).filter(s => s.text);
}

// ---------- Watchers ----------
export async function toggleWatchTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;
    const watchers = task.watchers || [];
    const isWatching = watchers.includes(state.currentUser.uid);
    await updateDoc(doc(db, 'tasks', taskId), {
        watchers: isWatching ? arrayRemove(state.currentUser.uid) : arrayUnion(state.currentUser.uid)
    });
    toast(isWatching ? 'Vous ne suivez plus cette tâche.' : 'Vous suivez cette tâche. Vous serez notifié de ses changements.', 'success');
    if (el.watchTaskBtn) {
        el.watchTaskBtn.innerHTML = `${icone('oeil')} ${isWatching ? 'Suivre' : 'Suivie'}`;
    }
}

// ---------- Inline edit ----------
export function makeCardEditable(cardEl, task) {
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
export async function snoozeTask(taskId) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const tz = tomorrow.getTimezoneOffset();
    const local = new Date(tomorrow.getTime() - tz * 60000);
    await updateTask(taskId, { dueDate: local.toISOString().slice(0, 16) });
    toast('Tâche reportée à demain 9 h.', 'success');
    playSound('pop');
    vibrate(15);
}

// ---------- Long-press contextual menu ----------
export function showContextMenu(x, y, task) {
    const menu = $('context-menu');
    if (!menu) return;

    // (Re)build the dynamic "Move to column" section for the current project.
    // This is how tasks change column on mobile (touch has no HTML5 drag&drop).
    menu.querySelector('.ctx-move-section')?.remove();
    const project = state.projects.find(p => p.id === state.currentProjectId);
    const columns = getProjectColumns(project) || [];
    const moveTargets = columns.filter(c => c.id !== task.status);
    if (moveTargets.length) {
        const sec = document.createElement('div');
        sec.className = 'ctx-move-section';
        sec.innerHTML = `<div class="ctx-move-label">Déplacer vers</div>` +
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
                // Pas de confirmation ici : deleteTask() en pose deja une.
                // L'ancien confirm() natif en empilait une seconde par-dessus.
                case 'delete': await deleteTask(task.id); break;
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

// ---- Wiring ----
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
        toast('Donnez un titre à la tâche avant de l\'enregistrer.', 'error');
        return;
    }

    // v5: prevent moving to "done" if blocked
    if (data.status === 'done' && data.blockedBy?.length) {
        const stillBlocking = data.blockedBy.filter(bid => {
            const b = state.tasks.find(t => t.id === bid);
            return b && b.status !== 'done';
        });
        if (stillBlocking.length > 0) {
            toast(`Impossible : ${stillBlocking.length} dépendance(s) non terminée(s). Terminez d'abord les tâches dont celle-ci dépend.`, 'error');
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

el.deleteTaskBtn?.addEventListener('click', () => {
    if (state.editingTaskId) deleteTask(state.editingTaskId);
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

el.searchInput?.addEventListener('input', () => {
    state.filters.search = el.searchInput.value;
    renderTasks();
});

$('duplicate-task-btn')?.addEventListener('click', () => {
    const task = state.tasks.find(t => t.id === state.editingTaskId);
    if (task) duplicateTask(task);
});

$('snooze-task-btn')?.addEventListener('click', () => {
    if (state.editingTaskId) {
        snoozeTask(state.editingTaskId);
        closeModal(el.taskModal);
    }
});

el.watchTaskBtn?.addEventListener('click', () => {
    if (state.editingTaskId) toggleWatchTask(state.editingTaskId);
});

$('task-template-btn')?.addEventListener('click', () => {
    if (!state.editingTaskId) {
        // Saving from a NEW (unsaved) task: build a quick task object from form fields
        const task = {
            title: el.taskTitle?.value.trim() || '',
            description: el.taskDesc?.value.trim() || '',
            priority: el.taskPriority?.value || 'medium',
            subtasks: getSubtasks()
        };
        if (!task.title) { toast('Donnez un titre à la tâche avant d\'en faire un modèle.', 'error'); return; }
        saveTaskAsTemplate(task);
        return;
    }
    const task = state.tasks.find(t => t.id === state.editingTaskId);
    if (task) saveTaskAsTemplate(task);
});

el.addTaskBtn?.addEventListener('click', () => {
    if (state.currentProjectId) openTaskModal();
    else toast('Créez d\'abord un projet.', 'info');
});

// FAB: quick add task (mobile)
$('fab-new-task')?.addEventListener('click', () => {
    if (state.currentProjectId) {
        openTaskModal();
    } else {
        toast('Sélectionnez ou créez d\'abord un projet.', 'info');
    }
});

// ---------- Auto-archive done tasks > 7 days ----------
export async function autoArchiveOldDoneTasks() {
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
        toast(`${toArchive.length} tâche${toArchive.length > 1 ? "s" : ""} terminée${toArchive.length > 1 ? "s" : ""} depuis plus de 7 jours ${toArchive.length > 1 ? "ont" : "a"} été archivée${toArchive.length > 1 ? "s" : ""}.`, 'info');
    } catch (e) {}
}
