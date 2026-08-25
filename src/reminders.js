// ==========================================
// REMINDERS
// ==========================================
import { state } from './core/state.js';
import { parseDeadline } from './core/utils.js';

// checkReminders() est rappele a CHAQUE connexion (onAuthStateChanged, auth.js).
// Sans un identifiant conserve et une garde, chaque reconnexion empilait un
// nouvel intervalle, et celui de la session precedente continuait de tourner
// apres la deconnexion — sur un etat perime, en doublant les notifications.
let _intervalId = null;

export function checkReminders() {
    stopReminders();
    if (!state.settings.notifications) return;

    _intervalId = setInterval(() => {
        const now = new Date();

        state.tasks.forEach(task => {
            if (!task.dueDate || task.status === 'done') return;

            // parseDeadline, jamais `new Date(task.dueDate)` : une echeance
            // "AAAA-MM-JJ" doit etre lue comme la FIN de la journee LOCALE.
            // `new Date("2026-07-23")` vaut minuit UTC — le rappel se declenchait
            // alors ~22 h trop tot, en pleine nuit, et tombait parfois le mauvais
            // jour a l'ouest de Greenwich.
            const dueDate = parseDeadline(task.dueDate);
            if (!dueDate) return;
            const diff = dueDate - now;

            // Notifier une heure avant l'echeance
            if (diff > 0 && diff <= 60 * 60 * 1000 && diff > 59 * 60 * 1000) {
                showBrowserNotification(`Rappel : « ${task.title} »`, 'Échéance dans une heure.');
            }

            // Notifier au passage en retard
            if (diff < 0 && diff > -60 * 1000) {
                showBrowserNotification(`En retard : « ${task.title} »`, 'Cette tâche a dépassé son échéance.');
            }
        });
    }, 60000);
}

/** Arrete la surveillance des rappels. Appele au logout (auth.js cleanup). */
export function stopReminders() {
    if (_intervalId) {
        clearInterval(_intervalId);
        _intervalId = null;
    }
}

export function showBrowserNotification(title, body) {
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
