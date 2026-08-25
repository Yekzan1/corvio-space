// ==========================================
// REPLI DES COLONNES DU PLATEAU (téléphone) — logique pure
// ==========================================
// Sur téléphone, le plateau s'empile verticalement : une colonne par ligne,
// pleine largeur, et l'on fait défiler vers le bas. Sans repli, une colonne
// « Terminé » qui contient trente tâches repousse tout ce qui suit hors de
// portée — or c'est précisément la colonne qu'on consulte le moins.
//
// Ce module ne contient QUE du calcul : aucun DOM, aucun stockage. Le câblage
// vit dans src/plateauMobile.js.

/** Colonnes repliées par défaut, faute de préférence enregistrée. */
export const REPLIEES_PAR_DEFAUT = Object.freeze(['done']);

/** Clé de stockage. Ne JAMAIS l'accentuer : ce serait une clé orpheline. */
export const CLE_REPLI = 'corviospace-colonnes-repliees';

/**
 * L'ensemble des colonnes repliées au chargement.
 *
 * @param {string[]} statuts    les colonnes réellement affichées
 * @param {string[]|null} enregistre  la préférence relue du stockage, ou null
 * @returns {Set<string>}
 *
 * Trois cas, dans cet ordre :
 *  - aucune préférence (première visite) → les colonnes de REPLIEES_PAR_DEFAUT
 *    qui existent dans ce projet ;
 *  - une préférence → elle fait foi, y compris si elle est VIDE (quelqu'un a
 *    délibérément tout déplié : le lui redéfaire à chaque ouverture serait
 *    ignorer son choix) ;
 *  - dans les deux cas, on ne garde que des statuts qui existent encore. Une
 *    colonne supprimée du projet laisserait sinon une entrée fantôme qui
 *    grossit indéfiniment.
 */
export function repliInitial(statuts, enregistre) {
    const existants = new Set(Array.isArray(statuts) ? statuts : []);
    const source = Array.isArray(enregistre) ? enregistre : REPLIEES_PAR_DEFAUT;
    return new Set(source.filter(s => existants.has(s)));
}

/**
 * Lit la préférence enregistrée. Rend `null` — et non un tableau vide — quand
 * il n'y a rien : les deux cas sont différents (voir repliInitial).
 * Tolère un stockage indisponible (navigation privée, quota plein) et une
 * valeur corrompue.
 */
export function lireRepli(stockage) {
    try {
        const brut = stockage.getItem(CLE_REPLI);
        if (brut === null || brut === '') return null;
        const v = JSON.parse(brut);
        return Array.isArray(v) ? v.filter(x => typeof x === 'string') : null;
    } catch {
        return null;
    }
}

/** Enregistre la préférence. Un stockage refusé ne doit jamais casser l'UI. */
export function ecrireRepli(stockage, replies) {
    try {
        stockage.setItem(CLE_REPLI, JSON.stringify([...replies]));
        return true;
    } catch {
        return false;
    }
}

/** Le libellé annoncé par le bouton de repli — il dit l'ACTION, pas l'état. */
export function libelleRepli(nomColonne, replie, nombre) {
    const taches = nombre === 0
        ? 'aucune tâche'
        : `${nombre} tâche${nombre > 1 ? 's' : ''}`;
    return `${replie ? 'Déplier' : 'Replier'} « ${nomColonne} », ${taches}`;
}
