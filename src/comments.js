// ==========================================
// COMMENTS
// ==========================================
import { doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { el } from './core/dom.js';
import { esc, timeAgo } from './core/utils.js';
import { avatarColor } from './core/utils.js';
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { parseMentions, resolveMentions, renderMentionsInText } from './notifications.js';

export function renderComments(task) {
    if (!el.commentsList) return;

    const comments = task.comments || [];

    el.commentsList.innerHTML = comments.map(c => {
        const author = state.projectMembers.find(m => m.uid === c.authorId) || { displayName: 'Utilisateur', uid: c.authorId };
        return `
            <div class="comment-item">
                <div class="comment-avatar" style="background:${avatarColor(c.authorId)}">${esc((author.displayName || 'U').charAt(0).toUpperCase())}</div>
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${esc(author.displayName || 'Utilisateur')}</span>
                        <span class="comment-time">${timeAgo(c.createdAt)}</span>
                    </div>
                    <div class="comment-text">${renderMentionsInText(c.text)}</div>
                </div>
            </div>
        `;
    }).join('') || '<div style="color:var(--text-muted);padding:0.5rem;text-align:center">Aucun commentaire</div>';
}

export async function addComment(taskId, text) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Les deux appelants actuels (src/tasks.js) filtrent deja le vide, mais la
    // fonction est exportee : sans cette garde, un commentaire vide serait
    // ecrit sur la tache ET declencherait une notification chez le createur,
    // la personne assignee et tous les abonnes. Le vide ne se retire pas.
    const propre = typeof text === 'string' ? text.trim() : '';
    if (!propre) return;

    const comments = task.comments || [];
    const comment = {
        authorId: state.currentUser.uid,
        text: propre,
        createdAt: new Date().toISOString()
    };

    comments.push(comment);
    await updateDoc(doc(db, 'tasks', taskId), { comments });

    // Notify task creator, assignee, and watchers
    const toNotify = new Set([task.createdBy, task.assigneeId, ...(task.watchers || [])]
        .filter(x => x && x !== state.currentUser.uid));

    // Add @mentioned users (resolved against Firestore)
    const mentions = await resolveMentions(parseMentions(propre));
    mentions.forEach(m => { if (m.uid && m.uid !== state.currentUser.uid) toNotify.add(m.uid); });

    const authorName = state.userProfile?.displayName || state.currentUser.email.split('@')[0];

    for (const userId of toNotify) {
        const isMention = mentions.some(m => m.uid === userId);
        await addDoc(collection(db, 'notifications'), {
            userId,
            type: isMention ? 'mention' : 'comment',
            message: isMention
                ? `${authorName} vous a mentionné dans « ${task.title} »`
                : `${authorName} a commenté « ${task.title} »`,
            projectId: state.currentProjectId,
            taskId,
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    renderComments({ ...task, comments });
    if (el.commentInput) el.commentInput.value = '';
}
