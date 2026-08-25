// ==========================================
// PROJECTS (CRUD, roles UI, members, background/custom columns, presence, public share)
// ==========================================
import {
    collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc, onSnapshot,
    query, where, orderBy, arrayUnion, arrayRemove, writeBatch, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $, $$, el } from './core/dom.js';
import { esc, toast, handleError, avatarColor, safeAsync, validators } from './core/utils.js';
import { getRole, myRole, canManageProject, canDeleteProject, ROLE_LABELS } from './core/roles.js';
import { membershipFields, membershipEstAJour, decouperEnLots } from './core/membership.js';
import { filtreAppartenance, filtrePublic } from './core/requetes.js';
import { openModal, closeModal } from './core/modal.js';
import { couleurSure } from './core/couleurs.js';
import { confirmDialog, promptDialog } from './core/confirm.js';
import { listenToTasks, renderTasks, updateTask } from './tasks.js';
import { listenToTags } from './tags.js';
import { resetFilters, updateEmptyState, renderFilterAssignees } from './views.js';
import { closeMobileSidebar } from './mobile.js';
import { createTasksFromTemplate } from './templates.js';
import { rafraichirPlateauMobile } from './plateauMobile.js';

export function initStarterWorkspace(userId) {
    try {
        let existingProjects = JSON.parse(localStorage.getItem('corviospace_projects') || '[]');
        let existingTasks = JSON.parse(localStorage.getItem('corviospace_tasks') || '[]');
        
        let projectId;
        if (existingProjects.length === 0) {
            projectId = 'proj_' + Math.random().toString(36).slice(2, 9);
            const starterProject = {
                id: projectId,
                name: "Chantiers & Projets 2026",
                description: "Suivi en temps réel des commandes, chantiers et facturations",
                color: "#10b981",
                ownerId: userId || state.currentUser?.uid || 'user_owner',
                members: [userId || state.currentUser?.uid || 'user_owner'],
                createdAt: new Date().toISOString()
            };
            existingProjects = [starterProject];
            localStorage.setItem('corviospace_projects', JSON.stringify(existingProjects));
        } else {
            projectId = existingProjects[0].id;
        }

        if (existingTasks.length === 0) {
            const starterTasks = [
                {
                    id: 'task_1',
                    projectId: projectId,
                    title: "Rénovation toiture & zinguerie",
                    description: "Chantier M. Delorme à Arnas. Dépose tuiles et pose étanchéité zinc.",
                    status: "todo",
                    priority: "high",
                    assigneeId: userId || state.currentUser?.uid,
                    dueDate: new Date(Date.now() + 86400000).toISOString(),
                    createdAt: new Date().toISOString(),
                    tags: ["Toiture", "Urgent"]
                },
                {
                    id: 'task_2',
                    projectId: projectId,
                    title: "Pose carrelage & plomberie",
                    description: "Boulangerie des Halles. Raccordement eau et faïence murale.",
                    status: "inprogress",
                    priority: "medium",
                    assigneeId: userId || state.currentUser?.uid,
                    dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
                    createdAt: new Date().toISOString(),
                    tags: ["Carrelage", "Plomberie"]
                },
                {
                    id: 'task_3',
                    projectId: projectId,
                    title: "Ravalement façade pierre dorée",
                    description: "Domaine des Vignes à Anse. Nettoyage basse pression et rejointoiement à la chaux.",
                    status: "review",
                    priority: "low",
                    assigneeId: userId || state.currentUser?.uid,
                    dueDate: new Date(Date.now() - 86400000).toISOString(),
                    createdAt: new Date().toISOString(),
                    tags: ["Façade", "Patrimoine"]
                },
                {
                    id: 'task_4',
                    projectId: projectId,
                    title: "Électricité générale showroom",
                    description: "Garage Automobile. Tableau triphasé et éclairage LED basse consommation.",
                    status: "done",
                    priority: "medium",
                    assigneeId: userId || state.currentUser?.uid,
                    completedAt: new Date().toISOString(),
                    createdAt: new Date().toISOString(),
                    tags: ["Électricité", "Facturé"]
                }
            ];
            existingTasks = starterTasks;
            localStorage.setItem('corviospace_tasks', JSON.stringify(existingTasks));
        }

        return { projects: existingProjects, tasks: existingTasks };
    } catch(e) {
        return { projects: [], tasks: [] };
    }
}

export function renderProjects() {
    if (!el.projectsList) return;

    // Les squelettes de chargement partent avec le innerHTML ; aria-busy, non.
    el.projectsList.removeAttribute('aria-busy');

    el.projectsList.innerHTML = state.projects.map(p => {
        const taskCount = state.tasks.filter(t => t.projectId === p.id && !t.archived).length;
        const isOwnerOrAdmin = getRole(p, state.currentUser?.uid) === 'owner' || getRole(p, state.currentUser?.uid) === 'admin';
        return `
            <li class="project-item ${p.id === state.currentProjectId ? 'active' : ''}"
                data-id="${esc(p.id)}" title="${esc(p.name)}">
                <div class="project-color" style="background:${couleurSure(p.color)}"></div>
                <span>${esc(p.name)}</span>
                ${/* Un compteur a zero n'apprend rien et vole ~20px au nom du
                      projet, déjà tronque dans une sidebar de 240px. On ne
                      l'affiche que lorsqu'il y a effectivement des tâches. */
                  taskCount > 0 ? `<span class="project-count">${taskCount}</span>` : ''}
                ${isOwnerOrAdmin ? `
                    <div class="project-actions">
                        <button class="project-action-btn project-edit-btn" data-id="${esc(p.id)}" title="Modifier">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="project-action-btn project-delete-btn" data-id="${esc(p.id)}" title="Supprimer">
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

export async function selectProject(id) {
    state.currentProjectId = id;
    const p = state.projects.find(x => x.id === id);

    if (p) {
        if (el.projectTitle) el.projectTitle.textContent = p.name;
        if (el.projectDescription) el.projectDescription.textContent = p.description || 'Gérez vos tâches en équipe';
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
export function applyRoleUI() {
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

    // Badge de rôle : slot statique (#my-role-badge) posé dans le HTML, À CÔTÉ
    // du titre. On le remplit et l'affiche quand un rôle existe, on le masque
    // sinon — sans quoi il gardait le rôle du projet précédent après un
    // changement de projet.
    const badge = document.getElementById('my-role-badge');
    if (badge) {
        if (role) {
            badge.textContent = ROLE_LABELS[role] || role;
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    }
}

// ==========================================
// MEMBERS
// ==========================================

export async function loadMembers(project) {
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

export function renderMembersAvatars() {
    if (!el.membersAvatars) return;

    el.membersAvatars.innerHTML = state.projectMembers.slice(0, 4).map(m => {
        const label = m.handle || m.displayName || m.email;
        const initial = (m.displayName || m.email || 'U').charAt(0).toUpperCase();
        return `<div class="member-avatar" style="background:${avatarColor(m.uid)}" title="${esc(label)}">${esc(initial)}</div>`;
    }).join('') + (state.projectMembers.length > 4 ? `<div class="member-avatar more">+${state.projectMembers.length - 4}</div>` : '');
}

export function updateAssigneeSelect() {
    if (!el.taskAssignee) return;

    el.taskAssignee.innerHTML = '<option value="">Non assigné</option>' +
        state.projectMembers.map(m => `<option value="${esc(m.uid)}">${esc(m.displayName || m.email)}</option>`).join('');
}

export async function addMember(input) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) return;

    if (!canManageProject(project.id)) {
        toast('Seuls le propriétaire et les administrateurs peuvent inviter des membres.', 'error');
        return;
    }

    const raw = (input || '').trim();
    if (!raw) {
        toast('Saisissez un tag de la forme pseudo#1234, ou une adresse e-mail.', 'error');
        return;
    }

    let userQuery;
    if (raw.includes('#')) {
        // Handle lookup: pseudo#1234
        const handle = raw.toLowerCase().replace(/\s+/g, '');
        if (!/^[^#\s]+#\d{4,6}$/.test(handle)) {
            toast('Format attendu : pseudo#1234.', 'error');
            return;
        }
        userQuery = query(collection(db, 'users'), where('handle', '==', handle), limit(1));
    } else if (validators.email(raw)) {
        userQuery = query(collection(db, 'users'), where('email', '==', raw.toLowerCase()), limit(1));
    } else {
        toast('Format attendu : pseudo#1234, ou une adresse e-mail.', 'error');
        return;
    }

    const snap = await getDocs(userQuery);
    if (snap.empty) {
        toast('Aucun compte ne correspond. La personne doit déjà être inscrite sur Corvio Space.', 'error');
        return;
    }

    const member = snap.docs[0];

    if (member.id === state.currentUser.uid) {
        toast('Vous êtes déjà membre de ce projet.', 'info');
        return;
    }
    if (project.members.includes(member.id)) {
        toast('Déjà membre du projet', 'info');
        return;
    }

    // Default new members to "member" role
    const newRoles = { ...(project.roles || {}), [member.id]: 'member' };
    await updateDoc(doc(db, 'projects', state.currentProjectId), {
        members: arrayUnion(member.id),
        roles: newRoles
    });

    // Propager la nouvelle appartenance sur les taches du projet, sinon le
    // nouveau membre ne les verrait plus une fois les regles resserrees.
    await syncProjectMembership(state.currentProjectId, {
        ...project,
        members: [...(project.members || []), member.id],
    });

    state.projectMembers.push({ uid: member.id, ...member.data() });
    renderMembersAvatars();
    renderModalMembers();
    updateAssigneeSelect();

    // Send notification
    await addDoc(collection(db, 'notifications'), {
        userId: member.id,
        type: 'invite',
        message: `${state.currentUser.displayName || state.currentUser.email} vous a ajouté au projet "${project.name}"`,
        projectId: state.currentProjectId,
        read: false,
        createdAt: new Date().toISOString()
    });

    toast('Membre ajouté !', 'success');
}

/**
 * Recopie l'appartenance d'un projet sur tout ce qui en depend.
 *
 * A appeler apres tout changement de `members`, de `ownerId` ou du partage
 * public. `projetApres` doit decrire le projet TEL QU'IL SERA APRES l'ecriture :
 * `state.projects` n'est rafraichi que par le onSnapshot, donc plus tard.
 *
 * Les trois collections sont traitees ensemble parce qu'elles fuient de la
 * meme facon : `tasks` en `allow list: if true`, `tags` et `attachments` en
 * `allow list: if isSignedIn()` — soit n'importe quel compte. `attachments`
 * est la plus sensible des trois, elle stocke les fichiers en base64.
 *
 * Volontairement tolerant : tant que les regles Firestore ne s'appuient pas
 * encore sur `memberIds` (etape 1 de la migration), un echec ici ne doit pas
 * empecher l'ajout du membre d'aboutir. Le backfill rattrapera.
 */
export const COLLECTIONS_PORTANT_MEMBERIDS = ['tasks', 'tags', 'attachments'];

export async function syncProjectMembership(projectId, projetApres) {
    if (!projectId || !projetApres) return 0;
    const champs = membershipFields(projetApres);
    let total = 0;

    for (const nom of COLLECTIONS_PORTANT_MEMBERIDS) {
        try {
            // Le filtre porte sur l'uid de CELUI QUI RESYNCHRONISE, pas sur le
            // membre ajoute ou retire : c'est un proprietaire ou un
            // administrateur, donc deja present dans les memberIds de tous les
            // documents du projet. Sans lui, cette requete devient un `list`
            // non prouvable et .hardened la refuse — y compris au proprietaire.
            const snap = await getDocs(query(
                collection(db, nom),
                ...filtreAppartenance(state.currentUser?.uid),
                where('projectId', '==', projectId),
            ));
            const aCorriger = snap.docs.filter(d => !membershipEstAJour(d.data(), projetApres));
            if (!aCorriger.length) continue;

            for (const lot of decouperEnLots(aCorriger)) {
                const batch = writeBatch(db);
                lot.forEach(d => batch.update(d.ref, champs));
                await batch.commit();
            }
            total += aCorriger.length;
        } catch (e) {
            // Une collection qui echoue ne doit pas empecher les autres :
            // `activities` et `attachments` peuvent ne pas exister du tout sur
            // un projet ancien.
            console.warn(`syncProjectMembership(${nom})`, e);
        }
    }
    return total;
}

export async function removeMember(uid) {
    const project = state.projects.find(p => p.id === state.currentProjectId);

    if (project?.ownerId === uid) {
        toast('Le propriétaire du projet ne peut pas en être retiré.', 'error');
        return;
    }

    if (!canManageProject(project?.id)) {
        toast('Seuls le propriétaire et les administrateurs peuvent retirer des membres.', 'error');
        return;
    }

    if (!await confirmDialog({
        titre: 'Retirer ce membre du projet ?',
        message: 'Cette personne perdra l\'accès au projet et à ses tâches. Les tâches qu\'elle a créées, elles, restent en place.',
        valider: 'Retirer', danger: true,
    })) return;

    // Also remove role entry
    const newRoles = { ...(project.roles || {}) };
    delete newRoles[uid];
    await updateDoc(doc(db, 'projects', state.currentProjectId), { roles: newRoles });

    await updateDoc(doc(db, 'projects', state.currentProjectId), {
        members: arrayRemove(uid)
    });

    // Retirer l'uid des taches aussi : c'est ce qui coupe reellement l'acces
    // une fois les regles resserrees, `members` seul ne suffirait pas.
    await syncProjectMembership(state.currentProjectId, {
        ...project,
        members: (project.members || []).filter(m => m !== uid),
    });

    state.projectMembers = state.projectMembers.filter(m => m.uid !== uid);
    renderMembersAvatars();
    renderModalMembers();
    updateAssigneeSelect();

    toast('Membre retiré du projet.', 'info');
}

export function renderModalMembers() {
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
            : `<span class="member-item-role ${isOwner ? 'owner' : esc(memberRole)}">${ROLE_LABELS[memberRole] || esc(memberRole)}</span>`;

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

export async function changeMemberRole(uid, newRole) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) return;
    if (!canManageProject(project.id)) {
        toast('Vous n\'avez pas les droits pour cette action.', 'error');
        return;
    }
    if (project.ownerId === uid) {
        toast('Le rôle du propriétaire ne peut pas être modifié.', 'error');
        return;
    }
    if (!['admin', 'member', 'viewer'].includes(newRole)) return;

    const newRoles = { ...(project.roles || {}), [uid]: newRole };
    try {
        await updateDoc(doc(db, 'projects', project.id), { roles: newRoles });
        toast(`Rôle mis à jour : ${ROLE_LABELS[newRole].toLowerCase()}.`, 'success');
    } catch (e) {
        toast('Le rôle n\'a pas pu être modifié. Vérifiez votre connexion, puis réessayez.', 'error');
    }
}

export function openMemberModal() {
    if (!state.currentProjectId) return;
    if (el.memberEmail) el.memberEmail.value = '';
    renderModalMembers();
    openModal(el.memberModal);
    el.memberEmail?.focus();
}

// ==========================================
// PROJECT CRUD
// (createProject below already includes the webhook/telegram patch that the
// original app.js grafted on later via reassignment — merged as one function
// instead of a runtime monkey-patch. The DOM read + follow-up patch keep the
// exact same two-step Firestore sequence as the original: create, then patch.)
// ==========================================

export async function createProject(name, desc, color, template = null) {
    if (!validators.projectName(name)) {
        toast('Le nom du projet doit faire entre 2 et 50 caractères.', 'error');
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

    // (merged webhook patch) read these BEFORE creating, exactly like the
    // original wrapper did, so the fields are captured before the form resets.
    const webhook = $('project-webhook')?.value.trim() || '';
    const telegramToken = $('project-telegram-token')?.value.trim() || '';
    const telegramChatId = $('project-telegram-chat')?.value.trim() || '';

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
        await createTasksFromTemplate(ref.id, template, { id: ref.id, ...projectData });
    }

    toast('Projet créé !', 'success');
    selectProject(ref.id);

    // (merged from the later webhook/telegram patch)
    if (webhook || telegramToken || telegramChatId) {
        try {
            const patch = {};
            if (webhook) patch.webhook = webhook;
            if (telegramToken) patch.telegramToken = telegramToken;
            if (telegramChatId) patch.telegramChatId = telegramChatId;
            await updateDoc(doc(db, 'projects', ref.id), patch);
        } catch (e) {}
    }

    return ref.id;
}

export async function deleteProject(id) {
    const project = state.projects.find(p => p.id === id);
    if (!project || project.ownerId !== state.currentUser.uid) {
        toast('Seul le propriétaire peut supprimer ce projet.', 'error');
        return;
    }

    // Double validation en UN seul dialogue : le bouton reste desactive tant
    // que le nom du projet n'est pas saisi exactement. Remplace l'ancien
    // couple confirm() + prompt(), deux boites systeme empilees qui sortaient
    // completement de l'identite de l'app.
    if (!await confirmDialog({
        titre: `Supprimer « ${project.name} » ?`,
        message: 'Toutes les tâches, tags, commentaires et pièces jointes du projet seront supprimés. Cette action est irréversible.',
        saisieAttendue: project.name.trim(),
        valider: 'Supprimer le projet',
        danger: true,
    })) return;

    try {
        // Delete all tasks
        const tasksSnap = await getDocs(query(
            collection(db, 'tasks'),
            ...filtreAppartenance(state.currentUser?.uid),
            where('projectId', '==', id),
        ));
        const batch = writeBatch(db);
        tasksSnap.docs.forEach(d => batch.delete(d.ref));

        // Delete all tags
        const tagsSnap = await getDocs(query(
            collection(db, 'tags'),
            ...filtreAppartenance(state.currentUser?.uid),
            where('projectId', '==', id),
        ));
        tagsSnap.docs.forEach(d => batch.delete(d.ref));

        // Delete all activities
        try {
            const activitiesSnap = await getDocs(query(collection(db, 'activities'), where('projectId', '==', id)));
            activitiesSnap.docs.forEach(d => batch.delete(d.ref));
        } catch (e) { /* activities may not exist */ }

        // Delete all attachments linked to project tasks
        try {
            const attachSnap = await getDocs(query(
                collection(db, 'attachments'),
                ...filtreAppartenance(state.currentUser?.uid),
                where('projectId', '==', id),
            ));
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

        toast('Projet supprimé.', 'info');
    } catch (err) {
        handleError(err, 'deleteProject');
        toast('Le projet n\'a pas pu être supprimé. Vérifiez votre connexion, puis réessayez.', 'error');
    }
}

// ==========================================
// PROJECT MODAL
// ==========================================

export function openProjectModal() {
    if (el.projectName) el.projectName.value = '';
    if (el.projectDesc) el.projectDesc.value = '';
    $$('.color-option:not(.tag-color)').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal(el.projectModal);
    el.projectName?.focus();
}

// ---------- Open project modal in edit mode ----------
export function openEditProjectModal() {
    const p = state.projects.find(x => x.id === state.currentProjectId);
    if (!p) { toast('Ouvrez d\'abord un projet.', 'error'); return; }
    if (!canManageProject(p.id)) { toast('Seuls le propriétaire et les administrateurs peuvent modifier ce projet.', 'error'); return; }

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
export function resetProjectModal() {
    state.editingProjectId = null;
    const modalTitle = el.projectModal?.querySelector('.modal-header h2');
    if (modalTitle) modalTitle.textContent = 'Nouveau projet';
    const submitBtn = el.projectModal?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Créer le projet';
    const delBtn = $('delete-project-btn');
    if (delBtn) delBtn.style.display = 'none';
}

el.projectForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const color = document.querySelector('.color-option:not(.tag-color).active')?.dataset.color || '#46615C';
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
            toast('Projet mis à jour.', 'success');
            // Re-render the current project header / background
            const p = state.projects.find(x => x.id === state.editingProjectId);
            if (p) {
                Object.assign(p, patch);
                if (state.currentProjectId === p.id) {
                    el.projectTitle.textContent = p.name;
                    el.projectDescription.textContent = p.description || 'Gérez vos tâches en équipe';
                    applyProjectBackground(p.background);
                    renderCustomColumns(p);
                    renderTasks();
                }
            }
        } catch (err) {
            toast('Le projet n\'a pas pu être mis à jour. Vérifiez votre connexion, puis réessayez.', 'error');
        }
        state.editingProjectId = null;
        closeModal(el.projectModal);
        return;
    }

    // Create mode
    await createProject(name, el.projectDesc?.value.trim() || '', color);
    closeModal(el.projectModal);
});

$('delete-project-btn')?.addEventListener('click', () => {
    if (state.editingProjectId) deleteProject(state.editingProjectId);
});

$$('.color-option:not(.tag-color)').forEach(b => {
    b.addEventListener('click', () => {
        $$('.color-option:not(.tag-color)').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
    });
});

// Project background picker
el.projectBgPicker?.querySelectorAll('.bg-option').forEach(b => {
    b.addEventListener('click', () => {
        el.projectBgPicker.querySelectorAll('.bg-option').forEach(o => o.classList.remove('active'));
        b.classList.add('active');
    });
});

$('edit-project-btn')?.addEventListener('click', openEditProjectModal);
el.addProjectBtn?.addEventListener('click', openProjectModal);
el.createFirstProject?.addEventListener('click', openProjectModal);
el.addProjectBtn?.addEventListener('click', resetProjectModal);
el.addMemberBtn?.addEventListener('click', openMemberModal);

document.querySelectorAll('#project-modal .modal-close, #project-modal .modal-cancel, #project-modal .modal-overlay').forEach(el2 => {
    el2.addEventListener('click', resetProjectModal);
});

el.memberForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = el.memberEmail?.value.trim();

    if (email) {
        await addMember(email);
        if (el.memberEmail) el.memberEmail.value = '';
    }
});

// ==========================================
// PROJECT BACKGROUND + CUSTOM KANBAN COLUMNS
// ==========================================

export function applyProjectBackground(bg) {
    if (el.mainContent) {
        if (bg && bg !== 'none') el.mainContent.dataset.bg = bg;
        else delete el.mainContent.dataset.bg;
    }
}

const DEFAULT_COLUMNS = [
    { id: 'todo', name: 'À faire' },
    { id: 'inprogress', name: 'En cours' },
    { id: 'review', name: 'En revue' },
    { id: 'done', name: 'Terminé' }
];

export function getProjectColumns(project) {
    if (!project?.columns || !Array.isArray(project.columns) || project.columns.length === 0) {
        return DEFAULT_COLUMNS;
    }
    return project.columns;
}

export function renderCustomColumns(project) {
    const board = el.board;
    if (!board) return;
    const columns = getProjectColumns(project);
    // On ne reconstruit que si les colonnes different — OU si la structure en
    // place est perimee. Le second test compte : le gabarit statique
    // d'index.html et celui genere ici doivent rester identiques, et sans
    // cette verification une evolution du gabarit ne serait jamais appliquee
    // aux projets dont les colonnes n'ont pas change.
    const currentIds = [...board.querySelectorAll('.column')].map(c => c.dataset.status).join(',');
    const newIds = columns.map(c => c.id).join(',');
    const structureAJour = board.querySelectorAll('.column-ajout').length === columns.length;
    if (currentIds === newIds && structureAJour) return;

    board.innerHTML = columns.map(col => `
        <section class="column" data-status="${esc(col.id)}" aria-labelledby="${esc(col.id)}-titre">
            <div class="column-header">
                <div class="column-title">
                    <span class="column-dot ${esc(col.id)}" aria-hidden="true"></span>
                    <h2 id="${esc(col.id)}-titre">${esc(col.name)}</h2>
                    <span class="column-count" id="${esc(col.id)}-count" aria-label="0 tâche dans « ${esc(col.name)} »">0</span>
                </div>
            </div>
            <div class="column-content" id="${esc(col.id)}-tasks"></div>
            <button type="button" class="column-ajout" data-status="${esc(col.id)}"
                    aria-label="Nouvelle tâche dans « ${esc(col.name)} »">
                <svg class="icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Ajouter</span>
            </button>
        </section>
    `).join('');

    // Les boutons d'ajout ne sont PAS cables ici : leur gestionnaire est
    // delegue sur #board dans tasks.js. Un cablage par rendu aurait laisse
    // sans gestionnaire les colonnes du gabarit statique d'index.html, que
    // cette fonction ne reconstruit pas quand la structure est deja a jour.

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

    // Le plateau vient d'etre reconstruit : les en-tetes ont perdu leur
    // commande de repli. On la repose tout de suite plutot que d'attendre le
    // premier onSnapshot, sinon les en-tetes restent inertes le temps de
    // l'aller-retour reseau. Sans effet sur ordinateur.
    rafraichirPlateauMobile();
}

// ==========================================
// PUBLIC SHARE
// ==========================================

export async function sharePublicLink() {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) { toast('Ouvrez d\'abord un projet.', 'error'); return; }
    if (project.ownerId !== state.currentUser.uid) { toast('Seul le propriétaire peut partager ce projet.', 'error'); return; }

    let shareId = project.publicShareId;
    if (!shareId) {
        shareId = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
        await updateDoc(doc(db, 'projects', project.id), { publicShareId: shareId, isPublic: true });
        // La vue publique lit les taches sans etre connectee : il leur faut
        // leur propre marqueur `isPublic`, une regle ne pouvant pas remonter
        // au projet parent lors d'un `list`.
        await syncProjectMembership(project.id, { ...project, isPublic: true });
    }
    const url = `${location.origin}${location.pathname}?share=${shareId}`;
    try {
        await navigator.clipboard.writeText(url);
        // Le toast portait l'URL entiere en clair : illisible, et ca faisait
        // deborder la bulle. Le lien est dans le presse-papiers, le dire suffit.
        toast('Lien de partage copié.', 'success');
    } catch (e) {
        // Presse-papiers refuse (permission, contexte non securise) : on
        // montre le lien deja selectionne, prêt pour un Ctrl+C.
        await promptDialog({
            titre: 'Lien de partage',
            message: 'Le presse-papiers n\'est pas accessible. Copiez ce lien manuellement :',
            valeur: url,
            valider: 'Fermer',
            annuler: 'Annuler',
            obligatoire: false,
        });
    }
}

export async function loadPublicProject(shareId) {
    try {
        // `isPublic` est INDISPENSABLE dans la requete, pas seulement dans la
        // regle. Sur une operation `list`, Firestore n'evalue pas la regle
        // document par document : il la confronte aux CONTRAINTES de la
        // requete. La branche « projet public » de la regle n'est donc
        // prouvable que si la requete filtre elle-meme sur isPublic.
        //
        // C'est ce qui permet de remplacer `allow list: if true` — qui
        // exposait la liste de TOUS les projets de TOUS les clients a un
        // visiteur anonyme — par une regle a deux branches.
        //
        // Effet de bord connu : un projet partage avant l'introduction du
        // drapeau porte un publicShareId sans isPublic. Son lien cassera.
        // Rouvrir le partage depuis l'application suffit a le reparer.
        const snap = await getDocs(query(
            collection(db, 'projects'),
            where('publicShareId', '==', shareId),
            where('isPublic', '==', true),
            limit(1)
        ));
        if (snap.empty) {
            document.body.style.background = '#283533';
            document.body.innerHTML = '<div style="padding:2rem;color:white;text-align:center"><h1>Projet introuvable</h1><a href="/" style="color:#D6C28B">Retour</a></div>';
            return;
        }
        const project = { id: snap.docs[0].id, ...snap.docs[0].data() };
        state.publicView = true;
        state.publicProjectData = project;

        // Fetch tasks of this project
        // Le visiteur n'est PAS connecte : c'est `isPublic` qui rend la
        // branche « partage public » de la regle prouvable, exactement comme
        // pour la requete sur les projets juste au-dessus. Sans ce filtre, la
        // liste des taches est refusee des que .hardened est deploye et le
        // lien de partage n'affiche plus rien.
        const tasksSnap = await getDocs(query(
            collection(db, 'tasks'),
            ...filtrePublic(),
            where('projectId', '==', project.id),
        ));
        const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.archived);

        // Render minimal read-only view
        document.body.innerHTML = `
            <div class="public-share-banner">
                Vue lecture seule · Projet partage publiquement ·
                <a href="/" style="color:white;text-decoration:underline">Retour a Corvio Space</a>
            </div>
            <div style="padding:2rem;max-width:1200px;margin:0 auto;color:white">
                <h1 style="margin-bottom:0.5rem">${esc(project.name)}</h1>
                <p style="color:#BDCCC6;margin-bottom:2rem">${esc(project.description || '')}</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem">
                    ${['todo', 'inprogress', 'review', 'done'].map(status => `
                        <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:1rem">
                            <h3 style="margin-bottom:0.75rem;font-size:0.9rem;text-transform:uppercase;color:#D6C28B">
                                ${status === 'todo' ? 'À faire' : status === 'inprogress' ? 'En cours' : status === 'review' ? 'En revue' : 'Terminé'}
                                (${tasks.filter(t => t.status === status).length})
                            </h3>
                            ${tasks.filter(t => t.status === status).map(t => `
                                <div style="background:rgba(255,255,255,0.06);padding:0.75rem;border-radius:8px;margin-bottom:0.5rem">
                                    <strong>${esc(t.title)}</strong>
                                    ${t.description ? `<p style="font-size:0.8rem;color:#BDCCC6;margin-top:4px">${esc(t.description)}</p>` : ''}
                                </div>
                            `).join('') || '<p style="color:#708C83;font-size:0.85rem">Vide</p>'}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.style.background = '#283533';
        document.body.style.fontFamily = 'Inter, sans-serif';
    } catch (e) {
        console.error(e);
        document.body.style.background = '#283533';
        document.body.innerHTML = '<div style="padding:2rem;color:white;text-align:center"><h1>Erreur</h1><p>Impossible de charger ce projet partage.</p></div>';
    }
}

el.shareProjectBtn?.addEventListener('click', sharePublicLink);

// ==========================================
// PRESENCE (live avatars of others viewing the same project)
// ==========================================

export async function updatePresence(projectId) {
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

export function listenToPresence(projectId) {
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
