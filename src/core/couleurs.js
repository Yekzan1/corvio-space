// ==========================================
// LISIBILITE DES COULEURS CHOISIES PAR L'UTILISATEUR
// ==========================================
// Les pastilles de tag s'affichent en `background: <couleur>20` (la couleur a
// 12.5% d'opacite) avec `color: <couleur>`. Sur une carte blanche, ca revient
// a poser une couleur sur une version tres pale d'elle-meme : le contraste
// depend entierement de la teinte choisie. Un tag sable #B09964 ressort a
// 2.48:1, un tag jaune serait pire encore.
//
// On ne peut pas imposer une palette : la couleur est choisie par
// l'utilisateur, et c'est le point du tag. On garde donc la teinte et on
// descend sa luminosite jusqu'a ce que le texte soit lisible — exactement la
// logique de --accent-deep et --success-deep, mais calculee a la volee.
// La pastille ronde, elle, conserve la couleur exacte : la vraie couleur du
// tag reste visible.

/**
 * Couleur sûre à injecter dans un attribut `style`.
 *
 * Les couleurs de tag et de projet étaient interpolées telles quelles :
 *
 *     `<span style="background:${t.color}20;color:${t.color}">`
 *
 * La valeur vient de Firestore. Le sélecteur de l'interface ne propose que
 * huit teintes fixes, mais RIEN ne l'impose côté données : une écriture
 * directe par le SDK — possible pour tout membre du projet — pouvait y placer
 *
 *     #fff" onmouseover="…
 *
 * qui referme l'attribut et en ouvre un autre. XSS stocké, déclenché chez
 * chaque personne ouvrant le projet, dans le contexte d'origine de
 * l'application : jetons Firebase compris.
 *
 * On ne fait pas confiance à la donnée, on la valide : seul un hexadécimal
 * strict passe, tout le reste retombe sur une teinte neutre de la palette.
 *
 * @param {unknown} valeur   la couleur telle qu'elle vient de la base
 * @param {string} repli     teinte utilisée si la valeur est refusée
 * @returns {string} une couleur hex sûre, toujours de la forme #rrggbb
 */
export function couleurSure(valeur, repli = '#46615C') {
    if (typeof valeur !== 'string') return repli;
    const v = valeur.trim();
    // Strictement #rgb ou #rrggbb. Pas d'espaces, pas de fonction css(),
    // pas de nom de couleur, pas de guillemet : rien qui puisse s'échapper
    // d'un attribut.
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return repli;
    return v.length === 4
        ? '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
        : v;
}

/** '#B09964' ou 'B09964' -> [176, 153, 100]. null si non analysable. */
export function hexVersRgb(hex) {
    if (typeof hex !== 'string') return null;
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

export function rgbVersHex([r, g, b]) {
    return '#' + [r, g, b].map(n => Math.max(0, Math.min(255, Math.round(n)))
        .toString(16).padStart(2, '0')).join('');
}

/** Luminance relative WCAG. */
export function luminance([r, g, b]) {
    const f = n => { n /= 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Rapport de contraste WCAG entre deux couleurs opaques. */
export function contraste(rgb1, rgb2) {
    const a = luminance(rgb1), b = luminance(rgb2);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Aplatit une couleur semi-transparente sur un fond opaque. */
export function aplatir(rgb, alpha, fond) {
    return rgb.map((c, i) => Math.round(c * alpha + fond[i] * (1 - alpha)));
}

/**
 * Assombrit `couleur` juste ce qu'il faut pour atteindre `cible` de contraste
 * sur `fond`, en conservant sa teinte.
 *
 * Procede par melange progressif vers le noir plutot que par conversion HSL :
 * un simple abaissement de la luminosite HSL fait deriver la teinte percue sur
 * les jaunes et les cyans. Le melange lineaire, lui, garde le rapport entre
 * canaux, donc la teinte.
 *
 * Renvoie la couleur d'origine si elle passe deja, et du noir si meme le noir
 * ne suffit pas (fond tres sombre — ne devrait pas arriver ici, mais on ne
 * renvoie jamais rien d'illisible).
 */
export function assombrirPourContraste(couleur, fond, cible = 4.5) {
    const rgb = Array.isArray(couleur) ? couleur : hexVersRgb(couleur);
    if (!rgb || !Array.isArray(fond)) return null;
    if (contraste(rgb, fond) >= cible) return rgb;

    // 20 paliers de 5% : imperceptible a l'oeil, et suffisant pour converger.
    for (let i = 1; i <= 20; i++) {
        const essai = rgb.map(c => Math.round(c * (1 - i / 20)));
        if (contraste(essai, fond) >= cible) return essai;
    }
    return [0, 0, 0];
}

/**
 * Miroir d'`assombrirPourContraste` : eclaircit vers le blanc.
 *
 * Indispensable en mode nuit. Une pastille y a un fond SOMBRE (la couleur du
 * tag a 12,5% sur une carte sombre) : continuer a assombrir le texte le rend
 * de moins en moins lisible, jusqu'au noir sur presque-noir. Mesure relevee
 * au banc avant correction : 2,31:1 pour une pastille de projet.
 *
 * Meme technique que son miroir — melange lineaire plutot que HSL, pour que
 * la teinte ne derive pas.
 */
export function eclaircirPourContraste(couleur, fond, cible = 4.5) {
    const rgb = Array.isArray(couleur) ? couleur : hexVersRgb(couleur);
    if (!rgb || !Array.isArray(fond)) return null;
    if (contraste(rgb, fond) >= cible) return rgb;

    for (let i = 1; i <= 20; i++) {
        const essai = rgb.map(c => Math.round(c + (255 - c) * (i / 20)));
        if (contraste(essai, fond) >= cible) return essai;
    }
    return [255, 255, 255];
}

// Le fond de carte courant, memorise par thème. `couleurTexteTag` est appelee
// une fois par pastille — jusqu'a plusieurs dizaines par rendu de liste — et
// getComputedStyle force un recalcul de style a chaque appel.
let _fondMemo = { theme: null, rgb: null };

/**
 * Le fond de carte reellement en vigueur, lu sur le jeton `--bg-card`.
 *
 * C'est ce qui rend TOUS les appelants existants sensibles au thème sans en
 * modifier aucun : ils laissaient le fond par defaut, qui valait blanc en dur.
 * Hors navigateur (tests unitaires), on retombe sur le blanc.
 */
export function fondCarteCourant() {
    if (typeof document === 'undefined' || !document.documentElement) return [255, 255, 255];
    const theme = document.documentElement.dataset?.theme || 'light';
    if (_fondMemo.theme === theme && _fondMemo.rgb) return _fondMemo.rgb;

    const valeur = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim();
    const rgb = hexVersRgb(valeur) || [255, 255, 255];
    _fondMemo = { theme, rgb };
    return rgb;
}

/**
 * Couleur de texte lisible pour une pastille de tag.
 *
 * La DIRECTION de la correction depend du fond : on assombrit sur clair, on
 * eclaircit sur sombre. C'est le meme calcul de contraste, pris dans le bon
 * sens — et c'est ce qui manquait pour que les pastilles de tag et de projet
 * survivent au mode nuit.
 *
 * @param {string} couleurTag  la couleur choisie par l'utilisateur
 * @param {number[]} fondCarte le fond sur lequel la pastille est posee
 * @returns {string} une couleur hex utilisable telle quelle en CSS
 */
export function couleurTexteTag(couleurTag, fondCarte = fondCarteCourant()) {
    const rgb = hexVersRgb(couleurTag);
    if (!rgb) return 'inherit';
    // Le fond reel de la pastille : la couleur du tag a 12.5% sur la carte.
    const fondPastille = aplatir(rgb, 0.125, fondCarte);
    // Seuil a 0.18 de luminance : c'est la frontiere ou passer du texte
    // fonce au texte clair devient payant. En dessous, aucun assombrissement
    // ne peut atteindre 4.5:1.
    const surFondSombre = luminance(fondPastille) < 0.18;
    const corrigee = surFondSombre
        ? eclaircirPourContraste(rgb, fondPastille)
        : assombrirPourContraste(rgb, fondPastille);
    return rgbVersHex(corrigee);
}
