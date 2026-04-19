const path = require('path');

const usePg = Boolean(String(process.env.DATABASE_URL || '').trim());

const impl = usePg ? require('./store-pg') : require('./store-files');

async function init() {
    const projectRoot = path.join(__dirname, '..');
    await impl.init({ projectRoot });
}

module.exports = {
    ...impl,
    init,
    usingPostgres: () => usePg
};
