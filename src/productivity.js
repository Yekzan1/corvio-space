// ==========================================
// GAMIFICATION + ACTIVITY HISTORY + STREAK + WEEKLY SUMMARY + CONFETTI
// ==========================================
// Le minuteur Pomodoro a ete retire le 23/07/2026 : personne ne s'en servait.
// DEUX choses le concernant sont volontairement conservees, et il ne faut pas
// les supprimer « pour finir le nettoyage » :
//   - les badges `pomodoro-5` et `pomodoro-25` restent declares. Leurs
//     identifiants sont PERSISTES chez les utilisateurs qui les ont gagnes ;
//     retirer la definition ferait disparaitre un badge deja obtenu de leur
//     profil. Ils ne sont simplement plus attribuables.
//   - le libelle et l'icone d'activite `pomodoro` restent, pour que
//     l'historique deja ecrit continue de s'afficher en toutes lettres au lieu
//     de lignes vides.
// Meme raisonnement que pour les series : une donnee ecrite ne se supprime pas
// en meme temps que la fonctionnalite qui l'a produite.
import { collection, addDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $ } from './core/dom.js';
import { esc, toast, timeAgo, toLocalISODate } from './core/utils.js';
import { openModal } from './core/modal.js';
import { icone } from './core/icones.js';
import { showBrowserNotification } from './reminders.js';

// ==========================================
// GAMIFICATION
// ==========================================

export const gamification = {
    points: 0,
    level: 1,
    streak: 0,
    lastActiveDate: null,
    badges: [],
    achievements: {
        // `icon` porte desormais une CLE du jeu d'icones (core/icones.js) et
        // non plus un emoji : la valeur est resolue au rendu. Les CLES du
        // catalogue ('streak-3'...) sont persistees dans le profil des
        // utilisateurs — elles ne doivent jamais changer.
        'first-task': { name: 'Première tâche', desc: 'Créer votre première tâche', icon: 'cible', points: 10 },
        'task-master': { name: 'Rythme de croisière', desc: 'Terminer 10 tâches', icon: 'cocheCercle', points: 50 },
        'centurion': { name: 'Centurion', desc: 'Terminer 100 tâches', icon: 'medaille', points: 200 },
        'streak-3': { name: 'Trois jours de suite', desc: '3 jours consécutifs', icon: 'flamme', points: 30 },
        'streak-7': { name: 'Semaine complète', desc: '7 jours consécutifs', icon: 'eclair', points: 70 },
        'streak-30': { name: 'Trente jours', desc: '30 jours consécutifs', icon: 'couronne', points: 300 },
        'early-bird': { name: 'Lève-tôt', desc: 'Terminer une tâche avant 8 h', icon: 'leverSoleil', points: 20 },
        'night-owl': { name: 'Travail de nuit', desc: 'Terminer une tâche après 22 h', icon: 'lune', points: 20 },
        'speed-demon': { name: 'Cadence soutenue', desc: 'Terminer 5 tâches en une heure', icon: 'compteur', points: 40 },
        'pomodoro-5': { name: 'Cinq sessions', desc: 'Terminer 5 sessions Pomodoro', icon: 'minuteur', points: 50 },
        'pomodoro-25': { name: 'Concentration', desc: 'Terminer 25 sessions Pomodoro', icon: 'concentration', points: 150 },
        'team-player': { name: 'Travail à plusieurs', desc: 'Inviter 3 membres', icon: 'equipe', points: 30 },
        'organizer': { name: 'Bien rangé', desc: 'Créer 5 projets', icon: 'dossier', points: 40 }
    }
};

// Ce qui appartient a l'utilisateur et doit etre conserve. `achievements` en
// est volontairement absent : c'est le CATALOGUE des badges, une donnee de
// definition, pas un etat.
const CHAMPS_PERSISTES = ['points', 'level', 'streak', 'lastActiveDate', 'badges'];

export function initGamification() {
    try {
        const saved = localStorage.getItem('corviospace-gamification');
        if (saved) {
            const data = JSON.parse(saved);
            // Restauration champ par champ, et non Object.assign(gamification,
            // data). L'ancienne version reinjectait tout l'objet stocke, donc
            // aussi `achievements` : le catalogue fige au jour de la derniere
            // sauvegarde ecrasait celui du code. Un badge ajoute dans une
            // nouvelle version n'apparaissait jamais chez les utilisateurs
            // existants, et un `achievements` absent ou corrompu faisait
            // planter le tableau de bord (Object.keys sur null).
            if (data && typeof data === 'object') {
                for (const champ of CHAMPS_PERSISTES) {
                    if (data[champ] !== undefined && data[champ] !== null) {
                        gamification[champ] = data[champ];
                    }
                }
                if (!Array.isArray(gamification.badges)) gamification.badges = [];
            }
        }
    } catch (e) {
        // Entree illisible : on repart des valeurs par defaut plutot que
        // d'empecher toute l'application de demarrer.
        console.warn('gamification illisible dans localStorage, valeurs par defaut', e);
    }

    checkStreak();
    renderGamificationWidget();
}

export function addGamificationPoints(points, reason) {
    gamification.points += points;

    const oldLevel = gamification.level;
    gamification.level = Math.floor(gamification.points / 100) + 1;

    if (gamification.level > oldLevel) {
        toast(`Niveau ${gamification.level} atteint.`, 'success');
        showBrowserNotification('Level Up !', `Vous etes maintenant niveau ${gamification.level}`);
    }

    saveGamification();
    renderGamificationWidget();

    // Show floating points
    showFloatingPoints(points);
}

function showFloatingPoints(points) {
    const el = document.createElement('div');
    el.className = 'floating-points';
    el.textContent = `+${points}`;
    document.body.appendChild(el);

    setTimeout(() => el.classList.add('animate'), 10);
    setTimeout(() => el.remove(), 1500);
}

function checkStreak() {
    const today = toLocalISODate();

    if (gamification.lastActiveDate) {
        const lastDate = new Date(gamification.lastActiveDate);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
            gamification.streak++;
            checkStreakBadges();
        } else if (diffDays > 1) {
            gamification.streak = 1;
        }
    } else {
        gamification.streak = 1;
    }

    gamification.lastActiveDate = today;
    saveGamification();
}

function checkStreakBadges() {
    if (gamification.streak >= 3 && !gamification.badges.includes('streak-3')) {
        unlockBadge('streak-3');
    }
    if (gamification.streak >= 7 && !gamification.badges.includes('streak-7')) {
        unlockBadge('streak-7');
    }
    if (gamification.streak >= 30 && !gamification.badges.includes('streak-30')) {
        unlockBadge('streak-30');
    }
}

function unlockBadge(badgeId) {
    if (gamification.badges.includes(badgeId)) return;

    const badge = gamification.achievements[badgeId];
    if (!badge) return;

    gamification.badges.push(badgeId);
    gamification.points += badge.points;

    // toast() echappe son message : y glisser du balisage l'afficherait tel
    // quel. Le nom du badge suffit.
    toast(`Badge débloqué : ${badge.name} (+${badge.points} points)`, 'success');
    showBrowserNotification('Nouveau badge', badge.name);

    saveGamification();
    renderGamificationWidget();
}

export function checkTaskCompletionBadges() {
    const completedCount = state.tasks.filter(t => t.status === 'done').length + state.archivedTasks.length;

    if (completedCount >= 1 && !gamification.badges.includes('first-task')) {
        unlockBadge('first-task');
    }
    if (completedCount >= 10 && !gamification.badges.includes('task-master')) {
        unlockBadge('task-master');
    }
    if (completedCount >= 100 && !gamification.badges.includes('centurion')) {
        unlockBadge('centurion');
    }

    // Time-based badges
    const hour = new Date().getHours();
    if (hour < 8 && !gamification.badges.includes('early-bird')) {
        unlockBadge('early-bird');
    }
    if (hour >= 22 && !gamification.badges.includes('night-owl')) {
        unlockBadge('night-owl');
    }
}

function saveGamification() {
    // On n'ecrit que l'etat de l'utilisateur. Serialiser tout l'objet stockait
    // aussi le catalogue des badges — une trentaine de lignes inutiles, et
    // surtout la cause du figement decrit dans initGamification().
    const aConserver = {};
    for (const champ of CHAMPS_PERSISTES) aConserver[champ] = gamification[champ];
    try {
        localStorage.setItem('corviospace-gamification', JSON.stringify(aConserver));
    } catch (e) {
        // Quota depasse ou stockage refuse (navigation privee sur iOS) : la
        // gamification est un bonus, elle ne doit rien interrompre.
        console.warn('gamification non sauvegardee', e);
    }
}

function renderGamificationWidget() {
    const widget = $('gamification-widget');
    if (!widget) return;

    const nextLevel = gamification.level * 100;
    const prevLevel = (gamification.level - 1) * 100;
    const progress = ((gamification.points - prevLevel) / (nextLevel - prevLevel)) * 100;

    widget.innerHTML = `
        <div class="gamification-header">
            <div class="gamification-level">
                <span class="level-badge">Niv. ${gamification.level}</span>
                <span class="level-points">${gamification.points} pts</span>
            </div>
            <div class="gamification-streak ${gamification.streak >= 3 ? 'hot' : ''}">
                ${icone('flamme', { taille: 14 })}
                <span>${gamification.streak}&nbsp;jour${gamification.streak > 1 ? 's' : ''}</span>
            </div>
        </div>
        <div class="gamification-progress">
            <div class="progress-bar-mini">
                <div class="progress-fill-mini" style="width: ${progress}%"></div>
            </div>
            <span class="progress-text">${gamification.points % 100}/${100} XP</span>
        </div>
        <div class="gamification-badges">
            ${gamification.badges.slice(-5).map(id => {
                const b = gamification.achievements[id];
                return `<span class="badge-icon" title="${esc(b.name)} — ${esc(b.desc)}">${icone(b.icon, { taille: 15 })}</span>`;
            }).join('')}
            ${gamification.badges.length > 5 ? `<span class="badge-more">+${gamification.badges.length - 5}</span>` : ''}
        </div>
    `;
}

export function openBadgesModal() {
    const modal = $('badges-modal');
    if (!modal) return;

    const content = $('badges-content');
    if (content) {
        content.innerHTML = `
            <div class="badges-stats">
                <div class="stat-box">
                    <span class="stat-value">${gamification.points}</span>
                    <span class="stat-label">Points</span>
                </div>
                <div class="stat-box">
                    <span class="stat-value">${gamification.level}</span>
                    <span class="stat-label">Niveau</span>
                </div>
                <div class="stat-box">
                    <span class="stat-value">${gamification.streak}</span>
                    <span class="stat-label">Jours</span>
                </div>
            </div>
            <div class="badges-grid">
                ${Object.entries(gamification.achievements).map(([id, badge]) => {
                    const unlocked = gamification.badges.includes(id);
                    return `
                        <div class="badge-card ${unlocked ? 'unlocked' : 'locked'}">
                            <span class="badge-icon-large">${icone(unlocked ? badge.icon : 'cadenas', { taille: 24 })}</span>
                            <span class="badge-name">${badge.name}</span>
                            <span class="badge-desc">${badge.desc}</span>
                            <span class="badge-points">+${badge.points} pts</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    openModal(modal);
}

// ==========================================
// ACTIVITY HISTORY
// ==========================================

const activityHistory = [];
const MAX_HISTORY = 100;

export function logActivity(type, data) {
    const activity = {
        id: Date.now(),
        type,
        data,
        userId: state.currentUser?.uid,
        userName: state.currentUser?.displayName || state.currentUser?.email?.split('@')[0],
        timestamp: new Date().toISOString()
    };

    activityHistory.unshift(activity);
    if (activityHistory.length > MAX_HISTORY) {
        activityHistory.pop();
    }

    renderActivityFeed();
    saveActivityToFirestore(activity);
}

async function saveActivityToFirestore(activity) {
    if (!state.currentProjectId || !state.currentUser) return;

    try {
        await addDoc(collection(db, 'activities'), {
            ...activity,
            projectId: state.currentProjectId
        });
    } catch (e) {
        console.error('Failed to save activity:', e);
    }
}

function renderActivityFeed() {
    const feed = $('activity-feed');
    if (!feed) return;

    feed.innerHTML = activityHistory.slice(0, 20).map(a => {
        const icon = getActivityIcon(a.type);
        const text = getActivityText(a);

        return `
            <div class="activity-item">
                <span class="activity-icon">${icon}</span>
                <div class="activity-content">
                    <span class="activity-text">${text}</span>
                    <span class="activity-time">${timeAgo(a.timestamp)}</span>
                </div>
            </div>
        `;
    }).join('') || '<div class="activity-empty">Aucune activité récente</div>';
}

function getActivityIcon(type) {
    const icons = {
        'task-create': 'coche',
        'task-complete': 'cocheCercle',
        'task-update': 'crayon',
        'task-delete': 'corbeille',
        'task-archive': 'archive',
        'comment-add': 'bulle',
        'project-create': 'dossier',
        'member-add': 'personnePlus',
        'tag-create': 'etiquette',
        'pomodoro': 'minuteur'
    };
    return icone(icons[type] || 'liste', { taille: 15 });
}

function getActivityText(activity) {
    const { type, data, userName } = activity;

    switch (type) {
        case 'task-create':
            return `<strong>${esc(userName)}</strong> a créé "${esc(data.title)}"`;
        case 'task-complete':
            return `<strong>${esc(userName)}</strong> a terminé "${esc(data.title)}"`;
        case 'task-update':
            return `<strong>${esc(userName)}</strong> a modifié "${esc(data.title)}"`;
        case 'task-delete':
            return `<strong>${esc(userName)}</strong> a supprimé "${esc(data.title)}"`;
        case 'task-archive':
            return `<strong>${esc(userName)}</strong> a archivé "${esc(data.title)}"`;
        case 'comment-add':
            return `<strong>${esc(userName)}</strong> a commenté "${esc(data.taskTitle)}"`;
        case 'project-create':
            return `<strong>${esc(userName)}</strong> a créé le projet "${esc(data.name)}"`;
        case 'member-add':
            return `<strong>${esc(userName)}</strong> a ajouté ${esc(data.memberEmail)}`;
        case 'tag-create':
            return `<strong>${esc(userName)}</strong> a créé le tag "${esc(data.name)}"`;
        case 'pomodoro':
            return `<strong>${esc(userName)}</strong> a terminé une session Pomodoro`;
        default:
            return `<strong>${esc(userName)}</strong> a effectue une action`;
    }
}

// ---------- Confetti ----------
export function fireConfetti() {
    const canvas = $('confetti-canvas');
    if (!canvas) return;
    canvas.classList.add('active');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    // Dessinees sur un <canvas>, ces couleurs ne peuvent pas passer par les
    // variables CSS : elles restent en dur. Alignees sur la palette
    // « pigments naturels » du selecteur de couleurs — la serie precedente
    // finissait sur un vert fluo, un ambre et un rose vif etrangers a
    // l'identite.
    const colors = ['#46615C', '#B09964', '#D6C28B', '#3F6B7D', '#A15C43', '#5F6B4A'];
    const particles = [];
    const N = 120;
    for (let i = 0; i < N; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 18,
            vy: Math.random() * -20 - 5,
            size: Math.random() * 6 + 4,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            vr: (Math.random() - 0.5) * 12,
            life: 1
        });
    }
    let frame = 0;
    function tick() {
        frame++;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = 0;
        particles.forEach(p => {
            if (p.life <= 0) return;
            alive++;
            p.vy += 0.5; // gravity
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.vr;
            p.life -= 0.012;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
            ctx.restore();
        });
        if (alive > 0 && frame < 200) {
            requestAnimationFrame(tick);
        } else {
            canvas.classList.remove('active');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    tick();
}

// ---------- Streak (consecutive active days) ----------
export function updateStreak() {
    const today = new Date().toDateString();
    const streakData = JSON.parse(localStorage.getItem('corviospace-streak') || '{}');
    if (streakData.lastDay === today) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = streakData.lastDay === yesterday.toDateString();

    streakData.streak = wasYesterday ? (streakData.streak || 0) + 1 : 1;
    streakData.lastDay = today;
    streakData.best = Math.max(streakData.best || 0, streakData.streak);
    localStorage.setItem('corviospace-streak', JSON.stringify(streakData));

    gamification.streak = streakData.streak;
    saveGamification();
    renderGamificationWidget();
}

// ---------- Weekly summary ----------
export function maybeShowWeeklySummary() {
    const today = new Date();
    if (today.getDay() !== 0) return; // sunday only
    const lastShown = localStorage.getItem('corviospace-weekly-shown');
    const todayKey = toLocalISODate(today);
    if (lastShown === todayKey) return;
    localStorage.setItem('corviospace-weekly-shown', todayKey);
    showWeeklySummary();
}

function showWeeklySummary() {
    const modal = $('weekly-modal');
    const content = $('weekly-content');
    if (!modal || !content) return;

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allTasks = [...state.tasks, ...state.archivedTasks, ...state.myTasks];
    const completedThisWeek = allTasks.filter(t => {
        if (t.status !== 'done') return false;
        const ts = t.completedAt || t.archivedAt || t.createdAt;
        return ts && new Date(ts).getTime() > oneWeekAgo;
    });
    const createdThisWeek = allTasks.filter(t => {
        return t.createdAt && new Date(t.createdAt).getTime() > oneWeekAgo;
    });
    const streakData = JSON.parse(localStorage.getItem('corviospace-streak') || '{}');

    const termine = completedThisWeek.length;
    const bilan = termine === 0
        ? 'Aucune tâche terminée cette semaine. Le compteur repart lundi.'
        : `${termine} tâche${termine > 1 ? 's' : ''} terminée${termine > 1 ? 's' : ''} sur les sept derniers jours.`;

    content.innerHTML = `
        <div class="resume-semaine">
            <p class="resume-semaine-intro">${bilan}</p>
            <div class="resume-semaine-grille">
                <div class="resume-semaine-carte">
                    <span class="resume-semaine-valeur">${termine}</span>
                    <span class="resume-semaine-libelle">terminées</span>
                </div>
                <div class="resume-semaine-carte">
                    <span class="resume-semaine-valeur">${createdThisWeek.length}</span>
                    <span class="resume-semaine-libelle">créées</span>
                </div>
                <div class="resume-semaine-carte">
                    <span class="resume-semaine-valeur">${streakData.streak || 0}</span>
                    <span class="resume-semaine-libelle">jours d'affilée</span>
                </div>
                <div class="resume-semaine-carte">
                    <span class="resume-semaine-valeur">${streakData.best || 0}</span>
                    <span class="resume-semaine-libelle">meilleure série</span>
                </div>
            </div>
        </div>
    `;
    openModal(modal);
}

// ---- Wiring ----
$('gamification-widget')?.addEventListener('click', openBadgesModal);
