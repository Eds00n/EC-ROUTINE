const path = require('path');

const usePg = Boolean(String(process.env.DATABASE_URL || '').trim());
const impl = usePg ? require('./store-pg') : require('./store-sqlite');

async function init() {
    const projectRoot = path.join(__dirname, '..');
    await impl.init({ projectRoot });
}

function getStorageLabel() {
    if (usePg) return 'PostgreSQL';
    const sqlitePath =
        String(process.env.SQLITE_PATH || '').trim() ||
        path.join(__dirname, '..', 'data', 'ec-routine.db');
    return `SQLite (${sqlitePath})`;
}

module.exports = {
    ...impl,
    init,
    usingPostgres: () => usePg,
    usingSqlite: () => !usePg,
    getStorageLabel
};
