# Centro de Administração

Repositório do **Centro de Administração** da Escola Iêda Alves de Oliveira MCPM.

- Produção: `https://admin.escolaieda.com`
- Frontend: React + HeroUI
- Runtime: Cloudflare Pages + Pages Functions
- Identidade: Microsoft Entra ID
- Dados administrativos: SharePoint/Microsoft Graph

## Desenvolvimento

Requer Node.js 22 ou compatível.

```powershell
npm ci
npm run verify
```

O fluxo normal verifica lint, tipos, testes e build. O deploy ocorre pela `main` quando código de runtime muda.

## Estrutura

- `src/`: interface do Centro de Administração.
- `functions/`: entrada BFF de autenticação e APIs administrativas.
- `server/`: autenticação, Microsoft Graph e backend administrativo.
- `shared/`: contratos compartilhados usados pelo runtime.
- `tests/`: testes automatizados do Centro de Administração.
