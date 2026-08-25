<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="Corvio Space réunit les tâches de votre équipe sur un tableau partagé : échéances, responsables et commentaires au même endroit, mis à jour en direct.">
    <!-- theme-color colore la barre systeme du navigateur mobile. Elle
         annoncait #283533, un vert tres fonce, alors que l'application est
         posee sur un fond clair : la barre tranchait avec la page. -->
    <meta name="theme-color" content="#F3F6F5">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="default">

    <!-- APPARENCE — doit rester ICI, en tête de <head>, avant la feuille de
         style et avant tout élément de <body>.
         Le thème est porté par [data-theme] sur <html>. Si l'attribut n'est
         posé qu'au chargement des modules ES (différés par nature), le
         navigateur a déjà peint une page CLAIRE : quelqu'un en mode nuit voit
         un éclair blanc plein écran à chaque ouverture. Ce script est
         volontairement synchrone, sans dépendance et minuscule.
         La logique complète (préférence, suivi du système, bascule) vit dans
         src/ui.js ; ces quelques lignes n'en sont que l'amorce, et les deux
         lisent la MÊME clé et les MÊMES valeurs. -->
    <script>
        (function () {
            try {
                var p = localStorage.getItem('corviospace-apparence');
                var sombre = p === 'sombre'
                    || (p !== 'clair' && window.matchMedia
                        && window.matchMedia('(prefers-color-scheme: dark)').matches);
                document.documentElement.setAttribute('data-theme', sombre ? 'dark' : 'light');
                if (sombre) {
                    var m = document.querySelector('meta[name="theme-color"]');
                    if (m) m.setAttribute('content', '#0F1614');
                }
            } catch (e) {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        })();
    </script>
    <title>Corvio Space — le tableau partagé de votre équipe</title>

    <!-- Partage social. og:image est volontairement absent : il exige une vraie
         image hebergee en absolu (1200x630) et un lien vers un fichier
         inexistant est pire que pas de balise du tout. A ajouter des qu'on a
         un visuel. -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Corvio Space">
    <meta property="og:title" content="Corvio Space — le tableau partagé de votre équipe">
    <meta property="og:description" content="Projets, tâches et commentaires réunis sur un tableau que toute l'équipe voit se mettre à jour en direct. Une alternative aux fils d'e-mails.">
    <meta property="og:url" content="https://corvio-space.vercel.app">
    <meta property="og:locale" content="fr_FR">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="Corvio Space — le tableau partagé de votre équipe">
    <meta name="twitter:description" content="Projets, tâches et commentaires réunis sur un tableau que toute l'équipe voit se mettre à jour en direct. Une alternative aux fils d'e-mails.">
    <link rel="stylesheet" href="styles.css">
    <link rel="manifest" href="manifest.json">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2346615C' stroke-width='2'><path d='M13 2L3 14h9l-1 8 10-12h-9l1-8z'/></svg>">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
    <!-- Lien d'evitement : premier element focusable de la page, invisible
         jusqu'a ce qu'il recoive le focus. Sans lui, un utilisateur au clavier
         doit traverser toute la sidebar a chaque chargement. -->
    <a href="#main-content" class="skip-link">Aller au contenu</a>

    <!-- Splash / loading screen — shown until Firebase auth resolves, kills the
         startup flash (login form flashing for logged-in users, black flash). -->
    <!-- Le fond est ecrit en dur parce qu'il doit s'appliquer AVANT que
         styles.css soit analyse. Il valait #283533, un vert tres fonce :
         le premier rendu etait donc sombre, puis basculait en clair des
         l'arrivee de la feuille de style — exactement le flash que ce
         splash existe pour supprimer. Il porte desormais la couleur de
         fond reelle de l'application. -->
    <div id="app-splash" style="position:fixed;inset:0;background:#F3F6F5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;z-index:99999">
        <div class="splash-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
        </div>
        <div class="splash-name">Corvio Space</div>
        <div class="splash-spinner"></div>
    </div>

    <!-- Auth Screen -->
    <div class="auth-container" id="auth-container">
        <div class="auth-card">
            <div class="auth-header">
                <div class="logo">
                    <div class="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                    </div>
                    <span class="logo-text">Corvio Space</span>
                </div>
                <p class="auth-subtitle">Le tableau partagé de votre équipe</p>
            </div>

            <form id="login-form" class="auth-form">
                <h2>Connexion</h2>
                <div class="form-group">
                    <label for="login-email">Email</label>
                    <input type="email" id="login-email" placeholder="votre@email.com" required autocomplete="email">
                </div>
                <div class="form-group">
                    <label for="login-password">Mot de passe</label>
                    <input type="password" id="login-password" placeholder="Votre mot de passe" required autocomplete="current-password" minlength="6">
                </div>
                <button type="submit" class="btn-primary btn-full">Se connecter</button>
                <p class="auth-forgot">
                    <a href="#" id="forgot-password">Mot de passe oublié ?</a>
                </p>
                <p class="auth-switch">
                    Pas encore de compte ? <a href="#" id="show-register">Créer un compte</a>
                </p>
            </form>

            <form id="register-form" class="auth-form hidden">
                <h2>Créer un compte</h2>
                <div class="form-group">
                    <label for="register-name">Pseudo</label>
                    <input type="text" id="register-name" placeholder="Votre pseudo" required minlength="2" maxlength="30">
                </div>
                <div class="form-group">
                    <label for="register-email">Email</label>
                    <input type="email" id="register-email" placeholder="votre@email.com" required autocomplete="email">
                </div>
                <div class="form-group">
                    <label for="register-password">Mot de passe</label>
                    <input type="password" id="register-password" placeholder="6 caractères minimum" required minlength="6" autocomplete="new-password">
                </div>
                <div class="form-group">
                    <label for="register-password-confirm">Confirmer le mot de passe</label>
                    <input type="password" id="register-password-confirm" placeholder="Saisissez-le une seconde fois" required minlength="6" autocomplete="new-password">
                </div>
                <button type="submit" class="btn-primary btn-full">Créer mon compte</button>
                <p class="auth-switch">
                    Déjà un compte ? <a href="#" id="show-login">Se connecter</a>
                </p>
            </form>

            <div id="auth-error" class="auth-error"></div>

            <!-- Obligatoire pour un service commercial qui collecte e-mail et
                 nom : la politique de confidentialite doit etre accessible
                 AVANT la creation du compte, pas seulement une fois dedans. -->
            <p class="auth-legal">
                En créant un compte, vous acceptez les
                <a href='/mentions-legales'>mentions légales</a> et la
                <a href='/confidentialite'>politique de confidentialité</a>.
            </p>
        </div>
    </div>

    <!-- Access Denied Screen -->
    <div class="auth-container hidden" id="access-denied">
        <div class="auth-card" style="text-align:center">
            <div class="auth-header">
                <div class="logo">
                    <div class="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                    </div>
                    <span class="logo-text">Corvio Space</span>
                </div>
            </div>
            <div class="acces-refuse">
                <svg class="acces-refuse-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h2>Votre accès n'est pas encore activé</h2>
                <p>Le compte <strong class="access-denied-email"></strong> est bien créé, mais aucune licence ne lui est rattachée pour l'instant.</p>
                <p class="acces-refuse-aide">Demandez son activation à la personne qui administre votre espace. L'accès est ouvert dès que la licence est attribuée, sans nouvelle inscription.</p>
                <button id="access-denied-logout" class="btn-secondary">Se déconnecter</button>
            </div>
        </div>
    </div>

    <!-- Écran de vérification d'email (comptes créés à partir du CUTOFF) -->
    <div class="auth-container hidden" id="email-verify">
        <div class="auth-card" style="text-align:center">
            <div class="auth-header">
                <div class="logo">
                    <div class="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                    </div>
                    <span class="logo-text">Corvio Space</span>
                </div>
            </div>
            <div class="acces-refuse">
                <svg class="acces-refuse-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                    <path d="m22 7-10 6L2 7"></path>
                </svg>
                <h2>Vérifie ton adresse email</h2>
                <p>On a envoyé un lien de vérification à <strong class="email-verify-email"></strong>. Clique dessus pour activer ton compte.</p>
                <p class="acces-refuse-aide">Pense à regarder tes spams. Une fois le lien cliqué, reviens ici et appuie sur « J'ai vérifié ».</p>
                <button id="email-verify-check" class="btn-primary btn-full">J'ai vérifié mon email</button>
                <button id="email-verify-resend" class="btn-secondary btn-full">Renvoyer le lien</button>
                <button id="email-verify-logout" class="btn-text">Se déconnecter</button>
            </div>
        </div>
    </div>

    <!-- Main App -->
    <div class="app hidden" id="app">
        <!-- Notifications Panel -->
        <div class="notifications-panel" id="notifications-panel">
            <div class="notifications-header">
                <h3>Notifications</h3>
                <button class="btn-text" id="mark-all-read">Tout marquer lu</button>
            </div>
            <div class="notifications-list" id="notifications-list">
                <div class="notifications-empty">Aucune notification. Vous serez prévenu ici quand une tâche que vous suivez évolue.</div>
            </div>
        </div>

        <!-- Filter Panel -->
        <div class="filter-panel" id="filter-panel">
            <div class="filter-header">
                <h3>Filtres</h3>
                <button class="btn-text" id="clear-filters">Effacer</button>
            </div>
            <div class="filter-content">
                <div class="filter-group">
                    <label for="filter-priority">Priorité</label>
                    <select id="filter-priority">
                        <option value="">Toutes</option>
                        <option value="high">Haute</option>
                        <option value="medium">Moyenne</option>
                        <option value="low">Basse</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-assignee">Responsable</label>
                    <select id="filter-assignee">
                        <option value="">Tous</option>
                    </select>
                </div>
                <div class="filter-group">
                    <label for="filter-date">Échéance</label>
                    <select id="filter-date">
                        <option value="">Toutes</option>
                        <option value="today">Aujourd'hui</option>
                        <option value="week">Cette semaine</option>
                        <option value="overdue">En retard</option>
                        <option value="no-date">Sans date</option>
                    </select>
                </div>
                <div class="filter-group">
                    <span class="form-legende" id="filter-tags-legende">Tags</span>
                    <div id="filter-tags" class="filter-tags" role="group" aria-labelledby="filter-tags-legende"></div>
                </div>
                <div class="filter-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="filter-archived">
                        Afficher les archives
                    </label>
                </div>
            </div>
        </div>

        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <div class="logo">
                    <div class="logo-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                        </svg>
                    </div>
                    <span class="logo-text">Corvio Space</span>
                </div>

                <!-- Bascule jour / nuit. Posée ici plutôt que dans l'en-tête :
                     .sidebar-header est déjà en `justify-content: space-between`
                     et n'avait qu'un seul enfant — la place à droite du
                     logotype l'attendait.
                     Les deux icônes sont présentes dans le balisage et c'est le
                     CSS qui montre la bonne. Rien n'est reconstruit au clic :
                     pas de scintillement, et le focus clavier reste sur le
                     bouton.
                     L'icône montre la DESTINATION, pas l'état courant : en mode
                     nuit on voit un soleil, parce que cliquer amène le jour. Un
                     bouton annonce ce qu'il fait. -->
                <button class="btn-icon theme-toggle" id="theme-toggle-btn">
                    <svg class="icone icone-soleil" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>
                    <svg class="icone icone-lune" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>
                </button>
            </div>

            <div class="user-info" id="user-info">
                <!-- L'initiale vit dans son propre <span> : updateUserUI()
                     ecrivait `userAvatar.textContent`, ce qui remplacait TOUS
                     les enfants du label — y compris le champ fichier ci-
                     dessous. Le label se retrouvait sans controle associe et
                     cliquer sur l'avatar ne faisait plus rien. -->
                <label class="user-avatar" id="user-avatar" title="Changer votre photo de profil">
                    <span class="user-avatar-initiale" id="user-avatar-initiale" aria-hidden="true">U</span>
                    <span class="sr-only">Changer votre photo de profil</span>
                    <input type="file" id="avatar-input" accept="image/*" style="display:none;">
                </label>
                <div class="user-details">
                    <span class="user-name" id="user-name">Utilisateur</span>
                    <span class="user-handle" id="user-handle" title="Copier votre tag"></span>
                    <span class="user-email" id="user-email">email@example.com</span>
                </div>
                <button class="btn-icon" id="logout-btn" aria-label="Se déconnecter" title="Déconnexion">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>

            <!-- Quick views (mobile drawer only) -->
            <div class="sidebar-section sidebar-views">
                <div class="section-title"><span>Vues</span></div>
                <div class="sidebar-views-list">
                    <button class="sidebar-view-btn active" data-view="board">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        <span>Tableau</span>
                    </button>
                    <button class="sidebar-view-btn" data-view="today">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                        <span>Aujourd'hui</span>
                    </button>
                    <button class="sidebar-view-btn" data-view="mytasks">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                        <span>Mes tâches</span>
                    </button>
                    <button class="sidebar-view-btn" data-view="calendar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                        <span>Calendrier</span>
                    </button>
                    <button class="sidebar-view-btn" data-view="dashboard">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
                        <span>Tableau de bord</span>
                    </button>
                </div>
            </div>

            <div class="sidebar-section">
                <div class="section-title">
                    <span>Mes Projets</span>
                    <button class="btn-icon" id="add-project-btn" aria-label="Nouveau projet" title="Nouveau projet (P)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <ul class="projects-list" id="projects-list"></ul>
            </div>

            <div class="sidebar-section">
                <div class="section-title">
                    <span>Tags</span>
                    <button class="btn-icon" id="add-tag-btn" aria-label="Nouveau tag" title="Nouveau tag (T)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div class="tags-list" id="tags-list"></div>
            </div>

            <div class="sidebar-footer">
                <!-- Gamification Widget -->
                <div class="gamification-widget" id="gamification-widget" title="Voir mes badges">
                    <div class="gamification-header">
                        <div class="gamification-level">
                            <span class="level-badge">Niv. 1</span>
                            <span class="level-points">0 pts</span>
                        </div>
                        <!-- « gamification-série » : la classe avait ete accentuee
                             par une passe de correction de texte qui a deborde sur
                             du code. Aucune regle CSS ne correspondait, le
                             compteur s'affichait donc sans style jusqu'au premier
                             rendu de productivity.js. La regle s'appelle
                             .gamification-streak. -->
                        <div class="gamification-streak">
                            <svg class="icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-.5-2 2 1.5 3.5 3.5 3.5 6a6 6 0 0 1-12 0C6 10 12 8 12 2z"></path></svg>
                            <span>0&nbsp;jour</span>
                        </div>
                    </div>
                    <div class="gamification-progress">
                        <div class="progress-bar-mini"><div class="progress-fill-mini"></div></div>
                        <span class="progress-text">0/100 XP</span>
                    </div>
                    <div class="gamification-badges"></div>
                </div>

                <div class="stats-card">
                    <div class="stats-header">
                        <span>Progression</span>
                        <span id="progress-percent">0%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <div class="stats-details">
                        <span><strong id="completed-count">0</strong> terminees</span>
                        <span><strong id="total-count">0</strong> total</span>
                    </div>
                </div>
                <div class="sidebar-actions">
                    <button class="btn-text" id="save-template-btn" title="Enregistrer ce projet comme modèle réutilisable">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                        Modèle
                    </button>
                    <button class="btn-text" id="browse-templates-btn" title="Mes modèles">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M4 4h6v6H4z"></path>
                            <path d="M14 4h6v6h-6z"></path>
                            <path d="M4 14h6v6H4z"></path>
                            <path d="M14 14h6v6h-6z"></path>
                        </svg>
                        Mes modèles
                    </button>
                    <button class="btn-text admin-only hidden" id="admin-btn" title="Gérer les licences des comptes">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        </svg>
                        Admin
                    </button>
                    <button class="btn-text" id="settings-btn" title="Paramètres">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        Paramètres
                    </button>
                    <!-- Promo: installer l'app sur mobile -->
                    <button class="btn-text" id="mobile-app-btn" title="Installer Corvio Space sur votre téléphone">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                            <line x1="12" y1="18" x2="12" y2="18"></line>
                        </svg>
                        Appli mobile
                    </button>
                    <!-- Deploy / trigger Netlify build (mobile drawer) -->
                    <!-- Masque par defaut : auth.js ne l'affiche que pour le
                         compte d'administration. Outil de developpement, il
                         n'a rien a faire dans l'interface d'un client. -->
                    <button class="btn-text deploy-btn admin-only hidden" id="deploy-btn" title="Publier la version en ligne">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                            <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
                            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
                        </svg>
                        Lancer le build
                    </button>
                </div>
                <div class="keyboard-hint">
                    <kbd>N</kbd> Tâche
                    <kbd>G P</kbd> Recherche
                    <kbd>?</kbd> Aide
                </div>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="main-content" id="main-content" tabindex="-1">
            <header class="main-header">
                <div class="header-left">
                    <button class="btn-icon mobile-menu" id="mobile-menu" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="sidebar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="3" y1="12" x2="21" y2="12"></line>
                            <line x1="3" y1="6" x2="21" y2="6"></line>
                            <line x1="3" y1="18" x2="21" y2="18"></line>
                        </svg>
                    </button>
                    <div class="current-project">
                        <div class="project-title-row">
                            <h1 id="project-title">Aucun projet sélectionné</h1>
                            <!-- Slot du badge de rôle. Placé À CÔTÉ du titre, pas
                                 dedans : le <h1> utilise -webkit-box (troncature
                                 sur deux lignes) qui rejetait le badge inline sur
                                 une ligne à part. Ici il reste aligné au titre. -->
                            <span id="my-role-badge" class="role-badge" hidden></span>
                        </div>
                        <p id="project-description">Choisissez un projet dans la barre latérale, ou créez-en un.</p>
                    </div>
                </div>
                <div class="header-actions">
                    <!-- View Toggle -->
                    <div class="view-toggle">
                        <button class="view-btn active" data-view="board" title="Vue Kanban">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                        </button>
                        <button class="view-btn" data-view="today" title="Aujourd'hui">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span class="view-badge" id="badge-today"></span>
                        </button>
                        <button class="view-btn" data-view="mytasks" title="Mes tâches, tous projets confondus">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <path d="M9 11l3 3L22 4"></path>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                            </svg>
                            <span class="view-badge" id="badge-mytasks"></span>
                        </button>
                        <button class="view-btn" data-view="calendar" title="Vue Calendrier">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                        </button>
                        <button class="view-btn" data-view="dashboard" title="Tableau de bord — tous les projets" aria-label="Tableau de bord, tous les projets">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <rect x="3" y="3" width="7" height="9"></rect>
                                <rect x="14" y="3" width="7" height="5"></rect>
                                <rect x="14" y="12" width="7" height="9"></rect>
                                <rect x="3" y="16" width="7" height="5"></rect>
                            </svg>
                        </button>
                    </div>

                    <!-- Project Members + Live Presence -->
                    <div class="project-members" id="project-members">
                        <div class="presence-avatars" id="presence-avatars" title="Personnes actuellement en ligne sur ce projet"></div>
                        <div class="members-avatars" id="members-avatars"></div>
                        <button class="btn-icon btn-add-member" id="add-member-btn" title="Inviter quelqu'un sur ce projet (M)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="8.5" cy="7" r="4"></circle>
                                <line x1="20" y1="8" x2="20" y2="14"></line>
                                <line x1="23" y1="11" x2="17" y2="11"></line>
                            </svg>
                        </button>
                    </div>

                    <!-- Search -->
                    <div class="search-box">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                        </svg>
                        <label for="search-input" class="sr-only">Filtrer les tâches du projet</label>
                        <input type="text" id="search-input" placeholder="Filtrer les tâches">
                    </div>

                    <!-- Plein ecran. Les deux icones (entrer / quitter) sont
                         presentes ; pleinEcran.js montre la bonne selon l'etat.
                         Masque si le navigateur ne supporte pas l'API. -->
                    <button class="btn-icon" id="fullscreen-btn" aria-label="Passer en plein écran" title="Plein écran (F)">
                        <svg class="icone icone-entrer" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>
                        <svg class="icone icone-quitter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>
                    </button>

                    <!-- Filter Button -->
                    <button class="btn-icon" id="filter-btn" aria-label="Filtres" title="Filtres">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                    </button>

                    <!-- Notifications Bell -->
                    <button class="btn-icon notifications-btn" id="notifications-btn" title="Notifications">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <span class="notification-badge" id="notification-badge">0</span>
                    </button>

                    <!-- Menu "plus d'actions" : regroupe les actions secondaires
                         qui saturaient la barre (15+ icones). Tous les IDs sont
                         conserves a l'identique — app.js s'y accroche par ID. -->
                    <div class="dropdown header-more" id="header-more">
                        <button class="btn-icon" id="header-more-btn" title="Plus d'actions" aria-haspopup="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <circle cx="5" cy="12" r="1"></circle>
                                <circle cx="12" cy="12" r="1"></circle>
                                <circle cx="19" cy="12" r="1"></circle>
                            </svg>
                        </button>
                        <div class="dropdown-menu dropdown-menu-wide">
                            <button id="edit-project-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                Modifier le projet
                            </button>
                            <button id="share-project-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                                Partager le projet
                            </button>
                            <button id="global-search-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                                Recherche globale
                            </button>
                            <button id="activity-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                                Activité récente
                            </button>
                            <button id="help-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                Aide &amp; raccourcis
                            </button>

                            <div class="dropdown-sep"></div>
                            <div class="dropdown-label">Exporter</div>
                            <button id="export-json">Export JSON</button>
                            <button id="export-csv">Export CSV</button>
                            <button id="export-ics">Export iCal (.ics)</button>
                            <button id="export-pdf">Imprimer / PDF</button>
                            <button id="import-csv-btn">Importer CSV</button>
                            <input type="file" id="import-csv-file" accept=".csv,.json" style="display:none;">

                            <div class="dropdown-sep"></div>
                            <div class="dropdown-label">Affichage</div>
                            <button id="toggle-compact">Mode compact</button>
                            <button id="toggle-sounds">Activer / désactiver les sons</button>
                        </div>
                    </div>

                    <!-- Add Task Button -->
                    <button class="btn-primary" id="add-task-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>Nouvelle tâche</span>
                    </button>
                </div>
            </header>

            <!-- Active Filters Display -->
            <div class="active-filters" id="active-filters" style="display:none;"></div>

            <!-- Kanban Board -->
            <div class="board" id="board">
                <section class="column" data-status="todo" aria-labelledby="todo-titre">
                    <div class="column-header">
                        <div class="column-title">
                            <span class="column-dot todo" aria-hidden="true"></span>
                            <h2 id="todo-titre">À faire</h2>
                            <span class="column-count" id="todo-count" aria-label="0 tâche dans «&nbsp;À faire&nbsp;»">0</span>
                        </div>
                    </div>
                    <div class="column-content" id="todo-tasks"></div>
                    <button type="button" class="column-ajout" data-status="todo" aria-label="Nouvelle tâche dans «&nbsp;À faire&nbsp;»">
                        <svg class="icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Ajouter</span>
                    </button>
                </section>

                <section class="column" data-status="inprogress" aria-labelledby="inprogress-titre">
                    <div class="column-header">
                        <div class="column-title">
                            <span class="column-dot inprogress" aria-hidden="true"></span>
                            <h2 id="inprogress-titre">En cours</h2>
                            <span class="column-count" id="inprogress-count" aria-label="0 tâche dans «&nbsp;En cours&nbsp;»">0</span>
                        </div>
                    </div>
                    <div class="column-content" id="inprogress-tasks"></div>
                    <button type="button" class="column-ajout" data-status="inprogress" aria-label="Nouvelle tâche dans «&nbsp;En cours&nbsp;»">
                        <svg class="icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Ajouter</span>
                    </button>
                </section>

                <section class="column" data-status="review" aria-labelledby="review-titre">
                    <div class="column-header">
                        <div class="column-title">
                            <span class="column-dot review" aria-hidden="true"></span>
                            <h2 id="review-titre">En revue</h2>
                            <span class="column-count" id="review-count" aria-label="0 tâche dans «&nbsp;En revue&nbsp;»">0</span>
                        </div>
                    </div>
                    <div class="column-content" id="review-tasks"></div>
                    <button type="button" class="column-ajout" data-status="review" aria-label="Nouvelle tâche dans «&nbsp;En revue&nbsp;»">
                        <svg class="icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Ajouter</span>
                    </button>
                </section>

                <section class="column" data-status="done" aria-labelledby="done-titre">
                    <div class="column-header">
                        <div class="column-title">
                            <span class="column-dot done" aria-hidden="true"></span>
                            <h2 id="done-titre">Terminé</h2>
                            <span class="column-count" id="done-count" aria-label="0 tâche dans «&nbsp;Terminé&nbsp;»">0</span>
                        </div>
                    </div>
                    <div class="column-content" id="done-tasks"></div>
                    <button type="button" class="column-ajout" data-status="done" aria-label="Nouvelle tâche dans «&nbsp;Terminé&nbsp;»">
                        <svg class="icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        <span>Ajouter</span>
                    </button>
                </section>
            </div>

            <!-- Calendar View -->
            <div class="calendar-view hidden" id="calendar-container"></div>

            <!-- My Tasks View (cross-projects) -->
            <div class="mytasks-view hidden" id="mytasks-container"></div>

            <!-- Today View -->
            <div class="today-view hidden" id="today-container"></div>

            <!-- Tableau de bord : tous projets, avec triage.
                 Il a absorbe l'ancienne vue Analytics (#analytics-container),
                 qui ne montrait que le projet ouvert. -->
            <div class="analytics-view hidden" id="dashboard-container"></div>

            <!-- Empty State -->
            <div class="empty-board" id="empty-board">
                <div class="empty-illustration">
                    <svg viewBox="0 0 200 200" fill="none">
                        <circle cx="100" cy="100" r="80" stroke="url(#gradient1)" stroke-width="2" stroke-dasharray="10 5"/>
                        <rect x="60" y="70" width="80" height="60" rx="8" fill="url(#gradient2)" opacity="0.3"/>
                        <rect x="70" y="85" width="40" height="6" rx="3" fill="currentColor" opacity="0.5"/>
                        <rect x="70" y="97" width="60" height="6" rx="3" fill="currentColor" opacity="0.3"/>
                        <rect x="70" y="109" width="30" height="6" rx="3" fill="currentColor" opacity="0.2"/>
                        <defs>
                            <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#46615C"/>
                                <stop offset="100%" stop-color="#B09964"/>
                            </linearGradient>
                            <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stop-color="#46615C"/>
                                <stop offset="100%" stop-color="#B09964"/>
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
                <h2>Créez votre premier projet</h2>
                <p>Un projet, c'est un tableau et son équipe. Les tâches s'y rangent en colonnes, de « À faire » à « Terminé ».</p>
                <button class="btn-primary btn-large" id="create-first-project">Créer un projet</button>
            </div>
        </main>

        <!-- ============================================================
             MOBILE BOTTOM NAVIGATION (app-native) - visible <= 900px
             ============================================================ -->
        <nav class="bottom-nav" id="bottom-nav" aria-label="Navigation principale">
            <button class="bottom-nav-item active" data-view="board" aria-label="Tableau">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span>Tableau</span>
            </button>
            <button class="bottom-nav-item" data-view="today" aria-label="Aujourd'hui">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>Aujourd'hui</span>
                <span class="bottom-nav-badge" id="bn-badge-today"></span>
            </button>

            <button class="bottom-nav-fab" id="bottom-nav-fab" aria-label="Nouvelle tâche">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" width="26" height="26">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </button>

            <button class="bottom-nav-item" data-view="mytasks" aria-label="Mes tâches">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span>Mes tâches</span>
                <span class="bottom-nav-badge" id="bn-badge-mytasks"></span>
            </button>
            <button class="bottom-nav-item" id="bottom-nav-menu" aria-label="Menu">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span>Menu</span>
            </button>
        </nav>

        <!-- Mobile sidebar backdrop — MUST live inside .app so it shares the
             same stacking context as the sidebar (otherwise it paints OVER the
             drawer: dark + untappable). -->
        <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    </div>

    <!-- Modal: Nouveau Projet -->
    <div class="modal" id="project-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Nouveau projet</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <form id="project-form">
                <div class="form-group">
                    <label for="project-name">Nom du projet</label>
                    <input type="text" id="project-name" placeholder="Ex : Lancement produit, Campagne marketing…" required maxlength="50">
                </div>
                <div class="form-group">
                    <label for="project-desc">Description</label>
                    <textarea id="project-desc" placeholder="À quoi sert ce projet, et pour qui ?" rows="3" maxlength="500"></textarea>
                </div>
                <div class="form-group">
                    <span class="form-legende" id="project-color-legende">Couleur</span>
                    <!-- Palette « pigments naturels » : huit teintes sourdes
                         accordees au vert sauge et au laiton de l'identite.
                         L'ancienne serie (indigo, violet, rose, cyan) etait la
                         palette SaaS par defaut et jurait avec tout le reste.
                         Le nom est porte par aria-label : sans lui, ces boutons
                         ne se distinguent que par leur couleur. -->
                    <div class="color-picker" role="group" aria-labelledby="project-color-legende">
                        <button type="button" class="color-option active" data-color="#46615C" style="background: #46615C;" aria-label="Sauge"></button>
                        <button type="button" class="color-option" data-color="#3F6B7D" style="background: #3F6B7D;" aria-label="Ardoise"></button>
                        <button type="button" class="color-option" data-color="#7E6A42" style="background: #7E6A42;" aria-label="Laiton"></button>
                        <button type="button" class="color-option" data-color="#A15C43" style="background: #A15C43;" aria-label="Terre cuite"></button>
                        <button type="button" class="color-option" data-color="#8C4A57" style="background: #8C4A57;" aria-label="Grenat"></button>
                        <button type="button" class="color-option" data-color="#5F6B4A" style="background: #5F6B4A;" aria-label="Olive"></button>
                        <button type="button" class="color-option" data-color="#7A7268" style="background: #7A7268;" aria-label="Taupe"></button>
                        <button type="button" class="color-option" data-color="#2F3F3C" style="background: #2F3F3C;" aria-label="Encre"></button>
                    </div>
                </div>
                <div class="form-group">
                    <span class="form-legende" id="project-bg-legende">Ambiance du projet</span>
                    <!-- Les valeurs data-bg sont ENREGISTREES EN BASE
                         (`project.background`, voir projects.js). Les renommer
                         effacerait l'ambiance de tous les projets existants :
                         on ne change que le libelle visible et la teinte. Les
                         anciens degrades violet/cyan/indigo sont remplaces par
                         la palette « pigments naturels ». -->
                    <div class="bg-picker" id="project-bg-picker" role="group" aria-labelledby="project-bg-legende">
                        <button type="button" class="bg-option active" data-bg="none">Aucune</button>
                        <button type="button" class="bg-option" data-bg="aurora" style="background:linear-gradient(135deg,#46615C,#2F3F3C);">Sauge</button>
                        <button type="button" class="bg-option" data-bg="ocean" style="background:linear-gradient(135deg,#3F6B7D,#2E4E5C);">Ardoise</button>
                        <button type="button" class="bg-option" data-bg="sunset" style="background:linear-gradient(135deg,#B09964,#7E6A42);">Laiton</button>
                        <button type="button" class="bg-option" data-bg="forest" style="background:linear-gradient(135deg,#A15C43,#6B3B2B);">Terre cuite</button>
                        <button type="button" class="bg-option" data-bg="midnight" style="background:linear-gradient(135deg,#5F6B4A,#3C4430);">Olive</button>
                    </div>
                </div>
                <div class="form-group">
                    <label for="project-columns">Colonnes du tableau</label>
                    <input type="text" id="project-columns" placeholder="À faire, En cours, En revue, Terminé" maxlength="200">
                    <span class="form-hint">Séparez les noms par une virgule. Laissez vide pour conserver les quatre colonnes par défaut. Six au maximum.</span>
                </div>
                <!-- Trois champs distincts sous une legende commune : chacun
                     porte son propre libelle associe, sinon un lecteur
                     d'ecran annonce trois zones de saisie sans nom. -->
                <fieldset class="form-group form-groupe-champs">
                    <legend class="form-legende">Notifications externes <span class="form-legende-note">(facultatif)</span></legend>
                    <span class="form-hint" id="webhook-aide">Un message est envoyé à chaque création de tâche, chaque changement de colonne et chaque tâche terminée. Vous pouvez renseigner Discord, Telegram, ou les deux.</span>
                    <label for="project-webhook">Adresse du webhook Discord</label>
                    <input type="url" id="project-webhook" placeholder="https://discord.com/api/webhooks/…" maxlength="300" aria-describedby="webhook-aide">
                    <label for="project-telegram-token">Jeton du bot Telegram</label>
                    <input type="text" id="project-telegram-token" placeholder="123456:ABC-DEF…" maxlength="100">
                    <label for="project-telegram-chat">Identifiant de conversation Telegram</label>
                    <input type="text" id="project-telegram-chat" placeholder="-100123456789" maxlength="50">
                </fieldset>
                <div class="modal-actions">
                    <button type="button" class="btn-danger" id="delete-project-btn" style="display:none;">Supprimer le projet</button>
                    <div style="flex:1;"></div>
                    <button type="button" class="btn-secondary modal-cancel">Annuler</button>
                    <button type="submit" class="btn-primary">Créer le projet</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Ajouter membre -->
    <div class="modal" id="member-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Inviter sur ce projet</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <form id="member-form">
                <div class="form-group">
                    <label for="member-email">Tag ou adresse e-mail</label>
                    <div class="input-with-icon">
                        <span class="input-icon" aria-hidden="true">#</span>
                        <input type="text" id="member-email" placeholder="camille#1234 ou camille@exemple.fr" required autocomplete="off" aria-describedby="member-aide">
                    </div>
                    <span class="form-hint" id="member-aide">La personne doit déjà avoir un compte. Son tag figure sous son nom, dans la barre latérale.</span>
                </div>
                <div class="current-members">
                    <h3 class="form-legende">Membres du projet</h3>
                    <div class="members-list" id="modal-members-list"></div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary modal-cancel">Fermer</button>
                    <button type="submit" class="btn-primary">Inviter</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Nouveau Tag -->
    <div class="modal" id="tag-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-small">
            <div class="modal-header">
                <h2>Nouveau tag</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <form id="tag-form">
                <div class="form-group">
                    <label for="tag-name">Nom du tag</label>
                    <input type="text" id="tag-name" placeholder="Design, Rédaction, Urgent…" required maxlength="20">
                </div>
                <div class="form-group">
                    <span class="form-legende" id="tag-color-legende">Couleur</span>
                    <!-- Meme palette que les projets : un tag et un projet
                         cohabitent en permanence a l'ecran, deux series de
                         couleurs differentes rendaient l'ensemble bruyant. -->
                    <div class="color-picker" role="group" aria-labelledby="tag-color-legende">
                        <button type="button" class="color-option tag-color active" data-color="#46615C" style="background: #46615C;" aria-label="Sauge"></button>
                        <button type="button" class="color-option tag-color" data-color="#3F6B7D" style="background: #3F6B7D;" aria-label="Ardoise"></button>
                        <button type="button" class="color-option tag-color" data-color="#7E6A42" style="background: #7E6A42;" aria-label="Laiton"></button>
                        <button type="button" class="color-option tag-color" data-color="#A15C43" style="background: #A15C43;" aria-label="Terre cuite"></button>
                        <button type="button" class="color-option tag-color" data-color="#8C4A57" style="background: #8C4A57;" aria-label="Grenat"></button>
                        <button type="button" class="color-option tag-color" data-color="#5F6B4A" style="background: #5F6B4A;" aria-label="Olive"></button>
                        <button type="button" class="color-option tag-color" data-color="#7A7268" style="background: #7A7268;" aria-label="Taupe"></button>
                        <button type="button" class="color-option tag-color" data-color="#2F3F3C" style="background: #2F3F3C;" aria-label="Encre"></button>
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary modal-cancel">Annuler</button>
                    <button type="submit" class="btn-primary">Créer</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Tache -->
    <div class="modal" id="task-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2 id="task-modal-title">Nouvelle tâche</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <form id="task-form">
                <div class="form-group">
                    <label for="task-title">Intitulé</label>
                    <input type="text" id="task-title" placeholder="Que faut-il faire&nbsp;?" required maxlength="200">
                </div>
                <div class="form-group">
                    <label for="task-desc">Description</label>
                    <textarea id="task-desc" placeholder="Contexte, lien utile, critère de validation…" rows="3"></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="task-status">Statut</label>
                        <select id="task-status">
                            <option value="todo">À faire</option>
                            <option value="inprogress">En cours</option>
                            <option value="review">En revue</option>
                            <option value="done">Terminé</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="task-priority">Priorité</label>
                        <select id="task-priority">
                            <option value="low">Basse</option>
                            <option value="medium" selected>Moyenne</option>
                            <option value="high">Haute</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="task-assignee">Assigné à</label>
                        <select id="task-assignee">
                            <option value="">Personne</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label for="task-due">Date limite</label>
                        <input type="datetime-local" id="task-due">
                    </div>
                    <div class="form-group">
                        <label for="task-recurrence">Récurrence</label>
                        <select id="task-recurrence">
                            <option value="none">Aucune</option>
                            <option value="daily">Quotidienne</option>
                            <option value="weekly">Hebdomadaire</option>
                            <option value="biweekly">Bi-hebdomadaire</option>
                            <option value="monthly">Mensuelle</option>
                            <option value="quarterly">Trimestrielle</option>
                            <option value="yearly">Annuelle</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <span class="form-legende" id="task-tags-legende">Tags</span>
                    <div class="tags-selector" id="tags-selector" role="group" aria-labelledby="task-tags-legende"></div>
                </div>
                <div class="form-group">
                    <label for="task-blocked-by">Bloquée par</label>
                    <select id="task-blocked-by" multiple size="3" aria-describedby="blocked-aide"></select>
                    <span class="form-hint" id="blocked-aide">Cette tâche ne pourra pas être terminée avant celles que vous sélectionnez ici. Ctrl+clic pour en choisir plusieurs.</span>
                </div>
                <div class="form-group">
                    <span class="form-legende" id="subtasks-legende">Sous-tâches</span>
                    <div class="subtasks-container" id="subtasks-container" role="group" aria-labelledby="subtasks-legende"></div>
                    <button type="button" class="btn-text" id="add-subtask">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Ajouter une sous-tâche
                    </button>
                </div>

                <!-- Attachments -->
                <div class="form-group" id="attachments-group">
                    <span class="form-legende" id="attachments-legende">Pièces jointes <span class="form-legende-note">(700 Ko maximum par fichier)</span></span>
                    <div class="attachments-list" id="attachments-list" role="group" aria-labelledby="attachments-legende"></div>
                    <div class="attachments-dropzone" id="attachments-dropzone">
                        <input type="file" id="attachment-input" multiple style="display:none;" accept="*/*">
                        <button type="button" class="btn-text" id="attachment-pick-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                            Ajouter un fichier
                        </button>
                        <span class="attachments-hint">ou déposez vos fichiers dans cette zone</span>
                    </div>
                </div>

                <!-- Time Tracking -->
                <div class="form-group" id="time-tracking-container" style="display:none;"></div>

                <!-- Comments Section -->
                <div class="form-group comments-section" id="comments-section" style="display: none;">
                    <h3 class="form-legende" id="comments-legende">Commentaires</h3>
                    <!-- aria-live : un commentaire ajoute par un collaborateur
                         arrive par onSnapshot, sans action de l'utilisateur.
                         Sans region live, rien ne l'annonce. -->
                    <div class="comments-list" id="comments-list" role="log" aria-live="polite" aria-labelledby="comments-legende"></div>
                    <div class="comment-input">
                        <label for="comment-input" class="sr-only">Écrire un commentaire</label>
                        <input type="text" id="comment-input" placeholder="Écrire un commentaire…">
                        <button type="button" class="btn-icon" id="send-comment" aria-label="Publier le commentaire">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        </button>
                    </div>
                </div>

                <div class="modal-actions">
                    <div class="actions-left">
                        <button type="button" class="btn-danger" id="delete-task-btn" style="display: none;">Supprimer</button>
                        <button type="button" class="btn-secondary" id="archive-task-btn" style="display: none;">Archiver</button>
                        <button type="button" class="btn-text" id="duplicate-task-btn" style="display: none;">Dupliquer</button>
                        <button type="button" class="btn-text" id="task-template-btn" title="Enregistrer cette tâche comme modèle réutilisable">
                            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 3 14.9 9.1 21.5 10 16.7 14.6 17.9 21.1 12 18 6.1 21.1 7.3 14.6 2.5 10 9.1 9.1 12 3"></polygon></svg>
                            Modèle
                        </button>
                        <button type="button" class="btn-text" id="snooze-task-btn" style="display: none;" title="Reporter l'échéance à demain">
                            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>
                            Reporter
                        </button>
                        <button type="button" class="btn-text" id="watch-task-btn" style="display: none;" title="Être notifié des changements sur cette tâche">
                            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            Suivre
                        </button>
                        <button type="button" class="btn-text" id="focus-task-btn" style="display: none;" title="Masquer tout le reste et lancer le minuteur">
                            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5"></circle></svg>
                            Focus
                        </button>
                    </div>
                    <div class="actions-right">
                        <button type="button" class="btn-secondary modal-cancel">Annuler</button>
                        <button type="submit" class="btn-primary" id="save-task-btn">Créer</button>
                    </div>
                </div>
            </form>
        </div>
    </div>

    <!-- Modal: Raccourcis clavier -->
    <div class="modal" id="shortcuts-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Raccourcis clavier</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div class="shortcuts-list">
                <div class="shortcut-group">
                    <h3>Navigation</h3>
                    <div class="shortcut-item"><kbd>G</kbd><kbd>H</kbd><span>Vue Tableau</span></div>
                    <div class="shortcut-item"><kbd>G</kbd><kbd>C</kbd><span>Vue Calendrier</span></div>
                    <div class="shortcut-item"><kbd>G</kbd><kbd>D</kbd><span>Tableau de bord</span></div>
                    <div class="shortcut-item"><kbd>G</kbd><kbd>P</kbd><span>Recherche globale</span></div>
                    <div class="shortcut-item"><kbd>1</kbd>-<kbd>4</kbd><span>Colonnes</span></div>
                </div>
                <div class="shortcut-group">
                    <h3>Actions</h3>
                    <div class="shortcut-item"><kbd>N</kbd><span>Nouvelle tâche</span></div>
                    <div class="shortcut-item"><kbd>P</kbd><span>Nouveau projet</span></div>
                    <div class="shortcut-item"><kbd>T</kbd><span>Nouveau tag</span></div>
                    <div class="shortcut-item"><kbd>M</kbd><span>Ajouter membre</span></div>
                    <div class="shortcut-item"><kbd>C</kbd><span>Créer tâche rapide</span></div>
                </div>
                <div class="shortcut-group">
                    <h3>Sur une tâche</h3>
                    <div class="shortcut-item"><kbd>Tab</kbd><span>Parcourir les tâches</span></div>
                    <div class="shortcut-item"><kbd>Entrée</kbd><span>Ouvrir la tâche</span></div>
                    <div class="shortcut-item"><kbd>Ctrl</kbd><kbd>←</kbd><span>Colonne précédente</span></div>
                    <div class="shortcut-item"><kbd>Ctrl</kbd><kbd>→</kbd><span>Colonne suivante</span></div>
                </div>
                <div class="shortcut-group">
                    <h3>Autres</h3>
                    <div class="shortcut-item"><kbd>B</kbd><span>Mes badges</span></div>
                    <div class="shortcut-item"><kbd>A</kbd><span>Activité</span></div>
                    <div class="shortcut-item"><kbd>S</kbd><span>Paramètres</span></div>
                    <div class="shortcut-item"><kbd>?</kbd><span>Cette aide</span></div>
                    <div class="shortcut-item"><kbd>Esc</kbd><span>Fermer</span></div>
                </div>
                <div class="shortcut-group">
                    <h3>Mobile</h3>
                    <div class="shortcut-item"><span>Balayer vers la droite</span><span>Terminer</span></div>
                    <div class="shortcut-item"><span>Balayer vers la gauche</span><span>Archiver</span></div>
                    <div class="shortcut-item"><span>Appui long</span><span>Menu d'actions</span></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal: Parametres -->
    <!-- Admin Panel Modal -->
    <div class="modal" id="admin-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Administration — Licences</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div id="admin-panel-content"></div>
        </div>
    </div>

    <div class="modal" id="settings-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Paramètres</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div id="settings-content"></div>
        </div>
    </div>

    <!-- Activity Panel -->
    <div class="activity-panel" id="activity-panel">
        <div class="activity-header">
            <h3>Activité récente</h3>
            <!-- Le `onclick=` qui vivait ici etait le SEUL gestionnaire en
                 ligne du fichier, et la Content-Security-Policy de
                 netlify.toml n'autorise pas 'unsafe-inline' pour les
                 scripts : au premier deploiement portant cet en-tete, ce
                 bouton aurait cesse de fermer le panneau, sans la moindre
                 erreur visible pour l'utilisateur. Cable dans
                 src/views.js. -->
            <button class="btn-icon" id="activity-close-btn" aria-label="Fermer le panneau d'activité">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
        <div class="activity-feed" id="activity-feed">
            <div class="activity-empty">Aucune activité pour le moment.</div>
        </div>
    </div>

    <!-- Modal: Recherche globale -->
    <!-- Seule des 13 modales a n'avoir aucun nom accessible : un lecteur
         d'ecran annoncait « dialogue », sans rien de plus. Elle n'a pas de
         titre visible — c'est une palette de commandes — donc openModal(),
         qui deduit le nom d'un <h2>, n'avait rien a se mettre sous la dent.
         Le nom est pose ici en dur. -->
    <div class="modal" id="search-modal" aria-label="Recherche globale">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-search">
            <div class="search-modal-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                </svg>
                <!-- Un placeholder n'est pas un libelle : il disparait des la
                     premiere frappe et n'est expose comme nom accessible qu'a
                     defaut de mieux. -->
                <input type="text" id="global-search-input" aria-label="Rechercher une tâche, un projet ou un tag"
                       placeholder="Rechercher une tâche, un projet, un tag…" autofocus>
                <kbd>Esc</kbd>
            </div>
            <div class="search-results" id="search-results">
                <div class="search-hint">
                    <p>Tapez pour rechercher dans :</p>
                    <ul>
                        <li>Tâches — titre et description</li>
                        <li>Projets — nom et description</li>
                        <li>Tags</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal: Badges -->
    <div class="modal" id="badges-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>Mes badges</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div id="badges-content"></div>
        </div>
    </div>

    <!-- Modal: Promo "Corvio Space sur mobile" (desktop) -->
    <div class="modal" id="mobile-promo-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-promo">
            <button class="btn-icon modal-close promo-close" aria-label="Fermer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div class="promo-hero">
                <h2>Corvio Space sur votre téléphone</h2>
                <p>Installez Corvio Space sur votre écran d'accueil : vos projets restent accessibles hors du bureau, et l'application s'ouvre comme n'importe quelle autre. Aucun passage par un magasin d'applications.</p>
            </div>

            <div class="promo-bridge">
                <div class="promo-qr">
                    <img id="promo-qr-img" alt="QR code menant à Corvio Space" width="150" height="150">
                    <span>Scannez ce code avec votre téléphone</span>
                </div>
                <div class="promo-share">
                    <span class="form-legende">Ou ouvrez ce lien sur votre téléphone</span>
                    <div class="promo-url" id="promo-url"></div>
                    <div class="promo-share-actions">
                        <button class="btn-primary" id="promo-copy">Copier le lien</button>
                        <button class="btn-secondary hidden" id="promo-install">Installer maintenant</button>
                    </div>
                </div>
            </div>

            <div class="promo-steps">
                <div class="promo-tabs" role="tablist" aria-label="Choisir votre système">
                    <button class="promo-tab active" data-os="ios" role="tab" aria-selected="true" aria-controls="promo-steps-ios">iPhone</button>
                    <button class="promo-tab" data-os="android" role="tab" aria-selected="false" aria-controls="promo-steps-android">Android</button>
                </div>
                <ol class="promo-steplist" id="promo-steps-ios" role="tabpanel">
                    <li>Ouvrez ce site dans <strong>Safari</strong>.</li>
                    <li>Touchez le bouton <strong>Partager</strong>, le carré surmonté d'une flèche.</li>
                    <li>Choisissez <strong>Sur l'écran d'accueil</strong>.</li>
                    <li>Touchez <strong>Ajouter</strong>. L'icône Corvio Space rejoint votre écran d'accueil.</li>
                </ol>
                <ol class="promo-steplist hidden" id="promo-steps-android" role="tabpanel">
                    <li>Ouvrez ce site dans <strong>Chrome</strong>.</li>
                    <li>Touchez le menu, en haut à droite.</li>
                    <li>Choisissez <strong>Installer l'application</strong>, ou <strong>Ajouter à l'écran d'accueil</strong>.</li>
                    <li>Confirmez. Corvio Space s'installe et s'ouvre ensuite comme une application ordinaire.</li>
                </ol>
            </div>

            <button class="btn-text promo-dismiss" id="promo-dismiss">Ne plus afficher</button>
        </div>
    </div>

    <!-- Floating Action Button (mobile) - Quick add task -->
    <button class="fab" id="fab-new-task" title="Créer une tâche">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    </button>

    <!-- Confetti canvas -->
    <canvas id="confetti-canvas" class="confetti-canvas"></canvas>

    <!-- Quick Capture (press +) -->
    <div class="quick-capture" id="quick-capture">
        <div class="quick-capture-overlay"></div>
        <div class="quick-capture-box">
            <div class="quick-capture-icon">
                <svg class="icone" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2"></polygon></svg>
            </div>
            <label for="quick-capture-input" class="sr-only">Décrire la tâche à créer</label>
            <input type="text" id="quick-capture-input" placeholder="Relire le devis demain 18h !haute #client" autocomplete="off">
            <div class="quick-capture-hint">
                <kbd>Entrée</kbd> créer · <kbd>Échap</kbd> fermer<br>Reconnus dans le texte&nbsp;: <code>demain 18h</code>, <code>!haute</code>, <code>!urgent</code>, <code>#tag</code>
            </div>
        </div>
    </div>

    <!-- Long-press contextual menu (mobile) -->
    <div class="context-menu" id="context-menu">
        <button data-action="open">
            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
            Ouvrir
        </button>
        <button data-action="done">
            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Terminer
        </button>
        <button data-action="snooze">
            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path></svg>
            Reporter à demain
        </button>
        <button data-action="duplicate">
            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Dupliquer
        </button>
        <button data-action="archive">
            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="5" rx="1"></rect><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"></path><line x1="10" y1="13" x2="14" y2="13"></line></svg>
            Archiver
        </button>
        <button data-action="delete" class="danger">
            <svg class="icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Supprimer
        </button>
    </div>

    <!-- Weekly summary modal -->
    <div class="modal" id="weekly-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Votre semaine</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div id="weekly-content"></div>
        </div>
    </div>

    <!-- Bulk Action Bar (apparait quand des taches sont selectionnees) -->
    <div class="bulk-action-bar" id="bulk-action-bar">
        <span class="bulk-count"><span id="bulk-count-num">0</span> sélectionnée(s)</span>
        <div class="bulk-actions">
            <button class="btn-text" id="bulk-status-todo">→ À faire</button>
            <button class="btn-text" id="bulk-status-inprogress">→ En cours</button>
            <button class="btn-text" id="bulk-status-done">→ Terminé</button>
            <button class="btn-text" id="bulk-archive">Archiver</button>
            <button class="btn-danger" id="bulk-delete">Supprimer</button>
            <button class="btn-icon" id="bulk-clear" aria-label="Tout désélectionner" title="Tout désélectionner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </div>
    </div>

    <!-- Focus Mode Overlay -->
    <div class="focus-mode" id="focus-mode">
        <button class="focus-close" id="focus-close" title="Sortir du focus (Esc)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
        <div class="focus-content" id="focus-content"></div>
    </div>

    <!-- Modal: Aide complete -->
    <div class="modal" id="help-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>Guide complet de Corvio Space</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div id="help-content"></div>
        </div>
    </div>

    <!-- Modal: Templates Browser -->
    <div class="modal" id="templates-modal">
        <div class="modal-overlay"></div>
        <div class="modal-content modal-large">
            <div class="modal-header">
                <h2>Mes modèles</h2>
                <button class="btn-icon modal-close" aria-label="Fermer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <p class="templates-intro">Un modèle ajoute d'un coup ses tâches au projet ouvert. Rien n'est écrasé&nbsp;: les tâches existantes restent en place.</p>
            <div class="templates-list" id="templates-list">
                <div class="templates-empty">Aucun modèle enregistré.</div>
            </div>
        </div>
    </div>

    <!-- Toast Container -->
    <div class="toast-container" id="toast-container"></div>

    <script type="module" src="app.js"></script>
</body>
</html>
