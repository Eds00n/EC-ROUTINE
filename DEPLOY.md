# Publicar o EC ROUTINE

Guia prático para colocar a aplicação em produção. O servidor é um único Node ([server.js](server.js)): API `/api/*` + ficheiros estáticos na raiz do projeto.

## 1. Escolher o modelo de alojamento

### Modelo A — Monólito (recomendado para começar)

Um único serviço (ex.: **Render Web Service**) corre `npm start` e serve **HTML + API** no mesmo domínio.

- Vantagens: menos problemas de CORS; [api-base.js](api-base.js) em `localhost:3000` já usa `/api` no mesmo host; em produção HTTPS o meta `ec-api-base` pode apontar para a mesma origem.
- Configure `CORS_ORIGIN` com o URL público HTTPS do **próprio** serviço (ex.: `https://ec-routine.onrender.com`). Inclua variante `www.` se existir, separada por vírgula.
- Na **Render**, se esquecer `CORS_ORIGIN`, o servidor passa a aceitar também a variável automática **`RENDER_EXTERNAL_URL`** (o URL `onrender.com` do serviço). Com **domínio próprio**, continue a definir `CORS_ORIGIN` com esse URL exacto.

### Modelo B — Front estático + API separada

- **API:** Render (ou outro) com Node + PostgreSQL.
- **Front:** Hostinger, Netlify, GitHub Pages, bucket S3, etc. — upload dos ficheiros do repositório (HTML, CSS, JS, `assets/`, etc.).
- **Obrigatório:** na API, `CORS_ORIGIN` deve listar **exatamente** as origens do site (protocolo + host + porta), por exemplo: `https://seudominio.com,https://www.seudominio.com`.
- **URL da API no browser:** em cada página HTML, defina o meta (ver secção 3) ou mantenha o fallback em [api-base.js](api-base.js).

## 2. Variáveis de ambiente (API / Node)

Crie um ficheiro `.env` na raiz (nunca commite segredos) ou configure no painel do PaaS. Ver [.env.example](.env.example).

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim com `NODE_ENV=production` | URI PostgreSQL |
| `JWT_SECRET` | Sim em produção ou sempre que use `DATABASE_URL` | Segredo longo e aleatório para JWT |
| `CORS_ORIGIN` | **Recomendado em produção** | Origens do front, separadas por vírgula, exatamente como o browser envia |
| `NODE_ENV` | Produção: `production` | Ativa validações no arranque |
| `PORT` | Opcional | Predefinição `3000`; muitos hosts injetam `PORT` |
| `ADMIN_EMAILS` | Opcional | E-mails com acesso ao painel admin (`/admin`, `GET /api/admin/*`). Vários: separados por vírgula, **minúsculas**, igual ao e-mail da conta. **Não** commite e-mails reais no repositório — defina só no painel do PaaS. Se vazio, todas as rotas admin respondem 403 |

O servidor recusa arrancar em produção sem `DATABASE_URL`, ou com `JWT_SECRET` fraco, quando aplicável (ver [server.js](server.js)).

### Painel administrativo (métricas)

- URL (monólito): `https://O-TEU-SERVICO/admin` ou `admin.html` na mesma origem.
- **Autenticação:** inicie sessão com uma conta cujo e-mail esteja em `ADMIN_EMAILS`; o browser envia o JWT nas chamadas a `/api/admin/summary` e `/api/admin/ping`.
- **Segurança:** o servidor valida o e-mail do token em cada pedido; não basta «esconder» o link no HTML.
- No arranque, os logs indicam se `ADMIN_EMAILS` está vazio (ninguém é admin) ou quantos e-mails foram configurados.

## 3. URL da API no front-end (sem editar `api-base.js` em cada deploy)

Em **cada** HTML que carrega [api-base.js](api-base.js) (`dashboard.html`, `auth.html`, `create.html`, `routine-detail.html`, `profile-setup.html`, `admin.html`), pode definir no `<head>`:

```html
<meta name="ec-api-base" content="https://O-TEU-SERVICO.onrender.com/api" />
```

- Deve terminar em `/api` (ou apenas a origem; o script normaliza).
- Se o meta estiver ausente ou com `content` vazio, usa-se o fallback predefinido em `api-base.js`.
- Em `http://localhost:3000` com `node server.js`, o script **ignora** o meta e usa sempre `/api` no mesmo host.

## 4. Front estático separado (modelo B)

1. Fazer build/deploy do repositório Node com as envs corretas.
2. Copiar para o hosting estático: todos os `.html`, `.css`, `.js` de raiz e pastas referenciadas (`assets/`, `migrations/` **não** é necessária no front público).
3. Garantir que `api-base.js` e o meta `ec-api-base` apontam para a API real.
4. No browser, abrir DevTools → Rede: se aparecer erro **CORS**, corrija `CORS_ORIGIN` na API (inclua o URL exato do front).

## 5. Anexos e uploads

Os ficheiros enviados (fotos de perfil, anexos de diagramas, etc.) são gravados em **disco** no servidor (`data/attachments` ou caminho definido pelo store).

- Em **Render** (plano gratuito), o sistema de ficheiros é muitas vezes **efémero**: reinícios podem apagar anexos.
- Para produção com muitos utilizadores ou dados críticos: use **disco persistente** no serviço ou armazenamento de objetos (S3, R2, etc.) — exigiria evolução do código além deste guia.

## 6. Checklist de fumo (após deploy)

Execute manualmente na URL de produção:

- [ ] Registo de novo utilizador
- [ ] Login e sessão (token)
- [ ] Abrir dashboard e listar rotinas
- [ ] Criar / editar rotina
- [ ] Perfil: ver dados, tema claro/escuro, guardar perfil
- [ ] Anotação (tipo caderno / digital / diagrama) e guardar
- [ ] Upload de imagem (perfil ou anexo) e verificar se persiste após redeploy (se usar disco efémero, pode falhar — ver secção 5)
- [ ] `ADMIN_EMAILS` definido; abrir `/admin` com sessão desse e-mail e confirmar estatísticas; com outra conta, confirmar 403 em `/api/admin/summary`

## 7. Outros

- **Login Google:** foi removido do projeto. Se ainda existir `GOOGLE_CLIENT_ID` no painel do host (Render, etc.), pode apagá-la — já não é usada.
- **Cold start (Render free):** o primeiro pedido após inatividade pode ser lento.
- **Proxy:** o servidor define `trust proxy` (1 hop por defeito) para conviver com `X-Forwarded-For` da Render e com **express-rate-limit v8**; sem isto, `POST /api/login` podia responder **500**. Opcional: `TRUST_PROXY_HOPS` no ambiente se tiver mais de um proxy.
- **CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre `npm test` em push/PR; **não faz deploy** automático.
- **Legal:** personalizar o contacto do responsável em [privacidade.html](privacidade.html) antes de tráfego público alargado (ver [README.md](README.md)).
