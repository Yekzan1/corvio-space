// ==========================================
// GENERIC MODAL OPEN/CLOSE
// ==========================================
// Split out of the original MODALS section: these two are used by every
// feature module, the rest of that section (task/project/tag/member modal
// setup) lives with its owning domain module.
//
// openModal/closeModal portent aussi toute l'accessibilite des 13 modales de
// l'app. C'etait un angle mort complet : aucune ne declarait role="dialog",
// aucune ne retenait le focus, et Echap ne les fermait pas. Concretement, au
// clavier, Tab sortait de la modale et parcourait la page derriere elle,
// pendant qu'un lecteur d'ecran continuait d'annoncer un contenu masque.
//
// Tout est pose ici depuis le JS plutot que dans index.html : un seul endroit
// a maintenir, et les 13 modales en beneficient sans en toucher une seule.
import { listenToTaskAttachments } from '../attachments.js';
import { $$ } from './dom.js';

// Pile plutot qu'une seule reference : une modale peut en ouvrir une autre
// (choisir un template depuis la modale de tache, par exemple). A la
// fermeture, le focus doit remonter d'un cran, pas sauter au debut.
const pile = [];

const SELECTEUR_FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// Les modales gardent des sections masquees selon le contexte : le piege ne
// doit pas envoyer le focus dans une section cachee.
function estAtteignable(e) {
    if (e.disabled || e.closest('[hidden]')) return false;
    // checkVisibility() est l'API prevue pour ca. Les options sont
    // indispensables : SANS elles, elle ne teste que display:none et laisse
    // donc passer les elements en visibility:hidden ou opacity:0 — qui
    // n'acceptent pourtant pas le focus. Le piege renvoyait alors le focus
    // dans le vide. On ne se fie pas non plus a offsetParent, null aussi
    // pour un element en position:fixed et dans tout environnement sans
    // mise en page.
    // On teste la geometrie plutot que checkVisibility({visibilityProperty}).
    // Cette derniere est plus exacte sur le papier, mais elle lit une valeur
    // calculee qui peut etre en cours de transition : le CSS legacy compte
    // une trentaine de `transition: all`, qui transitionnent donc aussi
    // `visibility` — heritee de .modal. Resultat, pendant l'ouverture, tous
    // les controles etaient declares invisibles et le piege se vidait.
    //
    // Les sections masquees des modales le sont par `display:none` (classe
    // .hidden), que la geometrie detecte parfaitement et sans ambiguite.
    if (typeof e.getClientRects !== 'function') return true;
    if (e.getClientRects().length > 0) return true;
    // Aucune boite : soit l'element est masque, soit on tourne dans un
    // environnement sans moteur de mise en page (jsdom en test), ou plus
    // rien n'a de geometrie. On ne filtre que dans le premier cas.
    return document.body.getClientRects().length === 0;
}

function focusables(modal) {
    return [...modal.querySelectorAll(SELECTEUR_FOCUSABLE)].filter(estAtteignable);
}

function auClavier(e) {
    const modal = pile[pile.length - 1];
    if (!modal) return;

    if (e.key === 'Escape') {
        // On respecte la convention deja en place dans ui.js : Echap dans un
        // champ le quitte d'abord. Un second Echap ferme la modale. Sans ca,
        // corriger une faute de frappe fermerait le formulaire entier.
        const t = e.target;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && modal.contains(t)) return;
        e.preventDefault();
        closeModal(modal);
        return;
    }

    if (e.key !== 'Tab') return;

    const items = focusables(modal);
    if (!items.length) { e.preventDefault(); return; }
    const premier = items[0], dernier = items[items.length - 1];

    // Le focus a pu se retrouver hors de la modale (clic dans la page, code
    // tiers) : on le ramene avant de raisonner sur les extremites.
    if (!modal.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? dernier : premier).focus();
        return;
    }
    if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
}

export function openModal(modal) {
    if (!modal) return;
    if (pile.includes(modal)) return; // déjà ouverte, on n'empile pas deux fois

    // Attributs ARIA poses a l'ouverture : les 13 modales n'en avaient aucun.
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const titre = modal.querySelector('.modal-header h2, h2');
    if (titre) {
        if (!titre.id) titre.id = (modal.id || 'modal') + '-titre';
        modal.setAttribute('aria-labelledby', titre.id);
    }

    // On retient d'ou vient l'utilisateur pour lui rendre le focus ensuite.
    modal.__retourFocus = document.activeElement;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    pile.push(modal);
    if (pile.length === 1) document.addEventListener('keydown', auClavier, true);

    // Le focus va sur le conteneur, pas sur le premier bouton : un lecteur
    // d'ecran annonce alors la modale depuis son titre, au lieu de lire
    // "bouton Fermer" hors contexte. tabindex -1 le rend focusable sans
    // l'ajouter a l'ordre de tabulation.
    //
    // .modal porte visibility:hidden avec `transition: all` : au moment ou
    // l'on ajoute .active, le style n'est pas encore recalcule et l'element
    // reste invisible — or un element invisible n'accepte pas le focus. Un
    // focus() synchrone naif echoue donc silencieusement.
    //
    // On force le recalcul en lisant offsetHeight plutot que d'attendre une
    // frame : requestAnimationFrame ne se declenche pas dans un onglet en
    // arriere-plan, ce qui laisserait le focus nulle part. Ici c'est
    // deterministe et ca ne depend d'aucun ordonnanceur.
    const contenu = modal.querySelector('.modal-content') || modal;
    contenu.setAttribute('tabindex', '-1');
    void modal.offsetHeight;
    contenu.focus({ preventScroll: true });
}

export function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');

    const i = pile.indexOf(modal);
    if (i !== -1) pile.splice(i, 1);
    // Le defilement du corps ne se retablit qu'une fois la derniere modale
    // fermee, sinon fermer une modale imbriquee debloquerait la page dessous.
    if (!pile.length) {
        document.body.style.overflow = '';
        document.removeEventListener('keydown', auClavier, true);
    }

    modal.removeAttribute('aria-modal');
    const retour = modal.__retourFocus;
    modal.__retourFocus = null;
    // Sans ca, l'utilisateur au clavier repart du haut de la page a chaque
    // fermeture, au lieu de reprendre ou il en etait.
    if (retour && document.contains(retour)) retour.focus({ preventScroll: true });

    // Stop attachments listener when task modal closes
    if (modal.id === 'task-modal') {
        listenToTaskAttachments(null);
    }
}

// Close any modal via its overlay, its "X" button, or a "Cancel" button.
$$('.modal-overlay, .modal-close, .modal-cancel').forEach(x => {
    x.addEventListener('click', e => {
        const m = e.target.closest('.modal');
        if (m) closeModal(m);
    });
});
