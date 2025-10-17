# stocksUI — Ambiente & Deploy

Este projeto usa React + Vite no frontend e um servidor Node/Express para APIs e para servir o build de produção.

## Variáveis de Ambiente

- Frontend (Vite):
  - `VITE_BASE_PATH` — caminho base onde os assets serão servidos.
    - `"/stocksUI/"` se a app estiver sob essa rota.
    - `"/"` para servir na raiz.
- Backend (Node/Express):
  - `SERVE_DIST` — quando `true`, o servidor monta `dist` em produção.
  - `NODE_ENV` — defina `production` em produção (impacta alguns padrões como `strict`).
  - `PORT` — porta do servidor.

Veja `/.env.example` para um modelo; copie para `.env.development` e `.env.production` conforme o ambiente. Arquivos `.env*` estão ignorados pelo Git.

## Desenvolvimento

- Instale dependências: `npm ci` (ou `npm install`).
- Execute o servidor e Vite juntos: `npm run dev:full`.
- URL local padrão: `http://localhost:5173/stocksUI/`.
  - Para usar raiz: exporte `VITE_BASE_PATH=/` e reinicie.

## Produção (Kamatera)

1) Defina variáveis de ambiente:

```
export VITE_BASE_PATH=/stocksUI/
export SERVE_DIST=true
export NODE_ENV=production
export PORT=3001
```

2) Build do frontend:

```
npm ci
npm run build
```

3) Inicie o servidor:

- Node direto:

```
node server.mjs
```

- PM2:

```
pm2 start server.mjs --name stocksUI --update-env
```

4) Acesse:

- `http://<host>:3001/stocksUI/` (ou `/` se usou `VITE_BASE_PATH=/`).

### Proxy/Nginx (exemplo)

```
location /stocksUI/ {
  root /caminho/para/dist; # Pastas do build
  try_files $uri $uri/ /stocksUI/index.html;
}
location /api/ {
  proxy_pass http://127.0.0.1:3001;
}
```

## Diagnóstico

- 404 de assets: verifique se `VITE_BASE_PATH` combina com a rota servida.
- `Unexpected token '<'` ao fazer `resp.json()`: geralmente resposta HTML (404/fallback). Confirme que `/api` está sendo servido/proxyado pelo Node.
- Verifique que `dist` foi gerado e o processo Node roda no diretório do projeto (o servidor usa `process.cwd()`).

## Notas

- Env de produção e desenvolvimento não são versionados; use `.env.example` como referência.
- Em produção, o servidor só serve `dist` com `NODE_ENV=production` ou `SERVE_DIST=true` e se `dist` existir.
