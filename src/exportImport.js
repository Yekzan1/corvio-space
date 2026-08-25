// ==========================================
// EXPORT (JSON/CSV/ICS/PDF) + CSV IMPORT
// ==========================================
import { state } from './core/state.js';
import { $ } from './core/dom.js';
import { toast, formatDuration } from './core/utils.js';
import { createTask } from './tasks.js';

export function exportData(format) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) {
        toast('Sélectionnez un projet', 'error');
        return;
    }

    const data = {
        project: {
            name: project.name,
            description: project.description,
            color: project.color,
            exportedAt: new Date().toISOString()
        },
        tasks: state.tasks.map(t => ({
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
            tags: (t.tags || []).map(tid => state.tags.find(tag => tag.id === tid)?.name).filter(Boolean),
            subtasks: t.subtasks,
            timeSpent: t.timeSpent,
            comments: t.comments?.length || 0
        })),
        tags: state.tags.map(t => ({
            name: t.name,
            color: t.color
        })),
        stats: {
            total: state.tasks.length,
            completed: state.tasks.filter(t => t.status === 'done').length,
            archived: state.archivedTasks.length
        }
    };

    let content, filename, type;

    if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        filename = `${project.name.replace(/\s+/g, '_')}_export.json`;
        type = 'application/json';
    } else if (format === 'csv') {
        // CSV format for tasks
        const headers = ['Titre', 'Description', 'Statut', 'Priorité', 'Date limite', 'Tags', 'Temps'];
        const rows = data.tasks.map(t => [
            `"${t.title.replace(/"/g, '""')}"`,
            `"${(t.description || '').replace(/"/g, '""')}"`,
            t.status,
            t.priority,
            t.dueDate || '',
            `"${t.tags.join(', ')}"`,
            formatDuration(t.timeSpent || 0)
        ]);
        content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        filename = `${project.name.replace(/\s+/g, '_')}_export.csv`;
        type = 'text/csv';
    }

    // Download file
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast(`Export ${format.toUpperCase()} téléchargé.`, 'success');
}

// ---------- ICS Export ----------
export function exportICS() {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    if (!project) { toast('Ouvrez d\'abord un projet.', 'error'); return; }
    const tasksWithDate = state.tasks.filter(t => t.dueDate && !t.archived);
    if (!tasksWithDate.length) { toast('Aucune tâche n\'a d\'échéance à exporter. Ajoutez une date limite à vos tâches, puis réessayez.', 'info'); return; }

    // Horodatage UTC pour DTSTAMP (l'instant de generation, pas une echeance).
    const fmtUTC = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    // Jour au format DATE (AAAAMMJJ) pour un evenement « toute la journee ».
    const fmtJour = s => String(s).slice(0, 10).replace(/-/g, '');
    const jourSuivant = s => {
        const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
        const j = new Date(y, m - 1, d + 1);
        return `${j.getFullYear()}${String(j.getMonth() + 1).padStart(2, '0')}${String(j.getDate()).padStart(2, '0')}`;
    };
    const estJourSeul = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Corvio Space//FR',
        'CALSCALE:GREGORIAN'
    ];
    tasksWithDate.forEach(t => {
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${t.id}@corviospace`);
        lines.push(`DTSTAMP:${fmtUTC(new Date())}`);
        // Une echeance saisie sans heure designe un JOUR, pas un instant.
        // L'ancien code faisait `new Date("2026-07-23").toISOString()` = minuit
        // UTC, soit un evenement d'1 h a 02:00 en France, le mauvais jour a
        // l'ouest de Greenwich. On emet un evenement « toute la journee »
        // (VALUE=DATE), qui tombe sur le bon jour quel que soit le fuseau.
        if (estJourSeul(t.dueDate)) {
            lines.push(`DTSTART;VALUE=DATE:${fmtJour(t.dueDate)}`);
            lines.push(`DTEND;VALUE=DATE:${jourSuivant(t.dueDate)}`);
        } else {
            const due = new Date(t.dueDate);
            const end = new Date(due.getTime() + 60 * 60 * 1000);
            lines.push(`DTSTART:${fmtUTC(due)}`);
            lines.push(`DTEND:${fmtUTC(end)}`);
        }
        lines.push(`SUMMARY:${(t.title || '').replace(/[\r\n,;]/g, ' ')}`);
        if (t.description) lines.push(`DESCRIPTION:${(t.description || '').replace(/[\r\n,;]/g, ' ').slice(0, 200)}`);
        lines.push(`PRIORITY:${t.priority === 'high' ? 1 : t.priority === 'medium' ? 5 : 9}`);
        lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${tasksWithDate.length} échéance${tasksWithDate.length > 1 ? 's' : ''} exportée${tasksWithDate.length > 1 ? 's' : ''}.`, 'success');
}

// ---------- Print / PDF ----------
export function printBoard() {
    window.print();
}

// ---------- CSV import ----------
export async function importCsv(file) {
    if (!state.currentProjectId) { toast('Ouvrez d\'abord un projet.', 'error'); return; }
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { toast('Ce fichier ne contient aucune ligne.', 'error'); return; }
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const titleIdx = header.indexOf('title');
    if (titleIdx === -1) { toast('Ce fichier doit comporter une colonne « title ». Vérifiez la première ligne.', 'error'); return; }
    const descIdx = header.indexOf('description');
    const statusIdx = header.indexOf('status');
    const priorityIdx = header.indexOf('priority');
    const dueIdx = header.indexOf('duedate');

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        const title = parts[titleIdx];
        if (!title) continue;
        await createTask({
            title,
            description: descIdx >= 0 ? parts[descIdx] : '',
            status: (statusIdx >= 0 && parts[statusIdx]) || 'todo',
            priority: (priorityIdx >= 0 && parts[priorityIdx]) || 'medium',
            dueDate: dueIdx >= 0 ? parts[dueIdx] : null,
            tags: [],
            subtasks: []
        });
        imported++;
    }
    toast(`${imported} tâche(s) importée(s).`, 'success');
}

// ---- Wiring ----
$('export-json')?.addEventListener('click', () => exportData('json'));
$('export-csv')?.addEventListener('click', () => exportData('csv'));
$('export-ics')?.addEventListener('click', exportICS);
$('export-pdf')?.addEventListener('click', printBoard);

const importCsvBtn = $('import-csv-btn');
const importCsvFile = $('import-csv-file');
importCsvBtn?.addEventListener('click', () => importCsvFile?.click());
importCsvFile?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) importCsv(f);
    e.target.value = '';
});
