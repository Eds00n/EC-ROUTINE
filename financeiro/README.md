# Orçamento pessoal

Controle financeiro local: planilha Excel, dashboard HTML e CSV.

## Site publicado (Hostinger + API Render)

1. Faça **login** no EC ROUTINE no seu domínio (mesma conta de sempre — não use `localhost` se a senha for só do site no ar).
2. No **dashboard**, clique **FINANCEIRO** no header (ao lado de ADM / perfil).
3. No hub (`financeiro/index.html`):
   - **Ver painel do mês** → `Planilha_Orcamento.html`
   - **Conectar Nubank** → `conectar-nubank.html` (Open Finance; exige Pluggy na API Render)

URL direta do hub: `https://SEU-DOMINIO/financeiro/index.html`

**Hostinger + API separada:** o sync Pluggy grava dados no servidor **Render**. O HTML do painel no Hostinger só mostra números novos depois de `npm run planilha:orcamento` e novo deploy FTP — ou use monólito Render para painel e API no mesmo domínio.

**Erro «Erro ao obter status» ou 404:** a API `ec-routine-api.onrender.com` ainda não foi atualizada com o módulo financeiro. No [Render](https://dashboard.render.com) → seu Web Service → **Environment** → adicione `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` → **Manual Deploy** / redeploy do último commit do GitHub.

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

**Sem exportar CSV:** use Open Finance abaixo (cada lançamento do mês soma no extrato).

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
| `index.html` | Hub no site (painel + conectar + voltar) |
| `conectar-nubank.html` | Open Finance (widget Pluggy) |

## Open Finance (Pluggy — cada centavo)

Com o servidor EC ROUTINE a correr (`npm start`) e credenciais Pluggy no `.env`:

1. Crie uma aplicação em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) (modo **sandbox** para testes).
2. No `.env` da raiz: `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` (ver `.env.example`).
3. Faça **login** no site EC ROUTINE (token em `localStorage`).
4. Abra **`financeiro/conectar-nubank.html`** no site (ou `http://localhost:3000/financeiro/conectar` em dev local).
5. **Conectar conta** → autorize no widget → **Sincronizar mês agora**.

O sync grava em `config.json` o bloco `extrato` (todas as linhas do mês), `financeiro/lancamentos.json`, opcionalmente atualiza `valores` por regras, e regenera o painel HTML.

| API (JWT) | Função |
|-----------|--------|
| `GET /api/financeiro/status` | Pluggy configurado? conta ligada? |
| `POST /api/financeiro/connect-token` | Token do widget Connect |
| `POST /api/financeiro/connection` | Guarda `itemId` após sucesso no widget |
| `POST /api/financeiro/sync` | Baixa transações do mês (`anoMes` do config) |
| `GET /api/financeiro/extrato` | Último `lancamentos.json` |

Código em `financeiro/openfinance/`. CSV manual continua válido; com `--apply` o import também pode preencher o extrato completo a partir do CSV.

## Git

Versione `config.json` e os `.mjs`. Os artefatos gerados (`.xlsx`, `.html`, `.csv`) podem ser ignorados — regenere com `npm run planilha:orcamento` após clonar.
