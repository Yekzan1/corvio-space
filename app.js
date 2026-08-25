// ==========================================
// TASKFLOW PRO - Ultimate Task Management
// Entry point — imports every feature module in the same relative order as
// the original monolithic app.js, then runs the handful of one-off init
// calls that used to live in scattered `DOMContentLoaded` blocks.
//
// See CONTRIBUTING.md / src/*.js for the module layout. `state` (src/core/state.js)
// stays a plain module-scoped object — never attach it to `window`.
// ==========================================
import { state } from './src/core/state.js';

// Firebase auth/session lifecycle — also transitively loads every feature
// module below (auth.js imports listeners/projects/tasks/... which import
// each other), so this ordering mostly documents intent rather than
// controlling execution: ES modules only evaluate once, the first time
// they're imported.
import './src/auth.js';
import './src/projects.js';
import './src/tags.js';
import './src/tasks.js';
import './src/attachments.js';
import './src/templates.js';
import './src/comments.js';
import './src/notifications.js';
import './src/webhooks.js';
import './src/views.js';
import './src/productivity.js';
import './src/mobile.js';
import './src/ui.js';
import './src/exportImport.js';
import './src/reminders.js';
import './src/serviceWorker.js';

import { surveillerReseau } from './src/core/reseau.js';
import { initAssistant, signalerAssistant } from './src/assistant.js';
import { initPleinEcran } from './src/pleinEcran.js';
import { initPlateauMobile } from './src/plateauMobile.js';
import { initGamification, updateStreak, maybeShowWeeklySummary } from './src/productivity.js';
import { initGestesTactiles } from './src/mobile.js';
import { autoArchiveOldDoneTasks } from './src/tasks.js';
import { loadPublicProject } from './src/projects.js';

// ---- Public share link bootstrap (?share=<id>, works without login) ----
const shareId = new URLSearchParams(location.search).get('share');
if (shareId) loadPublicProject(shareId);

// ---- One-off init calls (previously scattered across DOMContentLoaded blocks) ----
// Avant le reste : si l'application demarre deja hors ligne, il faut le dire
// tout de suite plutot qu'apres l'echec silencieux du premier chargement.
surveillerReseau();
initGamification();
initAssistant();
signalerAssistant();
initPleinEcran();
// Le plateau empilé et repliable du téléphone. Sans effet au-dessus de 900px.
initPlateauMobile();

// Plus de theme a restaurer : l'identite HF Growth OS est la seule. Le nettoyage
// de l'ancienne cle localStorage se fait dans initializeTheme() (src/ui.js),
// appele depuis le cycle d'auth.

if (state.settings.compactMode) document.body.classList.add('compact-mode');

// Les trois gestes du telephone, poses ensemble. Ils l'etaient auparavant a
// deux endroits, dont un seul derriere `'ontouchstart' in window` : le
// glissement partait donc sur tous les appareils, l'appui long non. La
// condition tombe — un poste de bureau n'emet aucun `touchstart`, l'ecouteur
// n'y coute rien, et un ecran tactile de portable a droit aux memes gestes.
initGestesTactiles();

setTimeout(autoArchiveOldDoneTasks, 5000);
setInterval(autoArchiveOldDoneTasks, 30 * 60 * 1000); // every 30min

setTimeout(updateStreak, 2000);
setTimeout(maybeShowWeeklySummary, 3000);
