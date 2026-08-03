const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let db;
let projectRoot;
let dbPath;

function formatBirthDateCell(val) {
    if (!val) return '';
    if (typeof val === 'string') return val.slice(0, 10);
    if (val instanceof Date) return val.toISOString().slice(0, 10);
    return String(val).slice(0, 10);
}

function rowToUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        password: row.password_hash,
        googleId: row.google_id || undefined,
        picture: row.picture || '',
        sexuality: row.sexuality || '',
        birthDate: formatBirthDateCell(row.birth_date),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined
    };
}

function parseBody(row) {
    if (!row || row.body == null) return null;
    if (typeof row.body === 'object') return row.body;
    return JSON.parse(row.body);
}

function runMigrations() {
    const sqlPath = path.join(__dirname, '..', 'migrations', 'sqlite', '001_initial.sql');
    const sql = fsSync.readFileSync(sqlPath, 'utf8');
    db.exec(sql);
}

async function maybeImportFromJson() {
    const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    if (count > 0) return;

    const usersPath = path.join(projectRoot, 'data', 'users.json');
    const routinesPath = path.join(projectRoot, 'data', 'routines.json');

    let users = [];
    let routines = [];
    try {
        const raw = await fs.readFile(usersPath, 'utf8');
        users = JSON.parse(raw);
        if (!Array.isArray(users)) users = [];
    } catch {
        users = [];
    }
    try {
        const raw = await fs.readFile(routinesPath, 'utf8');
        routines = JSON.parse(raw);
        if (!Array.isArray(routines)) routines = [];
    } catch {
        routines = [];
    }

    if (users.length === 0 && routines.length === 0) return;

    const insertUser = db.prepare(
        `INSERT INTO users (id, email, name, password_hash, google_id, picture, sexuality, birth_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
         ON CONFLICT (id) DO NOTHING`
    );
    const insertRoutine = db.prepare(
        `INSERT INTO routines (id, user_id, body, updated_at)
         VALUES (?, ?, ?, COALESCE(?, datetime('now')))
         ON CONFLICT (id) DO NOTHING`
    );
    const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');

    for (const u of users) {
        if (!u || !u.id || !u.email) continue;
        insertUser.run(
            u.id,
            u.email,
            u.name || '',
            u.password || null,
            u.googleId || null,
            u.picture || null,
            u.sexuality || null,
            u.birthDate ? u.birthDate : null,
            u.createdAt ? new Date(u.createdAt).toISOString() : null
        );
    }

    for (const r of routines) {
        if (!r || !r.id || !r.userId) continue;
        if (!userExists.get(r.userId)) continue;
        try {
            insertRoutine.run(
                r.id,
                r.userId,
                JSON.stringify({ ...r }),
                r.updatedAt ? new Date(r.updatedAt).toISOString() : null
            );
        } catch {
            /* ignora rotina órfã ou JSON inválido */
        }
    }

    if (users.length || routines.length) {
        console.log(
            `[store-sqlite] Migração automática a partir de JSON: ${users.length} utilizadores, ${routines.length} rotinas (apenas tabelas vazias).`
        );
    }
}

async function maybeImportAttachmentsIndex() {
    const count = db.prepare('SELECT COUNT(*) AS c FROM attachments').get().c;
    if (count > 0) return;

    const indexPath = path.join(projectRoot, 'data', 'attachments-index.json');
    let index = {};
    try {
        const raw = await fs.readFile(indexPath, 'utf8');
        index = JSON.parse(raw);
        if (!index || typeof index !== 'object') index = {};
    } catch {
        return;
    }

    const ids = Object.keys(index);
    if (ids.length === 0) return;

    const insert = db.prepare(
        `INSERT INTO attachments (id, user_id, disk_filename, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, NULL, NULL, datetime('now'))
         ON CONFLICT (id) DO NOTHING`
    );

    for (const id of ids) {
        const e = index[id];
        if (!e || !e.userId || !e.filename) continue;
        insert.run(id, e.userId, e.filename);
    }
    console.log(`[store-sqlite] Índice de anexos importado: ${ids.length} entradas.`);
}

async function init({ projectRoot: root }) {
    projectRoot = root;
    dbPath =
        String(process.env.SQLITE_PATH || '').trim() ||
        path.join(projectRoot, 'data', 'ec-routine.db');

    if (dbPath !== ':memory:') {
        await fs.mkdir(path.dirname(dbPath), { recursive: true });
    }

    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    runMigrations();
    if (dbPath !== ':memory:' && process.env.NODE_ENV !== 'test') {
        await maybeImportFromJson();
        await maybeImportAttachmentsIndex();
    }
}

function getPaths() {
    const DATA_DIR = path.join(projectRoot, 'data');
    return {
        DATA_DIR,
        ATTACHMENTS_DIR: path.join(DATA_DIR, 'attachments'),
        ATTACHMENTS_INDEX_FILE: path.join(DATA_DIR, 'attachments-index.json'),
        SQLITE_FILE: dbPath
    };
}

async function findUserByEmail(email) {
    const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
    return rowToUser(row);
}

async function findUserById(id) {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return rowToUser(row);
}

async function createUser(user) {
    try {
        db.prepare(
            `INSERT INTO users (id, email, name, password_hash, google_id, picture, sexuality, birth_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
        ).run(
            user.id,
            user.email,
            user.name,
            user.password || null,
            user.googleId || null,
            user.picture || null,
            user.sexuality || null,
            user.birthDate ? user.birthDate : null,
            user.createdAt ? new Date(user.createdAt).toISOString() : null
        );
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || e.code === 'SQLITE_CONSTRAINT') {
            const err = new Error('Email já cadastrado');
            err.code = 'DUPLICATE_EMAIL';
            throw err;
        }
        throw e;
    }
}

async function updateUser(user) {
    const existing = await findUserById(user.id);
    if (!existing) throw new Error('Usuário não encontrado');
    const email = user.email !== undefined ? user.email : existing.email;
    const name = user.name !== undefined ? user.name : existing.name;
    const password = user.password !== undefined ? user.password : existing.password;
    const googleId = user.googleId !== undefined ? user.googleId : existing.googleId;
    const picture = user.picture !== undefined ? user.picture : existing.picture;
    const sexuality = user.sexuality !== undefined ? user.sexuality : existing.sexuality;
    const birthDate = user.birthDate !== undefined ? user.birthDate : existing.birthDate;

    db.prepare(
        `UPDATE users SET email = ?, name = ?, password_hash = ?, google_id = ?, picture = ?, sexuality = ?, birth_date = ?
         WHERE id = ?`
    ).run(
        email,
        name,
        password || null,
        googleId || null,
        picture || null,
        sexuality || null,
        birthDate ? birthDate : null,
        user.id
    );
}

async function listRoutinesForUser(userId) {
    const rows = db
        .prepare('SELECT body FROM routines WHERE user_id = ? ORDER BY updated_at DESC')
        .all(userId);
    return rows.map(parseBody);
}

async function getRoutine(userId, routineId) {
    const row = db
        .prepare('SELECT body FROM routines WHERE id = ? AND user_id = ?')
        .get(routineId, userId);
    return parseBody(row);
}

async function createRoutine(routine) {
    db.prepare(
        `INSERT INTO routines (id, user_id, body, updated_at)
         VALUES (?, ?, ?, COALESCE(?, datetime('now')))`
    ).run(
        routine.id,
        routine.userId,
        JSON.stringify(routine),
        routine.updatedAt ? new Date(routine.updatedAt).toISOString() : null
    );
}

async function updateRoutine(routine) {
    const info = db
        .prepare(
            `UPDATE routines SET body = ?, updated_at = COALESCE(?, datetime('now'))
             WHERE id = ? AND user_id = ?`
        )
        .run(
            JSON.stringify(routine),
            routine.updatedAt ? new Date(routine.updatedAt).toISOString() : null,
            routine.id,
            routine.userId
        );
    if (info.changes === 0) throw new Error('Rotina não encontrada');
}

async function deleteRoutine(userId, routineId) {
    const info = db.prepare('DELETE FROM routines WHERE id = ? AND user_id = ?').run(routineId, userId);
    return info.changes > 0;
}

async function withRoutineExclusive(userId, routineId, fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
        const row = db
            .prepare('SELECT body FROM routines WHERE id = ? AND user_id = ?')
            .get(routineId, userId);
        if (!row) {
            db.exec('ROLLBACK');
            return null;
        }
        const current = parseBody(row);
        const next = await fn(JSON.parse(JSON.stringify(current)));
        if (!next) {
            db.exec('ROLLBACK');
            return null;
        }
        db.prepare(
            `UPDATE routines SET body = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
        ).run(JSON.stringify(next), routineId, userId);
        db.exec('COMMIT');
        return next;
    } catch (e) {
        try {
            db.exec('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw e;
    }
}

async function registerAttachment({ id, userId, filename, mimeType, sizeBytes }) {
    db.prepare(
        `INSERT INTO attachments (id, user_id, disk_filename, mime_type, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (id) DO UPDATE SET
            disk_filename = excluded.disk_filename,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes`
    ).run(id, userId, filename, mimeType || null, sizeBytes != null ? sizeBytes : null);
}

async function getAttachmentMeta(attachmentId) {
    const row = db
        .prepare('SELECT user_id, disk_filename, mime_type FROM attachments WHERE id = ?')
        .get(attachmentId);
    if (!row) return null;
    return {
        userId: row.user_id,
        filename: row.disk_filename,
        mimeType: row.mime_type || ''
    };
}

async function readAttachmentsIndex() {
    const rows = db.prepare('SELECT id, user_id, disk_filename FROM attachments').all();
    const index = {};
    for (const r of rows) {
        index[r.id] = { userId: r.user_id, filename: r.disk_filename };
    }
    return index;
}

async function writeAttachmentsIndex() {
    throw new Error('writeAttachmentsIndex não é suportado em SQLite; use registerAttachment.');
}

async function getAdminSummary() {
    const usersCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const routinesCount = db.prepare('SELECT COUNT(*) AS c FROM routines').get().c;
    const usersCreatedLast7Days = db
        .prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now', '-7 days')")
        .get().c;
    const routinesUpdatedLast7Days = db
        .prepare("SELECT COUNT(*) AS c FROM routines WHERE updated_at >= datetime('now', '-7 days')")
        .get().c;
    const attachmentsCount = db.prepare('SELECT COUNT(*) AS c FROM attachments').get().c;

    return {
        usersCount,
        routinesCount,
        usersCreatedLast7Days,
        routinesUpdatedLast7Days,
        attachmentsCount
    };
}

function close() {
    if (db) {
        db.close();
        db = null;
    }
}

module.exports = {
    mode: 'sqlite',
    init,
    close,
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
    getAttachmentMeta,
    getAdminSummary
};
