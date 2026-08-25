// ==========================================
// MOBILE: nav, swipe, long-press, pull-to-refresh, install promo, sounds, vibration
// ==========================================
import { state, isGlobalAdmin } from './core/state.js';
import { $, $$, el } from './core/dom.js';
import { confirmDialog } from './core/confirm.js';
import { toast } from './core/utils.js';
import { openModal, closeModal } from './core/modal.js';
import { switchView, updateViewBadges } from './views.js';
import { archiveTask, updateTask, openTaskModal, showContextMenu, renderTasks } from './tasks.js';
import { addGamificationPoints, checkTaskCompletionBadges, logActivity } from './productivity.js';
import { renderProjects } from './projects.js';

// ---------- Sounds (Web Audio) ----------
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) {
        try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return _audioCtx;
}
export function playSound(type) {
    if (state.settings.sounds === false) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    const sounds = {
        success: { freq: [523, 784, 1047], dur: 0.15, type: 'sine' },
        click:   { freq: [800], dur: 0.05, type: 'square' },
        pop:     { freq: [400, 800], dur: 0.08, type: 'sine' },
        error:   { freq: [200, 150], dur: 0.2, type: 'sawtooth' }
    };
    const s = sounds[type] || sounds.click;
    osc.type = s.type;

    s.freq.forEach((f, i) => {
        osc.frequency.setValueAtTime(f, now + i * (s.dur / s.freq.length));
    });
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + s.dur);

    osc.start(now);
    osc.stop(now + s.dur + 0.05);
}

// ---------- Vibration ----------
export function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); } catch (e) {}
}

// ---- Mobile bottom navigation (app-native) ----
export function openMobileSidebar() {
    el.sidebar?.classList.add('open');
    document.getElementById('sidebar-backdrop')?.classList.add('visible');
}

export function closeMobileSidebar() {
    if (window.innerWidth <= 900) {
        el.sidebar?.classList.remove('open');
        document.getElementById('sidebar-backdrop')?.classList.remove('visible');
    }
}

el.mobileMenu?.addEventListener('click', () => {
    el.sidebar?.classList.toggle('open');
    document.getElementById('sidebar-backdrop')?.classList.toggle('visible');
});

// ---------- aria-expanded du bouton de menu ----------
// Le bouton annonce s'il ouvre ou ferme le tiroir. La classe `.open` est
// basculee depuis CINQ endroits repartis sur trois fichiers (ici, ui.js pour
// le clic exterieur, le voile de fond, la navigation du bas) : poser
// l'attribut a chacun d'eux le ferait mentir des qu'un sixieme apparaitrait,
// et un aria-expanded qui ment est pire que pas d'aria-expanded du tout.
//
// On l'OBSERVE donc au lieu de le poser : la source de verite reste la classe,
// et l'attribut ne peut pas s'en desynchroniser.
function synchroniserEtatMenu() {
    if (!el.mobileMenu || !el.sidebar) return;
    const ouvert = el.sidebar.classList.contains('open');
    el.mobileMenu.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
    el.mobileMenu.setAttribute('aria-label', ouvert ? 'Fermer le menu' : 'Ouvrir le menu');
}
if (el.sidebar && el.mobileMenu && typeof MutationObserver === 'function') {
    new MutationObserver(synchroniserEtatMenu)
        .observe(el.sidebar, { attributes: true, attributeFilter: ['class'] });
    synchroniserEtatMenu();
}

// Tab items switch views
$$('.bottom-nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        // close any open overlays for a clean app feel
        el.notificationsPanel?.classList.remove('open');
        $('filter-panel')?.classList.remove('open');
    });
});

// Center FAB → new task
$('bottom-nav-fab')?.addEventListener('click', () => {
    if (state.currentProjectId) openTaskModal();
    else toast('Sélectionnez ou créez d\'abord un projet.', 'info');
});

// Menu tab → open the drawer
$('bottom-nav-menu')?.addEventListener('click', openMobileSidebar);

// Drawer "Vues" quick-nav
$$('.sidebar-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        switchView(btn.dataset.view);
        closeMobileSidebar();
    });
});

// ---- Bouton de publication : declenche un build hook Netlify ----
//
// ⚠️ L'URL du hook etait ECRITE EN DUR ICI. Sa valeur n'est volontairement
// pas reproduite dans ce commentaire : le JS n'est pas minifie, les
// commentaires partent donc en clair dans le bundle public au meme titre que
// le code. La retrouver au besoin dans l'historique git, avant revocation.
//
// Un build hook Netlify accepte un POST NON AUTHENTIFIE — le commentaire
// d'origine le disait lui-meme. Ce fichier part dans le bundle public, servi
// a chaque visiteur : n'importe qui pouvait le lire et declencher des
// deploiements de production en boucle. Minutes de build facturees, et mise
// en ligne forcee du contenu de master a volonte.
//
// Ce hook est donc COMPROMIS et doit etre revoque puis recree dans Netlify
// (Site settings > Build & deploy > Build hooks). Il n'a plus de valeur par
// defaut ici : le nouveau se pose par appareil, a la main, et ne quitte
// jamais le navigateur ou il a ete saisi :
//
//     localStorage.setItem('corviospace_build_hook', 'https://api.netlify.com/build_hooks/…')
//
// Le bouton est en outre reserve au compte administrateur : c'est un outil
// de developpement, il n'a rien a faire dans l'interface d'un client. Il
// etait visible par TOUS les utilisateurs mobiles.
$('deploy-btn')?.addEventListener('click', async () => {
    if (!isGlobalAdmin()) {
        toast('Cette action est réservée à l\'administration.', 'error');
        return;
    }

    const url = localStorage.getItem('corviospace_build_hook');
    if (!url || !/^https:\/\/api\.netlify\.com\/build_hooks\/[A-Za-z0-9]+$/.test(url)) {
        toast('Aucun hook de publication configuré sur cet appareil.', 'error');
        return;
    }

    if (!await confirmDialog({
        titre: 'Publier la version en ligne ?',
        message: 'La version actuellement en ligne sera remplacée par le contenu de la branche. Comptez une à deux minutes.',
        valider: 'Publier',
    })) return;
    try {
        await fetch(url, { method: 'POST', mode: 'no-cors' });
        toast('Déploiement lancé. Comptez une à deux minutes avant que la mise en ligne soit visible.', 'success');
    } catch (e) {
        toast('Le déploiement n\'a pas pu être lancé. Vérifiez votre connexion, puis réessayez.', 'error');
    }
});

// Backdrop closes sidebar
document.getElementById('sidebar-backdrop')?.addEventListener('click', () => {
    el.sidebar?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('visible');
});

// ==========================================
// MOBILE INSTALL PROMO ("Corvio Space est sur mobile")
// ==========================================
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
    // Chrome/Android/desktop-Chrome: keep the event to trigger a native install
    e.preventDefault();
    deferredInstallPrompt = e;
    $('promo-install')?.classList.remove('hidden');
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    $('promo-install')?.classList.add('hidden');
    toast('Corvio Space est installé. Retrouvez l\'icône sur votre écran d\'accueil.', 'success');
});

export function openMobilePromo() {
    const url = location.origin;
    const urlEl = $('promo-url');
    if (urlEl) urlEl.textContent = url.replace(/^https?:\/\//, '');
    const qr = $('promo-qr-img');
    if (qr) {
        qr.style.display = '';
        qr.onerror = () => { qr.closest('.promo-qr')?.classList.add('hidden'); };
        qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(url)}`;
    }
    openModal($('mobile-promo-modal'));
}

// Auto-show once on desktop for logged-in users (until dismissed).
export function maybeShowMobilePromo() {
    if (localStorage.getItem('corviospace_promo_dismissed')) return;
    if (localStorage.getItem('corviospace_promo_seen')) return;
    if (window.matchMedia('(max-width: 900px)').matches) return; // desktop only
    localStorage.setItem('corviospace_promo_seen', '1');
    setTimeout(openMobilePromo, 1200);
}

$('mobile-app-btn')?.addEventListener('click', openMobilePromo);

$('promo-copy')?.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(location.origin);
        toast('Lien copié. Ouvrez-le sur votre téléphone pour installer l\'application.', 'success');
    } catch (e) {
        toast('La copie automatique a échoué. Sélectionnez le lien affiché pour le copier à la main.', 'error');
    }
});

$('promo-install')?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
        toast('Suivez les étapes ci-dessous pour l\'installer.', 'info');
        return;
    }
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch (e) {}
    deferredInstallPrompt = null;
    $('promo-install')?.classList.add('hidden');
});

$('promo-dismiss')?.addEventListener('click', () => {
    localStorage.setItem('corviospace_promo_dismissed', '1');
    closeModal($('mobile-promo-modal'));
});

$$('.promo-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        $$('.promo-tab').forEach(t => t.classList.toggle('active', t === tab));
        const os = tab.dataset.os;
        $('promo-steps-ios')?.classList.toggle('hidden', os !== 'ios');
        $('promo-steps-android')?.classList.toggle('hidden', os !== 'android');
    });
});

// ==========================================
// LES GESTES DU DOIGT
// ==========================================
// Un seul jeu d'ecouteurs pour les trois gestes du telephone : glissement
// lateral d'une carte, appui long, tirer-pour-rafraichir. Ils vivaient dans
// trois fonctions independantes, avec chacune leurs variables de module et
// leurs propres `touchstart`/`touchmove`/`touchend` sur `document` — huit
// ecouteurs pour trois gestes qui parlent tous du meme doigt, et qui se
// marchaient dessus faute de se voir.
//
// La decision (« ce glissement vaut-il un archivage ? », « cet appui long
// tient-il encore ? ») est sortie dans src/core/gestes.js, ou elle se teste
// sans navigateur. Ici il ne reste que le cablage.
//
// ⚠️ Le `touchmove` NON PASSIF n'est plus pose en permanence sur le document.
// Un ecouteur `passive: false` interdit au navigateur d'optimiser le
// defilement de TOUTE la page, y compris pendant les 99 % de touchers qui ne
// visent aucune carte. Il n'est desormais pose que le temps d'un geste sur une
// carte, et retire au relachement.
import {
    ouvrirGeste, deplacerGeste, decalageAffiche, decisionGlissement,
    appuiLongTientEncore, ecartVertical, etatTirage,
    DUREE_APPUI_LONG, SEUIL_INDICATEUR,
} from './core/gestes.js';

/** Le geste en cours sur une carte, ou null. */
let geste = null;
let carteGlissee = null;
let minuteurAppuiLong = null;

/** Le geste en cours de tirage vers le bas, ou null. */
let tirage = null;
let indicateurTirage = null;

/**
 * Vrai entre le declenchement d'un appui long et le `click` qu'il produit.
 *
 * Sans ce verrou, l'appui long ouvrait le menu contextuel et le `click` emis
 * juste apres par le navigateur faisait DEUX choses : le gestionnaire global
 * de tasks.js refermait le menu (le clic est hors du menu), et celui de la
 * carte ouvrait la modale de tache par-dessus. Le menu « Deplacer vers… » —
 * seul chemin pour changer une tache de colonne au doigt — clignotait et
 * disparaissait.
 */
let clicASupprimer = false;

document.addEventListener('click', e => {
    if (!clicASupprimer) return;
    clicASupprimer = false;
    e.preventDefault();
    e.stopPropagation();
}, true); // capture : passe avant le gestionnaire de la carte ET celui du document

/** Retire l'ecouteur non passif et remet la carte a plat. */
function fermerGesteCarte() {
    document.removeEventListener('touchmove', pendantGesteCarte, { passive: false });
    clearTimeout(minuteurAppuiLong);
    minuteurAppuiLong = null;
    if (carteGlissee) {
        carteGlissee.style.transform = '';
        carteGlissee.classList.remove('swiping', 'swipe-right', 'swipe-left');
    }
    carteGlissee = null;
    geste = null;
}

function pendantGesteCarte(e) {
    if (!geste || !carteGlissee) return;
    const t = e.touches[0];
    if (!t) return;
    deplacerGeste(geste, t.clientX, t.clientY);

    // Le doigt a franchi la tolerance : ce n'est plus un appui long.
    if (!appuiLongTientEncore(geste)) {
        clearTimeout(minuteurAppuiLong);
        minuteurAppuiLong = null;
    }

    const decalage = decalageAffiche(geste);
    if (geste.axe !== 'x') return;

    // On ne confisque le geste au navigateur QUE pour un glissement lateral
    // avere : sinon on lui volerait le defilement vertical de la colonne.
    e.preventDefault();
    carteGlissee.style.transform = `translateX(${decalage}px)`;
    carteGlissee.classList.toggle('swipe-right', decalage > 50);
    carteGlissee.classList.toggle('swipe-left', decalage < -50);
}

function relacherGesteCarte() {
    if (!geste || !carteGlissee) { fermerGesteCarte(); return; }

    const decision = decisionGlissement(geste);
    const taskId = carteGlissee.dataset.id;
    const task = decision ? state.tasks.find(t => t.id === taskId) : null;

    if (decision === 'terminer' && task) {
        if (task.status === 'done') {
            archiveTask(taskId);
        } else {
            updateTask(taskId, { status: 'done' });
            addGamificationPoints(10, 'complete');
            checkTaskCompletionBadges();
            logActivity('task-complete', { title: task.title });
        }
    }

    if (decision === 'archiver' && task) {
        // .then() plutot qu'await : la carte doit revenir a plat tout de suite.
        // Un await la laisserait figee en position glissee pendant toute la
        // confirmation, et un autre toucher peut survenir entre-temps.
        confirmDialog({
            titre: 'Archiver cette tâche',
            message: 'Elle quitte le tableau, et reste consultable depuis les archives.',
            valider: 'Archiver',
        }).then(ok => { if (ok) archiveTask(taskId); });
    }

    fermerGesteCarte();
}

function ouvrirGesteCarte(e) {
    const carte = e.target.closest?.('.task-card');
    if (!carte) return;
    const t = e.touches[0];
    if (!t) return;

    // Un geste precedent mal referme laisserait sa carte decalee a l'ecran.
    if (carteGlissee && carteGlissee !== carte) fermerGesteCarte();

    geste = ouvrirGeste(t.clientX, t.clientY);
    carteGlissee = carte;
    carte.classList.add('swiping');
    document.addEventListener('touchmove', pendantGesteCarte, { passive: false });

    if (carte.classList.contains('archived')) return;
    minuteurAppuiLong = setTimeout(() => {
        minuteurAppuiLong = null;
        if (!appuiLongTientEncore(geste)) return;
        const task = state.tasks.find(x => x.id === carte.dataset.id);
        if (!task) return;
        vibrate(30);
        clicASupprimer = true;
        // Filet : si aucun `click` ne suit (le doigt sort de la carte, un
        // autre element l'absorbe), le verrou ne doit pas rester arme et
        // avaler le clic suivant, qui lui serait legitime.
        setTimeout(() => { clicASupprimer = false; }, 900);
        showContextMenu(t.clientX, t.clientY, task);
    }, DUREE_APPUI_LONG);
}

// ---------- Tirer pour rafraichir ----------

/**
 * Pose l'indicateur JUSTE SOUS l'en-tete, jamais par-dessus.
 *
 * ⚠️ Defaut constate sur l'appareil de Yekzan, pas au banc : le CSS pose
 * `top: 12px` sur `.ptr-indicator.visible`, alors que `.main-header` occupe la
 * bande 0 → 72px. La pastille « Rafraichissement… » se posait donc EN PLEIN
 * MILIEU de l'en-tete et masquait le nom du projet — c'est-a-dire le seul
 * repere d'orientation de l'application, exactement au moment ou l'on
 * rafraichit pour voir ce qui a change.
 *
 * Mesure a 390px : indicateur 12 → 47,6px, en-tete 0 → 72px. Recouvrement
 * franc, et sur le titre lui-meme.
 *
 * La hauteur est LUE et non ecrite en dur : l'en-tete grandit en PWA installee
 * (`padding-top: env(safe-area-inset-top)` sous l'encoche) et retrecit sous
 * 480px, ou la racine passe a 14px. Un nombre fige serait faux dans les deux
 * cas.
 *
 * ⚠️ On pose une VARIABLE, pas `top` directement. Un `top` en style en ligne
 * gagnerait aussi contre `.ptr-indicator { top: -60px }`, la regle qui range
 * l'indicateur hors ecran quand il n'est pas visible : il resterait alors
 * affiche en permanence sous l'en-tete. La variable n'est lue que par la regle
 * `.visible`, donc elle ne peut pas deborder de son role.
 */
function placerIndicateurTirage() {
    if (!indicateurTirage) return;
    const entete = document.querySelector('.main-header');
    const bas = entete?.getBoundingClientRect().bottom || 0;
    indicateurTirage.style.setProperty('--ptr-haut', `${Math.round(bas) + 12}px`);
}

function ouvrirTirage(e) {
    if (window.scrollY > 0) return;
    const zone = e.target.closest?.('.board, .mytasks-view, .today-view');
    if (!zone || zone.scrollTop > 0) return;
    const t = e.touches[0];
    if (!t) return;
    tirage = ouvrirGeste(t.clientX, t.clientY);
}

function pendantTirage(e) {
    if (!tirage || !indicateurTirage) return;
    const t = e.touches[0];
    if (!t) return;
    deplacerGeste(tirage, t.clientX, t.clientY);
    const dy = ecartVertical(tirage);
    if (dy > SEUIL_INDICATEUR && dy < 200) {
        const etat = etatTirage(dy);
        // Avant de le montrer, jamais apres : le poser une fois visible le
        // ferait sauter de l'en-tete jusque sous lui, a l'ecran.
        placerIndicateurTirage();
        indicateurTirage.classList.add('visible');
        indicateurTirage.textContent = etat.libelle;
    }
}

function relacherTirage() {
    if (!tirage || !indicateurTirage) { tirage = null; return; }
    const { pret } = etatTirage(ecartVertical(tirage));
    tirage = null;
    if (!pret) {
        indicateurTirage.classList.remove('visible');
        return;
    }
    indicateurTirage.classList.add('refreshing');
    indicateurTirage.textContent = 'Rafraîchissement…';
    vibrate(50);
    if (state.currentProjectId) {
        renderTasks();
        renderProjects();
        updateViewBadges();
    }
    setTimeout(() => {
        indicateurTirage.classList.remove('visible', 'refreshing');
        indicateurTirage.textContent = 'Tirer pour rafraîchir';
    }, 800);
}

/** Pose les trois gestes du telephone. Idempotent. */
let gestesPoses = false;
export function initGestesTactiles() {
    if (gestesPoses) return;
    gestesPoses = true;

    indicateurTirage = document.createElement('div');
    indicateurTirage.className = 'ptr-indicator';
    indicateurTirage.textContent = 'Tirer pour rafraîchir';
    document.body.appendChild(indicateurTirage);

    document.addEventListener('touchstart', e => {
        ouvrirGesteCarte(e);
        ouvrirTirage(e);
    }, { passive: true });

    document.addEventListener('touchmove', pendantTirage, { passive: true });

    document.addEventListener('touchend', () => {
        relacherGesteCarte();
        relacherTirage();
    }, { passive: true });

    // Un appel entrant, une notification systeme : le navigateur annule le
    // toucher sans jamais emettre `touchend`. Sans ca, la carte restait
    // decalee et l'ecouteur non passif restait pose.
    document.addEventListener('touchcancel', () => {
        fermerGesteCarte();
        tirage = null;
        indicateurTirage?.classList.remove('visible');
    }, { passive: true });
}
