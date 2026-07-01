/**
 * Flags de funcionalidades — altere aqui ou via env para reativar módulos.
 */
function envTruthy(name) {
    const v = String(process.env[name] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

module.exports = {
    /** Módulo orçamento / extrato Nubank — desativado por padrão. */
    financeiroEnabled: envTruthy('FINANCEIRO_ENABLED'),
};
