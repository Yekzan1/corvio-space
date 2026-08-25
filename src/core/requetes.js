// ==========================================
// CONTRAINTE D'APPARTENANCE DANS LES REQUETES
// ==========================================
// Etape 3 de la migration decrite dans docs/migration-firestore-memberids.md.
//
// Pourquoi une contrainte cote CLIENT alors que c'est la regle qui protege :
// sur une operation `list`, Firestore n'evalue pas la regle document par
// document, il la confronte aux CONTRAINTES DE LA REQUETE. Une regle
// `request.auth.uid in resource.data.memberIds` n'est donc prouvable que si la
// requete filtre elle-meme sur `memberIds`. Sans ce filtre, la requete est
// refusee — y compris pour le proprietaire du projet.
//
// ⚠️ ORDRE DE DEPLOIEMENT. Ces filtres rendent le tableau VIDE pour toute
// tache/tag/piece jointe qui ne porte pas encore `memberIds`. Ils ne doivent
// donc partir en production qu'APRES
// `node scripts/backfill-member-ids.mjs --apply`, exactement comme
// firestore.rules.hardened. Le danger est le meme et il est independant :
// Netlify deploie le JS, Firebase deploie les regles, les deux ne sont pas
// synchronises.

import { where } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * Contrainte « je fais partie des membres », a etaler dans un query().
 *
 * Rend un TABLEAU pour pouvoir s'etaler sans condition sur le site d'appel :
 *     query(collection(db, 'tasks'), ...filtreAppartenance(uid), where(...))
 *
 * Sans uid (visiteur anonyme d'un partage public) la contrainte n'a pas de
 * sens : c'est `isPublic` qui prend le relais, via filtrePublic().
 */
export function filtreAppartenance(uid) {
    // ⚠️ TEMPORAIREMENT NEUTRALISE (incident prod 2026-07-25).
    // L'etape 3 de la migration (ce filtre) est partie en prod SANS l'etape 2
    // (backfill des documents existants). Toutes les taches/tags/pieces jointes
    // deja en base n'ont pas de `memberIds` -> array-contains les rendait
    // INVISIBLES (tableau vide). Les regles n'ayant pas ete resserrees, retirer
    // le filtre restaure l'acces sans regression de securite.
    // A REACTIVER apres `node scripts/backfill-member-ids.mjs --apply` :
    //     return uid ? [where('memberIds', 'array-contains', uid)] : [];
    return [];
}

/**
 * Contrainte du partage par lien, pour le visiteur NON CONNECTE.
 * La regle a deux branches (membre OU public) ; celle-ci rend la seconde
 * prouvable a partir de la requete.
 */
export function filtrePublic() {
    return [where('isPublic', '==', true)];
}
