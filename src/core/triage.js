// ==========================================
// TRIAGE — LOGIQUE PURE DU TABLEAU DE BORD
// ==========================================
// Tout ce qui decide QUELLES taches sont retenues, dans QUEL ordre, et ce
// qu'elles totalisent. Aucun acces au DOM, a Firestore ni a `state` : ce
// fichier prend des tableaux et rend des tableaux.
//
// C'est deliberé. Le tableau de bord precedent melait le calcul et le
// `innerHTML` dans une seule fonction de 240 lignes : aucun de ses chiffres
// n'etait verifiable autrement qu'a l'oeil, sur un compte reel. Ici chaque
// regle de filtrage est une fonction que l'on peut appeler avec trois taches
// inventees et une date figee.

// ------------------------------------------------------------------
// Conversion de dates
// ------------------------------------------------------------------

/**
 * Convertit en Date n'importe laquelle des formes qu'une date prend dans
 * Corvio Space, et rend `null` si la valeur n'en est pas une.
 *
 * Quatre formes coexistent en base, pour des raisons historiques :
 *   - "AAAA-MM-JJ"          les echeances, saisies via <input type="date">
 *   - chaine ISO complete   les createdAt/completedAt ecrits par le client
 *   - nombre                quelques anciens enregistrements en millisecondes
 *   - Timestamp Firestore   { seconds, nanoseconds } ou objet a .toDate()
 *
 * Le code existant faisait partout `new Date(t.createdAt)`, ce qui rend
 * `Invalid Date` sur la quatrieme forme — et `Invalid Date` se propage
 * silencieusement : la comparaison est `false`, la tache disparait du
 * total sans que rien ne le signale.
 */
export function versDate(valeur) {
    if (valeur == null || valeur === '') return null;
    if (valeur instanceof Date) return isNaN(valeur) ? null : valeur;

    // Timestamp Firestore, dans ses deux formes.
    if (typeof valeur === 'object') {
        if (typeof valeur.toDate === 'function') {
            try {
                const d = valeur.toDate();
                return d instanceof Date && !isNaN(d) ? d : null;
            } catch { return null; }
        }
        if (typeof valeur.seconds === 'number') {
            const d = new Date(valeur.seconds * 1000);
            return isNaN(d) ? null : d;
        }
        return null;
    }

    if (typeof valeur === 'number') {
        const d = new Date(valeur);
        return isNaN(d) ? null : d;
    }

    const texte = String(valeur).trim();

    // Une date seule designe un JOUR, pas un instant : on la place a la fin
    // de la journee LOCALE. `new Date('2026-07-21')` vaudrait minuit UTC,
    // ce qui decale le jour a l'est de Greenwich et declare "en retard" des
    // 00h01 une tache due le jour meme. Meme regle que parseDeadline().
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);

    const d = new Date(texte);
    return isNaN(d) ? null : d;
}

/** Debut de journee locale. */
export function debutDuJour(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Fin de journee locale. */
export function finDuJour(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// ------------------------------------------------------------------
// Champs de date
// ------------------------------------------------------------------

// Sur QUELLE date porte la periode. Un tableau de bord qui ne le dit pas est
// un tableau de bord dont on ne peut pas se servir : « 42 taches sur 30
// jours » ne veut rien dire tant qu'on ignore s'il s'agit de taches creees,
// dues ou terminees pendant ces 30 jours. Le choix est donc explicite dans
// l'interface, et il porte sur les trois seules dates qu'une tache possede.
export const CHAMPS_DATE = {
    echeance: { libelle: 'Échéance', champs: ['dueDate'] },
    creation: { libelle: 'Création', champs: ['createdAt'] },
    achevement: { libelle: 'Achèvement', champs: ['completedAt', 'archivedAt'] }
};

/** La date d'une tache pour le champ demande, ou null si elle n'en a pas. */
export function dateDeTache(tache, champ) {
    const def = CHAMPS_DATE[champ] || CHAMPS_DATE.echeance;
    for (const nom of def.champs) {
        const d = versDate(tache[nom]);
        if (d) return d;
    }
    return null;
}

// ------------------------------------------------------------------
// Periodes
// ------------------------------------------------------------------

// Groupees par intention. Une fenetre retrospective n'a de sens que sur une
// date passee (creation, achevement) ; une fenetre prospective n'en a que
// sur une echeance. Les deux sont offertes parce que le champ de date est,
// lui, libre — et c'est la combinaison des deux qui repond aux vraies
// questions : « ce qui a ete termine le mois dernier », « ce qui arrive a
// echeance dans les 7 jours ».
export const PERIODES = {
    tout: { libelle: 'Toutes périodes', groupe: null },
    '7j': { libelle: '7 derniers jours', groupe: 'Rétrospectif' },
    '30j': { libelle: '30 derniers jours', groupe: 'Rétrospectif' },
    '90j': { libelle: '90 derniers jours', groupe: 'Rétrospectif' },
    mois: { libelle: 'Mois en cours', groupe: 'Période en cours' },
    trimestre: { libelle: 'Trimestre en cours', groupe: 'Période en cours' },
    annee: { libelle: 'Année en cours', groupe: 'Période en cours' },
    'a-venir-7j': { libelle: '7 prochains jours', groupe: 'Prospectif' },
    'a-venir-30j': { libelle: '30 prochains jours', groupe: 'Prospectif' },
    perso: { libelle: 'Dates personnalisées', groupe: 'Personnalisé' }
};

/**
 * Bornes d'une periode, en heure locale.
 * Rend `{ debut, fin }`, chacune pouvant valoir null = pas de borne de ce cote.
 *
 * @param {string} cle          une cle de PERIODES
 * @param {Date}   maintenant   injectable, pour que les tests ne dependent
 *                              pas du jour ou on les lance
 * @param {object} perso        { du, au } au format "AAAA-MM-JJ"
 */
export function bornesPeriode(cle, maintenant = new Date(), perso = {}) {
    const jour = 24 * 60 * 60 * 1000;
    const aujourdhuiDebut = debutDuJour(maintenant);
    const aujourdhuiFin = finDuJour(maintenant);

    switch (cle) {
        case '7j':
            return { debut: debutDuJour(new Date(aujourdhuiDebut.getTime() - 6 * jour)), fin: aujourdhuiFin };
        case '30j':
            return { debut: debutDuJour(new Date(aujourdhuiDebut.getTime() - 29 * jour)), fin: aujourdhuiFin };
        case '90j':
            return { debut: debutDuJour(new Date(aujourdhuiDebut.getTime() - 89 * jour)), fin: aujourdhuiFin };
        case 'mois':
            return {
                debut: new Date(maintenant.getFullYear(), maintenant.getMonth(), 1, 0, 0, 0, 0),
                fin: new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0, 23, 59, 59, 999)
            };
        case 'trimestre': {
            const premierMois = Math.floor(maintenant.getMonth() / 3) * 3;
            return {
                debut: new Date(maintenant.getFullYear(), premierMois, 1, 0, 0, 0, 0),
                fin: new Date(maintenant.getFullYear(), premierMois + 3, 0, 23, 59, 59, 999)
            };
        }
        case 'annee':
            return {
                debut: new Date(maintenant.getFullYear(), 0, 1, 0, 0, 0, 0),
                fin: new Date(maintenant.getFullYear(), 11, 31, 23, 59, 59, 999)
            };
        case 'a-venir-7j':
            return { debut: aujourdhuiDebut, fin: finDuJour(new Date(aujourdhuiDebut.getTime() + 6 * jour)) };
        case 'a-venir-30j':
            return { debut: aujourdhuiDebut, fin: finDuJour(new Date(aujourdhuiDebut.getTime() + 29 * jour)) };
        case 'perso': {
            const du = perso?.du ? versDate(perso.du) : null;
            const au = perso?.au ? versDate(perso.au) : null;
            // Une date seule est ramenee a la fin de journee par versDate ;
            // pour une borne de DEBUT c'est le contraire qu'on veut, sinon
            // toute la premiere journee de l'intervalle est exclue.
            return { debut: du ? debutDuJour(du) : null, fin: au || null };
        }
        case 'tout':
        default:
            return { debut: null, fin: null };
    }
}

// ------------------------------------------------------------------
// Etat de triage
// ------------------------------------------------------------------

// Vues rapides. Ce sont les cinq questions qu'on pose vraiment a un tableau
// de bord — « qu'est-ce qui est en retard », « qu'est-ce qui arrive »,
// « qu'est-ce qui n'a personne dessus ». Aucune ne s'exprime avec les filtres
// par champ : « en retard » croise le statut ET l'echeance ET l'heure qu'il
// est. Les exposer comme un critere a part entiere evite d'obliger
// l'utilisateur a les reconstruire a la main a chaque fois.
//
// Toutes, sauf `terminees`, ne portent que sur des taches ACTIVES : une tache
// terminee en retard n'est plus un risque.
export const VUES_RAPIDES = {
    retard: {
        libelle: 'En retard',
        icone: 'alerte',
        garde: (t, maintenant) => {
            if (t.status === 'done') return false;
            const d = versDate(t.dueDate);
            return !!d && d < maintenant;
        }
    },
    proche: {
        libelle: 'Sous 7 jours',
        icone: 'horloge',
        garde: (t, maintenant) => {
            if (t.status === 'done') return false;
            const d = versDate(t.dueDate);
            if (!d || d < maintenant) return false;
            return d <= finDuJour(new Date(debutDuJour(maintenant).getTime() + 6 * 24 * 60 * 60 * 1000));
        }
    },
    sansAssigne: {
        libelle: 'Sans personne assignée',
        icone: 'personnePlus',
        garde: t => t.status !== 'done' && !t.assigneeId
    },
    sansEcheance: {
        libelle: 'Sans échéance',
        icone: 'calendrier',
        garde: t => t.status !== 'done' && !versDate(t.dueDate)
    },
    terminees: {
        libelle: 'Terminées',
        icone: 'cocheCercle',
        garde: t => t.status === 'done'
    }
};

// GELE, et ce n'est pas de la coquetterie. Les valeurs par defaut contiennent
// quatre tableaux ; `{ ...TRIAGE_PAR_DEFAUT }` en copie la REFERENCE, pas le
// contenu. L'interface, elle, ajoute et retire des elements en place
// (`liste.push(valeur)` quand on active une puce de filtre) : sans le gel et
// sans la copie profonde faite dans normaliserTriage, le premier clic sur un
// filtre de projet ecrivait dans cette constante meme. Les "valeurs par
// defaut" du module portaient alors ce projet pour le reste de la session, et
// « Tout effacer » ne pouvait plus rien effacer — il rendait un etat par
// defaut deja pollue.
// Le gel transforme une corruption silencieuse en erreur immediate.
export const TRIAGE_PAR_DEFAUT = Object.freeze({
    perimetre: 'equipe',      // 'moi' | 'equipe'
    rapide: null,             // cle de VUES_RAPIDES, ou null
    periode: 'tout',
    champDate: 'echeance',
    perso: Object.freeze({ du: '', au: '' }),
    projets: Object.freeze([]),   // [] = tous
    assignes: Object.freeze([]),  // [] = tous ; 'aucun' cible les non assignees
    statuts: Object.freeze([]),   // [] = tous
    priorites: Object.freeze([]), // [] = toutes
    recherche: '',
    avecArchivees: false,
    tri: 'echeance',
    ordre: 'asc'
});

/** Fusionne un etat partiel (venu de localStorage) avec les valeurs par
 *  defaut, en rejetant tout ce qui n'a pas le bon type. Une cle corrompue ne
 *  doit pas rendre le tableau de bord inutilisable — l'utilisateur n'aurait
 *  aucun moyen de la reparer depuis l'interface. */
export function normaliserTriage(brut) {
    // Copie PROFONDE : voir le commentaire de TRIAGE_PAR_DEFAUT. L'objet rendu
    // ici est ensuite mute en place par l'interface, il ne doit donc partager
    // aucune reference avec la constante.
    const d = {
        ...TRIAGE_PAR_DEFAUT,
        perso: { ...TRIAGE_PAR_DEFAUT.perso },
        projets: [],
        assignes: [],
        statuts: [],
        priorites: []
    };
    if (!brut || typeof brut !== 'object') return d;

    const listeDeTextes = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);

    if (brut.perimetre === 'moi' || brut.perimetre === 'equipe') d.perimetre = brut.perimetre;
    if (typeof brut.rapide === 'string' && VUES_RAPIDES[brut.rapide]) d.rapide = brut.rapide;
    if (typeof brut.periode === 'string' && PERIODES[brut.periode]) d.periode = brut.periode;
    if (typeof brut.champDate === 'string' && CHAMPS_DATE[brut.champDate]) d.champDate = brut.champDate;
    if (brut.perso && typeof brut.perso === 'object') {
        if (typeof brut.perso.du === 'string') d.perso.du = brut.perso.du;
        if (typeof brut.perso.au === 'string') d.perso.au = brut.perso.au;
    }
    d.projets = listeDeTextes(brut.projets);
    d.assignes = listeDeTextes(brut.assignes);
    d.statuts = listeDeTextes(brut.statuts).filter(s => STATUTS[s]);
    d.priorites = listeDeTextes(brut.priorites).filter(p => PRIORITES[p]);
    if (typeof brut.recherche === 'string') d.recherche = brut.recherche;
    d.avecArchivees = brut.avecArchivees === true;
    if (typeof brut.tri === 'string' && TRIS[brut.tri]) d.tri = brut.tri;
    if (brut.ordre === 'asc' || brut.ordre === 'desc') d.ordre = brut.ordre;
    return d;
}

/** Vrai si le triage retient encore tout : sert a decider si l'on affiche le
 *  bouton « Tout effacer » et le bandeau « filtres actifs ». */
export function triageEstVierge(t) {
    return t.periode === 'tout'
        && !t.rapide
        && !t.projets.length && !t.assignes.length
        && !t.statuts.length && !t.priorites.length
        && !t.recherche.trim()
        && !t.avecArchivees
        && t.perimetre === 'equipe';
}

/** Nombre de criteres actifs — affiche sur le bouton qui replie la barre au
 *  telephone, ou l'on ne voit pas les champs eux-memes. */
export function nombreDeFiltresActifs(t) {
    let n = 0;
    if (t.rapide) n++;
    if (t.periode !== 'tout') n++;
    if (t.projets.length) n++;
    if (t.assignes.length) n++;
    if (t.statuts.length) n++;
    if (t.priorites.length) n++;
    if (t.recherche.trim()) n++;
    if (t.avecArchivees) n++;
    if (t.perimetre === 'moi') n++;
    return n;
}

// ------------------------------------------------------------------
// Vocabulaire
// ------------------------------------------------------------------

export const STATUTS = {
    todo: { libelle: 'À faire', classe: 'todo' },
    inprogress: { libelle: 'En cours', classe: 'inprogress' },
    review: { libelle: 'En revue', classe: 'review' },
    done: { libelle: 'Terminé', classe: 'done' }
};

export const PRIORITES = {
    high: { libelle: 'Haute', classe: 'high', poids: 3 },
    medium: { libelle: 'Moyenne', classe: 'medium', poids: 2 },
    low: { libelle: 'Basse', classe: 'low', poids: 1 }
};

/**
 * Descripteur SUR d'un statut ou d'une priorite.
 *
 * `STATUTS[t.status]` rendait `undefined` des que la valeur sortait des quatre
 * cles connues, et l'appelant faisait `.classe` dessus : TypeError, template
 * litteral interrompu, `innerHTML` jamais affecte — UNE tache mal formee
 * gelait le tableau de bord entier, en silence.
 *
 * Ce n'est pas un cas de laboratoire : les projets ont des COLONNES
 * PERSONNALISABLES (`project.columns`, voir projects.js), donc `status` vaut
 * legitimement l'identifiant de n'importe quelle colonne. Un statut inconnu
 * est la normale, pas l'exception.
 *
 * La `classe` rendue est toujours une valeur EN DUR. Elle finit dans un
 * attribut `class` non echappe : y laisser passer une donnee utilisateur
 * ouvrirait une injection, exactement le probleme que `couleurSure()` a du
 * corriger sur les couleurs de tags.
 */
export function statutDe(tache) {
    const cle = tache?.status;
    const connu = STATUTS[cle];
    if (connu) return { libelle: connu.libelle, classe: connu.classe, connu: true };
    return {
        libelle: cle ? String(cle) : 'Sans statut',
        classe: 'autre',
        connu: false
    };
}

export function prioriteDe(tache) {
    const cle = tache?.priority;
    const connu = PRIORITES[cle];
    if (connu) return { libelle: connu.libelle, classe: connu.classe, poids: connu.poids, connu: true };
    if (cle == null || cle === '') {
        const d = PRIORITES.medium;
        return { libelle: d.libelle, classe: d.classe, poids: d.poids, connu: true };
    }
    return { libelle: String(cle), classe: 'autre', poids: 0, connu: false };
}

export const TRIS = {
    echeance: 'Échéance',
    priorite: 'Priorité',
    temps: 'Temps passé',
    creation: 'Date de création',
    achevement: "Date d'achèvement",
    projet: 'Projet',
    assigne: 'Personne assignée',
    titre: 'Titre',
    statut: 'Statut'
};

// ------------------------------------------------------------------
// Filtrage
// ------------------------------------------------------------------

/**
 * Applique le triage a une liste de taches.
 *
 * Rend `{ retenues, horsPeriode }` plutot qu'un simple tableau : les taches
 * ecartees FAUTE DE DATE sont comptees a part. C'est le piege classique de ce
 * genre de filtre — poser une periode sur l'echeance fait disparaitre en
 * silence toutes les taches sans echeance, et le total affiche devient faux
 * sans que rien ne l'indique. L'interface annonce donc ce nombre.
 *
 * @param {Array}  taches
 * @param {object} triage
 * @param {object} ctx    { uid, maintenant }
 */
export function filtrerTaches(taches, triage, ctx = {}) {
    const t = triage;
    const uid = ctx.uid || null;
    const maintenant = ctx.maintenant || new Date();
    const { debut, fin } = bornesPeriode(t.periode, maintenant, t.perso);
    const bornee = !!(debut || fin);
    const recherche = t.recherche.trim().toLowerCase();

    const projets = new Set(t.projets);
    const assignes = new Set(t.assignes);
    const statuts = new Set(t.statuts);
    const priorites = new Set(t.priorites);
    const rapide = t.rapide ? VUES_RAPIDES[t.rapide] : null;

    const retenues = [];
    let horsPeriode = 0;

    for (const tache of taches) {
        if (!t.avecArchivees && tache.archived === true) continue;
        if (rapide && !rapide.garde(tache, maintenant)) continue;
        if (t.perimetre === 'moi' && tache.assigneeId !== uid) continue;
        if (projets.size && !projets.has(tache.projectId)) continue;

        if (assignes.size) {
            const cle = tache.assigneeId || 'aucun';
            if (!assignes.has(cle)) continue;
        }

        if (statuts.size && !statuts.has(tache.status || 'todo')) continue;
        if (priorites.size && !priorites.has(tache.priority || 'medium')) continue;

        if (recherche) {
            const titre = String(tache.title || '').toLowerCase();
            const desc = String(tache.description || '').toLowerCase();
            if (!titre.includes(recherche) && !desc.includes(recherche)) continue;
        }

        if (bornee) {
            const d = dateDeTache(tache, t.champDate);
            // Sans date sur le champ choisi, la tache ne peut ni etre dans la
            // fenetre ni en dehors : on la compte a part, on ne la retient pas.
            if (!d) { horsPeriode++; continue; }
            if (debut && d < debut) continue;
            if (fin && d > fin) continue;
        }

        retenues.push(tache);
    }

    return { retenues, horsPeriode };
}

// ------------------------------------------------------------------
// Tri
// ------------------------------------------------------------------

/**
 * Trie une COPIE de la liste. Deux regles constantes, quel que soit le
 * critere :
 *
 *  - une valeur absente part toujours a la fin, meme en ordre decroissant.
 *    Inverser l'ordre pour faire remonter trente taches sans echeance en tete
 *    de liste n'aide personne ;
 *  - a egalite, on departage par titre, pour que deux rendus successifs des
 *    memes donnees produisent le meme ordre. Sans ce depart, le tri par
 *    priorite reordonnait les taches a chaque re-rendu.
 */
export function trierTaches(taches, tri = 'echeance', ordre = 'asc') {
    const sens = ordre === 'desc' ? -1 : 1;

    const cle = tache => {
        switch (tri) {
            case 'priorite': return PRIORITES[tache.priority || 'medium']?.poids ?? 0;
            // 0 est une VRAIE valeur ici, pas une absence : une tache jamais
            // chronometree vaut zero seconde, elle ne doit pas etre traitee
            // comme une tache sans echeance et renvoyee en fin de liste dans
            // les deux sens. En decroissant, les zeros ferment la marche
            // d'eux-memes, ce qui est exactement ce qu'on veut.
            case 'temps': return tache.timeSpent || 0;
            case 'creation': return dateDeTache(tache, 'creation')?.getTime() ?? null;
            case 'achevement': return dateDeTache(tache, 'achevement')?.getTime() ?? null;
            case 'projet': return tache._nomProjet || '';
            case 'assigne': return tache._nomAssigne || '';
            case 'titre': return String(tache.title || '');
            // Un statut hors des quatre connus (colonne personnalisee) part en
            // fin de liste plutot qu'en tete : indexOf rendrait -1, ce qui le
            // ferait passer AVANT « À faire ».
            case 'statut': {
                const i = Object.keys(STATUTS).indexOf(tache.status || 'todo');
                return i === -1 ? Object.keys(STATUTS).length : i;
            }
            case 'echeance':
            default: return dateDeTache(tache, 'echeance')?.getTime() ?? null;
        }
    };

    const absente = v => v === null || v === undefined || v === '';

    return [...taches].sort((a, b) => {
        const va = cle(a);
        const vb = cle(b);

        const aVide = absente(va);
        const bVide = absente(vb);
        if (aVide && bVide) return String(a.title || '').localeCompare(String(b.title || ''), 'fr');
        if (aVide) return 1;   // toujours a la fin
        if (bVide) return -1;

        let d;
        if (typeof va === 'string' || typeof vb === 'string') {
            d = String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
        } else {
            d = va - vb;
        }

        if (d !== 0) return d * sens;
        return String(a.title || '').localeCompare(String(b.title || ''), 'fr');
    });
}

// ------------------------------------------------------------------
// Indicateurs
// ------------------------------------------------------------------

/**
 * Les cinq chiffres de pilotage, calcules sur le perimetre DEJA filtre.
 *
 * « En retard » et « à échéance sous 7 jours » ne comptent que des taches
 * actives : une tache terminee apres sa date n'est plus un risque, c'est de
 * l'histoire. C'est aussi ce que fait le reste de l'app (getDueStatus n'est
 * lu que sur des taches non terminees), et deux definitions concurrentes du
 * mot « retard » dans un meme produit sont une facon sure de perdre la
 * confiance de celui qui lit le chiffre.
 */
export function calculerIndicateurs(taches, maintenant = new Date()) {
    const finAujourdhui = finDuJour(maintenant);
    const dans7j = finDuJour(new Date(debutDuJour(maintenant).getTime() + 6 * 24 * 60 * 60 * 1000));

    let actives = 0, terminees = 0, enRetard = 0, echeanceProche = 0;
    let sansAssigne = 0, sansEcheance = 0;

    for (const t of taches) {
        const estTerminee = t.status === 'done';
        if (estTerminee) { terminees++; } else { actives++; }

        if (!estTerminee) {
            const due = versDate(t.dueDate);
            if (!due) {
                sansEcheance++;
            } else if (due < finAujourdhui && due < maintenant) {
                enRetard++;
            } else if (due <= dans7j) {
                echeanceProche++;
            }
            if (!t.assigneeId) sansAssigne++;
        }
    }

    const total = taches.length;
    return {
        total,
        actives,
        terminees,
        enRetard,
        echeanceProche,
        sansAssigne,
        sansEcheance,
        tauxAchevement: total ? Math.round((terminees / total) * 100) : 0
    };
}

/**
 * Duree longue, lisible dans un tableau de bord.
 *
 * `formatDuration` (core/utils.js) rend « 12h 0m » et « 82h 15m » : elle a ete
 * ecrite pour des chronometres de quelques minutes, ou la seconde compte. Sur
 * un cumul de plusieurs jours, ses zeros parasites sautent aux yeux — et on ne
 * peut pas la corriger sans changer l'affichage des cartes de tache et de
 * l'export CSV, qui en dependent et sont verrouilles par des tests.
 *
 * Espace INSECABLE avant l'unite : c'est la regle typographique francaise, et
 * surtout ca empeche « 12 » de rester en fin de ligne pendant que « h » passe
 * a la suivante, ce qui arrive des que la carte est etroite.
 */
export function formatDureeLongue(secondes) {
    const s = Math.max(0, Math.round(Number(secondes) || 0));
    const nbsp = ' ';

    if (s === 0) return `0${nbsp}h`;
    if (s < 60) return `${s}${nbsp}s`;

    const minutes = Math.round(s / 60);
    if (minutes < 60) return `${minutes}${nbsp}min`;

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    // « 12 h » plutot que « 12 h 00 » : un cumul rond se lit mieux sans son
    // reste nul. Les minutes gardent deux chiffres pour rester alignees en
    // colonne (font-variant-numeric: tabular-nums cote CSS).
    return m === 0 ? `${h}${nbsp}h` : `${h}${nbsp}h${nbsp}${String(m).padStart(2, '0')}`;
}

/**
 * Temps suivi sur le perimetre filtre.
 *
 * `timeSpent` est en SECONDES, alimente par le chronometre des taches
 * (`stopTimer` dans tasks.js). L'ancienne carte « Temps total » de l'onglet
 * Statistiques se contentait de sommer ce champ sur le projet ouvert et
 * d'afficher un chiffre brut. Un total seul ne se lit pas : 40 heures sur
 * 3 taches ou sur 300, ce n'est pas la meme information.
 *
 * On rend donc de quoi le qualifier — combien de taches sont reellement
 * chronometrees, et la moyenne sur celles-la seulement. Diviser par le total
 * des taches donnerait une moyenne ecrasee par toutes celles que personne
 * n'a jamais chronometrees.
 */
export function calculerTemps(taches) {
    let total = 0;
    let chronometrees = 0;
    let plusLongue = null;

    for (const t of taches) {
        const s = Number(t.timeSpent) || 0;
        if (s <= 0) continue;
        total += s;
        chronometrees++;
        if (!plusLongue || s > plusLongue.secondes) {
            plusLongue = { titre: t.title || 'Sans titre', secondes: s, id: t.id };
        }
    }

    return {
        total,
        chronometrees,
        sansSuivi: taches.length - chronometrees,
        moyenne: chronometrees ? Math.round(total / chronometrees) : 0,
        plusLongue
    };
}

/** Compte les taches par valeur d'un champ, en garantissant une entree pour
 *  chaque cle connue — une barre a zero doit rester visible, sinon la
 *  repartition change de forme d'un rendu a l'autre. */
export function repartir(taches, champ, clesConnues) {
    const compte = {};
    clesConnues.forEach(c => { compte[c] = 0; });
    // Les valeurs hors nomenclature sont COMPTEES A PART, pas jetees. Sans ce
    // total, les barres d'une repartition ne sommaient plus au nombre de
    // taches affiche juste a cote des qu'un projet utilisait une colonne
    // personnalisee — un ecart silencieux entre deux chiffres de la meme page.
    let autres = 0;
    for (const t of taches) {
        const v = t[champ] || (champ === 'status' ? 'todo' : 'medium');
        if (v in compte) compte[v]++; else autres++;
    }
    return { compte, autres };
}

/**
 * Charge par personne, sur le perimetre filtre.
 * `_nomAssigne` est pose en amont par le chargeur de donnees ; on ne fait pas
 * d'acces reseau ici.
 */
export function chargeParPersonne(taches, maintenant = new Date()) {
    const parUid = new Map();

    for (const t of taches) {
        const uid = t.assigneeId || 'aucun';
        if (!parUid.has(uid)) {
            parUid.set(uid, {
                uid,
                nom: uid === 'aucun' ? 'Non assignée' : (t._nomAssigne || 'Utilisateur'),
                actives: 0, terminees: 0, enRetard: 0, total: 0, temps: 0
            });
        }
        const e = parUid.get(uid);
        e.total++;
        e.temps += Number(t.timeSpent) || 0;
        if (t.status === 'done') {
            e.terminees++;
        } else {
            e.actives++;
            const due = versDate(t.dueDate);
            if (due && due < maintenant) e.enRetard++;
        }
    }

    // Le plus charge en premier ; « Non assignée » toujours en dernier, quelle
    // que soit sa taille : c'est une anomalie a traiter, pas un membre de
    // l'equipe, et le laisser trôner en tete du classement fausse la lecture.
    return [...parUid.values()].sort((a, b) => {
        if (a.uid === 'aucun') return 1;
        if (b.uid === 'aucun') return -1;
        if (b.actives !== a.actives) return b.actives - a.actives;
        return a.nom.localeCompare(b.nom, 'fr');
    });
}

/** Avancement par projet, sur le perimetre filtre. */
export function avancementParProjet(taches, projets) {
    const parId = new Map();
    for (const p of projets) {
        parId.set(p.id, { id: p.id, nom: p.name || 'Projet', couleur: p.color, total: 0, terminees: 0, enRetard: 0, temps: 0 });
    }
    const maintenant = new Date();

    for (const t of taches) {
        const e = parId.get(t.projectId);
        if (!e) continue;
        e.total++;
        e.temps += Number(t.timeSpent) || 0;
        if (t.status === 'done') {
            e.terminees++;
        } else {
            const due = versDate(t.dueDate);
            if (due && due < maintenant) e.enRetard++;
        }
    }

    // Les projets sans aucune tache retenue sont ecartes : sur un filtre
    // etroit, afficher quinze projets a « 0/0 » noie les deux qui comptent.
    return [...parId.values()]
        .filter(p => p.total > 0)
        .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr'));
}
