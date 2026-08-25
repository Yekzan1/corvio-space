// ==========================================
// ROLES & PERMISSIONS
// ==========================================
import { state } from './state.js';

// Libelles en toutes lettres et en francais. Ils associaient un emoji a un nom
// anglais (couronne + "Owner") dans une interface entierement francaise ;
// l'emoji etait de surcroit annonce « emoji couronne » par les lecteurs
// d'ecran.
// Ces chaines sont posees via textContent (projects.js) : du texte, jamais
// du balisage.
export const ROLE_LABELS = {
    owner: 'Propriétaire',
    admin: 'Administrateur',
    member: 'Membre',
    viewer: 'Lecteur'
};

export function getRole(project, uid) {
    if (!project || !uid) return null;
    if (project.ownerId === uid) return 'owner';
    if (project.roles && project.roles[uid]) return project.roles[uid];
    // Backward compat: if user is in members but no role set, default to member
    if ((project.members || []).includes(uid)) return 'member';
    return null;
}

export function myRole(projectId = state.currentProjectId) {
    const p = state.projects.find(x => x.id === projectId);
    return getRole(p, state.currentUser?.uid);
}

export function canCreateOrEditTasks(projectId) {
    const r = myRole(projectId);
    return r === 'owner' || r === 'admin' || r === 'member';
}
export function canManageProject(projectId) {
    const r = myRole(projectId);
    return r === 'owner' || r === 'admin';
}
export function canDeleteProject(projectId) {
    return myRole(projectId) === 'owner';
}
export function canDeleteTasks(projectId) {
    const r = myRole(projectId);
    return r === 'owner' || r === 'admin';
}
