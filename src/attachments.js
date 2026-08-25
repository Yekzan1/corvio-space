// ==========================================
// ATTACHMENTS (PDF, txt, images... stored as base64 in Firestore)
// ==========================================
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $ } from './core/dom.js';
import { confirmDialog } from './core/confirm.js';
import { membershipFields } from './core/membership.js';
import { filtreAppartenance } from './core/requetes.js';
import { esc, toast, handleError } from './core/utils.js';
import { icone } from './core/icones.js';
import { canCreateOrEditTasks } from './core/roles.js';

const MAX_ATTACHMENT_SIZE = 700 * 1024; // 700 KB raw (under 1MB Firestore limit after base64)
let _currentTaskAttachments = [];
let _attachmentsUnsub = null;

export function listenToTaskAttachments(taskId) {
    if (_attachmentsUnsub) { _attachmentsUnsub(); _attachmentsUnsub = null; }
    _currentTaskAttachments = [];
    if (!taskId) { renderAttachmentsList(); return; }

    try {
        const q = query(
            collection(db, 'attachments'),
            ...filtreAppartenance(state.currentUser?.uid),
            where('taskId', '==', taskId),
        );
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

/** Renvoie la CLE d'icone correspondant a un type MIME. */
export function fileIconName(type = '') {
    if (type.startsWith('image/')) return 'image';
    if (type === 'application/pdf') return 'fichierPdf';
    if (type.startsWith('text/')) return 'fichierTexte';
    if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return 'fichierArchive';
    if (type.includes('word')) return 'fichierTexte';
    if (type.includes('sheet') || type.includes('excel')) return 'fichierTableur';
    if (type.includes('audio')) return 'fichierAudio';
    if (type.includes('video')) return 'fichierVideo';
    return 'trombone';
}

export function fileIcon(type = '') {
    return icone(fileIconName(type), { taille: 18 });
}

export function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(2) + ' Mo';
}

export function renderAttachmentsList() {
    const container = $('attachments-list');
    if (!container) return;

    if (!_currentTaskAttachments.length) {
        container.innerHTML = '<div class="attachments-empty">Aucune pièce jointe</div>';
        return;
    }

    container.innerHTML = _currentTaskAttachments.map(a => `
        <div class="attachment-item" data-id="${esc(a.id)}">
            <span class="attachment-icon">${fileIcon(a.type)}</span>
            <div class="attachment-info">
                <span class="attachment-name" title="${esc(a.name)}">${esc(a.name)}</span>
                <span class="attachment-meta">${formatFileSize(a.size)} ${a.type ? '· ' + esc(a.type) : ''}</span>
            </div>
            <button type="button" class="btn-icon attachment-download" data-id="${esc(a.id)}" title="Télécharger" aria-label="Télécharger ${esc(a.name)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </button>
            <button type="button" class="btn-icon attachment-delete" data-id="${esc(a.id)}" title="Supprimer">
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
        btn.addEventListener('click', async () => {
            if (await confirmDialog({
                titre: 'Supprimer la pièce jointe',
                message: 'Ce fichier sera définitivement retiré de la tâche.',
                valider: 'Supprimer', danger: true,
            })) deleteAttachment(btn.dataset.id);
        });
    });
}

export function downloadAttachment(att) {
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

export async function deleteAttachment(id) {
    try {
        await deleteDoc(doc(db, 'attachments', id));
        toast('Pièce jointe supprimée.', 'info');
    } catch (e) {
        handleError(e, 'deleteAttachment');
    }
}

export function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
    });
}

export async function uploadAttachmentForCurrentTask(file) {
    if (!file) return;
    if (!state.editingTaskId) {
        toast('Enregistrez d\'abord la tâche : les pièces jointes s\'y rattachent une fois qu\'elle existe.', 'error');
        return;
    }
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Vous êtes en lecture seule sur ce projet.', 'error');
        return;
    }
    if (file.size > MAX_ATTACHMENT_SIZE) {
        toast(`Ce fichier dépasse la taille maximale de ${formatFileSize(MAX_ATTACHMENT_SIZE)}. Compressez-le, ou partagez-en un lien.`, 'error');
        return;
    }

    try {
        const dataUrl = await readFileAsDataURL(file);
        await addDoc(collection(db, 'attachments'), {
            taskId: state.editingTaskId,
            projectId: state.currentProjectId,
            // Comme pour les taches : sans ce champ, la regle `list` ne peut
            // pas etre resserree. C'est la collection la plus sensible du lot,
            // elle porte les fichiers eux-memes.
            ...membershipFields(state.projects.find(p => p.id === state.currentProjectId), state.currentUser.uid),
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: dataUrl,
            uploadedBy: state.currentUser.uid,
            uploadedAt: new Date().toISOString()
        });
        toast('Pièce jointe ajoutée.', 'success');
    } catch (e) {
        handleError(e, 'uploadAttachment');
    }
}

// ---- Wiring (originally in the top-level EVENT LISTENERS section) ----
$('attachment-pick-btn')?.addEventListener('click', () => $('attachment-input')?.click());
$('attachment-input')?.addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await uploadAttachmentForCurrentTask(f);
    e.target.value = ''; // reset so re-uploading same file fires change
});

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
