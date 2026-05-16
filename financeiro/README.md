# Orçamento pessoal

Controle financeiro local: planilha Excel, dashboard HTML e CSV.

## Uso no site (FINANCEIRO no header)

### Opção A — CSV no site (recomendado)

1. Faça **login** no EC ROUTINE.
2. **FINANCEIRO** → exporte CSV no app Nubank (Conta → CSV).
3. **Escolher ficheiro** → **Importar e ver painel** (dados ficam na API, por utilizador).
4. O painel abre automaticamente (não precisa de PC nem FTP).

Requer API em produção com `POST /api/financeiro/import` (redeploy Render) e `CORS_ORIGIN` com o domínio do site.

### Opção B — CSV no PC

1. Salvar em `financeiro/import/nubank.csv`.
2. `SINCRONIZAR_AUTOMATICO.bat` (opcional FTP no `.env` publica `Planilha_Orcamento.html` na Hostinger).

Open Finance (Pluggy) não é o fluxo principal — use o CSV.

## Editar valores

Altere [`config.json`](config.json):

- `mesRef` / `anoMes` — mês de referência do painel
- `valores` — salário, pensão, despesas, `reservaAtual` (colchão)
- `emprestimo` — parcelas pagas/total, saldo, valor de antecipação
- `fluxo` — calendário do mês (dia, evento, campo em `valores`, sinal +1 ou -1)
- `metas` — textos exibidos no dashboard

## Auto Nubank — guia rápido

Não é login no site do banco. Você **exporta CSV no app**; o PC atualiza o painel.

### Passo 1 — Exportar no celular

1. App Nubank → **conta** (NuConta).
2. **Exportar extrato** / Compartilhar → formato **CSV** (não PDF).
3. Período = mesmo mês de `anoMes` no [`config.json`](config.json) (ex. `2026-06`).

### Passo 2 — Salvar no PC

Caminho exato:

`financeiro/import/nubank.csv`

Renomeie se vier `nubank (1).csv`. Substitua o arquivo a cada atualização.

**Primeira vez / teste:** dois cliques em `PREPARAR_NUBANK.bat` (copia `exemplo-nubank.csv` se ainda não tiver CSV).

Instruções também em `financeiro/import/LEIA-ME.txt`.

### Passo 3 — Escolher o modo no PC

| Modo | Atalho | Quando usar |
|------|--------|-------------|
| **Um clique** | `SINCRONIZAR_AUTOMATICO.bat` ou `npm run planilha:sync` | Exportou o CSV → quer painel atualizado agora |
| **Monitor** | `MONITORAR_NUBANK.bat` ou `npm run planilha:watch` | Deixa janela aberta; ao salvar `nubank.csv`, atualiza sozinho |
| **Só gerar** | `npm run planilha:orcamento` | Já tem CSV; não precisa abrir navegador |

### Conferir valores

```bash
npm run planilha:verificar          # valida config.json
npm run planilha:import-nubank      # só mostra mudanças (não grava)
npm run planilha:import-nubank -- --apply   # grava no config
```

**Preenche do CSV:** salário, pensão, IFAL, fatura cartão, empréstimo, gasolina, faculdade.  
**Manual no config:** `moto`, `outros`, metas (se não aparecerem no extrato).

**Sem CSV:** o painel não atualiza — exporte o extrato no app Nubank.

## Gerar arquivos

Na raiz do projeto:

```bash
npm run planilha:orcamento
```

Gera:

- `Planilha_Orcamento_Pessoal.xlsx`
- `Planilha_Orcamento.html`
- `Planilha_Resumo.csv` / `Planilha_Fluxo.csv`
- Atalhos `.bat`

## Abrir

| O quê | Como |
|-------|------|
| Dashboard | `npm run planilha:navegador` ou `ABRIR_NO_NAVEGADOR.bat` |
| Excel | `ABRIR_PLANILHA.bat` (use o Explorador de Arquivos; no Cursor o `.xlsx` não abre como planilha) |

## Código-fonte

| Arquivo | Função |
|---------|--------|
| `config.json` | Dados editáveis |
| `load-config.mjs` | Lê config e calcula totais |
| `gerar-planilha.mjs` | Gera XLSX, CSV, HTML, `.bat` |
| `build-html-page.mjs` | Template do dashboard |
| `abrir-navegador.mjs` | Abre o HTML no navegador padrão |
| `importar-nubank-csv.mjs` | Lê CSV e atualiza `config.json` |
| `sync.mjs` | Import + gerar + abrir navegador |
| `watch-import.mjs` | Monitora pasta `import/` |
| `verificar-config.mjs` | Valida `anoMes` / totais |
| `PREPARAR_NUBANK.bat` | Cria `nubank.csv` de teste ou lembra o caminho |
| `SINCRONIZAR_AUTOMATICO.bat` | Sync completo em um clique |
| `MONITORAR_NUBANK.bat` | Monitor da pasta `import/` |
| `index.html` | Hub: upload CSV (login) + instruções PC |
| `import.js` | Envia CSV para `POST /api/financeiro/import` |
| `painel.html` | Painel via API (logado) ou `Planilha_Orcamento.html` (fallback) |
| `conectar-nubank.html` | Redireciona para `index.html` (legado) |

## Git

Versione `config.json` e os `.mjs`. Os artefatos gerados (`.xlsx`, `.html`, `.csv`) podem ser ignorados — regenere com `npm run planilha:orcamento` após clonar.
