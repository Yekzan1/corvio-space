// ==========================================
// THEMES, SETTINGS, ADMIN PANEL, HELP, KEYBOARD SHORTCUTS, QUICK CAPTURE
// ==========================================
import { doc, updateDoc, deleteDoc, query, collection, addDoc, where, orderBy, limit, getDocs, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { deleteUser } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { db, auth } from './core/firebase.js';
import { state, isGlobalAdmin, GLOBAL_ADMINS } from './core/state.js';
import { $, $$, el } from './core/dom.js';
import { toast, esc, handleError } from './core/utils.js';
import { openModal, closeModal } from './core/modal.js';
import { icone } from './core/icones.js';
import { confirmDialog } from './core/confirm.js';
import { decouperEnLots, membershipFields } from './core/membership.js';
import { filtreAppartenance } from './core/requetes.js';
import { switchView, openGlobalSearch } from './views.js';
import { openBadgesModal } from './productivity.js';
import { vibrate, playSound } from './mobile.js';
import { openTaskModal, createTask } from './tasks.js';
import { openProjectModal, openMemberModal } from './projects.js';
import { openTagModal } from './tags.js';

// ==========================================
// IDENTITE VISUELLE
// ==========================================

// Corvio Space a UNE identite visuelle (design HF Growth OS) en DEUX declinaisons :
// jour et nuit. Ce n'est pas le retour du multi-theme retire en son temps
// (dracula, nord, solarized) — il n'y a pas de selecteur de skins, seulement
// la meme palette eclairee ou assombrie.
//
// Trois preferences possibles, une seule enregistree :
//   'systeme' (defaut) — suit le reglage du systeme d'exploitation, en direct
//   'clair' / 'sombre' — choix explicite, qui l'emporte sur le systeme
//
// L'ancienne cle 'corviospace-theme' pouvait contenir 'dracula' ou 'nord' chez
// les comptes anciens. On ne la reutilise pas : une nouvelle cle evite qu'une
// valeur morte soit interpretee comme un thème valide.
const CLE_THEME = 'corviospace-apparence';
const PREFERENCES = ['systeme', 'clair', 'sombre'];

// Couleur de la barre systeme du navigateur mobile, par thème resolu. Elles
// doivent rester EGALES a --bg-main : c'est ce qui fait que la barre et la
// page se confondent au lieu de former un bandeau.
const COULEUR_BARRE = { light: '#F3F6F5', dark: '#0F1614' };

let _mediaSombre = null;

/** La preference enregistree, nettoyee de toute valeur heritee. */
export function preferenceApparence() {
    try {
        const v = localStorage.getItem(CLE_THEME);
        return PREFERENCES.includes(v) ? v : 'systeme';
    } catch {
        return 'systeme';
    }
}

/** Le thème REELLEMENT applique : 'light' ou 'dark'. */
export function themeResolu(preference = preferenceApparence()) {
    if (preference === 'clair') return 'light';
    if (preference === 'sombre') return 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Pose l'attribut et synchronise ce qui ne peut pas dependre du CSS. */
function appliquerTheme(theme) {
    // L'attribut data-theme est la SEULE source de verite. `state.theme`
    // etait ecrit ici et relu nulle part.
    document.documentElement.dataset.theme = theme;

    // Le nom accessible du bouton de bascule annonce l'ACTION possible, donc
    // il depend du theme courant. Il etait remis a jour dans le gestionnaire
    // de clic uniquement : changer de theme depuis la modale des reglages
    // laissait le bouton de l'en-tete annoncer « Passer en mode nuit » alors
    // qu'on y etait deja. Ici, il suit toutes les voies de changement.
    majEtiquetteBascule();

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', COULEUR_BARRE[theme]);

    // Le splash porte son fond en STYLE EN LIGNE : il s'applique avant que la
    // feuille de style soit chargee, donc aucune regle CSS ne peut l'atteindre.
    // Sans cette ligne, ouvrir l'application en mode nuit commence par un
    // aplat clair plein ecran — exactement le flash que le splash existe pour
    // supprimer.
    const splash = document.getElementById('app-splash');
    if (splash) splash.style.background = COULEUR_BARRE[theme];
}

export function initializeTheme() {
    localStorage.removeItem('corviospace-theme'); // valeur heritee du multi-theme retire

    appliquerTheme(themeResolu());

    // Suivi EN DIRECT du reglage systeme : quelqu'un dont le systeme bascule
    // au coucher du soleil doit voir l'application suivre sans rechargement.
    // Uniquement si aucun choix explicite n'a ete fait.
    if (!_mediaSombre && window.matchMedia) {
        _mediaSombre = window.matchMedia('(prefers-color-scheme: dark)');
        _mediaSombre.addEventListener('change', () => {
            if (preferenceApparence() === 'systeme') appliquerTheme(themeResolu());
        });
    }
}

/**
 * Enregistre une preference et l'applique.
 * @param {'systeme'|'clair'|'sombre'} preference
 */
export function definirApparence(preference) {
    if (!PREFERENCES.includes(preference)) return;
    try {
        localStorage.setItem(CLE_THEME, preference);
    } catch { /* stockage refuse : le choix vaut alors pour la session */ }
    appliquerTheme(themeResolu(preference));
}

/**
 * Bascule jour <-> nuit depuis le bouton de l'en-tete.
 * Toujours vers un choix EXPLICITE : quelqu'un qui clique veut ce thème-la,
 * pas « suivre le systeme et se faire rebasculer dans une heure ».
 */
export function basculerApparence() {
    const versSombre = themeResolu() === 'light';
    definirApparence(versSombre ? 'sombre' : 'clair');
    // Pas de message : le resultat occupe l'ecran entier et se voit
    // immediatement. Une notification qui annonce ce que l'utilisateur vient
    // de faire et de constater n'apporte rien, et masque un coin de l'interface
    // au moment precis ou il la regarde.
    return versSombre ? 'sombre' : 'clair';
}

export function toggleCompactMode() {
    const isCompact = document.body.classList.toggle('compact-mode');
    state.settings.compactMode = isCompact;
    localStorage.setItem('corviospace-settings', JSON.stringify(state.settings));
    toast(`Mode compact ${isCompact ? 'activé' : 'désactivé'}.`, 'info');
}

export function toggleSounds() {
    state.settings.sounds = !state.settings.sounds;
    localStorage.setItem('corviospace-settings', JSON.stringify(state.settings));
    toast(`Sons ${state.settings.sounds ? 'activés' : 'désactivés'}.`, 'info');
    if (state.settings.sounds) playSound('success');
}

// Menu "plus d'actions" du header : ouverture au clic (pas seulement au
// survol) pour rester utilisable au clavier et au toucher.
const closeHeaderMore = () => $('header-more')?.classList.remove('open');
$('header-more-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    $('header-more')?.classList.toggle('open');
});
document.addEventListener('click', e => {
    if (!e.target.closest('#header-more')) closeHeaderMore();
});
// Tout item du menu le referme apres action
document.querySelectorAll('#header-more .dropdown-menu button').forEach(b => {
    b.addEventListener('click', closeHeaderMore);
});

// Preferences d'affichage — vivent maintenant dans ce menu
$('toggle-compact')?.addEventListener('click', toggleCompactMode);
$('toggle-sounds')?.addEventListener('click', toggleSounds);

// Close notifications panel, mobile sidebar, and filter panel on outside click
document.addEventListener('click', e => {
    if (el.notificationsPanel &&
        !el.notificationsPanel.contains(e.target) &&
        !el.notificationsBtn?.contains(e.target)) {
        el.notificationsPanel.classList.remove('open');
    }

    if (window.innerWidth <= 900 &&
        el.sidebar?.classList.contains('open') &&
        !el.sidebar.contains(e.target) &&
        !el.mobileMenu?.contains(e.target) &&
        !$('bottom-nav-menu')?.contains(e.target)) {
        el.sidebar.classList.remove('open');
    }

    const filterPanel = $('filter-panel');
    const filterBtn = $('filter-btn');
    if (filterPanel &&
        !filterPanel.contains(e.target) &&
        !filterBtn?.contains(e.target)) {
        filterPanel.classList.remove('open');
    }
});

// ==========================================
// SETTINGS
// ==========================================

$('theme-toggle-btn')?.addEventListener('click', () => {
    basculerApparence();
    majEtiquetteBascule();
    // La modale des reglages peut etre ouverte en meme temps : ses trois
    // boutons doivent suivre, sinon l'interface s'affiche en desaccord
    // avec elle-meme.
    if ($('settings-modal')?.classList.contains('active')) renderSettings();
});

/** L'icone est choisie par le CSS ; le nom accessible, lui, doit etre pose en
 *  JS. Sans cela, un lecteur d'ecran annonce toujours le meme libelle quel que
 *  soit le thème en cours. */
function majEtiquetteBascule() {
    const b = $('theme-toggle-btn');
    if (!b) return;
    const sombre = themeResolu() === 'dark';
    b.setAttribute('aria-label', sombre ? 'Passer en mode jour' : 'Passer en mode nuit');
    b.setAttribute('title', sombre ? 'Passer en mode jour' : 'Passer en mode nuit');
}
majEtiquetteBascule();

$('settings-btn')?.addEventListener('click', () => {
    openModal($('settings-modal'));
    renderSettings();
});

function renderSettings() {
    const container = $('settings-content');
    if (!container) return;

    const pref = preferenceApparence();
    const choix = [
        ['systeme', 'Système', 'boussole'],
        ['clair', 'Clair', 'soleil'],
        ['sombre', 'Sombre', 'lune']
    ];

    container.innerHTML = `
        <div class="settings-group">
            <span class="settings-titre">Apparence</span>
            <div class="theme-choix" role="group" aria-label="Apparence">
                ${choix.map(([cle, libelle, ic]) => `
                    <button type="button" data-apparence="${cle}" aria-pressed="${pref === cle ? 'true' : 'false'}">
                        ${icone(ic, { taille: 15 })} ${libelle}
                    </button>`).join('')}
            </div>
            <p class="theme-aide">
                ${pref === 'systeme'
                    ? 'Corvio Space suit le réglage de votre appareil et bascule avec lui.'
                    : 'Ce choix est enregistré sur cet appareil et ignore le réglage du système.'}
            </p>
        </div>
        <div class="settings-group">
            <label class="settings-item">
                <span>Notifications navigateur</span>
                <input type="checkbox" id="setting-notifications" ${state.settings.notifications ? 'checked' : ''}>
            </label>
            <label class="settings-item">
                <span>Sons</span>
                <input type="checkbox" id="setting-sounds" ${state.settings.sounds ? 'checked' : ''}>
            </label>
            <label class="settings-item">
                <span>Mode compact</span>
                <input type="checkbox" id="setting-compact" ${state.settings.compactMode ? 'checked' : ''}>
            </label>
        </div>
        <div class="settings-actions">
            <button class="btn-danger" id="delete-account-btn">Supprimer mon compte</button>
        </div>
        <p class="auth-legal">
            <a href="/mentions-legales.html" target="_blank" rel="noopener">Mentions légales</a>
            ·
            <a href="/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a>
        </p>
    `;

    container.querySelectorAll('[data-apparence]').forEach(b => {
        b.addEventListener('click', () => {
            definirApparence(b.dataset.apparence);
            // On re-rend : l'etat presse des trois boutons ET la phrase
            // d'explication en dessous doivent refleter le nouveau choix.
            renderSettings();
        });
    });

    $('setting-notifications')?.addEventListener('change', e => {
        state.settings.notifications = e.target.checked;
        saveSettings();
        if (e.target.checked) {
            Notification.requestPermission();
        }
    });

    $('setting-sounds')?.addEventListener('change', e => {
        state.settings.sounds = e.target.checked;
        saveSettings();
    });

    $('setting-compact')?.addEventListener('change', e => {
        state.settings.compactMode = e.target.checked;
        document.body.classList.toggle('compact-mode', e.target.checked);
        saveSettings();
    });

    // Le conteneur est reconstruit a chaque ouverture des reglages, donc le
    // bouton est neuf a chaque fois : pas de risque d'empiler les ecouteurs.
    $('delete-account-btn')?.addEventListener('click', deleteAccount);
}

function saveSettings() {
    localStorage.setItem('corviospace-settings', JSON.stringify(state.settings));
    if (state.currentUser) {
        // Le reglage est deja garde en local ci-dessus ; la synchro serveur est
        // secondaire, mais un rejet ne doit pas rester une promesse non geree.
        updateDoc(doc(db, 'users', state.currentUser.uid), { settings: state.settings })
            .catch(e => console.error('Sync des réglages échouée', e));
    }
}

// ==========================================
// SUPPRESSION DE COMPTE (droit a l'effacement, RGPD art. 17)
// ==========================================
// Le bouton existait dans le gabarit des reglages depuis longtemps mais
// n'avait AUCUN gestionnaire : cliquer dessus ne faisait rien. Un droit
// affiche et inoperant est pire que pas de bouton du tout, et la politique
// de confidentialite ne peut pas le mentionner tant qu'il ne marche pas.

/** Supprime en lots les documents d'une requete. */
async function supprimerParLots(requete) {
    const snap = await getDocs(requete);
    for (const lot of decouperEnLots(snap.docs)) {
        const batch = writeBatch(db);
        lot.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
    return snap.size;
}

export async function deleteAccount() {
    const utilisateur = auth.currentUser;
    if (!utilisateur) return;

    // Les projets dont je suis proprietaire partent avec moi ; ceux ou je ne
    // suis que membre appartiennent a quelqu'un d'autre et doivent survivre.
    const miens = state.projects.filter(p => p.ownerId === utilisateur.uid);
    const partages = state.projects.filter(p => p.ownerId !== utilisateur.uid);

    const accord = (n, singulier, pluriel) => `${n} ${n > 1 ? pluriel : singulier}`;
    const details = [
        miens.length
            ? `${accord(miens.length, 'projet dont vous êtes propriétaire sera supprimé', 'projets dont vous êtes propriétaire seront supprimés')}, avec toutes leurs tâches, leurs commentaires et leurs pièces jointes.`
            : null,
        partages.length
            ? `Vous serez retiré de ${accord(partages.length, 'projet appartenant à quelqu\'un d\'autre', 'projets appartenant à quelqu\'un d\'autre')}. Leur contenu, lui, est conservé.`
            : null,
        'Votre compte et votre profil seront effacés. Cette action est définitive : rien ne pourra être restauré.',
    ].filter(Boolean).join(' ');

    if (!await confirmDialog({
        titre: 'Supprimer définitivement votre compte ?',
        message: details,
        saisieAttendue: 'SUPPRIMER',
        valider: 'Supprimer mon compte',
        danger: true,
    })) return;

    try {
        // 1. Les projets dont je suis proprietaire, et tout ce qui en depend.
        for (const projet of miens) {
            const mien = filtreAppartenance(state.currentUser?.uid);
            await supprimerParLots(query(collection(db, 'tasks'), ...mien, where('projectId', '==', projet.id)));
            await supprimerParLots(query(collection(db, 'tags'), ...mien, where('projectId', '==', projet.id)));
            try {
                await supprimerParLots(query(collection(db, 'attachments'), ...mien, where('projectId', '==', projet.id)));
                await supprimerParLots(query(collection(db, 'activities'), where('projectId', '==', projet.id)));
            } catch (e) { /* collections optionnelles */ }
            await deleteDoc(doc(db, 'projects', projet.id));
        }

        // 2. Me retirer des projets des autres — sinon je resterais dans leur
        //    liste de membres avec un uid qui ne correspond plus a personne.
        for (const projet of partages) {
            const roles = { ...(projet.roles || {}) };
            delete roles[utilisateur.uid];
            try {
                await updateDoc(doc(db, 'projects', projet.id), {
                    members: (projet.members || []).filter(m => m !== utilisateur.uid),
                    roles,
                });
            } catch (e) { /* projet deja supprime de son cote */ }
        }

        // 3. Ce qui m'est propre.
        try {
            await supprimerParLots(query(collection(db, 'notifications'), where('userId', '==', utilisateur.uid)));
            await supprimerParLots(query(collection(db, 'templates'), where('ownerId', '==', utilisateur.uid)));
            await deleteDoc(doc(db, 'presence', utilisateur.uid));
        } catch (e) { /* rien a supprimer */ }

        await deleteDoc(doc(db, 'users', utilisateur.uid));

        // 4. Le compte d'authentification en dernier : une fois supprime, plus
        //    aucune ecriture Firestore ne passerait les regles.
        await deleteUser(utilisateur);

        // Les traces locales n'ont plus d'objet.
        ['corviospace-gamification', 'corviospace-streak', 'corviospace-settings',
         'corviospace-weekly-shown'].forEach(c => localStorage.removeItem(c));

        toast('Votre compte a été supprimé.', 'info');
        setTimeout(() => location.reload(), 1200);
    } catch (e) {
        // Firebase exige une connexion recente pour supprimer un compte ; au
        // dela de quelques minutes il refuse. Le message par defaut
        // ("auth/requires-recent-login") n'aide personne.
        if (e?.code === 'auth/requires-recent-login') {
            await confirmDialog({
                titre: 'Reconnectez-vous d\'abord',
                message: 'Par sécurité, une connexion récente est requise pour supprimer un compte. Déconnectez-vous, reconnectez-vous, puis relancez la suppression.',
                valider: 'Compris',
                annuler: 'Fermer',
            });
            return;
        }
        handleError(e, 'deleteAccount');
    }
}

// ==========================================
// ADMIN PANEL
// ==========================================

$('admin-btn')?.addEventListener('click', () => {
    if (!isGlobalAdmin()) return;
    openModal($('admin-modal'));
    renderAdminPanel();
});

function renderAdminPanel() {
    const container = $('admin-panel-content');
    if (!container) return;

    container.innerHTML = `
        <div style="padding:1rem">
            <div style="display:flex;gap:.5rem;margin-bottom:1rem">
                <input type="text" id="admin-panel-search" placeholder="Chercher par email ou tag..." style="flex:1;padding:.6rem .85rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-primary);font-size:.9rem">
                <button class="btn-primary" id="admin-panel-search-btn" style="padding:.6rem 1.2rem">Chercher</button>
            </div>
            <div id="admin-panel-results" style="margin-bottom:1rem">
                <p style="color:var(--text-secondary);font-size:.85rem">Cherche un utilisateur pour gerer sa licence.</p>
            </div>
            <hr style="border:none;border-top:1px solid var(--border);margin:1rem 0">
            <button class="btn-primary" id="admin-list-all-btn" style="width:100%;padding:.6rem">Voir tous les utilisateurs</button>
            <div id="admin-all-users" style="margin-top:1rem"></div>
        </div>
    `;

    const doSearch = () => adminPanelSearch($('admin-panel-search')?.value?.trim());
    $('admin-panel-search-btn')?.addEventListener('click', doSearch);
    $('admin-panel-search')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
    $('admin-list-all-btn')?.addEventListener('click', adminListAllUsers);
}

async function adminPanelSearch(searchTerm) {
    const resultsDiv = $('admin-panel-results');
    if (!resultsDiv) return;
    if (!searchTerm) {
        resultsDiv.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Entrez un email ou un tag.</p>';
        return;
    }
    resultsDiv.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Recherche...</p>';

    try {
        let userQuery;
        if (searchTerm.includes('@')) {
            userQuery = query(collection(db, 'users'), where('email', '==', searchTerm.toLowerCase()), limit(10));
        } else if (searchTerm.includes('#')) {
            userQuery = query(collection(db, 'users'), where('handle', '==', searchTerm.toLowerCase()), limit(10));
        } else {
            userQuery = query(collection(db, 'users'), where('email', '>=', searchTerm.toLowerCase()), where('email', '<=', searchTerm.toLowerCase() + ''), limit(10));
        }
        const snap = await getDocs(userQuery);
        renderAdminUserList(resultsDiv, snap);
    } catch (err) {
        resultsDiv.innerHTML = '<p class="message-erreur">La recherche n\'a pas abouti. Vérifiez votre connexion, puis relancez-la.</p>';
        console.error(err);
    }
}

async function adminListAllUsers() {
    const container = $('admin-all-users');
    if (!container) return;
    container.innerHTML = '<p class="message-chargement">Chargement de la liste des comptes…</p>';
    try {
        const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50)));
        renderAdminUserList(container, snap);
    } catch (err) {
        container.innerHTML = '<p class="message-erreur">La liste des comptes n\'a pas pu être chargée. Vérifiez votre connexion, puis rouvrez ce panneau.</p>';
        console.error(err);
    }
}

function renderAdminUserList(container, snap) {
    if (snap.empty) {
        container.innerHTML = '<p style="color:var(--text-secondary);font-size:.85rem">Aucun utilisateur trouve</p>';
        return;
    }

    container.innerHTML = snap.docs.map(d => {
        const u = d.data();
        const licensed = u.licensed ? true : false;
        const isAdmin = GLOBAL_ADMINS.includes(u.email?.toLowerCase());
        return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem .85rem;border-radius:8px;background:var(--bg-card);margin-bottom:.4rem;border:1px solid var(--border)">
                <div style="min-width:0">
                    <div style="display:flex;align-items:center;gap:.4rem">
                        <strong style="color:var(--text-primary);font-size:.85rem">${esc(u.displayName || 'Sans nom')}</strong>
                        ${isAdmin ? '<span style="background:var(--primary);color:white;padding:0 .4rem;border-radius:4px;font-size:.65rem;font-weight:700">ADMIN</span>' : ''}
                    </div>
                    <div style="color:var(--text-secondary);font-size:.8rem">${esc(u.email || '')}${u.handle ? ' &middot; ' + esc(u.handle) : ''}</div>
                </div>
                <button class="admin-toggle-btn" data-uid="${esc(d.id)}" data-licensed="${licensed}" style="padding:.4rem .85rem;border-radius:6px;border:none;cursor:pointer;font-size:.8rem;font-weight:600;white-space:nowrap;${licensed ? 'background:#22c55e;color:white' : 'background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border)'}">
                    ${licensed ? 'Active' : 'Inactive'}
                </button>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.admin-toggle-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const uid = btn.dataset.uid;
            const currentlyLicensed = btn.dataset.licensed === 'true';
            const newValue = !currentlyLicensed;
            try {
                await updateDoc(doc(db, 'users', uid), { licensed: newValue });
                btn.dataset.licensed = String(newValue);
                btn.textContent = newValue ? 'Active' : 'Inactive';
                btn.style.background = newValue ? '#22c55e' : 'var(--bg-input)';
                btn.style.color = newValue ? 'white' : 'var(--text-secondary)';
                btn.style.border = newValue ? 'none' : '1px solid var(--border)';
                toast(`Licence ${newValue ? 'activée' : 'désactivée'}.`, 'success');
            } catch (err) {
                toast('La mise à jour a échoué. Vérifiez votre connexion, puis réessayez.', 'error');
                console.error(err);
            }
        });
    });
}

// ==========================================
// HELP MODAL
// ==========================================

function openHelpModal() {
    if (!el.helpModal || !el.helpContent) return;
    el.helpContent.innerHTML = `
        <div class="help-grid">
            <div class="help-section">
                <h3>${icone('boussole')} Démarrer</h3>
                <ul>
                    <li><strong>Créer un projet</strong> : bouton + en face de « Mes projets », ou touche <kbd>P</kbd>.</li>
                    <li><strong>Inviter quelqu'un</strong> : ouvrez un projet, puis le bouton d'ajout de membre. Renseignez son tag, de la forme <code>pseudo#1234</code>.</li>
                    <li><strong>Retrouver votre tag</strong> : sous votre pseudo, dans la barre latérale. Un clic le copie.</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('liste')} Tâches</h3>
                <ul>
                    <li><strong>Créer</strong> : touche <kbd>N</kbd>, ou le bouton « Nouvelle tâche ».</li>
                    <li><strong>Changer de statut</strong> : glissez la carte d'une colonne à l'autre.</li>
                    <li><strong>Détailler</strong> : sous-tâches, tags, priorité, échéance, récurrence.</li>
                    <li><strong>Enchaîner</strong> : le champ « Bloquée par » empêche de terminer une tâche avant celles dont elle dépend.</li>
                    <li><strong>Agir en lot</strong> : <kbd>Maj</kbd>+clic sur plusieurs cartes ouvre une barre d'actions en bas d'écran.</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('oeil')} Vues</h3>
                <ul>
                    <li><strong>Tableau</strong> — le kanban du projet courant. <kbd>G</kbd> <kbd>H</kbd></li>
                    <li><strong>Aujourd'hui</strong> — ce qui est dû aujourd'hui et ce qui est en retard, tous projets confondus.</li>
                    <li><strong>Mes tâches</strong> — tout ce qui vous est assigné, regroupé par projet.</li>
                    <li><strong>Calendrier</strong> — vos échéances mois par mois. <kbd>G</kbd> <kbd>C</kbd></li>
                    <li><strong>Statistiques</strong> — répartition, rythme et classement de l'équipe. <kbd>G</kbd> <kbd>A</kbd></li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('bulle')} Travailler à plusieurs</h3>
                <ul>
                    <li><strong>Mentionner</strong> : dans un commentaire, <code>@pseudo#1234</code> notifie la personne.</li>
                    <li><strong>Suivre une tâche</strong> : le bouton « Suivre » vous alerte à chaque changement, même sans en être responsable.</li>
                    <li><strong>Présence</strong> : les avatars en haut du tableau indiquent qui le consulte en même temps que vous.</li>
                    <li><strong>Partage public</strong> : « Partager le projet » produit un lien en lecture seule, consultable sans compte.</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('cible')} Se concentrer</h3>
                <ul>
                    <li><strong>Mode focus</strong> : depuis une tâche, masque tout le reste pour ne garder qu'elle.</li>
                    <li><strong>Temps passé</strong> : chronométré par tâche, visible sur la carte.</li>
                    <li><strong>Modèles</strong> : enregistrez une tâche ou un projet entier pour le réutiliser.</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('clavier')} Raccourcis</h3>
                <ul>
                    <li><kbd>N</kbd> tâche · <kbd>P</kbd> projet · <kbd>T</kbd> tag · <kbd>M</kbd> membre</li>
                    <li><kbd>/</kbd> filtrer · <kbd>G</kbd> <kbd>P</kbd> recherche globale · <kbd>?</kbd> aide</li>
                    <li><kbd>B</kbd> badges · <kbd>A</kbd> activité · <kbd>S</kbd> réglages</li>
                    <li><kbd>1</kbd> à <kbd>4</kbd> atteindre une colonne · <kbd>Échap</kbd> fermer</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('telephone')} Sur téléphone</h3>
                <ul>
                    <li>Balayez une carte vers la droite pour la terminer, vers la gauche pour l'archiver.</li>
                    <li>Un appui long ouvre le menu d'actions de la carte.</li>
                    <li>Corvio Space s'installe sur l'écran d'accueil depuis le menu du navigateur, sans passer par une boutique d'applications.</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('telechargement')} Importer et exporter</h3>
                <ul>
                    <li><strong>Exporter</strong> : JSON, CSV, iCal, ou impression PDF.</li>
                    <li><strong>Importer</strong> : un CSV avec les colonnes <code>title</code>, <code>description</code>, <code>status</code>, <code>priority</code>, <code>dueDate</code>.</li>
                </ul>
            </div>
            <div class="help-section">
                <h3>${icone('reglages')} Adapter à votre équipe</h3>
                <ul>
                    <li><strong>Colonnes</strong> : jusqu'à six, renommables dans les réglages du projet.</li>
                    <li><strong>Ambiance</strong> : une teinte de fond par projet, pour les distinguer d'un coup d'œil.</li>
                    <li><strong>Rôles</strong> : propriétaire, administrateur, membre ou lecteur, réglés par membre.</li>
                </ul>
            </div>
        </div>
    `;
    openModal(el.helpModal);
}

el.helpBtn?.addEventListener('click', openHelpModal);

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================

document.addEventListener('keydown', e => {
    // Don't trigger if typing in input
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        if (e.key === 'Escape') e.target.blur();
        return;
    }

    // Don't trigger if modal open (except Esc)
    const modalOpen = document.querySelector('.modal.active');
    if (modalOpen && e.key !== 'Escape') return;

    switch (e.key.toLowerCase()) {
        case 'n':
            e.preventDefault();
            if (state.currentProjectId) openTaskModal();
            else toast('Créez d\'abord un projet.', 'info');
            break;
        case 'p':
            e.preventDefault();
            openProjectModal();
            break;
        case 't':
            e.preventDefault();
            openTagModal();
            break;
        case 'm':
            e.preventDefault();
            if (state.currentProjectId) openMemberModal();
            break;
        case '/':
            e.preventDefault();
            el.searchInput?.focus();
            break;
        case '?':
            e.preventDefault();
            openModal(el.shortcutsModal);
            break;
        case 'escape':
            $$('.modal.active').forEach(m => closeModal(m));
            el.notificationsPanel?.classList.remove('open');
            $('filter-panel')?.classList.remove('open');
            // Le panneau d'activite manquait a cette liste : Echap fermait
            // deux des trois panneaux lateraux et laissait le troisieme
            // ouvert. Pour qui navigue au clavier, Echap est LA touche qui
            // referme — une exception non annoncee se lit comme une panne.
            $('activity-panel')?.classList.remove('open');
            break;
        case 'f':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                el.searchInput?.focus();
            }
            break;
        case '1':
        case '2':
        case '3':
        case '4':
            if (!e.ctrlKey && !e.metaKey) {
                const cols = ['todo', 'inprogress', 'review', 'done'];
                const col = el.columns[cols[parseInt(e.key) - 1]];
                if (col) {
                    col.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    col.classList.add('highlight');
                    setTimeout(() => col.classList.remove('highlight'), 500);
                }
            }
            break;
    }
});

// ==========================================
// ENHANCED KEYBOARD SHORTCUTS (multi-key sequences)
// ==========================================

const keyboardShortcuts = {
    'g h': () => switchView('board'),
    'g c': () => switchView('calendar'),
    // « a » comme analyse : la vue Analytics a ete absorbee par le tableau
    // de bord, le raccourci le plus connu des utilisateurs y mene desormais.
    'g a': () => switchView('dashboard'),
    'g d': () => switchView('dashboard'),
    'g p': () => openGlobalSearch(),
    'c': () => { if (state.currentProjectId) openTaskModal(); },
    'b': () => openBadgesModal(),
    's': () => openModal($('settings-modal')),
    'a': () => $('activity-panel')?.classList.toggle('open'),
    'h': () => openModal($('shortcuts-modal'))
};

let keySequence = '';
let keySequenceTimer = null;

function handleKeySequence(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (document.querySelector('.modal.active')) return;

    const key = e.key.toLowerCase();
    keySequence += key + ' ';

    clearTimeout(keySequenceTimer);
    keySequenceTimer = setTimeout(() => {
        keySequence = '';
    }, 500);

    // Check for matching shortcut
    for (const [combo, action] of Object.entries(keyboardShortcuts)) {
        if (keySequence.trim() === combo || key === combo) {
            e.preventDefault();
            action();
            keySequence = '';
            break;
        }
    }
}

document.addEventListener('keydown', handleKeySequence);

// ==========================================
// QUICK CAPTURE (parses natural-language date/priority/tags from the title)
// ==========================================

// ---------- Date detection in title (NLP-lite) ----------
// Returns { cleanTitle, dueDate, priority, tags } from a raw input
export function parseSmartTitle(raw) {
    let title = raw.trim();
    let dueDate = null;
    let priority = null;
    const tags = [];

    // Extract priority: !urgent !haute !high !moyenne !basse
    const priorityMap = {
        urgent: 'high', high: 'high', haute: 'high',
        medium: 'medium', moyenne: 'medium', moy: 'medium',
        low: 'low', basse: 'low'
    };
    const prioMatch = title.match(/!(\w+)/i);
    if (prioMatch && priorityMap[prioMatch[1].toLowerCase()]) {
        priority = priorityMap[prioMatch[1].toLowerCase()];
        title = title.replace(prioMatch[0], '').trim();
    }

    // Extract #tags
    const tagMatches = [...title.matchAll(/#(\w+)/g)];
    tagMatches.forEach(m => { tags.push(m[1]); });
    title = title.replace(/#\w+/g, '').trim();

    // Extract dates: aujourd'hui, demain, lundi-dimanche, dans X jours, "18h", "18:30"
    const now = new Date();
    let date = null;

    if (/aujourd'hui|today/i.test(title)) {
        date = new Date(now);
        title = title.replace(/aujourd'hui|today/gi, '').trim();
    } else if (/demain|tomorrow/i.test(title)) {
        date = new Date(now);
        date.setDate(date.getDate() + 1);
        title = title.replace(/demain|tomorrow/gi, '').trim();
    } else if (/après-demain|apres-demain/i.test(title)) {
        date = new Date(now);
        date.setDate(date.getDate() + 2);
        title = title.replace(/après-demain|apres-demain/gi, '').trim();
    } else {
        // Days of week
        const days = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
                       sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
        for (const [name, idx] of Object.entries(days)) {
            const re = new RegExp('\\b' + name + '\\b', 'i');
            if (re.test(title)) {
                date = new Date(now);
                const diff = (idx + 7 - now.getDay()) % 7 || 7;
                date.setDate(date.getDate() + diff);
                title = title.replace(re, '').trim();
                break;
            }
        }
    }

    // "dans X jours/heures"
    const inMatch = title.match(/dans\s+(\d+)\s*(jours?|h(?:eures?)?)/i);
    if (inMatch) {
        date = date || new Date(now);
        const n = parseInt(inMatch[1]);
        if (/h/i.test(inMatch[2])) date.setHours(date.getHours() + n);
        else date.setDate(date.getDate() + n);
        title = title.replace(inMatch[0], '').trim();
    }

    // Time: "18h", "18h30", "18:30"
    const timeMatch = title.match(/\b(\d{1,2})[h:](\d{2})?\b/);
    if (timeMatch) {
        date = date || new Date(now);
        date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || '0'), 0, 0);
        title = title.replace(timeMatch[0], '').trim();
    } else if (date) {
        date.setHours(9, 0, 0, 0); // default 9am if no time given
    }

    if (date) {
        // local ISO without seconds for datetime-local
        const tz = date.getTimezoneOffset();
        const local = new Date(date.getTime() - tz * 60000);
        dueDate = local.toISOString().slice(0, 16);
    }

    // Auto-priority from keywords if not explicit
    if (!priority) {
        if (/urgent|asap|critique|imm[eé]diat/i.test(title)) priority = 'high';
        else if (/plus tard|quand j'aurai|optionnel/i.test(title)) priority = 'low';
    }

    return { cleanTitle: title.replace(/\s+/g, ' ').trim(), dueDate, priority, tags };
}

function openQuickCapture() {
    const qc = $('quick-capture');
    const input = $('quick-capture-input');
    if (!qc || !input) return;
    if (!state.currentProjectId) {
        toast('Sélectionnez ou créez d\'abord un projet.', 'info');
        return;
    }
    qc.classList.add('active');
    input.value = '';
    setTimeout(() => input.focus(), 50);
}
function closeQuickCapture() {
    $('quick-capture')?.classList.remove('active');
}
async function submitQuickCapture() {
    const input = $('quick-capture-input');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;
    const parsed = parseSmartTitle(raw);
    if (!parsed.cleanTitle) {
        toast('Saisissez un titre.', 'error');
        return;
    }

    // Convert tag names to tag IDs (create if missing)
    const tagIds = [];
    for (const tagName of parsed.tags) {
        let existing = state.tags.find(t => t.name.toLowerCase() === tagName.toLowerCase());
        if (!existing) {
            try {
                const ref = await addDoc(collection(db, 'tags'), {
                    name: tagName,
                    color: '#46615C',
                    projectId: state.currentProjectId,
                    ...membershipFields(state.projects.find(p => p.id === state.currentProjectId), state.currentUser.uid),
                    createdAt: new Date().toISOString()
                });
                tagIds.push(ref.id);
            } catch (e) {}
        } else {
            tagIds.push(existing.id);
        }
    }

    await createTask({
        title: parsed.cleanTitle,
        description: '',
        status: 'todo',
        priority: parsed.priority || 'medium',
        dueDate: parsed.dueDate,
        tags: tagIds,
        subtasks: [],
        recurrence: 'none'
    });

    closeQuickCapture();
    playSound('pop');
    vibrate(20);
}

$('quick-capture-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitQuickCapture(); }
    if (e.key === 'Escape') closeQuickCapture();
});
document.querySelector('#quick-capture .quick-capture-overlay')?.addEventListener('click', closeQuickCapture);

// Global "+" key opens quick capture
document.addEventListener('keydown', e => {
    if (e.key === '+' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        openQuickCapture();
    }
});
