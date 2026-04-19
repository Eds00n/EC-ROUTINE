const fs = require('fs').promises;
const path = require('path');
const { Pool } = require('pg');

let pool;
let projectRoot;

function useSsl() {
    if (process.env.PGSSLMODE === 'disable') return false;
    const u = String(process.env.DATABASE_URL || '');
    if (/localhost|127\.0\.0\.1/.test(u)) return false;
    return { rejectUnauthorized: false };
}

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

async function runMigrations(client) {
    const files = ['001_initial.sql', '002_user_profile.sql'];
    for (const f of files) {
        const sqlPath = path.join(__dirname, '..', 'migrations', f);
        const sql = await fs.readFile(sqlPath, 'utf8');
        await client.query(sql);
    }
}

async function maybeImportFromJson(client) {
    const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM users');
    if (rows[0].c > 0) return;

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

    for (const u of users) {
        if (!u || !u.id || !u.email) continue;
        await client.query(
            `INSERT INTO users (id, email, name, password_hash, google_id, picture, sexuality, birth_date, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
             ON CONFLICT (id) DO NOTHING`,
            [
                u.id,
                u.email,
                u.name || '',
                u.password || null,
                u.googleId || null,
                u.picture || null,
                u.sexuality || null,
                u.birthDate ? u.birthDate : null,
                u.createdAt ? new Date(u.createdAt) : null
            ]
        );
    }

    for (const r of routines) {
        if (!r || !r.id || !r.userId) continue;
        const owner = await client.query('SELECT 1 FROM users WHERE id = $1', [r.userId]);
        if (owner.rowCount === 0) continue;
        const body = { ...r };
        try {
            await client.query(
                `INSERT INTO routines (id, user_id, body, updated_at)
                 VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()))
                 ON CONFLICT (id) DO NOTHING`,
                [
                    r.id,
                    r.userId,
                    JSON.stringify(body),
                    r.updatedAt ? new Date(r.updatedAt) : null
                ]
            );
        } catch {
            /* ignora rotina órfã ou JSON inválido */
        }
    }

    if (users.length || routines.length) {
        console.log(
            `[store-pg] Migração automática a partir de JSON: ${users.length} utilizadores, ${routines.length} rotinas (apenas tabelas vazias).`
        );
    }
}

async function maybeImportAttachmentsIndex(client) {
    const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM attachments');
    if (rows[0].c > 0) return;

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

    for (const id of ids) {
        const e = index[id];
        if (!e || !e.userId || !e.filename) continue;
        await client.query(
            `INSERT INTO attachments (id, user_id, disk_filename, mime_type, size_bytes, created_at)
             VALUES ($1, $2, $3, NULL, NULL, now())
             ON CONFLICT (id) DO NOTHING`,
            [id, e.userId, e.filename]
        );
    }
    console.log(`[store-pg] Índice de anexos importado: ${ids.length} entradas.`);
}

async function init({ projectRoot: root }) {
    projectRoot = root;
    const conn = String(process.env.DATABASE_URL || '').trim();
    if (!conn) {
        throw new Error('DATABASE_URL em falta para store PostgreSQL.');
    }

    pool = new Pool({
        connectionString: conn,
        max: Number(process.env.PG_POOL_MAX) || 12,
        idleTimeoutMillis: 30_000,
        ssl: useSsl()
    });

    const client = await pool.connect();
    try {
        await runMigrations(client);
        await maybeImportFromJson(client);
        await maybeImportAttachmentsIndex(client);
    } finally {
        client.release();
    }
}

function getPaths() {
    const DATA_DIR = path.join(projectRoot, 'data');
    return {
        DATA_DIR,
        ATTACHMENTS_DIR: path.join(DATA_DIR, 'attachments'),
        ATTACHMENTS_INDEX_FILE: path.join(DATA_DIR, 'attachments-index.json')
    };
}

async function findUserByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return rowToUser(rows[0]);
}

async function findUserById(id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rowToUser(rows[0]);
}

async function createUser(user) {
    try {
        await pool.query(
            `INSERT INTO users (id, email, name, password_hash, google_id, picture, sexuality, birth_date, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
            [
                user.id,
                user.email,
                user.name,
                user.password || null,
                user.googleId || null,
                user.picture || null,
                user.sexuality || null,
                user.birthDate ? user.birthDate : null,
                user.createdAt ? new Date(user.createdAt) : null
            ]
        );
    } catch (e) {
        if (e.code === '23505') {
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
    const password =
        user.password !== undefined ? user.password : existing.password;
    const googleId =
        user.googleId !== undefined ? user.googleId : existing.googleId;
    const picture =
        user.picture !== undefined ? user.picture : existing.picture;
    const sexuality =
        user.sexuality !== undefined ? user.sexuality : existing.sexuality;
    const birthDate =
        user.birthDate !== undefined ? user.birthDate : existing.birthDate;
    await pool.query(
        `UPDATE users SET email = $2, name = $3, password_hash = $4, google_id = $5, picture = $6, sexuality = $7, birth_date = $8
         WHERE id = $1`,
        [
            user.id,
            email,
            name,
            password || null,
            googleId || null,
            picture || null,
            sexuality || null,
            birthDate ? birthDate : null
        ]
    );
}

async function listRoutinesForUser(userId) {
    const { rows } = await pool.query(
        'SELECT body FROM routines WHERE user_id = $1 ORDER BY updated_at DESC',
        [userId]
    );
    return rows.map(r => r.body);
}

async function getRoutine(userId, routineId) {
    const { rows } = await pool.query(
        'SELECT body FROM routines WHERE id = $1 AND user_id = $2',
        [routineId, userId]
    );
    return rows[0] ? rows[0].body : null;
}

async function createRoutine(routine) {
    await pool.query(
        `INSERT INTO routines (id, user_id, body, updated_at)
         VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()))`,
        [
            routine.id,
            routine.userId,
            JSON.stringify(routine),
            routine.updatedAt ? new Date(routine.updatedAt) : null
        ]
    );
}

async function updateRoutine(routine) {
    const { rowCount } = await pool.query(
        `UPDATE routines SET body = $3::jsonb, updated_at = COALESCE($4::timestamptz, now())
         WHERE id = $1 AND user_id = $2`,
        [
            routine.id,
            routine.userId,
            JSON.stringify(routine),
            routine.updatedAt ? new Date(routine.updatedAt) : null
        ]
    );
    if (rowCount === 0) throw new Error('Rotina não encontrada');
}

async function deleteRoutine(userId, routineId) {
    const { rowCount } = await pool.query('DELETE FROM routines WHERE id = $1 AND user_id = $2', [
        routineId,
        userId
    ]);
    return rowCount > 0;
}

async function withRoutineExclusive(userId, routineId, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            'SELECT body FROM routines WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [routineId, userId]
        );
        if (!rows[0]) {
            await client.query('ROLLBACK');
            return null;
        }
        const current = rows[0].body;
        const snapshot = JSON.parse(JSON.stringify(current));
        const next = await fn(snapshot);
        if (!next) {
            await client.query('ROLLBACK');
            return null;
        }
        await client.query(
            `UPDATE routines SET body = $1::jsonb, updated_at = now() WHERE id = $2 AND user_id = $3`,
            [JSON.stringify(next), routineId, userId]
        );
        await client.query('COMMIT');
        return next;
    } catch (e) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw e;
    } finally {
        client.release();
    }
}

async function registerAttachment({ id, userId, filename, mimeType, sizeBytes }) {
    await pool.query(
        `INSERT INTO attachments (id, user_id, disk_filename, mime_type, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (id) DO UPDATE SET
            disk_filename = EXCLUDED.disk_filename,
            mime_type = EXCLUDED.mime_type,
            size_bytes = EXCLUDED.size_bytes`,
        [id, userId, filename, mimeType || null, sizeBytes != null ? sizeBytes : null]
    );
}

async function getAttachmentMeta(attachmentId) {
    const { rows } = await pool.query(
        'SELECT user_id, disk_filename FROM attachments WHERE id = $1',
        [attachmentId]
    );
    if (!rows[0]) return null;
    return { userId: rows[0].user_id, filename: rows[0].disk_filename };
}

/** Compatibilidade com código legado que espera um mapa id -> { userId, filename } */
async function readAttachmentsIndex() {
    const { rows } = await pool.query('SELECT id, user_id, disk_filename FROM attachments');
    const index = {};
    for (const r of rows) {
        index[r.id] = { userId: r.user_id, filename: r.disk_filename };
    }
    return index;
}

async function writeAttachmentsIndex() {
    throw new Error('writeAttachmentsIndex não é suportado em PostgreSQL; use registerAttachment.');
}

module.exports = {
    mode: 'pg',
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
    getAttachmentMeta,
    getPool: () => pool
};
