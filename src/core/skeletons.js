// ==========================================
// SQUELETTES DE CHARGEMENT
// ==========================================
// Le CSS (.skeleton, .skeleton-card, .skeleton-line) existait depuis la
// refonte mais aucun JS ne l'inserait : l'app affichait donc des colonnes
// et une sidebar vides pendant que Firestore repondait. Un board vide se
// lit comme "il n'y a rien", pas comme "ca charge" — le pire des deux
// messages quand on montre le produit a quelqu'un.
//
// Fonctionnement : les squelettes sont DIFFERES. Firestore garde un cache
// local, et un onSnapshot repond tres souvent en quelques millisecondes —
// afficher les squelettes immediatement produirait alors un clignotement plus
// desagreable que l'attente qu'ils sont censes masquer. On ne les pose donc
// que si les donnees ne sont pas arrivees au bout de SEUIL_AFFICHAGE.
//
// Le premier snapshot appelle renderTasks()/renderProjects(), qui reecrivent
// integralement le innerHTML de leurs conteneurs : les squelettes disparaissent
// sans nettoyage explicite. Il suffit d'annuler le minuteur.

// Marqueur porte par tout element injecte ici, pour pouvoir les retirer
// sans toucher au vrai contenu.
const MARQUEUR = 'data-squelette';

// En dessous, l'oeil percoit le changement comme instantane : poser un
// squelette pour si peu ne ferait qu'ajouter du bruit.
export const SEUIL_AFFICHAGE = 140;

/** Nombre de cartes fantomes par colonne : de quoi remplir le pli sans mentir
 *  sur le volume reel. Volontairement decroissant — un board realiste a plus
 *  de "a faire" que de "termine", et des colonnes toutes egales font faux. */
export const CARTES_PAR_COLONNE = { todo: 3, inprogress: 2, review: 1, done: 2 };

function carte() {
    const d = document.createElement('div');
    d.className = 'skeleton skeleton-card';
    d.setAttribute(MARQUEUR, '');
    // Purement decoratif : rien a annoncer element par element, c'est le
    // conteneur qui porte aria-busy.
    d.setAttribute('aria-hidden', 'true');
    return d;
}

/**
 * Remplit les colonnes du board de cartes fantomes.
 * @param {Record<string, HTMLElement>} colonnes  el.columns
 * @param {Record<string, HTMLElement>} compteurs el.counts — vides pendant
 *   l'attente. Sinon la colonne annonce le total du projet PRECEDENT au-dessus
 *   des squelettes du suivant : « A FAIRE 1 » sur trois cartes fantomes.
 */
export function afficherSquelettesBoard(colonnes, compteurs = null) {
    if (!colonnes) return 0;
    let poses = 0;
    if (compteurs) {
        Object.values(compteurs).forEach(c => { if (c) c.textContent = ''; });
    }
    for (const [statut, conteneur] of Object.entries(colonnes)) {
        if (!conteneur) continue;
        // On efface d'abord : au changement de projet, les cartes du projet
        // precedent sont encore la. Passe le seuil d'affichage, les laisser
        // reviendrait a presenter les donnees d'un projet sous le titre d'un
        // autre — pire qu'un squelette.
        conteneur.innerHTML = '';
        conteneur.setAttribute('aria-busy', 'true');
        const nb = CARTES_PAR_COLONNE[statut] ?? 2;
        for (let i = 0; i < nb; i++) { conteneur.appendChild(carte()); poses++; }
    }
    return poses;
}

/**
 * Remplit la liste des projets de la sidebar.
 * @param {HTMLElement} conteneur  el.projectsList
 * @param {number} nb
 */
export function afficherSquelettesProjets(conteneur, nb = 4) {
    if (!conteneur) return 0;
    // La liste des projets n'est peuplee qu'une fois par session ; si elle a
    // deja du contenu, c'est le vrai, et il n'y a rien a attendre.
    if (conteneur.children.length) return 0;
    conteneur.setAttribute('aria-busy', 'true');
    for (let i = 0; i < nb; i++) {
        const li = document.createElement('li');
        li.className = 'project-item project-item--squelette';
        li.setAttribute(MARQUEUR, '');
        li.setAttribute('aria-hidden', 'true');
        li.innerHTML =
            '<div class="skeleton project-color"></div>' +
            // Largeurs alternees : quatre barres identiques ressemblent a un
            // gabarit casse plutot qu'a des noms de projets.
            `<span class="skeleton skeleton-line ${i % 2 ? 'skeleton-line--short' : 'skeleton-line--mid'}"></span>`;
        conteneur.appendChild(li);
    }
    return nb;
}

/**
 * Retire les squelettes d'un conteneur sans toucher au reste.
 * renderTasks()/renderProjects() reecrivent deja tout le innerHTML, donc ce
 * n'est utile que pour le filet de securite ci-dessous.
 */
export function retirerSquelettes(conteneur) {
    if (!conteneur) return 0;
    const cibles = conteneur.querySelectorAll(`[${MARQUEUR}]`);
    cibles.forEach(e => e.remove());
    conteneur.removeAttribute('aria-busy');
    return cibles.length;
}

/**
 * Pose les squelettes seulement si les donnees tardent, et prevoit leur
 * disparition si elles n'arrivent jamais.
 *
 * @param {() => void} afficher   ce qu'il faut poser passe le seuil
 * @param {HTMLElement[]} conteneurs  a nettoyer si le listener reste muet
 * @returns {() => void}  a appeler au premier snapshot — annule l'affichage
 *   s'il n'a pas encore eu lieu, retire les squelettes s'il a eu lieu.
 */
export function squelettesDifferes(afficher, conteneurs = [], {
    seuil = SEUIL_AFFICHAGE,
    // Si le listener ne repond jamais (hors ligne, regles refusees, index
    // absent), un board qui scintille indefiniment se lit comme une
    // application cassee. Au bout de ce delai on efface, et l'etat vide
    // legitime reprend la main.
    abandon = 8000,
} = {}) {
    let pose = false;
    const minuteurAffichage = setTimeout(() => { pose = true; afficher(); }, seuil);
    const minuteurAbandon = setTimeout(() => {
        conteneurs.filter(Boolean).forEach(retirerSquelettes);
    }, abandon);

    return () => {
        clearTimeout(minuteurAffichage);
        clearTimeout(minuteurAbandon);
        // Deja poses : c'est renderTasks()/renderProjects() qui vont reecrire
        // le conteneur, mais on ne peut pas en dependre si l'appelant rend
        // autrement. Retirer explicitement coute peu et evite un residu.
        if (pose) conteneurs.filter(Boolean).forEach(retirerSquelettes);
    };
}
