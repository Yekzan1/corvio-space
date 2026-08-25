// ==========================================
// ETAT DU RESEAU
// ==========================================
// L'application n'avait aucune gestion de la perte de connexion : ni
// navigator.onLine, ni ecouteur 'online'/'offline'. Or Firestore met les
// ecritures en file d'attente locale et les rejoue au retour du reseau —
// donc rien n'est perdu, mais rien ne le dit non plus. L'utilisateur
// continue de cocher des taches en croyant que tout est enregistre, sans
// savoir que plus rien ne part.
//
// C'est exactement le genre de silence qui se remarque en demonstration :
// le wifi tombe, l'application a l'air de fonctionner, et personne ne
// comprend pourquoi le collegue d'en face ne voit rien arriver.
//
// Une bande discrete, pas une modale : on ne bloque pas quelqu'un qui peut
// tres bien continuer a travailler.

const ID = 'bandeau-hors-ligne';

function construire() {
    let bandeau = document.getElementById(ID);
    if (bandeau) return bandeau;

    bandeau = document.createElement('div');
    bandeau.id = ID;
    bandeau.className = 'bandeau-reseau';
    // `polite` et non `assertive` : l'information compte, mais elle ne doit
    // pas couper la lecture en cours.
    bandeau.setAttribute('role', 'status');
    bandeau.setAttribute('aria-live', 'polite');
    document.body.appendChild(bandeau);
    return bandeau;
}

function afficher(texte, etat) {
    const bandeau = construire();
    bandeau.textContent = texte;
    bandeau.dataset.etat = etat;
    bandeau.classList.add('visible');
}

function masquer() {
    document.getElementById(ID)?.classList.remove('visible');
}

export function horsLigne() {
    // `navigator.onLine` a false est fiable ; a true il signifie seulement
    // qu'une interface reseau existe, pas qu'Internet reponde. On ne s'en
    // sert donc que pour detecter la coupure, jamais pour affirmer que tout va bien.
    return navigator.onLine === false;
}

/** Branche les ecouteurs. Idempotent. */
export function surveillerReseau() {
    if (surveillerReseau.branche) return;
    surveillerReseau.branche = true;

    const auRetour = () => {
        // Le libelle est accentue, la valeur de `data-etat` ne l'est pas :
        // celle-ci sert de selecteur CSS.
        afficher('Connexion rétablie — synchronisation en cours', 'retabli');
        // La bande de retour disparait d'elle-meme : c'est une bonne nouvelle,
        // elle n'a pas a rester a l'ecran.
        clearTimeout(surveillerReseau.minuteur);
        surveillerReseau.minuteur = setTimeout(masquer, 3000);
    };

    const aLaCoupure = () => {
        clearTimeout(surveillerReseau.minuteur);
        afficher('Hors ligne — vos modifications seront envoyées dès le retour de la connexion.', 'coupe');
    };

    window.addEventListener('online', auRetour);
    window.addEventListener('offline', aLaCoupure);

    // L'application peut demarrer deja hors ligne.
    if (horsLigne()) aLaCoupure();
}
