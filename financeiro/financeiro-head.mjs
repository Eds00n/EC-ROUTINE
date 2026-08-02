/** Fragmentos HTML partilhados (tema EC ROUTINE). */
export const EC_THEME_BOOT_SCRIPT = `<script>
(function () {
  try {
    if (localStorage.getItem("ecRoutineTheme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  } catch (e) {}
})();
</script>`;

export const EC_SITE_STYLES = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/ec-global-responsive.css" />
<link rel="stylesheet" href="/dashboard.css" />
<link rel="stylesheet" href="/dashboard-theme.css" />
<link rel="stylesheet" href="/financeiro/financeiro-theme.css" />
`;

export const EC_PAINEL_STYLES = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/ec-global-responsive.css" />
<link rel="stylesheet" href="/dashboard.css" />
<link rel="stylesheet" href="/dashboard-theme.css" />
<link rel="stylesheet" href="/financeiro/financeiro-theme.css" />
<link rel="stylesheet" href="/financeiro/financeiro-painel.css?v=20260516kpi-sobra" />
`;

/** Header no padrão do dashboard (grid 3 colunas + nav pill). */
export function finHeaderHtml(active) {
  const importCls = active === "import" ? " active" : "";
  const painelCls = active === "painel" ? " active" : "";
  return `<header class="header fin-header" role="banner">
  <div class="header-center">
    <h1 class="header-title" aria-label="EC ROUTINE"><span class="header-title-text">EC ROUTINE</span></h1>
    <p class="header-subtitle">Organize sua rotina. Meça sua produtividade.</p>
  </div>
  <div class="header-right fin-header-right">
    <nav class="view-toggle fin-nav" aria-label="Financeiro">
      <a class="view-btn${importCls}" href="/financeiro/index.html">Importar CSV</a>
      <a class="view-btn${painelCls}" href="/financeiro/painel.html">Painel</a>
    </nav>
  </div>
</header>`;
}

/** @deprecated Use finHeaderHtml */
export function finToolbarHtml(active) {
  return finHeaderHtml(active);
}
