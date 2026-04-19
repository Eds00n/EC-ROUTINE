# EC ROUTINE

Sistema de rotinas e tarefas com autenticação (JWT), API REST em Node/Express e armazenamento em **PostgreSQL** (produção) ou ficheiros JSON em `data/` (desenvolvimento sem `DATABASE_URL`).

**Publicação / produção:** ver o guia [DEPLOY.md](DEPLOY.md) (modelos de alojamento, CORS, meta `ec-api-base`, anexos e checklist).

## Arranque rápido

```bash
npm install
npm start
```

Abrir `http://localhost:3000` (servidor estático + API no mesmo processo).

Testes automatizados (API em memória com ficheiros em `data/`):

```bash
npm test
```

## Estrutura principal

| Ficheiro / pasta | Função |
|------------------|--------|
| [server.js](server.js) | Express, rotas `/api/*`, ficheiros estáticos |
| [auth.html](auth.html) / [auth.js](auth.js) | Login e registo |
| [dashboard.html](dashboard.html) / [dashboard.js](dashboard.js) | Painel principal |
| [create.html](create.html), [routine-detail.html](routine-detail.html) | Criar/editar rotinas |
| [profile-setup.html](profile-setup.html) | Onboarding de perfil |
| [lib/store.js](lib/store.js) | Postgres (`store-pg.js`) ou JSON (`store-files.js`) |
| [termos.html](termos.html), [privacidade.html](privacidade.html) | Documentos legais (links no registo e no app) |

## Variáveis de ambiente (produção)

Exemplo comentado: [.env.example](.env.example). Defina na Render (ou noutro alojamento da API):

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim em `NODE_ENV=production` | URI PostgreSQL |
| `JWT_SECRET` | Sim em produção **ou** sempre que use `DATABASE_URL` | Segredo longo e aleatório para assinar JWT (nunca o valor de desenvolvimento) |
| `CORS_ORIGIN` | Recomendado | Origens do **front-end** separadas por vírgula, **exatamente** como o browser envia (ex.: `https://seudominio.com,https://www.seudominio.com`). O servidor também aceita `http://localhost:3000` e `http://127.0.0.1:3000` para desenvolvimento. |
| `NODE_ENV` | Produção: `production` | Ativa validações estritas no arranque |
| `PORT` | Opcional | Predefinição `3000` |

Se o site estático estiver na **Hostinger** (ou outro domínio) e a API na **Render**, o valor de `CORS_ORIGIN` tem de incluir o URL HTTPS do site; caso contrário o browser bloqueia os pedidos (`CORS`).

## Front-end e URL da API

- Em `http://localhost:3000` com `node server.js`, [api-base.js](api-base.js) usa sempre `/api` no mesmo host (ignora o meta).
- Noutros hosts, a URL da API vem do `<meta name="ec-api-base" content=".../api" />` em cada HTML (ver [DEPLOY.md](DEPLOY.md)); se o meta estiver vazio, usa-se o fallback em `api-base.js`.

## API (resumo)

- `POST /api/register`, `POST /api/login` — registo e sessão (limite de pedidos por IP em janela de 15 min).
- `GET/PUT /api/profile` — perfil (autenticado).
- `GET/POST/PUT/DELETE /api/routines` e sub-rotas de tarefas — rotinas (autenticado).

## Segurança e privacidade

- Palavras-passe com bcrypt; rotas sensíveis com `helmet` (CSP desativada no código para não partir inline existente).
- Textos legais em [termos.html](termos.html) e [privacidade.html](privacidade.html) (base LGPD); personalize o contacto do “controlador” na política antes de uso público alargado.

## Backup

- **PostgreSQL:** backups conforme o plano do fornecedor (ex.: Render).
- **Modo ficheiros (`data/`):** copie regularmente `data/users.json`, `data/routines.json`, `data/attachments/` e `data/attachments-index.json`.

## Operação (Render gratuito)

O primeiro pedido após período inativo pode demorar (**cold start**). Utilizadores podem ver lentidão pontual; considere plano pago ou keep-alive externo se for crítico.
