// ==========================================
// APPARTENANCE PROJET, DENORMALISEE SUR LES TACHES
// ==========================================
// Pourquoi ce module existe : `firestore.rules` porte aujourd'hui
// `allow list: if true` sur `tasks`. C'est une fuite — n'importe qui, sans
// meme etre connecte, peut lister les taches de tous les clients.
//
// On ne peut pas la refermer avec la regle "naturelle"
// `isProjectMember(resource.data.projectId)` : celle-ci appelle get() sur le
// projet parent, or Firestore n'evalue pas une operation `list` document par
// document. Il l'evalue contre les CONTRAINTES de la requete, et une
// contrainte ne peut pas prouver le resultat d'un get(). La regle refuserait
// donc toute requete de board, y compris pour le proprietaire du projet.
//
// La seule sortie est de recopier la liste des membres sur chaque tache
// (`memberIds`), puis de filtrer dessus cote client avec `array-contains` :
// la regle devient purement scalaire, donc prouvable a partir de la requete.
//
// MIGRATION EN TROIS TEMPS — ne pas sauter d'etape, sinon les clients
// perdent l'acces a leurs donnees pendant la bascule :
//   1. (ce module) on ECRIT `memberIds` partout, sans encore lire dessus ni
//      resserrer les regles. Aucun comportement ne change.
//   2. backfill des documents existants  -> scripts/backfill-member-ids.mjs
//   3. les requetes filtrent sur `memberIds` et les regles se resserrent
//      -> firestore.rules.hardened
// Le mode d'emploi complet : docs/migration-firestore-memberids.md

// Firestore plafonne un writeBatch a 500 operations. On garde de la marge
// pour les eventuelles ecritures jointes dans le meme lot.
export const TAILLE_LOT_FIRESTORE = 400;

/**
 * Liste des uid ayant acces a un projet, dedoublonnee.
 * Le proprietaire est reinjecte defensivement : un projet dont le tableau
 * `members` aurait perdu son owner (donnee ancienne ou corrompue) rendrait
 * ses propres taches invisibles a leur createur une fois les regles
 * resserrees.
 */
export function projectMemberIds(project) {
    if (!project) return [];
    const ids = Array.isArray(project.members) ? project.members.slice() : [];
    if (project.ownerId && !ids.includes(project.ownerId)) ids.push(project.ownerId);
    return ids.filter(uid => typeof uid === 'string' && uid.length > 0);
}

/**
 * Champs d'appartenance a recopier sur une tache.
 * `isPublic` suit le partage par lien du projet : la vue publique lit les
 * taches sans etre connectee, il lui faut un champ filtrable a elle.
 *
 * `uidDeSecours` est un filet : ecrire une tache avec `memberIds: []` la
 * rendrait invisible a tout le monde, y compris a son auteur, des que les
 * regles s'appuieront dessus. Ca arrive si le projet n'est pas encore dans
 * `state.projects` (onSnapshot pas encore revenu). Dans ce cas on garde au
 * moins l'auteur, et la resynchronisation completera.
 */
export function membershipFields(project, uidDeSecours = null) {
    const memberIds = projectMemberIds(project);
    if (!memberIds.length && uidDeSecours) memberIds.push(uidDeSecours);
    return {
        memberIds,
        isPublic: project?.isPublic === true,
    };
}

/**
 * Vrai si la tache porte deja exactement l'appartenance du projet.
 * Evite de reecrire des milliers de documents pour rien lors d'une
 * resynchronisation.
 */
export function membershipEstAJour(tache, project) {
    const attendu = membershipFields(project);
    if ((tache?.isPublic === true) !== attendu.isPublic) return false;
    const actuel = Array.isArray(tache?.memberIds) ? tache.memberIds : null;
    if (!actuel || actuel.length !== attendu.memberIds.length) return false;
    const set = new Set(actuel);
    return attendu.memberIds.every(uid => set.has(uid));
}

/** Decoupe une liste en lots compatibles avec writeBatch. */
export function decouperEnLots(items, taille = TAILLE_LOT_FIRESTORE) {
    const source = Array.isArray(items) ? items : [];
    if (taille < 1) return source.length ? [source.slice()] : [];
    const lots = [];
    for (let i = 0; i < source.length; i += taille) {
        lots.push(source.slice(i, i + taille));
    }
    return lots;
}
