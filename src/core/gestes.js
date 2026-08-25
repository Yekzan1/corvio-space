// ==========================================
// LES GESTES DU DOIGT — logique pure
// ==========================================
// Trois gestes se disputent le meme toucher sur telephone : le glissement
// lateral d'une carte, l'appui long qui ouvre le menu, et le tirer-pour-
// rafraichir. Ils etaient decides a trois endroits differents de src/mobile.js,
// chacun avec ses propres variables de module — et c'est de la que venaient
// leurs collisions.
//
// Ici, aucun DOM, aucun minuteur, aucun etat global : un geste est un objet, et
// trois fonctions disent ce qu'il vaut. C'est testable au clavier, sans
// navigateur, et c'est ce qui permet de verrouiller le defaut ci-dessous.
//
// ⚠️ LE DEFAUT QUE CE MODULE EXISTE POUR FERMER
// L'ancien code gardait `touchEndX` d'un geste a l'autre : `handleTouchStart`
// posait `touchStartX` sans jamais remettre `touchEndX`. Un APPUI SIMPLE — qui
// n'emet aucun `touchmove` — arrivait donc a `touchend` avec la valeur d'un
// geste anterieur, ou `0` :
//
//     diffX = touchEndX (0) - touchStartX (220) = -220  →  seuil de -80 franchi
//
// Un appui sur une carte, a droite de 80px, proposait donc d'ARCHIVER la tache.
// La parade tient en une regle, ecrite ici et impossible a oublier ailleurs :
// un geste nait a la position du doigt, `x === x0`, et un geste ou le doigt
// n'a pas bouge ne vaut RIEN.

/** Deplacement lateral, en px, au-dela duquel un glissement compte. */
export const SEUIL_GLISSEMENT = 80;

/** Deplacement au-dela duquel on tranche entre glissement lateral et defilement. */
export const SEUIL_DIRECTION = 10;

/** Duree d'immobilite, en ms, qui declenche le menu contextuel. */
export const DUREE_APPUI_LONG = 500;

/**
 * Derive toleree, en px, pendant l'appui long.
 *
 * L'ancien code annulait le minuteur au PREMIER `touchmove`, sans tolerance.
 * Un doigt pose sur du verre bouge toujours d'un ou deux pixels : l'appui long
 * exigeait donc une immobilite que personne n'atteint. 10px, c'est la meme
 * valeur que SEUIL_DIRECTION — en deca, on n'a rien decide.
 */
export const TOLERANCE_APPUI_LONG = 10;

/** Amplitude maximale du glissement rendu a l'ecran, en px. */
export const AMPLITUDE_MAX = 100;

/** Tirage vertical, en px, qui declenche le rafraichissement. */
export const SEUIL_RAFRAICHIR = 100;

/** Tirage a partir duquel l'indicateur de rafraichissement se montre. */
export const SEUIL_INDICATEUR = 30;

/**
 * Ouvre un geste a la position du doigt.
 * `x === x0` et `y === y0` : c'est cette egalite de depart qui garantit qu'un
 * appui sans deplacement rende un ecart nul.
 */
export function ouvrirGeste(x, y) {
    return { x0: x, y0: y, x, y, axe: null, deplace: false };
}

/**
 * Enregistre la position courante du doigt et fige l'axe une fois pour toutes.
 *
 * L'axe se decide au premier depassement de SEUIL_DIRECTION et ne change plus :
 * sans ca, un glissement en diagonale basculerait d'un axe a l'autre en cours
 * de route, et la carte suivrait le doigt par a-coups.
 */
export function deplacerGeste(geste, x, y) {
    if (!geste) return geste;
    geste.x = x;
    geste.y = y;
    const dx = x - geste.x0;
    const dy = y - geste.y0;
    if (Math.abs(dx) > TOLERANCE_APPUI_LONG || Math.abs(dy) > TOLERANCE_APPUI_LONG) {
        geste.deplace = true;
    }
    if (!geste.axe && (Math.abs(dx) > SEUIL_DIRECTION || Math.abs(dy) > SEUIL_DIRECTION)) {
        geste.axe = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    return geste;
}

/** Ecart lateral parcouru depuis l'origine du geste. */
export function ecartLateral(geste) {
    return geste ? geste.x - geste.x0 : 0;
}

/** Ecart vertical parcouru depuis l'origine du geste. */
export function ecartVertical(geste) {
    return geste ? geste.y - geste.y0 : 0;
}

/**
 * La position a donner a la carte pendant le glissement, bornee.
 * Rend 0 tant que l'axe n'est pas lateral : une carte ne doit pas frissonner
 * pendant qu'on fait defiler la colonne.
 */
export function decalageAffiche(geste) {
    if (!geste || geste.axe !== 'x') return 0;
    const dx = ecartLateral(geste);
    return Math.min(Math.max(dx, -AMPLITUDE_MAX), AMPLITUDE_MAX);
}

/**
 * Ce que le geste declenche au relachement.
 * @returns {'terminer'|'archiver'|null}
 */
export function decisionGlissement(geste) {
    if (!geste || geste.axe !== 'x') return null;
    const dx = ecartLateral(geste);
    if (dx > SEUIL_GLISSEMENT) return 'terminer';
    if (dx < -SEUIL_GLISSEMENT) return 'archiver';
    return null;
}

/**
 * Le geste a-t-il encore le droit de devenir un appui long ?
 * Non des que le doigt a franchi la tolerance — mais un simple frisson ne
 * l'annule plus.
 */
export function appuiLongTientEncore(geste) {
    return !!geste && !geste.deplace;
}

/**
 * L'etat du tirer-pour-rafraichir, a partir du tirage vertical.
 * @returns {{visible: boolean, pret: boolean, libelle: string}}
 */
export function etatTirage(dy) {
    const pret = dy > SEUIL_RAFRAICHIR;
    return {
        visible: dy > SEUIL_INDICATEUR,
        pret,
        libelle: pret ? 'Relâcher pour rafraîchir' : 'Tirer pour rafraîchir',
    };
}
