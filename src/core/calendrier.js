// ==========================================
// LE MOIS — arithmetique du calendrier, sans DOM
// ==========================================
// Deux defauts fermes ici, tous deux invisibles a la relecture du rendu :
//
// 1. LA SEMAINE COMMENCAIT DIMANCHE. L'en-tete etait ecrit en dur
//    « Dim Lun Mar… » et la case de depart calculee sur `getDay()`, qui rend 0
//    pour dimanche. Dans une application francaise, le week-end se lit d'un
//    bloc en fin de ligne : le couper en deux, une moitie a chaque bout, oblige
//    a relire la ligne pour situer un jour.
//
// 2. LES FLECHES DE MOIS N'ETAIENT BRANCHEES SUR RIEN. `#prev-month` et
//    `#next-month` etaient rendus a chaque appel, mais n'apparaissaient nulle
//    part ailleurs dans src/ : deux boutons morts, et un calendrier fige sur le
//    mois courant. On ne pouvait donc pas voir une echeance du mois suivant.
//
// Le passage d'un mois a l'autre est de l'arithmetique sur des entiers, pas sur
// des `Date` : `setMonth(getMonth() + 1)` le 31 janvier rend le 3 mars. C'est
// exactement le genre de faute qu'on ne voit qu'un mois sur douze.

/** En-tete de la grille, semaine commencant LUNDI. */
export const JOURS_COURTS = Object.freeze(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']);

/**
 * La colonne d'une date, 0 = lundi … 6 = dimanche.
 * `getDay()` rend 0 pour dimanche : le decalage de 6 modulo 7 remet lundi en
 * tete sans table de correspondance.
 */
export function colonneDe(date) {
    return (date.getDay() + 6) % 7;
}

/**
 * Le mois voisin, en arithmetique entiere.
 * @param {{annee: number, mois: number}} m mois de 0 a 11
 * @param {number} pas -1 ou +1
 */
export function moisDecale({ annee, mois }, pas) {
    const total = annee * 12 + mois + pas;
    return { annee: Math.floor(total / 12), mois: ((total % 12) + 12) % 12 };
}

/** Le mois d'une date. */
export function moisDe(date) {
    return { annee: date.getFullYear(), mois: date.getMonth() };
}

/** Deux mois designent-ils la meme case du temps ? */
export function memeMois(a, b) {
    return !!a && !!b && a.annee === b.annee && a.mois === b.mois;
}

/**
 * Les cases d'un mois, dans l'ordre de lecture.
 *
 * Rend d'abord les cases vides qui precedent le 1er, puis un objet par jour.
 * Le rendu n'a plus qu'a parcourir : aucune date n'y est recalculee, donc
 * aucune occasion de refaire la faute du decalage de colonne.
 *
 * @returns {Array<{vide: true} | {jour: number, iso: string, aujourdhui: boolean}>}
 */
export function casesDuMois(annee, mois, aujourdhui = new Date()) {
    const premier = new Date(annee, mois, 1);
    // Jour 0 du mois suivant = dernier jour de celui-ci. Robuste aux mois de
    // 28, 29, 30 et 31 jours sans aucun cas particulier.
    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const isoAujourdhui = isoLocal(aujourdhui);

    const cases = [];
    for (let i = 0; i < colonneDe(premier); i++) cases.push({ vide: true });
    for (let jour = 1; jour <= nbJours; jour++) {
        const iso = isoLocal(new Date(annee, mois, jour));
        cases.push({ jour, iso, aujourdhui: iso === isoAujourdhui });
    }
    return cases;
}

/**
 * Date locale au format AAAA-MM-JJ.
 * Jamais `toISOString().slice(0,10)` : celui-la convertit en UTC et decale
 * d'un jour tout ce qui est a l'est de Greenwich apres 22h ou 23h — un 31
 * janvier affiche « 1er fevrier ».
 */
function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Le titre du mois, en francais et avec une majuscule initiale.
 * `toLocaleDateString` rend « juillet 2026 » en minuscule ; en titre de vue,
 * la majuscule est attendue.
 */
export function titreMois({ annee, mois }) {
    const t = new Date(annee, mois, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Range des taches par jour d'echeance.
 * @returns {Map<string, object[]>} cle AAAA-MM-JJ
 */
export function tachesParJour(taches = []) {
    const par = new Map();
    for (const t of taches) {
        if (!t?.dueDate) continue;
        const jour = String(t.dueDate).split('T')[0];
        if (!par.has(jour)) par.set(jour, []);
        par.get(jour).push(t);
    }
    return par;
}
