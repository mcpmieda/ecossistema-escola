# Ecossistema Escolar

Repositório do **Centro de Administração** e do **Banco de Notas** da Escola Iêda Alves de Oliveira MCPM.

- Produção: `https://admin.escolaieda.com`
- Frontend: React + HeroUI
- Runtime: Cloudflare Pages + Pages Functions
- Identidade: Microsoft Entra ID
- Dados do Centro: SharePoint/Microsoft Graph
- Dados do Banco de Notas: Cloudflare D1

## Desenvolvimento

Requer Node.js 22 ou compatível.

```powershell
npm ci
npm run verify
```

O fluxo normal verifica lint, tipos, testes e build. O deploy ocorre pela `main` quando código de runtime muda.

## Estrutura

- `src/`: Centro de Administração e interface atual do Banco de Notas.
- `functions/`: entrada BFF de autenticação e APIs.
- `server/`: autenticação, Graph e backend do Banco de Notas.
- `shared/`: contratos compartilhados usados pelo runtime atual.
- `infra/banco-notas/d1/migrations/`: migrations preservadas do Banco de Notas.
- `tests/`: testes automatizados do Centro e do Banco ativos.
- `docs/banco-notas/códigos de testes/`: reserva do código antigo do Banco, fora do runtime e do build.

Código histórico removido continua recuperável pelo histórico do Git e pelo arquivo preservado em `docs/banco-notas/códigos de testes/`.
