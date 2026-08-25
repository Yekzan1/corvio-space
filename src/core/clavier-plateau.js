// ==========================================
// DEPLACEMENT D'UNE CARTE AU CLAVIER — logique pure
// ==========================================
// Le glisser-deposer du plateau etait souris et tactile UNIQUEMENT. Deplacer
// une tache d'une colonne a l'autre est la fonction centrale du produit :
// sans equivalent clavier, le kanban est inutilisable pour qui n'a pas de
// souris. C'etait le manque annonce dans docs/PLAN-BOARD.md, lot 5.
//
// Ce module ne contient QUE du calcul — aucun DOM, aucun Firestore. Le
// cablage vit dans src/tasks.js, qui reutilise moveTaskToStatus(), la meme
// fonction que le glisser-deposer souris et que le menu mobile. Trois entrees,
// un seul chemin d'ecriture.

/**
 * Le statut voisin dans l'ordre des colonnes.
 *
 * @param {string[]} statuts        ordre des colonnes, tel qu'affiche
 * @param {string}   statutActuel   colonne de depart
 * @param {number}   direction      -1 vers la gauche, +1 vers la droite
 * @returns {string|null}  le statut cible, ou null s'il n'y a pas de voisin
 *
 * Rend `null` — plutot que de boucler — aux deux extremites : une carte qui
 * repasse de « Terminé » a « À faire » sur une touche de trop serait une
 * modification silencieuse et fausse. Un mur se sent, un enroulement non.
 */
export function statutVoisin(statuts, statutActuel, direction) {
    if (!Array.isArray(statuts) || statuts.length === 0) return null;
    if (direction !== 1 && direction !== -1) return null;

    const i = statuts.indexOf(statutActuel);
    // Statut inconnu (colonne supprimee, valeur ecrite hors interface) : on
    // entre par l'extremite correspondante plutot que de refuser tout
    // mouvement, sinon la carte serait definitivement bloquee.
    if (i === -1) return direction === 1 ? statuts[0] : statuts[statuts.length - 1];

    const cible = i + direction;
    if (cible < 0 || cible >= statuts.length) return null;
    return statuts[cible];
}

/**
 * Le texte annonce dans la zone aria-live apres un deplacement reussi.
 * La position est donnee explicitement : « En cours » seul ne dit pas a
 * quelqu'un qui ne voit pas le plateau ou il vient d'atterrir.
 */
export function annonceDeplacement(titre, nomColonne, rang, total) {
    return `« ${titre} » déplacée vers ${nomColonne}, colonne ${rang} sur ${total}.`;
}

/** Le texte annonce quand la carte est deja contre un bord. */
export function annonceBord(nomColonne, direction) {
    return direction === 1
        ? `${nomColonne} est la dernière colonne.`
        : `${nomColonne} est la première colonne.`;
}
