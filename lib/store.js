const path = require('path');
const impl = require('./store-sqlite');

async function init() {
    const projectRoot = path.join(__dirname, '..');
    await impl.init({ projectRoot });
}

function getStorageLabel() {
    const sqlitePath =
        String(process.env.SQLITE_PATH || '').trim() ||
        path.join(__dirname, '..', 'data', 'ec-routine.db');
    return `SQLite (${sqlitePath})`;
}

module.exports = {
    ...impl,
    init,
    usingPostgres: () => false,
    usingSqlite: () => true,
    getStorageLabel
};
