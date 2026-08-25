# CLAUDE.md — Taskflow

Workspace collaboratif / kanban. **Vanilla JS + Firebase, PWA, déployé sur Netlify.**
Pas de framework, pas de build step (site statique).

## Stack & fichiers
- `index.html` — toute l'interface (écrans auth, app, modales, menus). ~1200 lignes.
- `app.js` — toute la logique (~5800 lignes). Firebase Auth + Firestore temps réel, ES module (`import` depuis gstatic CDN).
- `styles.css` — tout le CSS (~4900 lignes), thèmes via variables `:root` (dark par défaut + light/dracula/nord/solarized).
- `sw.js` — service worker (PWA / offline). `manifest.json` — PWA (display: standalone).
- `firestore.rules`, `firestore.indexes.json` — règles & index Firestore.
- `netlify.toml` — config déploiement (headers, redirects SPA, **safelist scan-secrets**).
- `firebase.json`, `.firebaserc` (gitignored) — projet Firebase `todolist-ed2f3`.

## Lancer / tester en local
```bash
python -m http.server 8777   # puis http://localhost:8777
```
L'app nécessite l'auth Firebase pour atteindre le board. Pour inspecter l'UI sans compte :
en console, `document.getElementById('auth-container').classList.add('hidden'); document.getElementById('app').classList.remove('hidden');`

## Déploiement (Netlify)
- Site `taskflow-space` (id `87be2bc2-ea46-4353-a956-99f5b1b53fc6`), prod : https://taskflow-space.netlify.app
- Auto-déploiement depuis GitHub `kenyalkan-hash/taskflow`. Chaque branche a une preview : `https://<branche>--taskflow-space.netlify.app`.
- Branche prod = **`master`** (pas `main`).
- **Build hook** (relance déploiement) câblé dans le bouton "Lancer le build" du menu mobile.
- ⚠️ La clé API web Firebase (`AIza...`) est publique par design mais le scan de secrets Netlify la flague → elle est **safelistée** dans `netlify.toml` (`SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES`). Ne pas retirer, sinon le build échoue.

## Architecture
- `state` = objet global de l'app (`state.tasks`, `state.projects`, `state.currentProjectId`, `state.currentView`, etc.). **N'est PAS exposé sur `window`** — inaccessible depuis la console / le code injecté.
- Helpers : `$('id')` = getElementById, `$$('.sel')` = querySelectorAll. `el.*` = refs DOM cachées.
- Vues : `switchView('board'|'today'|'mytasks'|'calendar'|'analytics')` affiche/cache les conteneurs et synchronise les boutons actifs (header `.view-btn`, `.bottom-nav-item`, `.sidebar-view-btn`).
- Données temps réel : `startListeners()` (onSnapshot Firestore). Déplacer une tâche = `moveTaskToStatus(taskId, newStatus)` (réutilisé par le drag souris ET le menu mobile).

## Mobile-first — pièges importants (à connaître avant de toucher au CSS/layout)
- **Stacking context `.app`** : `.app { position:relative; z-index:1 }` crée un contexte d'empilement → tout élément `position:fixed` enfant (sidebar, panels) est plafonné à z=1 au niveau racine. **Le `#sidebar-backdrop` DOIT rester à l'intérieur de `.app`**, sinon il passe au-dessus du drawer (sombre + intouchable). Idem pour tout futur overlay.
- **Boutons écrasés** : ne jamais styler `.btn-primary` largement dans la media query mobile — une ancienne règle `width:40px` écrasait tous les boutons de formulaire. Le bouton "Nouvelle tâche" du header est scopé à `#add-task-btn`.
- **`100dvh`** : `.app` utilise `100dvh` (pas `100vh`) en mobile pour ne pas être coupé par la barre d'URL.
- **Navigation mobile** : bottom nav (`.bottom-nav`, z-180) avec FAB central → `openTaskModal`. Onglet "Menu" ouvre la sidebar drawer (z-210). Calendrier/Analytics accessibles via la section "Vues" du drawer.
- **Modales = bottom-sheets** en mobile (`.modal-content` arrondi en haut + poignée), `100dvh`/`92dvh`.
- **PWA standalone** : en-tête rendu opaque (`@media (display-mode: standalone)`) pour éviter le bandeau sombre sous la barre de statut iOS.
- **Splash anti-flash** : `#app-splash` (HTML, fond inline) masqué par `hideSplash()` dans showApp/showAuth/showAccessDenied + filet de sécurité 5s.
- **Popup d'install** : `#mobile-promo-modal`, auto-affiché 1× sur desktop (`maybeShowMobilePromo`), QR via `api.qrserver.com` basé sur `location.origin`, install natif via `beforeinstallprompt`.

### Déjà présent (ne pas réimplémenter)
Vibrations (`vibrate()`), swipe sur cartes (droite=terminer / gauche=archiver), menu long-press (`showContextMenu`), pull-to-refresh.

## Gotcha test navigateur
L'extension Chrome plafonne `window.innerWidth` (~515-1700px selon le panneau) — `resize_window` ne change pas le viewport CSS de façon fiable. Pour valider du CSS mobile : simuler l'empilement via styles inline + `elementFromPoint`, ou tester sur la preview Netlify depuis un vrai téléphone.

## Conventions
- Français dans l'UI (sans accents dans certaines chaînes JS legacy). Pas de point d'entrée build : éditer directement les 3 fichiers.
- Commits : messages en français, terminés par `Co-Authored-By: Claude ...`.
