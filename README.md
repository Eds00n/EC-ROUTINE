# EC ROUTINE

Sistema de rotinas e tarefas com autenticação (JWT), API REST em Node/Express e banco **SQLite local** (`data/ec-routine.db`).

## Arranque rápido

```bash
npm install
npm start
```

Abrir `http://localhost:3000` (HTML + API no mesmo processo). Requer **Node.js 22.5+** (SQLite nativo via `node:sqlite`).

Testes automatizados (SQLite em memória):

```bash
npm test
```

## Banco local (SQLite)

O servidor grava tudo em **`data/ec-routine.db`** (ou o caminho em `SQLITE_PATH`).

- Tabelas: `users`, `routines`, `attachments` — ver [migrations/sqlite/001_initial.sql](migrations/sqlite/001_initial.sql)
- Na primeira execução com DB vazio, importa automaticamente `data/users.json` e `data/routines.json` se existirem
- Anexos ficam em `data/attachments/`; metadados na tabela `attachments`

## Estrutura principal

| Ficheiro / pasta | Função |
|------------------|--------|
| [server.js](server.js) | Express, rotas `/api/*`, ficheiros estáticos |
| [auth.html](auth.html) / [auth.js](auth.js) | Login e registo |
| [dashboard.html](dashboard.html) / [dashboard.js](dashboard.js) | Painel principal |
| [create.html](create.html), [routine-detail.html](routine-detail.html) | Criar/editar rotinas |
| [profile-setup.html](profile-setup.html) | Onboarding de perfil |
| [lib/store-sqlite.js](lib/store-sqlite.js) | Persistência SQLite |
| [termos.html](termos.html), [privacidade.html](privacidade.html) | Documentos legais |

## Variáveis de ambiente (opcional)

Exemplo: [.env.example](.env.example)

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `SQLITE_PATH` | Não | Caminho do ficheiro SQLite (predefinição: `data/ec-routine.db`) |
| `JWT_SECRET` | Só em `NODE_ENV=production` | Segredo para assinar JWT |
| `PORT` | Não | Predefinição `3000` |
| `ADMIN_EMAILS` | Não | E-mails com acesso ao painel `/admin` |

## API (resumo)

- `POST /api/register`, `POST /api/login` — registo e sessão
- `GET/PUT /api/profile` — perfil (autenticado)
- `GET/POST/PUT/DELETE /api/routines` e sub-rotas de tarefas — rotinas (autenticado)

A URL da API é sempre **`/api`** no mesmo host ([api-base.js](api-base.js)).

## Backup

Copie regularmente:

- `data/ec-routine.db` (e `-wal`/`-shm` se existirem)
- `data/attachments/`

## Segurança

- Palavras-passe com bcrypt; rotas sensíveis com `helmet`.
- Textos legais em [termos.html](termos.html) e [privacidade.html](privacidade.html).
