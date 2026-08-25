// ==========================================
// LE PLATEAU SUR TÉLÉPHONE — colonnes empilées et repliables
// ==========================================
// Sous 900px, le plateau ne défile plus horizontalement : les colonnes
// s'empilent et l'on descend. La mise en page est faite par le CSS ; ce module
// n'ajoute que le repli, qui demande du JS (état, persistance, ARIA).
//
// Pourquoi le repli : empilées, quatre colonnes pleines font une page qu'on ne
// finit jamais de faire défiler — et « Terminé », la moins consultée, est la
// plus longue. Repliée, elle tient sur une ligne tout en gardant son compteur
// visible : on garde la vue d'ensemble des quatre statuts d'un coup d'œil.
//
// ⚠️ Le repli est STRICTEMENT mobile. Sur ordinateur les colonnes sont côte à
// côte : une colonne repliée y serait une bande verticale absurde. Quand on
// repasse au-dessus de 900px, tout est déplié et les attributs sont retirés.
//
// Le gabarit d'une colonne existe en DEUX exemplaires — le statique
// d'index.html et celui que renderCustomColumns() génère. On ne l'écrit donc
// pas une troisième fois ici : les en-têtes sont transformés à la volée, et le
// clic est délégué sur #board, ce qui survit à toutes les reconstructions.
import { $, el } from './core/dom.js';
import { icone } from './core/icones.js';
import {
    repliInitial, lireRepli, ecrireRepli, libelleRepli,
} from './core/repli-colonnes.js';

const MOBILE = '(max-width: 900px)';

/**
 * ⚠️ LE REPLI EST COUPÉ — décision du 31/07/2026, demandée par Yekzan.
 *
 * Le plateau du téléphone est revenu au **défilement horizontal** de la
 * première version mise entre les mains du client : une colonne par écran,
 * avec le liseré de la suivante. Le repli n'avait de sens que sur des colonnes
 * EMPILÉES — sur un plateau horizontal, une colonne repliée serait une bande
 * de 320px de large et de pleine hauteur ne portant qu'un titre. C'est
 * exactement ce que le commentaire d'origine reprochait déjà au repli sur
 * ordinateur.
 *
 * Et surtout : le masquage du contenu repose sur l'attribut `hidden`, dont
 * l'effet est un `display: none` de la feuille du NAVIGATEUR. Toute règle
 * d'auteur qui déclare un `display` le surcharge — or `.column-content` est en
 * `display: flex`. La règle CSS qui rendait `hidden` effectif vivait dans la
 * section « LE PLATEAU SUR TÉLÉPHONE », partie avec l'empilement. Laisser le
 * repli actif ferait donc revenir le défaut déjà payé : `aria-expanded`
 * annonce « replié » pendant que les cartes restent entièrement visibles.
 *
 * Le module n'est pas supprimé : la logique pure (`core/repli-colonnes.js`)
 * reste testée, et `rafraichirPlateauMobile()` continue d'être appelée après
 * chaque rendu. Avec ce drapeau à `false`, elle NETTOIE — elle retire le rôle,
 * le tabindex, le chevron et les `hidden` d'une session précédente au lieu de
 * ne rien faire. Un retour à l'empilement ne demande que de repasser à `true`
 * et de remettre la section CSS.
 */
const REPLI_ACTIF = false;

/** Les colonnes actuellement repliées. Vide tant que initPlateauMobile() n'a pas tourné. */
let replies = new Set();
let initialise = false;

const estMobile = () => REPLI_ACTIF && (window.matchMedia?.(MOBILE).matches ?? false);

/** Les statuts des colonnes réellement présentes dans le DOM. */
function statutsAffiches() {
    return [...(el.board?.querySelectorAll('.column') || [])].map(c => c.dataset.status);
}

/** Le nom lisible d'une colonne, tel qu'affiché dans son en-tête. */
function nomDe(colonne) {
    return colonne.querySelector('h2')?.textContent?.trim() || colonne.dataset.status || '';
}

/** Le nombre de tâches d'une colonne, lu sur son compteur. */
function nombreDe(colonne) {
    return parseInt(colonne.querySelector('.column-count')?.textContent || '0', 10) || 0;
}

/**
 * Transforme l'en-tête d'une colonne en commande de repli, ou l'y ramène.
 * Idempotent : appelable après chaque rendu sans empiler d'attributs.
 */
function preparerEntete(colonne, actif) {
    const entete = colonne.querySelector('.column-header');
    const contenu = colonne.querySelector('.column-content');
    if (!entete || !contenu) return;

    if (!actif) {
        // Retour sur ordinateur : on rend l'en-tête à son état d'origine.
        entete.removeAttribute('role');
        entete.removeAttribute('tabindex');
        entete.removeAttribute('aria-expanded');
        entete.removeAttribute('aria-controls');
        entete.removeAttribute('aria-label');
        entete.querySelector('.column-chevron')?.remove();
        colonne.classList.remove('est-repliee');
        contenu.removeAttribute('hidden');
        return;
    }

    // `role="button"` sur le <div> existant plutôt qu'un vrai <button> : le
    // <button> encapsulerait le <h2> du titre, ce qui retirerait la colonne de
    // la liste des titres du document — un lecteur d'écran perdrait le plan de
    // la page. Le rôle + tabindex donnent le comportement sans ce coût.
    entete.setAttribute('role', 'button');
    entete.setAttribute('tabindex', '0');

    if (!contenu.id) contenu.id = `${colonne.dataset.status}-tasks`;
    entete.setAttribute('aria-controls', contenu.id);

    if (!entete.querySelector('.column-chevron')) {
        const chevron = document.createElement('span');
        chevron.className = 'column-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = icone('chevronBas', { taille: 16 });
        entete.querySelector('.column-title')?.appendChild(chevron);
    }
}

/** Applique l'état de repli d'une colonne au DOM. */
function appliquerColonne(colonne, actif) {
    const entete = colonne.querySelector('.column-header');
    const contenu = colonne.querySelector('.column-content');
    const ajout = colonne.querySelector('.column-ajout');
    if (!entete || !contenu) return;

    const replie = actif && replies.has(colonne.dataset.status);
    colonne.classList.toggle('est-repliee', replie);

    // `hidden` et non un simple masquage CSS : une colonne repliée doit sortir
    // de l'ordre de tabulation. Sans ça, on traverse au clavier des cartes
    // qu'on ne voit pas — le piège déjà payé sur le tiroir mobile.
    contenu.toggleAttribute('hidden', replie);
    if (ajout) ajout.toggleAttribute('hidden', replie);

    if (actif) {
        entete.setAttribute('aria-expanded', replie ? 'false' : 'true');
        entete.setAttribute('aria-label', libelleRepli(nomDe(colonne), replie, nombreDe(colonne)));
    }
}

/**
 * Resynchronise tout le plateau. À appeler après chaque rendu : renderTasks()
 * réécrit les compteurs, et renderCustomColumns() reconstruit les colonnes.
 */
export function rafraichirPlateauMobile() {
    if (!initialise || !el.board) return;
    const actif = estMobile();
    el.board.classList.toggle('plateau-empile', actif);
    for (const colonne of el.board.querySelectorAll('.column')) {
        preparerEntete(colonne, actif);
        appliquerColonne(colonne, actif);
    }
}

/** Replie ou déplie une colonne, et retient le choix. */
function basculer(colonne) {
    const statut = colonne.dataset.status;
    if (!statut) return;
    if (replies.has(statut)) replies.delete(statut);
    else replies.add(statut);
    ecrireRepli(localStorage, replies);
    appliquerColonne(colonne, true);
}

export function initPlateauMobile() {
    if (!el.board || initialise) return;
    initialise = true;

    replies = repliInitial(statutsAffiches(), lireRepli(localStorage));

    // Délégation sur le plateau : survit à toutes les reconstructions.
    el.board.addEventListener('click', e => {
        if (!estMobile()) return;
        const entete = e.target.closest?.('.column-header');
        if (!entete || !el.board.contains(entete)) return;
        basculer(entete.closest('.column'));
    });

    // Un élément à `role="button"` n'active RIEN au clavier de lui-même : ni
    // Entrée ni Espace n'émettent de clic. C'est au code de le faire — sinon
    // le repli serait réservé à la souris et au doigt.
    el.board.addEventListener('keydown', e => {
        if (!estMobile()) return;
        if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
        const entete = e.target.closest?.('.column-header');
        if (!entete || !el.board.contains(entete)) return;
        e.preventDefault(); // Espace ferait défiler la page
        basculer(entete.closest('.column'));
    });

    // Passage ordinateur <-> téléphone : on repose ou on retire tout.
    const mq = window.matchMedia?.(MOBILE);
    mq?.addEventListener?.('change', rafraichirPlateauMobile);

    rafraichirPlateauMobile();
}
