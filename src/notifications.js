// ==========================================
// NOTIFICATIONS + @MENTIONS
// ==========================================
import { collection, doc, updateDoc, query, where, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $, el } from './core/dom.js';
import { esc, toast, timeAgo } from './core/utils.js';
import { icone } from './core/icones.js';

// Icone par type de notification, tiree du jeu SVG maison. Remplace trois
// emojis (rendus differemment selon l'OS, annonces en toutes lettres par les
// lecteurs d'ecran) et fige la classe CSS a une valeur connue : `n.type` vient
// de Firestore, l'injecter brut dans un attribut `class` ouvrait un XSS stocke.
const TYPE_NOTIF = {
    invite: { classe: 'invite', icone: 'equipe' },
    assign: { classe: 'assign', icone: 'liste' },
    mention: { classe: 'mention', icone: 'bulle' }
};
function descripteurNotif(type) {
    return TYPE_NOTIF[type] || { classe: 'autre', icone: 'bulle' };
}

export function renderNotifications() {
    const unread = state.notifications.filter(n => !n.read).length;

    if (el.notificationBadge) {
        el.notificationBadge.textContent = unread;
        el.notificationBadge.style.display = unread ? 'flex' : 'none';
    }

    if (!el.notificationsList) return;

    el.notificationsList.innerHTML = state.notifications.length ? state.notifications.map(n => {
        const d = descripteurNotif(n.type);
        return `
        <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}">
            <div class="notification-icon ${d.classe}">
                ${icone(d.icone, { taille: 15 })}
            </div>
            <div class="notification-content">
                <div class="notification-text">${esc(n.message)}</div>
                <div class="notification-time">${timeAgo(n.createdAt)}</div>
            </div>
        </div>`;
    }).join('') : '<div class="notifications-empty">Aucune notification.</div>';

    el.notificationsList.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => markNotificationRead(item.dataset.id));
    });
}

export async function markNotificationRead(id) {
    await updateDoc(doc(db, 'notifications', id), { read: true });
}

export async function markAllNotificationsRead() {
    const unread = state.notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true })));
    toast('Toutes les notifications sont marquées comme lues.', 'info');
}

// ---------- @Mentions in comments ----------
// Parse @pseudo#1234 and @pseudo (project member) into mention objects.
export function parseMentions(text) {
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

export async function resolveMentions(mentions) {
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

export function renderMentionsInText(text) {
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

// ---- Wiring ----
el.notificationsBtn?.addEventListener('click', () => {
    el.notificationsPanel?.classList.toggle('open');
});
el.markAllRead?.addEventListener('click', markAllNotificationsRead);
