// ==========================================
// PLEIN ECRAN
// ==========================================
// « Ceux qui veulent avoir leur TaskFlow en plein ecran peuvent l'avoir ; ceux
// qui ne veulent pas, non. » Autrement dit : un mode plein ecran OPTIONNEL et
// REVERSIBLE, jamais impose. Un bouton dans l'en-tete bascule l'affichage sur
// toute la surface de l'ecran (sans barre du navigateur ni onglets), et le meme
// bouton en ressort.
//
// L'API Fullscreen impose deux contraintes que ce module respecte :
//   - `requestFullscreen()` ne peut etre appele qu'en reponse a un GESTE de
//     l'utilisateur (clic, touche). On ne peut donc pas retablir le plein ecran
//     automatiquement au chargement — d'ou l'absence de persistance : c'est une
//     action volontaire, a chaque fois.
//   - Elle n'existe pas partout (vieux navigateurs, certains iOS). Si elle est
//     absente, on masque simplement le bouton plutot que d'afficher un controle
//     qui ne ferait rien.

import { $ } from './core/dom.js';
import { toast } from './core/utils.js';

/** Vrai si le navigateur expose l'API Fullscreen (avec le prefixe webkit au besoin). */
function estSupporte() {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen);
}

/** L'element actuellement en plein ecran, ou null. Couvre le prefixe webkit. */
function elementPleinEcran() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function demanderPleinEcran() {
    const d = document.documentElement;
    const fn = d.requestFullscreen || d.webkitRequestFullscreen;
    // Rend toujours une promesse rejetable : certains navigateurs lancent de
    // maniere synchrone, d'autres rejettent la promesse.
    return Promise.resolve().then(() => fn.call(d));
}

function quitterPleinEcran() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    return Promise.resolve().then(() => fn.call(document));
}

export function basculerPleinEcran() {
    if (elementPleinEcran()) {
        quitterPleinEcran().catch(() => { /* deja sorti, sans consequence */ });
    } else {
        demanderPleinEcran().catch(() => {
            // Refus le plus frequent : l'action n'est pas rattachee a un geste,
            // ou la politique de la page l'interdit (iframe sans autorisation).
            toast('Le plein écran a été refusé par le navigateur. Réessayez depuis le bouton.', 'warning');
        });
    }
}

/** Met le bouton en accord avec l'etat reel : icone, libelle, etat presse. */
function synchroniserBouton() {
    const btn = $('fullscreen-btn');
    if (!btn) return;
    const actif = !!elementPleinEcran();
    btn.classList.toggle('est-plein-ecran', actif);
    btn.setAttribute('aria-pressed', actif ? 'true' : 'false');
    const libelle = actif ? 'Quitter le plein écran' : 'Passer en plein écran';
    btn.setAttribute('aria-label', libelle);
    btn.setAttribute('title', actif ? 'Quitter le plein écran (F ou Échap)' : 'Plein écran (F)');
}

export function initPleinEcran() {
    const btn = $('fullscreen-btn');
    if (!btn) return;

    // Pas d'API -> pas de bouton. Un controle qui ne peut rien faire n'a rien a
    // faire dans la barre.
    if (!estSupporte()) {
        btn.remove();
        return;
    }

    btn.addEventListener('click', basculerPleinEcran);

    // L'etat peut changer SANS passer par le bouton : la touche Echap sort du
    // plein ecran, F11 y entre. On ecoute donc l'evenement de l'API, source de
    // verite, plutot que de deduire l'etat de nos propres clics.
    document.addEventListener('fullscreenchange', synchroniserBouton);
    document.addEventListener('webkitfullscreenchange', synchroniserBouton);

    // Raccourci clavier « f », hors des champs de saisie pour ne pas voler la
    // frappe. Coherent avec les autres raccourcis a une lettre (c, b, s…).
    document.addEventListener('keydown', e => {
        if (e.key !== 'f' && e.key !== 'F') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const cible = e.target;
        if (cible && ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName)) return;
        if (cible && cible.isContentEditable) return;
        e.preventDefault();
        basculerPleinEcran();
    });

    synchroniserBouton();
}
