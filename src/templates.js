// ==========================================
// TEMPLATES
// ==========================================
import { collection, addDoc, deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $ } from './core/dom.js';
import { esc, toast, handleError } from './core/utils.js';
import { canCreateOrEditTasks } from './core/roles.js';
import { membershipFields } from './core/membership.js';
import { confirmDialog, promptDialog } from './core/confirm.js';
import { openModal, closeModal } from './core/modal.js';
import { couleurSure } from './core/couleurs.js';

export async function saveAsTemplate(project) {
    const templateName = await promptDialog({
        titre: 'Enregistrer ce projet comme modèle',
        message: 'Les tâches et les tags de ce projet seront réutilisables sur un nouveau projet.',
        label: 'Nom du modèle',
        valeur: project.name + ' — modèle',
        valider: 'Enregistrer',
    });
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
            subtasks: (t.subtasks || []).map(s => ({ text: s.text, completed: false })),
            tags: t.tags || []
        })),
        tags: state.tags.map(t => ({
            name: t.name,
            color: t.color
        })),
        createdAt: new Date().toISOString()
    });

    toast('Modèle enregistré.', 'success');
}

/**
 * `projet` est explicite parce que ce sont les toutes premieres taches d'un
 * projet qui vient d'etre cree : `state.projects` ne le contient pas encore
 * (le onSnapshot n'a pas repondu). Sans lui, les taches naitraient avec un
 * `memberIds` vide, donc invisibles a leur propre proprietaire une fois les
 * regles resserrees.
 */
export async function createTasksFromTemplate(projectId, template, projet = null) {
    const projetSource = projet || state.projects.find(p => p.id === projectId);
    // Create tags first
    const tagMap = {};
    for (const tagData of template.tags || []) {
        const tagRef = await addDoc(collection(db, 'tags'), {
            name: tagData.name,
            color: tagData.color,
            projectId,
            ...membershipFields(projetSource, state.currentUser.uid),
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
            ...membershipFields(projetSource, state.currentUser.uid),
            createdBy: state.currentUser.uid,
            createdAt: new Date().toISOString(),
            archived: false,
            timeSpent: 0,
            recurrence: 'none'
        });
    }
}

export function renderTemplatesList() {
    const container = $('templates-list');
    if (!container) return;

    if (!state.templates.length) {
        container.innerHTML = '<div class="templates-empty">'
            + '<p>Aucun modèle enregistré.</p>'
            + '<p>Un modèle vous évite de ressaisir une tâche ou une structure de projet qui revient souvent. '
            + 'Pour en créer un : ouvrez une tâche et utilisez « Modèle », ou enregistrez le projet entier depuis la barre latérale.</p>'
            + '</div>';
        return;
    }

    container.innerHTML = state.templates.map(t => `
        <div class="template-item" data-id="${esc(t.id)}">
            <div class="template-color" style="background:${couleurSure(t.color)}"></div>
            <div class="template-info">
                <span class="template-name">${esc(t.name)}</span>
                <span class="template-tasks">${t.tasks?.length || 0} tâche(s)${t.description ? ' - ' + esc(t.description) : ''}</span>
            </div>
            <button class="btn-primary template-use" data-id="${esc(t.id)}">Utiliser</button>
            <button class="btn-icon template-delete" data-id="${esc(t.id)}" title="Supprimer">
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
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const tpl = state.templates.find(t => t.id === id);
            if (!await confirmDialog({
                titre: 'Supprimer ce modèle ?',
                message: tpl?.name
                    ? `« ${tpl.name} » sera supprimé. Les projets déjà créés à partir de ce modèle ne changent pas.`
                    : 'Ce modèle sera supprimé. Les projets déjà créés à partir de lui ne changent pas.',
                valider: 'Supprimer',
                danger: true,
            })) return;
            deleteTemplate(id);
        });
    });
}

export async function deleteTemplate(id) {
    try {
        await deleteDoc(doc(db, 'templates', id));
        toast('Modèle supprimé.', 'info');
    } catch (e) {
        handleError(e, 'deleteTemplate');
    }
}

export async function useTemplate(template) {
    if (!state.currentProjectId) {
        toast('Sélectionnez d\'abord un projet.', 'error');
        return;
    }
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Vous êtes en lecture seule sur ce projet.', 'error');
        return;
    }
    const count = template.tasks?.length || 0;
    if (!count) { toast('Ce modèle ne contient aucune tâche.', 'info'); return; }
    const projetCourant = state.projects.find(p => p.id === state.currentProjectId);
    if (!await confirmDialog({
        titre: count > 1 ? `Ajouter ${count} tâches ?` : 'Ajouter 1 tâche ?',
        message: `Les tâches du modèle « ${template.name} » seront ajoutées ${projetCourant?.name ? `au projet « ${projetCourant.name} »` : 'au projet ouvert'}. Les tâches existantes ne changent pas.`,
        valider: 'Ajouter',
    })) return;

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
            ...membershipFields(state.projects.find(p => p.id === state.currentProjectId), state.currentUser.uid),
            createdBy: state.currentUser.uid,
            createdAt: new Date().toISOString(),
            archived: false,
            timeSpent: 0,
            recurrence: 'none'
        });
    }
    toast(`${count} tâche${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''} depuis le modèle.`, 'success');
    closeModal($('templates-modal'));
}

export async function saveTaskAsTemplate(task) {
    if (!task) return;
    const templateName = await promptDialog({
        titre: 'Enregistrer la tâche comme modèle',
        message: 'Le titre, la description, la priorité et les sous-tâches seront réutilisables.',
        label: 'Nom du modèle',
        valeur: task.title,
        valider: 'Enregistrer',
    });
    if (!templateName) return;

    try {
        await addDoc(collection(db, 'templates'), {
            name: templateName.trim(),
            description: 'Modèle d\'une tâche',
            color: '#46615C',
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
        toast('Tâche enregistrée comme modèle.', 'success');
    } catch (e) {
        handleError(e, 'saveTaskAsTemplate');
    }
}

// ---- Wiring ----
$('save-template-btn')?.addEventListener('click', () => {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (project) saveAsTemplate(project);
    else toast('Ouvrez d\'abord un projet.', 'error');
});

$('browse-templates-btn')?.addEventListener('click', () => {
    renderTemplatesList();
    openModal($('templates-modal'));
});
