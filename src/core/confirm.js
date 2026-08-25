// ==========================================
// BOITE DE CONFIRMATION
// ==========================================
// Remplace les confirm() natifs. Le dialogue natif du navigateur pose trois
// problemes : il est dessine par le systeme d'exploitation (donc hors de
// l'identite HF), il bloque tout le fil JS, et en PWA mobile il s'affiche
// comme une alerte de site web — exactement ce que l'app cherche a ne pas
// etre.
//
// API volontairement identique a confirm() dans son usage :
//     if (!await confirmDialog({ ... })) return;
// pour que la conversion d'un appel existant reste une seule ligne.
//
// promptDialog() couvre le second cas natif, prompt() : meme gabarit, meme
// piege a focus, mais resout sur la chaine saisie (ou null si on annule).

import { $ } from './dom.js';

let dialogue = null;      // element racine, construit une seule fois
let resoudre = null;      // resolve() de la promesse en cours
let elementDeRetour = null; // ou renvoyer le focus a la fermeture
let mode = 'confirm';     // 'confirm' -> booleen, 'prompt' -> chaine ou null

function construire() {
    if (dialogue) return dialogue;

    dialogue = document.createElement('div');
    dialogue.className = 'modal confirm-modal';
    dialogue.id = 'confirm-modal';
    // alertdialog et non dialog : le contenu demande une decision immediate,
    // les lecteurs d'ecran doivent l'annoncer sans attendre.
    dialogue.setAttribute('role', 'alertdialog');
    dialogue.setAttribute('aria-modal', 'true');
    dialogue.setAttribute('aria-labelledby', 'confirm-title');
    dialogue.setAttribute('aria-describedby', 'confirm-message');
    dialogue.innerHTML = `
        <div class="modal-overlay" data-confirm-cancel></div>
        <div class="modal-content confirm-content">
            <h2 id="confirm-title" class="confirm-title"></h2>
            <p id="confirm-message" class="confirm-message"></p>
            <label class="confirm-saisie" hidden>
                <span class="confirm-saisie-label"></span>
                <input type="text" class="confirm-saisie-input" autocomplete="off" spellcheck="false">
            </label>
            <div class="confirm-actions">
                <button type="button" class="btn-secondary" data-confirm-cancel></button>
                <button type="button" class="btn-primary" data-confirm-ok></button>
            </div>
        </div>`;
    document.body.appendChild(dialogue);

    dialogue.addEventListener('click', e => {
        if (e.target.closest('[data-confirm-ok]')) fermer(true);
        else if (e.target.closest('[data-confirm-cancel]')) fermer(false);
    });

    // Echap annule, Tab reste captif du dialogue tant qu'il est ouvert.
    dialogue.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); fermer(false); return; }
        if (e.key !== 'Tab') return;
        // Le champ de securite fait partie du piege a focus quand il est
        // affiche ; un bouton desactive n'est pas focusable, on l'exclut.
        const focusables = [...dialogue.querySelectorAll('button, input')]
            .filter(e => !e.disabled && !e.closest('[hidden]'));
        const premier = focusables[0], dernier = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
        else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    });

    return dialogue;
}

function fermer(accepte) {
    if (!dialogue) return;
    const saisie = dialogue.querySelector('.confirm-saisie-input')?.value.trim() ?? '';
    dialogue.classList.remove('active');
    document.body.style.overflow = '';
    // Le focus doit revenir la ou l'utilisateur l'avait laisse : sans ca, un
    // utilisateur au clavier repart du haut de la page a chaque confirmation.
    elementDeRetour?.focus?.();
    elementDeRetour = null;
    const r = resoudre; resoudre = null;
    // En mode prompt, annuler rend null et non '' : une chaine vide est une
    // reponse valide potentielle, l'appelant doit pouvoir distinguer les deux.
    r?.(mode === 'prompt' ? (accepte ? saisie : null) : accepte);
}

/**
 * Demande une confirmation. Resout a true si l'utilisateur accepte.
 *
 * @param {object|string} options  Message seul, ou { titre, message, valider,
 *   annuler, danger, saisieAttendue }. saisieAttendue affiche un champ et
 *   garde le bouton de validation desactive tant que le texte saisi ne
 *   correspond pas exactement — pour les actions vraiment irreversibles.
 * @returns {Promise<boolean>}
 */
export function confirmDialog(options = {}) {
    const o = typeof options === 'string' ? { message: options } : options;
    const {
        titre = 'Confirmer',
        message = '',
        valider = 'Confirmer',
        annuler = 'Annuler',
        danger = false,
        saisieAttendue = null,
    } = o;

    mode = 'confirm';
    const d = construire();
    d.querySelector('.confirm-title').textContent = titre;
    // textContent et non innerHTML : le message contient souvent un nom de
    // projet ou de tache saisi par un utilisateur.
    d.querySelector('.confirm-message').textContent = message;
    // Le dialogue est un singleton partage avec promptDialog, qui peut avoir
    // masque ces deux elements : on les remet dans leur etat par defaut.
    d.querySelector('.confirm-message').hidden = false;
    d.querySelector('.confirm-saisie-label').hidden = false;

    const btnOk = d.querySelector('[data-confirm-ok]');
    const btnAnnuler = d.querySelector('[data-confirm-cancel].btn-secondary');
    btnOk.textContent = valider;
    btnAnnuler.textContent = annuler;
    btnOk.classList.toggle('btn-danger', !!danger);
    btnOk.classList.toggle('btn-primary', !danger);

    // Champ de saisie de securite : remplace le couple confirm() + prompt()
    // par un seul dialogue, sur le modele de la suppression de depot GitHub.
    const bloc = d.querySelector('.confirm-saisie');
    const champ = d.querySelector('.confirm-saisie-input');
    bloc.hidden = !saisieAttendue;
    champ.value = '';
    champ.placeholder = '';
    if (saisieAttendue) {
        d.querySelector('.confirm-saisie-label').textContent =
            `Saisissez « ${saisieAttendue} » pour confirmer`;
        btnOk.disabled = true;
        champ.oninput = () => {
            btnOk.disabled = champ.value.trim() !== String(saisieAttendue).trim();
        };
        // Entree valide directement si la saisie est bonne.
        champ.onkeydown = e => {
            if (e.key === 'Enter' && !btnOk.disabled) { e.preventDefault(); fermer(true); }
        };
    } else {
        btnOk.disabled = false;
        champ.oninput = null;
        champ.onkeydown = null;
    }

    // Une confirmation deja ouverte est annulee plutot qu'empilee.
    if (resoudre) fermer(false);

    elementDeRetour = document.activeElement;
    d.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Avec un champ de securite, le focus y va : c'est la seule action
    // possible. Sinon le focus part sur Annuler pour une action destructrice,
    // afin que l'option sure soit celle qu'on declenche par reflexe a Entree.
    //
    // Meme precaution que dans modal.js : .modal porte visibility:hidden en
    // transition, et un element invisible n'accepte pas le focus. On force le
    // recalcul de style en lisant offsetHeight — pas de requestAnimationFrame,
    // qui ne se declenche pas dans un onglet en arriere-plan.
    void d.offsetHeight;
    (saisieAttendue ? champ : danger ? btnAnnuler : btnOk).focus();

    return new Promise(r => { resoudre = r; });
}

/**
 * Demande une chaine de caracteres. Remplace prompt().
 * Resout sur le texte saisi, ou null si l'utilisateur annule (Echap, clic sur
 * l'overlay, bouton Annuler) — comme prompt(), et distinct d'une saisie vide.
 *
 * @param {object} options { titre, message, label, valeur, placeholder,
 *   valider, annuler, obligatoire }. `obligatoire` (defaut true) garde le
 *   bouton de validation desactive tant que le champ est vide.
 * @returns {Promise<string|null>}
 */
export function promptDialog(options = {}) {
    const {
        titre = 'Saisir',
        message = '',
        label = '',
        valeur = '',
        placeholder = '',
        valider = 'Valider',
        annuler = 'Annuler',
        obligatoire = true,
    } = options;

    mode = 'prompt';
    const d = construire();
    d.querySelector('.confirm-title').textContent = titre;
    d.querySelector('.confirm-message').textContent = message;
    // Sans message, la marge sous le paragraphe laisserait un trou.
    d.querySelector('.confirm-message').hidden = !message;

    const btnOk = d.querySelector('[data-confirm-ok]');
    const btnAnnuler = d.querySelector('[data-confirm-cancel].btn-secondary');
    btnOk.textContent = valider;
    btnAnnuler.textContent = annuler;
    btnOk.classList.remove('btn-danger');
    btnOk.classList.add('btn-primary');

    const bloc = d.querySelector('.confirm-saisie');
    const champ = d.querySelector('.confirm-saisie-input');
    bloc.hidden = false;
    d.querySelector('.confirm-saisie-label').textContent = label;
    d.querySelector('.confirm-saisie-label').hidden = !label;
    champ.value = valeur;
    champ.placeholder = placeholder;

    const majBouton = () => { btnOk.disabled = obligatoire && !champ.value.trim(); };
    majBouton();
    champ.oninput = majBouton;
    champ.onkeydown = e => {
        if (e.key === 'Enter' && !btnOk.disabled) { e.preventDefault(); fermer(true); }
    };

    if (resoudre) fermer(false);

    elementDeRetour = document.activeElement;
    d.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Meme precaution que confirmDialog : .modal porte visibility:hidden en
    // transition, un element invisible n'accepte pas le focus.
    void d.offsetHeight;
    champ.focus();
    // Texte pre-selectionne : le cas courant est de le remplacer entierement,
    // comme le faisait prompt() avec sa valeur par defaut.
    champ.select();

    return new Promise(r => { resoudre = r; });
}

// Filet de securite : si un autre code ferme les modales globalement, on ne
// laisse pas une promesse en suspens.
export function annulerConfirmationOuverte() {
    if (resoudre) fermer(false);
}
