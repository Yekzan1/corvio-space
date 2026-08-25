# Corvio Space - Workspace Collaboratif

Application de gestion de projets en équipe avec authentification, board Kanban et collaboration en temps réel.

## Fonctionnalités

### Authentification
- Inscription avec email/mot de passe
- Connexion sécurisée
- Profil utilisateur avec avatar

### Projets & Collaboration
- Créer plusieurs projets avec couleurs
- **Inviter des amis** via leur email (#email)
- Voir les membres du projet (avatars)
- Retirer des membres (owner only)
- Assigner des tâches aux membres

### Board Kanban
- 4 colonnes : À faire → En cours → En revue → Terminé
- Drag & Drop entre colonnes
- Sous-tâches avec progression
- Labels (Urgent, Important, Feature, Bug)
- Priorités et dates limites
- Recherche instantanée

## Configuration Firebase

### 1. Créer le projet
1. [Firebase Console](https://console.firebase.google.com/) → Nouveau projet
2. Activer **Authentication** (Email/Password)
3. Créer **Firestore Database** (mode test)

### 2. Configurer l'app
Dans `app.js`, remplacer lignes 6-13 :

```javascript
const firebaseConfig = {
    apiKey: "VOTRE_API_KEY",
    authDomain: "votre-projet.firebaseapp.com",
    projectId: "votre-projet",
    storageBucket: "votre-projet.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

### 3. Activer l'authentification
1. Firebase Console → Authentication → Sign-in method
2. Activer **Email/Password**

### 4. Règles Firestore (IMPORTANT)

Dans Firestore → Règles, collez :

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users - lecture pour tous les connectés, écriture pour soi-même
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Projects - lecture/écriture pour les membres uniquement
    match /projects/{projectId} {
      allow read: if request.auth != null &&
        request.auth.uid in resource.data.members;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null &&
        request.auth.uid in resource.data.members;
    }

    // Tasks - accès si membre du projet
    match /tasks/{taskId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 5. Index Firestore

Créez ces index (ou attendez l'erreur dans la console qui donne le lien) :

**Index 1 - Projects:**
- Collection: `projects`
- Champs: `members` (Arrays), `createdAt` (Descending)

**Index 2 - Tasks:**
- Collection: `tasks`
- Champs: `projectId` (Ascending), `createdAt` (Descending)

## Déploiement Netlify

```bash
git init
git add .
git commit -m "Corvio Space - Collaborative workspace"
git push origin main
```

Puis sur Netlify : Import existing project → Deploy.

## Comment ça marche

### Créer un compte
1. Cliquer sur "Créer un compte"
2. Entrer pseudo, email, mot de passe
3. C'est bon !

### Inviter un ami
1. Ton ami doit d'abord créer son compte
2. Dans ton projet, clique sur l'icône 👤+
3. Entre l'email de ton ami avec #
4. Il verra le projet dans sa sidebar !

### Assigner une tâche
1. Créer ou modifier une tâche
2. Dans "Assigné à", choisir un membre
3. Son avatar apparaît sur la carte

## Structure

```
todolist/
├── index.html      # Interface complète
├── styles.css      # 1500+ lignes CSS premium
├── app.js          # 1000+ lignes JS (Auth + Collab)
├── netlify.toml    # Config déploiement
└── README.md       # Ce fichier
```

## Technologies

- Firebase Auth (authentification)
- Firestore (base de données temps réel)
- HTML/CSS/JS vanilla (pas de framework)
- Netlify (hébergement)

---

Fait avec ⚡ par Corvio Space
