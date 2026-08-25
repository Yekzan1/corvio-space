// ==========================================
// VIEW SWITCHING, STATS, CALENDAR, "MES TACHES"/"AUJOURD'HUI", FILTERS,
// GLOBAL SEARCH, BULK SELECTION, FOCUS MODE
// ==========================================
// Le tableau de bord vit dans ./dashboard.js — il n'est plus rendu ici. La
// vue « analytics » a ete absorbee par lui (voir switchView).
import { doc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { db } from './core/firebase.js';
import { state } from './core/state.js';
import { $, $$, el, createElement } from './core/dom.js';
import { esc, toast, handleError, getDueStatus, formatDeadline, highlightMatch, toLocalISODate } from './core/utils.js';
import { openModal, closeModal } from './core/modal.js';
import { icone } from './core/icones.js';
import { couleurSure, couleurTexteTag } from './core/couleurs.js';
import { confirmDialog } from './core/confirm.js';
import { renderTasks, openTaskModal, updateTask } from './tasks.js';
import { selectProject } from './projects.js';
import { canCreateOrEditTasks, canDeleteTasks } from './core/roles.js';
import { renderDashboard } from './dashboard.js';
// statutDe / prioriteDe rendent une `classe` CSS et un libelle TOUJOURS surs :
// `status` et `priority` viennent de Firestore et peuvent contenir n'importe
// quoi (un membre les ecrit via le SDK). Les injecter bruts dans un attribut
// `class` ou en contenu texte ouvrait un XSS stocke — meme menace que les
// couleurs, deja fermee par couleurSure().
import { statutDe, prioriteDe } from './core/triage.js';
import {
    JOURS_COURTS, casesDuMois, moisDe, moisDecale, memeMois, titreMois, tachesParJour,
} from './core/calendrier.js';

// ==========================================
// VIEW SWITCHING
// ==========================================

export function switchView(view) {
    // La vue « analytics » a ete absorbee par le tableau de bord : elle ne
    // lisait que `state.tasks`, donc le projet couramment ouvert, et repetait
    // les memes cartes que lui. Filtrer le tableau de bord sur un seul projet
    // redonne exactement ce qu'elle affichait.
    // L'alias est conserve plutot que supprime : le raccourci « g a », les
    // liens profonds et tout appel externe continuent de fonctionner au lieu
    // d'ouvrir une vue vide.
    if (view === 'analytics') view = 'dashboard';

    state.currentView = view;

    // Update view buttons (header toggle + mobile bottom nav + drawer)
    $$('.view-btn, .bottom-nav-item[data-view], .sidebar-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide containers.
    // Le board reste masque tant qu'il n'y a aucun projet : sinon on affichait
    // les quatre colonnes vides ET, juste en dessous, l'invitation a creer un
    // premier projet. Un compte neuf qui passe sur Calendrier puis revient sur
    // Tableau tombait dessus a coup sur — updateEmptyState() decidait
    // correctement, et cette ligne ecrasait sa decision juste apres.
    const aucunProjet = !state.projects.length;
    el.board?.classList.toggle('hidden', view !== 'board' || aucunProjet);
    $('calendar-container')?.classList.toggle('hidden', view !== 'calendar');
    $('mytasks-container')?.classList.toggle('hidden', view !== 'mytasks');
    $('today-container')?.classList.toggle('hidden', view !== 'today');
    $('dashboard-container')?.classList.toggle('hidden', view !== 'dashboard');
    // "Créé un nouveau projet" ne doit s'afficher que sur le board, jamais
    // a cote des autres vues (sinon elles se partagent la moitie de l'ecran)
    el.emptyBoard?.classList.toggle('visible', view === 'board' && aucunProjet);

    // Render appropriate view
    // Le calendrier repart du mois courant a chaque entree dans la vue : un
    // mois consulte au detour d'une visite n'a pas a devenir l'etat par defaut,
    // et un jour deplie sous la grille appartenait peut-etre a un autre projet.
    if (view === 'calendar') { reinitialiserCalendrier(); renderCalendar(); }
    if (view === 'mytasks') renderMyTasks();
    if (view === 'today') renderToday();
    // Seule vue asynchrone : elle va chercher les taches de tous les projets.
    // On ne l'attend pas — la bascule de vue doit etre immediate, le tableau
    // affiche son propre squelette. Le `catch` n'est pas decoratif : sans lui,
    // un echec apres le chargement partirait en rejet de promesse non traite,
    // invisible pour l'utilisateur comme pour nous.
    if (view === 'dashboard') {
        renderDashboard().catch(e => handleError(e, 'renderDashboard'));
    }
}

// ==========================================
// STATS
// ==========================================

export function updateStats() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.status === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    if (el.progressPercent) el.progressPercent.textContent = pct + '%';
    if (el.progressFill) el.progressFill.style.width = pct + '%';
    if (el.completedCount) el.completedCount.textContent = done;
    if (el.totalCount) el.totalCount.textContent = total;
}

export function updateEmptyState() {
    // Only the board view shows "Créé un nouveau projet" — on any other
    // view (dashboard, calendar, etc.) leave the containers as switchView() set them.
    if (state.currentView && state.currentView !== 'board') return;

    // Meme regle que switchView(), volontairement : les deux fonctions
    // decident du meme couple d'elements, et c'est leur desaccord qui faisait
    // apparaitre le board vide sous l'etat vide.
    const aucunProjet = !state.projects.length;
    el.board?.classList.toggle('hidden', aucunProjet);
    el.emptyBoard?.classList.toggle('visible', aucunProjet);
}

// ==========================================
// FILTERS
// ==========================================

export function resetFilters() {
    state.filters = {
        search: '',
        tags: [],
        priority: null,
        assignee: null,
        status: null,
        dateRange: null,
        showArchived: false
    };
    if (el.searchInput) el.searchInput.value = '';
    renderTasks();
    updateActiveFiltersDisplay();
}

export function renderFilterTags() {
    const container = $('filter-tags');
    if (!container) return;

    container.innerHTML = state.tags.map(t => `
        <label class="filter-tag-checkbox">
            <input type="checkbox" value="${esc(t.id)}" ${state.filters.tags.includes(t.id) ? 'checked' : ''}>
            <span class="filter-tag-chip" style="background:${couleurSure(t.color)}20;color:${couleurTexteTag(t.color)}">
                <span class="filter-tag-dot" style="background:${couleurSure(t.color)}"></span>${esc(t.name)}
            </span>
        </label>
    `).join('') || '<span class="text-muted">Aucun tag</span>';

    container.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', () => {
            if (input.checked) {
                state.filters.tags.push(input.value);
            } else {
                state.filters.tags = state.filters.tags.filter(id => id !== input.value);
            }
            renderTasks();
        });
    });
}

export function renderFilterAssignees() {
    const container = $('filter-assignee');
    if (!container) return;

    container.innerHTML = '<option value="">Tous</option>' +
        state.projectMembers.map(m =>
            `<option value="${esc(m.uid)}" ${state.filters.assignee === m.uid ? 'selected' : ''}>${esc(m.displayName || m.email)}</option>`
        ).join('');

    container.addEventListener('change', () => {
        state.filters.assignee = container.value || null;
        renderTasks();
    });
}

export function updateActiveFiltersDisplay() {
    const container = $('active-filters');
    if (!container) return;

    const activeFilters = [];

    if (state.filters.tags.length > 0) {
        const tagNames = state.filters.tags.map(id => state.tags.find(t => t.id === id)?.name).filter(Boolean);
        activeFilters.push(`Tags: ${esc(tagNames.join(', '))}`);
    }
    if (state.filters.priority) {
        activeFilters.push(`Priorité: ${state.filters.priority}`);
    }
    if (state.filters.assignee) {
        const assignee = state.projectMembers.find(m => m.uid === state.filters.assignee);
        activeFilters.push(`Assigné: ${esc(assignee?.displayName || assignee?.email || '')}`);
    }
    if (state.filters.dateRange) {
        const labels = { today: "Aujourd'hui", week: 'Cette semaine', overdue: 'En retard', 'no-date': 'Sans date' };
        activeFilters.push(`Date: ${labels[state.filters.dateRange]}`);
    }
    if (state.filters.showArchived) {
        activeFilters.push('Archives incluses');
    }

    if (activeFilters.length > 0) {
        container.innerHTML = `
            <div class="active-filters-list">
                ${activeFilters.map(f => `<span class="active-filter">${f}</span>`).join('')}
                <button class="clear-filters" id="clear-filters">Effacer</button>
            </div>
        `;
        container.style.display = 'block';
        $('clear-filters')?.addEventListener('click', resetFilters);
    } else {
        container.style.display = 'none';
    }
}

// ==========================================
// CALENDAR VIEW
// ==========================================

/**
 * Le mois affiche. Il ne valait rien auparavant : renderCalendar() repartait
 * systematiquement de `new Date()`, et les deux fleches n'etaient branchees sur
 * rien. On ne pouvait donc pas voir une echeance du mois suivant.
 */
let moisAffiche = moisDe(new Date());

/** Le jour ouvert sous la grille, en AAAA-MM-JJ, ou null. */
let jourOuvert = null;

/** Remet le calendrier sur le mois courant. Appele a chaque entree dans la vue. */
export function reinitialiserCalendrier() {
    moisAffiche = moisDe(new Date());
    jourOuvert = null;
}

export function renderCalendar() {
    const container = $('calendar-container');
    if (!container) return;

    const parJour = tachesParJour(state.tasks);
    const cases = casesDuMois(moisAffiche.annee, moisAffiche.mois);
    const surLeMoisCourant = memeMois(moisAffiche, moisDe(new Date()));

    let html = `
        <div class="calendar-header">
            <button type="button" class="btn-icon" id="prev-month" aria-label="Mois précédent">
                ${icone('chevronGauche', { taille: 20 })}
            </button>
            <h3 id="calendar-titre">${esc(titreMois(moisAffiche))}</h3>
            ${/* Le bouton de retour n'est pas RENDU sur le mois courant, plutot
                  que rendu et masque par `hidden`. `hidden` n'est pas une
                  propriete : c'est un `display: none` de la feuille du
                  navigateur, que la moindre regle d'auteur declarant un
                  `display` surcharge — et `.btn-text` en declare un. Le piege a
                  deja ete paye deux fois sur ce projet. */
              surLeMoisCourant ? '' :
                '<button type="button" class="btn-text calendar-aujourdhui" id="calendar-today">Ce mois-ci</button>'}
            <button type="button" class="btn-icon" id="next-month" aria-label="Mois suivant">
                ${icone('chevronDroite', { taille: 20 })}
            </button>
        </div>
        <div class="calendar-grid" role="grid" aria-labelledby="calendar-titre">
            <div class="calendar-weekdays">
                ${JOURS_COURTS.map(j => `<span>${j}</span>`).join('')}
            </div>
            <div class="calendar-days">
    `;

    for (const c of cases) {
        // Les cases vides avant le 1er sont purement decoratives : elles gardent
        // leurs bordures mais restent des <div>, masques aux lecteurs d'ecran.
        if (c.vide) {
            html += '<div class="calendar-day empty" aria-hidden="true"></div>';
            continue;
        }

        const taches = parJour.get(c.iso) || [];
        const date = new Date(c.iso + 'T12:00');
        const libelleJour = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
        const resume = taches.length
            ? `${taches.length} tâche${taches.length > 1 ? 's' : ''}`
            : 'aucune tâche, ouvrir pour en créer une';

        // Les PASTILLES, et non les intitules, sont la seule marque qui survive
        // a un ecran de telephone : `.day-tasks` y etait masque en bloc, et il
        // ne restait qu'une grille de nombres, sans aucun moyen de savoir quel
        // jour portait du travail. Elles sont posees a toutes les largeurs — sur
        // grand ecran les intitules les completent, ils ne les remplacent pas.
        const pastilles = taches.slice(0, 4)
            .map(t => `<span class="day-point ${prioriteDe(t).classe}"></span>`).join('');

        // <button> et non <div> : la case est cliquable depuis toujours, mais
        // en <div> elle n'etait ni focusable ni activable au clavier.
        html += `
            <button type="button" class="calendar-day${c.aujourdhui ? ' today' : ''}${jourOuvert === c.iso ? ' est-ouvert' : ''}"
                    data-date="${c.iso}" aria-label="${esc(libelleJour)} — ${esc(resume)}"
                    ${jourOuvert === c.iso ? 'aria-expanded="true" aria-controls="calendar-jour"' : ''}>
                <span class="day-number">${c.jour}</span>
                ${taches.length ? `<span class="day-points" aria-hidden="true">${pastilles}${
                    taches.length > 4 ? `<span class="day-point-plus">+${taches.length - 4}</span>` : ''
                }</span>` : ''}
                ${taches.length ? `
                    <span class="day-tasks">
                        ${taches.slice(0, 3).map(t => `
                            <span class="day-task ${prioriteDe(t).classe}" title="${esc(t.title)}">${esc(t.title)}</span>
                        `).join('')}
                        ${taches.length > 3 ? `<span class="day-task-more">+${taches.length - 3}</span>` : ''}
                    </span>
                ` : ''}
            </button>
        `;
    }

    html += '</div></div><div id="calendar-jour" class="calendar-jour"></div>';

    // Zone "Sans échéance" : les taches du projet sans dueDate n'ont aucun jour
    // ou se poser dans la grille. Plutot que de les laisser introuvables depuis
    // le calendrier, on les liste ici — un clic ouvre la tache pour lui donner
    // une date (ou juste la retrouver). Styles en ligne (variables du theme)
    // pour ne pas dependre du build CSS Tailwind.
    const sansDate = state.tasks.filter(t => !t.dueDate && !t.archived);
    if (sansDate.length) {
        html += `
            <div style="margin-top:1rem;padding:1rem;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg)">
                <h4 style="margin:0 0 .2rem">Sans échéance (${sansDate.length})</h4>
                <p style="margin:0 0 .75rem;font-size:.8rem;color:var(--text-muted)">Ces tâches n'ont pas de date — clique pour en ajouter une et les placer dans le calendrier.</p>
                <div style="display:flex;flex-direction:column;gap:.4rem">
                    ${sansDate.map(t => `
                        <button type="button" class="calendar-sans-date-item" data-id="${esc(t.id)}"
                                style="display:flex;align-items:center;gap:.55rem;width:100%;text-align:left;padding:.5rem .65rem;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--text-primary);font-size:.85rem">
                            <span class="day-point ${prioriteDe(t).classe}"></span>
                            <span>${esc(t.title)}</span>
                        </button>
                    `).join('')}
                </div>
            </div>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.calendar-sans-date-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const t = state.tasks.find(x => x.id === btn.dataset.id);
            if (t) openTaskModal(t);
        });
    });

    $('prev-month')?.addEventListener('click', () => {
        moisAffiche = moisDecale(moisAffiche, -1);
        jourOuvert = null;
        renderCalendar();
    });
    $('next-month')?.addEventListener('click', () => {
        moisAffiche = moisDecale(moisAffiche, 1);
        jourOuvert = null;
        renderCalendar();
    });
    $('calendar-today')?.addEventListener('click', () => {
        reinitialiserCalendrier();
        renderCalendar();
    });

    container.querySelectorAll('.calendar-day:not(.empty)').forEach(jour => {
        jour.addEventListener('click', () => ouvrirJour(jour.dataset.date));
    });

    if (jourOuvert) rendreJourOuvert(parJour.get(jourOuvert) || []);
}

/**
 * Ouvre le jour sous la grille.
 *
 * Un jour vide ouvre directement la creation de tache, prerempli : c'est le
 * geste attendu quand on touche une case vide d'un calendrier.
 *
 * Un jour occupe DEPLIE SA LISTE. Auparavant, deux taches ou plus n'affichaient
 * qu'un toast (« 3 tâches le 12/08 ») : une impasse, l'information etait
 * annoncee mais restait hors d'atteinte. Sur telephone, ou les intitules sont
 * masques dans la grille, c'etait le seul chemin possible — et il ne menait
 * nulle part.
 */
function ouvrirJour(iso) {
    const taches = state.tasks.filter(t => t.dueDate?.split('T')[0] === iso);
    if (taches.length === 0) {
        openTaskModal(null);
        if (el.taskDue) el.taskDue.value = iso + 'T09:00';
        return;
    }
    jourOuvert = jourOuvert === iso ? null : iso;
    renderCalendar();
    if (jourOuvert) {
        $('calendar-jour')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function rendreJourOuvert(taches) {
    const panneau = $('calendar-jour');
    if (!panneau || !jourOuvert) return;
    const date = new Date(jourOuvert + 'T12:00');
    const titre = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

    panneau.innerHTML = `
        <div class="calendar-jour-entete">
            <h4>${esc(titre.charAt(0).toUpperCase() + titre.slice(1))}</h4>
            <button type="button" class="btn-icon" id="calendar-jour-fermer" aria-label="Fermer la journée">
                ${icone('croix', { taille: 18 })}
            </button>
        </div>
        <ul class="calendar-jour-liste"></ul>
        <button type="button" class="btn-secondary calendar-jour-ajout" id="calendar-jour-ajout">
            ${icone('plus', { taille: 16 })} Ajouter une tâche ce jour-là
        </button>
    `;

    const liste = panneau.querySelector('.calendar-jour-liste');
    for (const t of taches) {
        const li = document.createElement('li');
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.className = 'calendar-jour-tache';
        // Construction par le DOM et non par innerHTML : le titre et le nom de
        // statut viennent de Firestore. `esc()` suffirait, mais textContent ne
        // peut pas se tromper.
        const point = document.createElement('span');
        point.className = `day-point ${prioriteDe(t).classe}`;
        const intitule = document.createElement('span');
        intitule.className = 'calendar-jour-titre';
        intitule.textContent = t.title || 'Sans titre';
        const statut = document.createElement('span');
        statut.className = 'calendar-jour-statut';
        statut.textContent = statutDe(t).libelle;
        bouton.append(point, intitule, statut);
        bouton.addEventListener('click', () => openTaskModal(t));
        li.appendChild(bouton);
        liste.appendChild(li);
    }

    panneau.querySelector('#calendar-jour-fermer')?.addEventListener('click', () => {
        jourOuvert = null;
        renderCalendar();
    });
    panneau.querySelector('#calendar-jour-ajout')?.addEventListener('click', () => {
        const iso = jourOuvert;
        openTaskModal(null);
        if (el.taskDue) el.taskDue.value = iso + 'T09:00';
    });
}

// ---------- Helper: build a row for "Mes tâches" / "Today" ----------
// avecProjet : la puce du projet n'a de sens que dans une liste melangeant
// plusieurs projets. Dans "Mes taches", les lignes sont deja regroupees sous
// un titre de projet — la repeter sur chaque ligne est du bruit pur.
function buildTaskRow(task, { avecProjet = true } = {}) {
    const project = state.projects.find(p => p.id === task.projectId);
    const dueStatus = getDueStatus(task.dueDate);
    const due = task.dueDate ? formatDeadline(task.dueDate) : '';
    const projName = project?.name || 'Projet inconnu';

    const row = document.createElement('div');
    row.className = `task-row ${dueStatus === 'overdue' ? 'overdue' : dueStatus === 'soon' ? 'due-soon' : ''}`;
    // La puce projet et l'echeance sont regroupees dans .row-meta pour qu'elles
    // descendent ENSEMBLE sur une seconde ligne au telephone. Sans ce groupe,
    // les quatre enfants se partageaient la largeur en colonnes : sur un ecran
    // de 320px le titre tombait a ~100px et s'etalait sur cinq lignes pendant
    // que « En retard de 3j » s'etranglait a cote.
    // Sur ecran large, .row-meta est en `display: contents` — le rendu bureau
    // est rigoureusement inchange, les deux spans restent freres du titre.
    row.innerHTML = `
        <span class="priority-dot ${prioriteDe(task).classe}"></span>
        <span class="row-title">${esc(task.title)}</span>
        <span class="row-meta">
            ${avecProjet ? `<span class="row-project" style="background:${couleurSure(project?.color)}25;color:${couleurTexteTag(couleurSure(project?.color))}">${esc(projName)}</span>` : ''}
            ${due ? `<span class="row-due">${esc(due)}</span>` : ''}
        </span>
    `;
    row.addEventListener('click', () => {
        if (task.projectId !== state.currentProjectId) {
            selectProject(task.projectId);
            setTimeout(() => openTaskModal(task), 600);
        } else {
            openTaskModal(task);
        }
    });
    return row;
}

// ---------- Vue "Mes tâches" cross-projets ----------
export function renderMyTasks() {
    const container = el.mytasksContainer;
    if (!container) return;

    const myActive = state.myTasks.filter(t => t.status !== 'done');
    const myDone = state.myTasks.filter(t => t.status === 'done');

    // Group by project
    const byProject = {};
    myActive.forEach(t => {
        (byProject[t.projectId] = byProject[t.projectId] || []).push(t);
    });

    // Sort each group by due date (overdue first)
    Object.values(byProject).forEach(arr => {
        arr.sort((a, b) => {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
    });

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'section-cards-header';
    header.innerHTML = `<h2>Mes tâches</h2><span class="count-badge">${myActive.length} active(s) · ${myDone.length} terminée(s)</span>`;
    container.appendChild(header);

    if (myActive.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-section';
        empty.innerHTML = `${icone('cocheCercle', { taille: 28 })}
            <p>Aucune tâche ne vous est assignée.</p>
            <p class="empty-section-aide">Cette vue rassemble vos tâches de tous les projets. Assignez-vous une tâche depuis un tableau pour la voir apparaître ici.</p>`;
        container.appendChild(empty);
        return;
    }

    Object.entries(byProject).forEach(([projectId, tasks]) => {
        const project = state.projects.find(p => p.id === projectId);
        const sub = document.createElement('div');
        sub.className = 'section-group';
        const h = document.createElement('h3');
        h.className = 'section-group-title';
        h.textContent = project?.name || 'Projet';
        sub.appendChild(h);
        // Pas de puce projet : le titre du groupe la porte deja.
        tasks.forEach(t => sub.appendChild(buildTaskRow(t, { avecProjet: false })));
        container.appendChild(sub);
    });
}

// ---------- Vue "Aujourd'hui" ----------
export function renderToday() {
    const container = el.todayContainer;
    if (!container) return;

    const now = new Date();
    const todayStr = toLocalISODate(now);

    const overdue = state.myTasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return t.dueDate.split('T')[0] < todayStr;
    });
    const dueToday = state.myTasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return t.dueDate.split('T')[0] === todayStr;
    });
    const noDate = state.myTasks.filter(t => !t.dueDate && t.status !== 'done');

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'section-cards-header';
    header.innerHTML = `<h2>Aujourd'hui · ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><span class="count-badge">${overdue.length + dueToday.length} à traiter</span>`;
    container.appendChild(header);

    const buildSection = (title, tasks, nomIcone, vide) => {
        const sec = document.createElement('div');
        sec.className = 'section-group';
        const h = document.createElement('h3');
        h.className = 'section-group-heading';
        h.innerHTML = `${icone(nomIcone, { taille: 16 })} ${esc(title)} <span class="section-group-count">(${tasks.length})</span>`;
        sec.appendChild(h);
        if (tasks.length === 0) {
            const e2 = document.createElement('p');
            e2.className = 'section-group-empty';
            e2.textContent = vide;
            sec.appendChild(e2);
        } else {
            tasks.forEach(t => sec.appendChild(buildTaskRow(t)));
        }
        container.appendChild(sec);
    };

    buildSection('En retard', overdue, 'alerte', 'Rien en retard.');
    buildSection("À faire aujourd'hui", dueToday, 'calendrier', 'Rien de prévu aujourd\'hui.');
    if (noDate.length > 0) buildSection('Sans échéance', noDate.slice(0, 10), 'liste', '');

    if (overdue.length === 0 && dueToday.length === 0 && noDate.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-section';
        empty.innerHTML = `${icone('cocheCercle', { taille: 28 })}
            <p>Rien à traiter aujourd'hui.</p>
            <p class="empty-section-aide">Les tâches qui vous sont assignées apparaissent ici le jour de leur échéance, et dès qu'elles sont en retard.</p>`;
        container.appendChild(empty);
    }
}

// ---------- View badges (today / mytasks counts) ----------
export function updateViewBadges() {
    const todayBadge = $('badge-today');
    const mytasksBadge = $('badge-mytasks');

    const todayStr = toLocalISODate();

    // Today: overdue + due today (active assigned tasks)
    const todayCount = state.myTasks.filter(t => {
        if (!t.dueDate || t.status === 'done') return false;
        return t.dueDate.split('T')[0] <= todayStr;
    }).length;

    // My tasks: total active assigned
    const mytasksCount = state.myTasks.filter(t => t.status !== 'done').length;

    // Apply a count to a badge element (header toggle + mobile bottom nav)
    const setBadge = (badge, count) => {
        if (!badge) return;
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.add('visible');
        } else {
            badge.classList.remove('visible');
        }
    };

    setBadge(todayBadge, todayCount);
    setBadge(mytasksBadge, mytasksCount);
    setBadge($('bn-badge-today'), todayCount);
    setBadge($('bn-badge-mytasks'), mytasksCount);
}

// Refresh view badges every minute (so "today" count stays accurate at midnight)
setInterval(updateViewBadges, 60_000);

// ==========================================
// GLOBAL SEARCH
// ==========================================

export function openGlobalSearch() {
    const modal = $('search-modal');
    if (!modal) return;

    openModal(modal);
    const input = $('global-search-input');
    if (input) {
        input.value = '';
        input.focus();
    }

    renderSearchResults('');
}

export function performGlobalSearch(query) {
    const q = query.toLowerCase().trim();
    const results = { tasks: [], projects: [], tags: [] };

    if (!q) {
        renderSearchResults(results, q);
        return;
    }

    // Search tasks
    results.tasks = [...state.tasks, ...state.archivedTasks].filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q)
    ).slice(0, 10);

    // Search projects
    results.projects = state.projects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    ).slice(0, 5);

    // Search tags
    results.tags = state.tags.filter(t =>
        t.name.toLowerCase().includes(q)
    ).slice(0, 5);

    renderSearchResults(results, q);
}

function renderSearchResults(results, query) {
    const container = $('search-results');
    if (!container) return;

    if (!query) {
        container.innerHTML = `
            <div class="search-hint">
                <p>La recherche porte sur tous vos projets à la fois :</p>
                <ul>
                    <li>${icone('liste')} <span>Tâches — titre et description</span></li>
                    <li>${icone('dossier')} <span>Projets — nom et description</span></li>
                    <li>${icone('etiquette')} <span>Tags</span></li>
                </ul>
                <div class="search-shortcuts">
                    <kbd>↑</kbd><kbd>↓</kbd> Parcourir
                    <kbd>Entrée</kbd> Ouvrir
                    <kbd>Échap</kbd> Fermer
                </div>
            </div>
        `;
        return;
    }

    const total = results.tasks.length + results.projects.length + results.tags.length;

    if (total === 0) {
        container.innerHTML = `<div class="search-empty">Aucun résultat pour « ${esc(query)} ». Vérifiez l'orthographe, ou cherchez un mot du titre plutôt que la phrase entière.</div>`;
        return;
    }

    let html = '';

    if (results.projects.length > 0) {
        html += `<div class="search-group"><h4>Projets</h4>`;
        html += results.projects.map(p => `
            <div class="search-item" data-type="project" data-id="${esc(p.id)}">
                <div class="search-item-icon" style="background:${couleurSure(p.color)}">${icone('dossier', { taille: 14 })}</div>
                <div class="search-item-content">
                    <span class="search-item-title">${highlightMatch(p.name, query)}</span>
                    ${p.description ? `<span class="search-item-desc">${highlightMatch(p.description, query)}</span>` : ''}
                </div>
            </div>
        `).join('');
        html += '</div>';
    }

    if (results.tasks.length > 0) {
        html += `<div class="search-group"><h4>Tâches</h4>`;
        html += results.tasks.map(t => `
            <div class="search-item" data-type="task" data-id="${esc(t.id)}">
                <div class="search-item-icon ${statutDe(t).classe}">${icone('liste', { taille: 14 })}</div>
                <div class="search-item-content">
                    <span class="search-item-title">${highlightMatch(t.title, query)}</span>
                    ${t.description ? `<span class="search-item-desc">${highlightMatch(t.description.substring(0, 100), query)}</span>` : ''}
                </div>
                <span class="search-item-status ${statutDe(t).classe}">${t.archived ? 'Archivée' : esc(statutDe(t).libelle)}</span>
            </div>
        `).join('');
        html += '</div>';
    }

    if (results.tags.length > 0) {
        html += `<div class="search-group"><h4>Tags</h4>`;
        html += results.tags.map(t => `
            <div class="search-item" data-type="tag" data-id="${esc(t.id)}">
                <div class="search-item-icon" style="background:${couleurSure(t.color)}">${icone('etiquette', { taille: 14 })}</div>
                <span class="search-item-title">${highlightMatch(t.name, query)}</span>
            </div>
        `).join('');
        html += '</div>';
    }

    container.innerHTML = html;

    // Add click handlers
    container.querySelectorAll('.search-item').forEach(item => {
        item.addEventListener('click', () => handleSearchSelect(item.dataset.type, item.dataset.id));
    });
}

function handleSearchSelect(type, id) {
    closeModal($('search-modal'));

    switch (type) {
        case 'project':
            selectProject(id);
            break;
        case 'task': {
            const task = [...state.tasks, ...state.archivedTasks].find(t => t.id === id);
            if (task) {
                if (task.projectId !== state.currentProjectId) {
                    selectProject(task.projectId);
                    setTimeout(() => openTaskModal(task), 500);
                } else {
                    openTaskModal(task);
                }
            }
            break;
        }
        case 'tag':
            state.filters.tags = [id];
            renderTasks();
            toast('Filtre appliqué.', 'info');
            break;
    }
}

// ---------- Bulk selection ----------
export function toggleTaskSelection(taskId, cardEl) {
    if (state.selectedTaskIds.has(taskId)) {
        state.selectedTaskIds.delete(taskId);
        cardEl?.classList.remove('selected');
    } else {
        state.selectedTaskIds.add(taskId);
        cardEl?.classList.add('selected');
    }
    updateBulkBar();
}

export function updateBulkBar() {
    if (!el.bulkActionBar) return;
    const count = state.selectedTaskIds.size;
    if (count > 0) {
        el.bulkActionBar.classList.add('visible');
        if (el.bulkCountNum) el.bulkCountNum.textContent = count;
    } else {
        el.bulkActionBar.classList.remove('visible');
    }
}

export function clearBulkSelection() {
    state.selectedTaskIds.clear();
    document.querySelectorAll('.task-card.selected').forEach(c => c.classList.remove('selected'));
    updateBulkBar();
}

export async function bulkUpdateStatus(status) {
    const ids = [...state.selectedTaskIds];
    const batch = writeBatch(db);
    ids.forEach(id => batch.update(doc(db, 'tasks', id), { status }));
    await batch.commit();
    toast(`${ids.length} tâche(s) mise(s) à jour.`, 'success');
    clearBulkSelection();
}

export async function bulkArchive() {
    // Aucun controle de role n'existait ici : un lecteur pouvait archiver en
    // masse. Les regles Firestore le refusent desormais ; sans ce garde-fou
    // l'utilisateur n'aurait eu qu'un echec silencieux.
    if (!canCreateOrEditTasks(state.currentProjectId)) {
        toast('Vous êtes en lecture seule sur ce projet.', 'error');
        return;
    }
    const ids = [...state.selectedTaskIds];
    const batch = writeBatch(db);
    ids.forEach(id => batch.update(doc(db, 'tasks', id), { archived: true, archivedAt: new Date().toISOString() }));
    try {
        await batch.commit();
    } catch (e) {
        handleError(e, 'bulkArchive');
        return;
    }
    toast(`${ids.length} tâche${ids.length > 1 ? "s" : ""} archivée${ids.length > 1 ? "s" : ""}.`, 'success');
    clearBulkSelection();
}

export async function bulkDelete() {
    // Meme angle mort que bulkArchive, avec une consequence pire : la
    // suppression est definitive. Seuls proprietaire et administrateurs,
    // comme pour la suppression a l'unite (canDeleteTasks).
    if (!canDeleteTasks(state.currentProjectId)) {
        toast('Seuls le propriétaire et les administrateurs peuvent supprimer des tâches.', 'error');
        return;
    }
    const nb = state.selectedTaskIds.size;
    if (!await confirmDialog({
        titre: nb > 1 ? `Supprimer ${nb} tâches ?` : 'Supprimer cette tâche ?',
        message: 'La suppression est définitive : ces tâches ne pourront pas être récupérées.',
        valider: nb > 1 ? `Supprimer les ${nb}` : 'Supprimer',
        danger: true,
    })) return;
    const ids = [...state.selectedTaskIds];
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'tasks', id)));
    try {
        await batch.commit();
    } catch (e) {
        handleError(e, 'bulkDelete');
        return;
    }
    toast(`${ids.length} tâche${ids.length > 1 ? "s" : ""} supprimée${ids.length > 1 ? "s" : ""}.`, 'info');
    clearBulkSelection();
}

// ---------- Focus mode ----------
export function enterFocusMode(task) {
    if (!task || !el.focusMode || !el.focusContent) return;
    state.focusedTaskId = task.id;
    // Le minuteur affiche ici a ete retire avec le Pomodoro. Il ne fonctionnait
    // de toute facon pas : `#focus-timer-display` etait ecrit une fois a 25:00
    // et JAMAIS mis a jour ensuite — aucune ligne du produit ne le touchait.
    // Le bouton « Démarrer le minuteur » lancait le compte a rebours de la
    // barre laterale, cachee derriere cet overlay : on voyait donc un 25:00
    // fige pendant que le temps s'ecoulait hors de vue.
    el.focusContent.innerHTML = `
        <h1>${esc(task.title)}</h1>
        ${task.description ? `<div class="focus-desc">${esc(task.description)}</div>` : ''}
        <div class="focus-actions">
            <button class="btn-secondary" id="focus-done-btn">${icone('coche')} Marquer terminée</button>
        </div>
    `;
    el.focusMode.classList.add('active');

    $('focus-done-btn')?.addEventListener('click', async () => {
        await updateTask(task.id, { status: 'done', title: task.title });
        exitFocusMode();
    });
}

export function exitFocusMode() {
    state.focusedTaskId = null;
    el.focusMode?.classList.remove('active');
}

// ---- Wiring ----
$$('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
});

$('filter-btn')?.addEventListener('click', () => {
    $('filter-panel')?.classList.toggle('open');
});

$('global-search-btn')?.addEventListener('click', openGlobalSearch);
$('global-search-input')?.addEventListener('input', e => performGlobalSearch(e.target.value));
$('activity-btn')?.addEventListener('click', () => {
    $('activity-panel')?.classList.toggle('open');
});

// Remplace un `onclick=` qui vivait dans index.html. La CSP de netlify.toml
// n'autorise pas 'unsafe-inline' pour les scripts : le gestionnaire en ligne
// aurait ete bloque au premier deploiement, laissant un bouton de fermeture
// inerte. Un test verrouille l'absence de `onclick=` dans index.html.
$('activity-close-btn')?.addEventListener('click', () => {
    $('activity-panel')?.classList.remove('open');
});

$('filter-priority')?.addEventListener('change', e => {
    state.filters.priority = e.target.value || null;
    renderTasks();
});

$('filter-date')?.addEventListener('change', e => {
    state.filters.dateRange = e.target.value || null;
    renderTasks();
});

$('filter-archived')?.addEventListener('change', e => {
    state.filters.showArchived = e.target.checked;
    renderTasks();
});

$('bulk-status-todo')?.addEventListener('click', () => bulkUpdateStatus('todo'));
$('bulk-status-inprogress')?.addEventListener('click', () => bulkUpdateStatus('inprogress'));
$('bulk-status-done')?.addEventListener('click', () => bulkUpdateStatus('done'));
$('bulk-archive')?.addEventListener('click', bulkArchive);
$('bulk-delete')?.addEventListener('click', bulkDelete);
$('bulk-clear')?.addEventListener('click', clearBulkSelection);

el.focusClose?.addEventListener('click', exitFocusMode);
el.focusTaskBtn?.addEventListener('click', () => {
    const t = state.tasks.find(x => x.id === state.editingTaskId);
    if (t) {
        closeModal(el.taskModal);
        enterFocusMode(t);
    }
});

// Esc closes focus mode / clears bulk selection
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.focusMode?.classList.contains('active')) exitFocusMode();
    // Bulk Esc clears selection
    if (e.key === 'Escape' && state.selectedTaskIds.size > 0) clearBulkSelection();
});
