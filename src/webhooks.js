// ==========================================
// Notifications externes (Discord + Telegram)
// ==========================================
import { state } from './core/state.js';

export function statusLabel(s) {
    return ({ todo: 'À faire', inprogress: 'En cours', review: 'En revue', done: 'Terminé' })[s] || s;
}

export async function notifyTaskEvent(event, task, extra = {}) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) return;
    if (!project.webhook && !(project.telegramToken && project.telegramChatId)) return;

    const userName = state.userProfile?.displayName || state.currentUser?.email?.split('@')[0] || 'Quelqu\'un';
    const taskTitle = task?.title || 'sans titre';
    const projectName = project.name || 'Projet';

    // Discord embed config — couleurs alignees sur la palette HF Growth OS
    // (l'API Discord attend des entiers, pas des variables CSS).
    let embedTitle, color, mdText;

    if (event === 'create') {
        embedTitle = '🆕 Nouvelle tâche';
        color = 0x46615C;
        mdText = `🆕 *Nouvelle tâche*\n\n📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    } else if (event === 'move') {
        const from = statusLabel(extra._from);
        const to = statusLabel(extra._to);
        const arrow = extra._to === 'done' ? '✅' : '↗️';
        embedTitle = `${arrow} ${from} → ${to}`;
        color = extra._to === 'done' ? 0x10b981 : 0xB09964;
        mdText = `${arrow} *Statut change*\n\n📋 *${taskTitle}*\n${from} → *${to}*\n👤 ${userName}\n📁 ${projectName}`;
    } else if (event === 'complete') {
        embedTitle = '✅ Tâche terminée';
        color = 0x10b981;
        mdText = `✅ *Tâche terminée*\n\n📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    } else if (event === 'delete') {
        embedTitle = '🗑 Tâche supprimee';
        color = 0xE11D48;
        mdText = `🗑 *Tâche supprimee*\n\n📋 *${taskTitle}*\n👤 ${userName}\n📁 ${projectName}`;
    } else {
        embedTitle = event;
        color = 0x46615C;
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
export const sendDiscordWebhook = (event, task) => notifyTaskEvent(event, task);
