// ==========================================
// AUTHENTICATION
// ==========================================
import {
    createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged,
    updateProfile, sendPasswordResetEmail, sendEmailVerification
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    collection, doc, getDoc, setDoc, updateDoc, query, where, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { auth, db } from './core/firebase.js';
import { state, isGlobalAdmin, isTrialActive, GLOBAL_ADMINS } from './core/state.js';
import { $, el } from './core/dom.js';
import { validators, errorMessages, toast, safeAsync, esc } from './core/utils.js';
import { startListeners } from './listeners.js';
import { initializeTheme } from './ui.js';
import { checkReminders, stopReminders } from './reminders.js';
import { stopAllTimers } from './tasks.js';
import { maybeShowMobilePromo, playSound } from './mobile.js';

// Generate a unique 4-digit tag for a given displayName.
// Retries on collision; falls back to 6 digits after 5 tries.
async function generateUniqueTag(displayName) {
    const baseName = (displayName || 'user').toLowerCase().trim().replace(/[#\s]/g, '');
    for (let i = 0; i < 5; i++) {
        const tag = String(Math.floor(1000 + Math.random() * 9000));
        const handle = `${baseName}#${tag}`;
        const existing = await getDocs(query(collection(db, 'users'), where('handle', '==', handle), limit(1)));
        if (existing.empty) return { tag, handle, baseName };
    }
    const tag = String(Math.floor(100000 + Math.random() * 900000));
    return { tag, handle: `${baseName}#${tag}`, baseName };
}

async function ensureUserProfile(user) {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        const displayName = user.displayName || user.email.split('@')[0];
        const { tag, handle } = await generateUniqueTag(displayName);
        const isAdmin = GLOBAL_ADMINS.includes(user.email?.toLowerCase());

        const profile = {
            uid: user.uid,
            email: user.email.toLowerCase(),
            displayName,
            tag,
            handle,
            licensed: isAdmin, // admins get auto-licensed
            // 7-day free trial for new signups (admins don't need it).
            trialEndsAt: isAdmin ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            settings: state.settings
        };
        await setDoc(ref, profile);
        state.userProfile = profile;
        return profile;
    }

    const data = snap.data();
    if (data.settings) {
        state.settings = { ...state.settings, ...data.settings };
    }

    // Backfill tag/handle for legacy accounts created before the tag system.
    if (!data.tag || !data.handle) {
        const { tag, handle } = await generateUniqueTag(data.displayName || user.email.split('@')[0]);
        await updateDoc(ref, { tag, handle });
        data.tag = tag;
        data.handle = handle;
    }

    state.userProfile = data;
    return data;
}

// Fade out the startup splash once we know what to show.
function hideSplash() {
    const splash = document.getElementById('app-splash');
    if (!splash || splash.classList.contains('hidden')) return;
    splash.classList.add('hidden');
    setTimeout(() => splash.remove(), 450);
}
// Safety net: never let the splash get stuck if auth hangs.
setTimeout(hideSplash, 5000);

function showAuth() {
    el.authContainer?.classList.remove('hidden');
    el.appContainer?.classList.add('hidden');
    $('access-denied')?.classList.add('hidden');
    $('email-verify')?.classList.add('hidden');
    hideSplash();
}

function showApp() {
    el.authContainer?.classList.add('hidden');
    el.appContainer?.classList.remove('hidden');
    $('access-denied')?.classList.add('hidden');
    $('email-verify')?.classList.add('hidden');
    updateUserUI();
    // Show admin button only for global admins
    const adminBtn = $('admin-btn');
    if (adminBtn) {
        if (isGlobalAdmin()) adminBtn.classList.remove('hidden');
        else adminBtn.classList.add('hidden');
    }
    // Meme traitement pour « Publier la version en ligne » : c'est un outil de
    // developpement, il etait visible par TOUS les utilisateurs mobiles.
    const deployBtn = $('deploy-btn');
    if (deployBtn) deployBtn.classList.toggle('hidden', !isGlobalAdmin());
    hideSplash();
    maybeShowMobilePromo();
}

// ---- Verification d'email (comptes crees a partir du CUTOFF) ----
// Grandfather par date : les comptes anterieurs ne sont JAMAIS bloques, seuls
// les nouveaux doivent verifier. Evite tout backfill/lockout des comptes
// existants (meme prudence que la migration memberIds).
const CUTOFF_VERIF_EMAIL = Date.parse('2026-07-27T00:00:00Z');
function emailVerifieRequis(user) {
    if (!user || user.emailVerified) return false;
    const cree = Date.parse(user.metadata?.creationTime || '');
    return !Number.isNaN(cree) && cree >= CUTOFF_VERIF_EMAIL;
}

function showEmailVerify(user) {
    el.authContainer?.classList.add('hidden');
    el.appContainer?.classList.add('hidden');
    $('access-denied')?.classList.add('hidden');
    const screen = $('email-verify');
    if (screen) {
        screen.classList.remove('hidden');
        const emailEl = screen.querySelector('.email-verify-email');
        if (emailEl) emailEl.textContent = user?.email || '';
    }
    hideSplash();
}

// Boutons de l'ecran de verification (delegation, l'ecran est statique).
document.addEventListener('click', async e => {
    const id = e.target?.closest('button')?.id;
    if (id === 'email-verify-resend') {
        try {
            await sendEmailVerification(auth.currentUser);
            toast('Lien de vérification renvoyé — vérifie ta boîte mail 📩', 'success');
        } catch (err) {
            toast('Trop de tentatives, réessaie dans un moment', 'error');
        }
    } else if (id === 'email-verify-check') {
        try {
            await auth.currentUser?.reload();
            if (auth.currentUser?.emailVerified) location.reload();
            else toast('Pas encore vérifié — clique le lien dans ton email, puis réessaie', 'info');
        } catch (err) { /* ignore */ }
    } else if (id === 'email-verify-logout') {
        signOut(auth);
    }
});

function showAccessDenied() {
    el.authContainer?.classList.add('hidden');
    el.appContainer?.classList.add('hidden');
    $('email-verify')?.classList.add('hidden');
    const denied = $('access-denied');
    if (denied) {
        denied.classList.remove('hidden');
        const email = denied.querySelector('.access-denied-email');
        if (email) email.textContent = state.currentUser?.email || '';

        // Differentiate "trial expired" from "never licensed".
        const trialExpired = state.userProfile?.trialEndsAt
            && new Date(state.userProfile.trialEndsAt).getTime() <= Date.now();
        const heading = denied.querySelector('h2');
        const paras = denied.querySelectorAll('p');
        if (trialExpired) {
            if (heading) heading.textContent = 'Votre période d\'essai est terminée';
            // esc() : l'adresse vient du compte, mais elle passe par innerHTML.
            // La couleur est portee par la classe, plus par un style en ligne
            // sur var(--accent) — qui ne faisait que 2.77:1.
            if (paras[0]) paras[0].innerHTML = `Les 7 jours d'essai associés à <strong class="access-denied-email">${esc(state.currentUser?.email || '')}</strong> sont écoulés.`;
            if (paras[1]) paras[1].textContent = 'Demandez l\'activation d\'une licence à la personne qui administre votre espace. Vos projets et vos tâches sont conservés.';
        }
    }
    hideSplash();
}

// Logout from access denied screen
document.addEventListener('click', e => {
    if (e.target?.id === 'access-denied-logout') signOut(auth);
});

// NOTE: already includes the renderUserAvatar() call that the original
// grafted on later via `updateUserUI = function(){...}`.
function updateUserUI() {
    if (!state.currentUser) return;
    const name = state.userProfile?.displayName || state.currentUser.displayName || state.currentUser.email.split('@')[0];
    if (el.userName) el.userName.textContent = name;
    if (el.userEmail) el.userEmail.textContent = state.currentUser.email;
    // Cible le <span> de l'initiale, jamais le <label> lui-meme : ecrire
    // textContent sur le label detruisait le champ fichier qu'il contient.
    if (el.userAvatarInitiale) el.userAvatarInitiale.textContent = name.charAt(0).toUpperCase();
    if (el.userHandle) {
        const handle = state.userProfile?.handle || '';
        el.userHandle.textContent = handle ? '#' + (state.userProfile.tag || handle.split('#')[1] || '') : '';
        el.userHandle.title = handle ? `Copier votre tag ${handle}` : '';
    }
    renderUserAvatar();
}

// Click on the handle to copy it to clipboard
document.addEventListener('click', e => {
    if (e.target && e.target.id === 'user-handle' && state.userProfile?.handle) {
        navigator.clipboard?.writeText(state.userProfile.handle).then(() => {
            toast(`Tag copié : ${state.userProfile.handle}`, 'success');
        }).catch(() => {
            toast(`Votre tag : ${state.userProfile.handle}`, 'info');
        });
    }
});

function showAuthError(msg) {
    if (!el.authError) return;
    el.authError.textContent = msg;
    el.authError.classList.add('visible');
    setTimeout(() => el.authError.classList.remove('visible'), 4000);
}

el.loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = el.loginEmail.value.trim();
    const password = el.loginPassword.value;

    if (!validators.email(email)) {
        return showAuthError('Cette adresse e-mail n\'est pas valide. Vérifiez le format : nom@domaine.fr');
    }
    if (!validators.password(password)) {
        return showAuthError('Le mot de passe doit contenir au moins 6 caractères.');
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Connexion...';

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        showAuthError(errorMessages[err.code] || errorMessages.default);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Se connecter';
    }
});

// ---------- Mot de passe oublie ----------
// L'ecran de connexion n'offrait aucun moyen de recuperer un compte : un
// utilisateur ayant oublie son mot de passe etait simplement bloque dehors.
$('forgot-password')?.addEventListener('click', async e => {
    e.preventDefault();
    const email = el.loginEmail?.value.trim();

    // On part de ce qui est deja saisi plutot que d'ouvrir un champ de plus.
    if (!validators.email(email)) {
        return showAuthError('Saisissez votre adresse e-mail ci-dessus, puis cliquez à nouveau sur ce lien.');
    }

    const lien = e.currentTarget;
    lien.textContent = 'Envoi...';
    try {
        await sendPasswordResetEmail(auth, email);
        // Message volontairement identique en cas de succes comme d'adresse
        // inconnue : confirmer qu'un email existe permettrait d'enumerer les
        // comptes de l'application.
        toast('Si un compte existe pour cette adresse, un lien de réinitialisation vient d\'être envoyé. Pensez à vérifier les indésirables.', 'success');
    } catch (err) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
            toast('Si un compte existe pour cette adresse, un lien de réinitialisation vient d\'être envoyé. Pensez à vérifier les indésirables.', 'success');
        } else {
            showAuthError(errorMessages[err.code] || errorMessages.default);
        }
    } finally {
        lien.textContent = 'Mot de passe oublié ?';
    }
});

el.registerForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = el.registerName.value.trim();
    const email = el.registerEmail.value.trim();
    const password = el.registerPassword.value;
    const passwordConfirm = el.registerPasswordConfirm?.value;

    if (name.length < 2) {
        return showAuthError('Le pseudo doit contenir au moins 2 caractères.');
    }
    if (!validators.email(email)) {
        return showAuthError('Cette adresse e-mail n\'est pas valide. Vérifiez le format : nom@domaine.fr');
    }
    if (!validators.password(password)) {
        return showAuthError('Le mot de passe doit contenir au moins 6 caractères.');
    }
    if (password !== passwordConfirm) {
        return showAuthError('Les mots de passe ne correspondent pas');
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creation...';

    try {
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(user, { displayName: name });
        await ensureUserProfile({ ...user, displayName: name });
        // Verification d'email obligatoire pour les nouveaux comptes : on envoie
        // le lien tout de suite. onAuthStateChanged affichera l'ecran de
        // verification (l'utilisateur est deja connecte mais non verifie).
        try { await sendEmailVerification(user); } catch (e) { /* non bloquant */ }
    } catch (err) {
        showAuthError(errorMessages[err.code] || errorMessages.default);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Créer mon compte';
    }
});

el.showRegister?.addEventListener('click', e => {
    e.preventDefault();
    el.loginForm?.classList.add('hidden');
    el.registerForm?.classList.remove('hidden');
});

el.showLogin?.addEventListener('click', e => {
    e.preventDefault();
    el.registerForm?.classList.add('hidden');
    el.loginForm?.classList.remove('hidden');
});

el.logoutBtn?.addEventListener('click', () => signOut(auth));

function cleanup() {
    Object.values(state.unsubscribers).forEach(u => {
        try { u && u(); } catch (e) { /* ignore */ }
    });
    state.unsubscribers = {};
    state.projects = [];
    state.tasks = [];
    state.archivedTasks = [];
    state.tags = [];
    state.notifications = [];
    state.userProfile = null;
    state.currentProjectId = null;
    stopAllTimers();
    stopReminders();
}

// ==========================================
// Avatar (base64, resized client-side)
// ==========================================

async function uploadAvatar(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
        toast('Cette image dépasse 2 Mo. Choisissez-en une plus légère.', 'error');
        return;
    }
    // Resize to 128x128 with canvas
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.readAsDataURL(file);

    img.onload = async () => {
        const canvas = document.createElement('canvas');
        const SIZE = 128;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        // Square crop center
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

        try {
            await updateDoc(doc(db, 'users', state.currentUser.uid), { avatar: dataUrl });
            state.userProfile = { ...state.userProfile, avatar: dataUrl };
            renderUserAvatar();
            toast('Photo de profil mise à jour.', 'success');
            playSound('success');
        } catch (e) {
            toast('La photo n\'a pas pu être enregistrée. Vérifiez votre connexion, puis réessayez.', 'error');
        }
    };
}

function renderUserAvatar() {
    const av = el.userAvatar;
    if (!av) return;
    const existing = av.querySelector('img');
    if (state.userProfile?.avatar) {
        if (existing) existing.src = state.userProfile.avatar;
        else {
            const img = document.createElement('img');
            img.src = state.userProfile.avatar;
            av.appendChild(img);
        }
    } else if (existing) {
        existing.remove();
    }
}

$('avatar-input')?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) uploadAvatar(f);
    e.target.value = '';
});

// ==========================================
// AUTH STATE
// ==========================================

onAuthStateChanged(auth, async user => {
    if (user) {
        state.currentUser = user;
        await safeAsync(() => ensureUserProfile(user), 'ensureUserProfile');

        // Verification d'email : les comptes crees a partir du CUTOFF doivent
        // valider leur adresse avant d'entrer. Les comptes existants sont
        // grandfathes (jamais bloques). Passe avant le check de licence.
        if (emailVerifieRequis(user)) {
            showEmailVerify(user);
            return;
        }

        // Access check — admins always have access, licensed users too, and
        // new signups get a 7-day free trial before the paywall kicks in.
        if (!isGlobalAdmin() && !state.userProfile?.licensed && !isTrialActive()) {
            showAccessDenied();
            return;
        }

        showApp();
        startListeners();
        initializeTheme();
        checkReminders();
    } else {
        state.currentUser = null;
        showAuth();
        cleanup();
    }
});
