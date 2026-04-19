const fs = require('fs').promises;
const path = require('path');

let DATA_DIR;
let ATTACHMENTS_DIR;
let ATTACHMENTS_INDEX_FILE;
let USERS_FILE;
let ROUTINES_FILE;

async function ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(ATTACHMENTS_DIR, { recursive: true });
    try {
        await fs.access(USERS_FILE);
    } catch {
        await fs.writeFile(USERS_FILE, JSON.stringify([], null, 2));
    }
    try {
        await fs.access(ROUTINES_FILE);
    } catch {
        await fs.writeFile(ROUTINES_FILE, JSON.stringify([], null, 2));
    }
}

async function init({ projectRoot }) {
    DATA_DIR = path.join(projectRoot, 'data');
    ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');
    ATTACHMENTS_INDEX_FILE = path.join(DATA_DIR, 'attachments-index.json');
    USERS_FILE = path.join(DATA_DIR, 'users.json');
    ROUTINES_FILE = path.join(DATA_DIR, 'routines.json');
    await ensureDataDir();
}

function getPaths() {
    return { DATA_DIR, ATTACHMENTS_DIR, ATTACHMENTS_INDEX_FILE };
}

async function readUsersArray() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeUsersArray(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

async function readRoutinesArray() {
    try {
        const data = await fs.readFile(ROUTINES_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

async function writeRoutinesArray(routines) {
    await fs.writeFile(ROUTINES_FILE, JSON.stringify(routines, null, 2));
}

async function findUserByEmail(email) {
    const users = await readUsersArray();
    const want = String(email || '').trim().toLowerCase();
    return users.find(u => String(u.email || '').trim().toLowerCase() === want) || null;
}

async function findUserById(id) {
    const users = await readUsersArray();
    return users.find(u => u.id === id) || null;
}

async function createUser(user) {
    const users = await readUsersArray();
    const em = String(user.email || '').trim().toLowerCase();
    if (users.some(u => String(u.email || '').trim().toLowerCase() === em)) {
        throw new Error('Email já cadastrado');
    }
    if (user.email) user.email = em;
    users.push(user);
    await writeUsersArray(users);
}

async function updateUser(user) {
    const users = await readUsersArray();
    const i = users.findIndex(u => u.id === user.id);
    if (i === -1) throw new Error('Usuário não encontrado');
    users[i] = user;
    await writeUsersArray(users);
}

async function listRoutinesForUser(userId) {
    const routines = await readRoutinesArray();
    return routines.filter(r => r.userId === userId);
}

async function getRoutine(userId, routineId) {
    const routines = await readRoutinesArray();
    const r = routines.find(x => x.id === routineId && x.userId === userId);
    return r || null;
}

async function createRoutine(routine) {
    const routines = await readRoutinesArray();
    routines.push(routine);
    await writeRoutinesArray(routines);
}

async function updateRoutine(routine) {
    const routines = await readRoutinesArray();
    const i = routines.findIndex(r => r.id === routine.id && r.userId === routine.userId);
    if (i === -1) throw new Error('Rotina não encontrada');
    routines[i] = routine;
    await writeRoutinesArray(routines);
}

async function deleteRoutine(userId, routineId) {
    const routines = await readRoutinesArray();
    const i = routines.findIndex(r => r.id === routineId && r.userId === userId);
    if (i === -1) return false;
    routines.splice(i, 1);
    await writeRoutinesArray(routines);
    return true;
}

/**
 * Leitura + escrita atómica ao nível do ficheiro (evita perder merges em anotações).
 */
async function withRoutineExclusive(userId, routineId, fn) {
    const routines = await readRoutinesArray();
    const i = routines.findIndex(r => r.id === routineId && r.userId === userId);
    if (i === -1) return null;
    const next = await fn(JSON.parse(JSON.stringify(routines[i])));
    if (!next) return null;
    const latest = await readRoutinesArray();
    const j = latest.findIndex(r => r.id === routineId && r.userId === userId);
    if (j === -1) return null;
    latest[j] = next;
    await writeRoutinesArray(latest);
    return next;
}

async function readAttachmentsIndex() {
    try {
        const data = await fs.readFile(ATTACHMENTS_INDEX_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function writeAttachmentsIndex(index) {
    await fs.writeFile(ATTACHMENTS_INDEX_FILE, JSON.stringify(index, null, 2));
}

async function registerAttachment({ id, userId, filename, mimeType, sizeBytes }) {
    const index = await readAttachmentsIndex();
    index[id] = { userId, filename };
    await writeAttachmentsIndex(index);
}

async function getAttachmentMeta(attachmentId) {
    const index = await readAttachmentsIndex();
    const entry = index[attachmentId];
    if (!entry) return null;
    return { userId: entry.userId, filename: entry.filename };
}

module.exports = {
    mode: 'files',
    init,
    getPaths,
    findUserByEmail,
    findUserById,
    createUser,
    updateUser,
    listRoutinesForUser,
    getRoutine,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    withRoutineExclusive,
    readAttachmentsIndex,
    writeAttachmentsIndex,
    registerAttachment,
    getAttachmentMeta
};
