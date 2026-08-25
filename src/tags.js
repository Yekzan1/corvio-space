// ==========================================
// TAGS
// ==========================================
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $, $$, el } from './core/dom.js';
import { esc, toast, validators, handleError } from './core/utils.js';
import { openModal, closeModal } from './core/modal.js';
import { confirmDialog } from './core/confirm.js';
import { membershipFields } from './core/membership.js';
import { filtreAppartenance } from './core/requetes.js';
import { couleurSure, couleurTexteTag } from './core/couleurs.js';
import { renderTasks } from './tasks.js';
import { renderFilterTags } from './views.js';

export function listenToTags(projectId) {
    if (state.unsubscribers.tagListener) {
        state.unsubscribers.tagListener();
    }

    if (!projectId) return;

    const q = query(
        collection(db, 'tags'),
        ...filtreAppartenance(state.currentUser?.uid),
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

export function renderTags() {
    if (!el.tagsList) return;

    el.tagsList.innerHTML = state.tags.map(t => {
        const count = state.tasks.filter(task => task.tags?.includes(t.id)).length;
        return `
            <div class="tag-item" data-id="${esc(t.id)}">
                <span class="tag-dot" style="background:${couleurSure(t.color)}"></span>
                <span class="tag-item-name">${esc(t.name)}</span>
                <span class="tag-item-count">${count}</span>
                <button class="tag-delete" data-id="${esc(t.id)}">
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

export function renderTagsSelector() {
    if (!el.tagsSelector) return;

    el.tagsSelector.innerHTML = state.tags.map(t => `
        <label class="tag-checkbox">
            <input type="checkbox" value="${esc(t.id)}">
            <span class="tag-chip" style="background:${couleurSure(t.color)}20;color:${couleurTexteTag(t.color)}">
                <span class="tag-chip-dot" style="background:${couleurSure(t.color)}"></span>${esc(t.name)}
            </span>
        </label>
    `).join('') || '<span class="hint-inline">Créez des tags avec <kbd>T</kbd></span>';
}

export async function createTag(name, color) {
    if (!validators.tagName(name)) {
        toast('Le nom du tag doit faire entre 1 et 20 caractères.', 'error');
        return;
    }

    await addDoc(collection(db, 'tags'), {
        name: name.trim(),
        color,
        projectId: state.currentProjectId,
        ...membershipFields(state.projects.find(p => p.id === state.currentProjectId), state.currentUser.uid),
        createdAt: new Date().toISOString()
    });

    toast('Tag créé', 'success');
}

export async function deleteTag(id) {
    if (!await confirmDialog({
        titre: 'Supprimer le tag',
        message: 'Le tag sera retire de toutes les tâches qui le portent.',
        valider: 'Supprimer', danger: true,
    })) return;
    await deleteDoc(doc(db, 'tags', id));
    toast('Tag supprimé.', 'info');
}

export function openTagModal() {
    if (!state.currentProjectId) {
        toast('Créez d\'abord un projet.', 'info');
        return;
    }
    if (el.tagName) el.tagName.value = '';
    $$('.tag-color').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal(el.tagModal);
    el.tagName?.focus();
}

// ---- Wiring ----
el.addTagBtn?.addEventListener('click', openTagModal);

el.tagForm?.addEventListener('submit', async e => {
    e.preventDefault();
    // Repli aligne sur la premiere pastille du selecteur (sauge), pas sur un
    // rouge vif etranger a la palette.
    const color = document.querySelector('.tag-color.active')?.dataset.color || '#46615C';
    const name = el.tagName?.value.trim();

    if (name) {
        await createTag(name, color);
        closeModal(el.tagModal);
    }
});

$$('.tag-color').forEach(b => {
    b.addEventListener('click', () => {
        $$('.tag-color').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
    });
});
