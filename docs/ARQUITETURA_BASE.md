# Arquitetura da fundação

Data do estado descrito: 2026-08-24.

```text
Navegador institucional
  └─ HTTPS admin.escolaieda.com (CNAME na GoDaddy)
      └─ Cloudflare Pages
          ├─ assets React/Vite (estáticos, sem Function)
          └─ /auth/* e /api/* → Pages Functions / Workers runtime
              ├─ OIDC Entra, tenant único
              ├─ sessão selada em cookie HttpOnly/Secure/SameSite=Lax
              └─ Microsoft Graph, identidade app-only por certificado
                  └─ Sites.Selected → somente CENTROADMIN (write)
                      └─ listas e bibliotecas SharePoint

GitHub main → CI (format/lint/typecheck/test/build) → Wrangler → Pages
GitHub Actions OIDC → Entra Maintenance → rotação Web/Graph → slots A/B Cloudflare
```

O frontend recebe somente nome e papéis mínimos de `/api/me`. Tokens Graph, chaves privadas e `SESSION_SECRET` permanecem no runtime. O backend valida host oficial, issuer, tenant, audience, nonce, state, método, Origin e papéis.

## Componentes

| Camada              | Implementação                   | Responsabilidade                                  |
| ------------------- | ------------------------------- | ------------------------------------------------- |
| DNS                 | GoDaddy                         | Mantém a zona e o único CNAME novo `admin`        |
| Edge/frontend       | Cloudflare Pages Free           | HTTPS, assets globais e custom domain             |
| Backend             | Pages Functions                 | BFF, autenticação, autorização e Graph            |
| Identidade humana   | Entra Web app                   | Login institucional e group claims                |
| Identidade de dados | Entra Graph Backend             | Token app-only limitado por `Sites.Selected`      |
| Manutenção          | Entra Maintenance + GitHub OIDC | Rotação sem client secret                         |
| Persistência        | SharePoint CENTROADMIN          | Metadados institucionais e arquivos da plataforma |
| Código/CI           | GitHub privado                  | Fonte, testes, deploy e auditoria de rotação      |

## Rotas e consumo

`public/_routes.json` invoca Functions somente em `/auth/*` e `/api/*`; assets não consomem quota de Functions. APIs e autenticação usam `Cache-Control: no-store, private`. O `pages.dev` pode entregar assets, mas o runtime rejeita suas APIs com 421.

O Graph client centraliza timeout, correlação, paginação limitada, batch de 1–20 requisições, ETag/If-Match e retry de `429/5xx` com `Retry-After`, backoff e jitter. Nenhum KV, D1, R2, Durable Object, Queue, Cron Cloudflare ou Azure runtime foi criado.

## Extensão futura

Cada módulo deve satisfazer `moduleContract`, registrar-se em `PLATAFORMA_MODULOS` e declarar rota, versão, papéis e health endpoint. Feature flags usam `feature.<modulo>.<flag>`. Read models são específicos por módulo. Banco de Notas, Centro de Administração real e painéis não fazem parte desta fundação.
