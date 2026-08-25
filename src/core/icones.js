// ==========================================
// JEU D'ICONES
// ==========================================
// L'interface melangeait deux systemes : une soixantaine d'icones SVG au
// trait ecrites a la main dans index.html, et environ 130 emojis disperses
// dans le HTML et le JS. Les emojis posent trois problemes concrets :
//
// 1. Ils sont rendus par la police systeme : un meme badge n'a pas la meme
//    tete sur Windows, macOS et Android, et certains ne s'affichent pas du
//    tout sous Linux.
// 2. Ils ne prennent pas la couleur du texte. Impossible de les accorder a
//    la palette, ni de les faire reagir a un survol ou a un etat actif.
// 3. Un lecteur d'ecran les annonce en toutes lettres : « emoji cible »,
//    « emoji feu ». Colles devant un titre, ils le polluent.
//
// Toutes les icones ici partagent la meme grille 24x24, la meme graisse de
// trait et les memes terminaisons arrondies que celles deja presentes dans
// index.html : le jeu est homogene, rien ne detonne.
//
// Elles heritent de `currentColor` : la couleur vient du contexte, jamais de
// l'icone.

/** Tracés seuls — l'enveloppe <svg> est ajoutée par `icone()`. */
const TRACES = {
    // --- Lecture / minuteur ---
    lecture: '<polygon points="6 4 20 12 6 20 6 4"></polygon>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>',
    reprise: '<path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 4 3 10 9 10"></polyline>',
    minuteur: '<circle cx="12" cy="13" r="8"></circle><line x1="12" y1="9" x2="12" y2="13"></line><line x1="9" y1="2" x2="15" y2="2"></line>',
    horloge: '<circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline>',

    // --- Actions sur une tâche ---
    etoile: '<polygon points="12 3 14.9 9.1 21.5 10 16.7 14.6 17.9 21.1 12 18 6.1 21.1 7.3 14.6 2.5 10 9.1 9.1 12 3"></polygon>',
    lune: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"></path>',
    oeil: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle>',
    cible: '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.5"></circle>',
    crayon: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
    copie: '<rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
    archive: '<rect x="2" y="4" width="20" height="5" rx="1"></rect><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"></path><line x1="10" y1="13" x2="14" y2="13"></line>',
    corbeille: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
    cadenas: '<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
    coche: '<polyline points="20 6 9 17 4 12"></polyline>',
    cocheCercle: '<circle cx="12" cy="12" r="9"></circle><polyline points="8.5 12.5 11 15 16 9.5"></polyline>',

    // --- Objets du domaine ---
    liste: '<rect x="5" y="3" width="14" height="18" rx="2"></rect><line x1="9" y1="8" x2="15" y2="8"></line><line x1="9" y1="12" x2="15" y2="12"></line><line x1="9" y1="16" x2="13" y2="16"></line>',
    dossier: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
    etiquette: '<path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h8.6z"></path><circle cx="7.5" cy="7.5" r="1.5"></circle>',
    calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><line x1="16" y1="3" x2="16" y2="7"></line><line x1="8" y1="3" x2="8" y2="7"></line><line x1="3" y1="11" x2="21" y2="11"></line>',
    graphique: '<line x1="6" y1="20" x2="6" y2="13"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="18" y1="20" x2="18" y2="9"></line>',
    equipe: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.9"></path><path d="M16 3.1a4 4 0 0 1 0 7.8"></path>',
    personnePlus: '<path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line>',
    bulle: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"></path>',
    lien: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"></path>',
    trombone: '<path d="M21 12.5 12.9 20.6a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.3-2.3l7.8-7.8"></path>',
    recherche: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.7" y2="16.7"></line>',
    clavier: '<rect x="2" y="6" width="20" height="12" rx="2"></rect><line x1="6" y1="10" x2="6" y2="10"></line><line x1="10" y1="10" x2="10" y2="10"></line><line x1="14" y1="10" x2="14" y2="10"></line><line x1="18" y1="10" x2="18" y2="10"></line><line x1="8" y1="14" x2="16" y2="14"></line>',
    reglages: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"></path>',

    // --- Récompenses / progression ---
    trophee: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"></path><path d="M8 5H5.5a2.5 2.5 0 0 0 2.5 5"></path><path d="M16 5h2.5a2.5 2.5 0 0 1-2.5 5"></path><line x1="12" y1="13" x2="12" y2="17"></line><path d="M8.5 20h7l-.7-3h-5.6z"></path>',
    medaille: '<circle cx="12" cy="15" r="6"></circle><polyline points="8 3 9.5 9"></polyline><polyline points="16 3 14.5 9"></polyline><path d="M12 12.8 13 15h2.2l-1.8 1.4.7 2.2-2.1-1.3-2.1 1.3.7-2.2L8.8 15H11z"></path>',
    couronne: '<path d="M3 7l4 4 5-7 5 7 4-4-2 12H5z"></path><line x1="5" y1="21" x2="19" y2="21"></line>',
    flamme: '<path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-.5-2 2 1.5 3.5 3.5 3.5 6a6 6 0 0 1-12 0C6 10 12 8 12 2z"></path>',
    eclair: '<polygon points="13 2 4 14 11 14 10 22 20 10 13 10 13 2"></polygon>',
    leverSoleil: '<path d="M12 3v5"></path><path d="M6.5 9.5 4.9 7.9"></path><path d="M17.5 9.5l1.6-1.6"></path><path d="M2 18h20"></path><path d="M6 18a6 6 0 0 1 12 0"></path><path d="M5 21h14"></path>',
    compteur: '<path d="M4 19a9 9 0 1 1 16 0"></path><line x1="12" y1="19" x2="16" y2="11"></line>',
    concentration: '<circle cx="12" cy="12" r="9"></circle><path d="M12 3v3"></path><path d="M12 18v3"></path><path d="M3 12h3"></path><path d="M18 12h3"></path><circle cx="12" cy="12" r="2.5"></circle>',

    // --- Types de fichiers ---
    image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9.5" r="1.5"></circle><path d="m21 16-5-5L5 20"></path>',
    fichierTexte: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><polyline points="14 3 14 8 19 8"></polyline><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="17" x2="13" y2="17"></line>',
    fichierPdf: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><polyline points="14 3 14 8 19 8"></polyline><path d="M9 17v-4h1.5a1.5 1.5 0 0 1 0 3H9"></path>',
    fichierArchive: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><polyline points="14 3 14 8 19 8"></polyline><line x1="11" y1="11" x2="11" y2="11"></line><line x1="11" y1="14" x2="11" y2="14"></line><line x1="11" y1="17" x2="11" y2="17"></line>',
    fichierTableur: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><polyline points="14 3 14 8 19 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><line x1="12" y1="13" x2="12" y2="17"></line>',
    fichierAudio: '<path d="M9 18V7l9-2v11"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="15.5" cy="16" r="2.5"></circle>',
    fichierVideo: '<rect x="2" y="6" width="14" height="12" rx="2"></rect><polygon points="16 11 22 7 22 17 16 13"></polygon>',

    // --- Direction / état ---
    flecheDroite: '<line x1="4" y1="12" x2="19" y2="12"></line><polyline points="13 6 19 12 13 18"></polyline>',
    flecheGauche: '<line x1="20" y1="12" x2="5" y2="12"></line><polyline points="11 6 5 12 11 18"></polyline>',
    // Chevron seul, sans hampe : il indique un dépliage, pas un déplacement.
    // Utilisé par le repli des colonnes du plateau sur téléphone, qui le fait
    // pivoter en CSS — d'où un tracé centré sur la grille de 24.
    chevronBas: '<polyline points="6 9 12 15 18 9"></polyline>',
    // Meme trace, pivote. Ils naviguent d'un mois a l'autre dans le
    // calendrier, ou les fleches d'origine etaient deux entites HTML brutes
    // (&#x25C0;) : un caractere de police, donc de taille et d'epaisseur
    // imprevisibles, et sans rapport avec le reste du jeu d'icones.
    chevronGauche: '<polyline points="15 6 9 12 15 18"></polyline>',
    chevronDroite: '<polyline points="9 6 15 12 9 18"></polyline>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    alerte: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12" y2="17"></line>',
    soleil: '<circle cx="12" cy="12" r="4.5"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="M4.2 4.2l1.4 1.4"></path><path d="M18.4 18.4l1.4 1.4"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="M4.2 19.8l1.4-1.4"></path><path d="M18.4 5.6l1.4-1.4"></path>',
    boussole: '<circle cx="12" cy="12" r="9"></circle><polygon points="16 8 14 14 8 16 10 10"></polygon>',
    info: '<circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><line x1="12" y1="8" x2="12" y2="8"></line>',
    croix: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
    telephone: '<rect x="6" y="2" width="12" height="20" rx="2"></rect><line x1="12" y1="18" x2="12" y2="18"></line>',
    appareilPhoto: '<path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><circle cx="12" cy="13" r="3.5"></circle>',
    telechargement: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
    // Entrer / sortir du plein ecran : quatre coins qui s'ouvrent ou se
    // referment, meme grille 24x24 que le reste du jeu.
    pleinEcran: '<path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>',
    quitterPleinEcran: '<path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path>',
};

/**
 * Rend une icône du jeu.
 *
 * Décorative par défaut (`aria-hidden`) : dans l'écrasante majorité des cas
 * l'icône double un libellé déjà présent à côté, et l'annoncer reviendrait à
 * le lire deux fois. Passer `titre` uniquement quand l'icône est SEULE
 * porteuse du sens.
 *
 * @param {string} nom     clé de TRACES
 * @param {object} options
 * @param {number} options.taille  côté en px (16 par défaut)
 * @param {string} options.classe  classes CSS supplémentaires
 * @param {string} options.titre   nom accessible ; rend l'icône annonçable
 * @returns {string} le balisage `<svg>`, prêt à être interpolé
 */
export function icone(nom, { taille = 16, classe = '', titre = '' } = {}) {
    const trace = TRACES[nom];
    // Une clé inconnue ne doit pas casser la mise en page : on ne rend rien
    // plutôt qu'un carré vide ou un `undefined` visible.
    if (!trace) return '';

    const accessibilite = titre
        ? `role="img" aria-label="${titre.replace(/"/g, '&quot;')}"`
        : 'aria-hidden="true" focusable="false"';

    return `<svg class="icone${classe ? ' ' + classe : ''}" width="${taille}" height="${taille}" `
        + `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" `
        + `stroke-linecap="round" stroke-linejoin="round" ${accessibilite}>${trace}</svg>`;
}

/** Vrai si la clé existe — utilisé par les tests pour verrouiller le jeu. */
export function iconeExiste(nom) {
    return Object.prototype.hasOwnProperty.call(TRACES, nom);
}

/** Toutes les clés disponibles. */
export function nomsIcones() {
    return Object.keys(TRACES);
}
