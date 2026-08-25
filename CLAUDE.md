# Corvio Space — Documentation & Architecture

Workspace collaboratif et suivi de chantiers / tâches temps réel.
**Vanilla JS + Firebase / Vercel PWA**.

## Stack & Fichiers
- `index.html` — Interface complète (écrans d'authentification, board kanban, modales, vues).
- `app.js` — Logique applicative, gestion d'état réactif, synchronisation.
- `styles.css` — Feuille de style complète avec thème émeraude Corvio.
- `sw.js` — Service Worker (PWA offline).
- `manifest.json` — Manifeste d'application PWA.
- `firestore.rules`, `firestore.indexes.json` — Règles & index Firestore.
- `vercel.json` — Configuration de déploiement Vercel.

## Déploiement
- Dépôt GitHub : `https://github.com/Yekzan1/corvio-space`
- Production Vercel : `https://corvio-space.vercel.app`
- Branche de production : `master`
