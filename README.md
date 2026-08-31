# Centro de Administração

Repositório do **Centro de Administração** da Escola Iêda Alves de Oliveira MCPM.

- Produção: `https://admin.escolaieda.com`
- Frontend: React + HeroUI React v3
- Runtime: Cloudflare Pages + Pages Functions
- Identidade: Microsoft Entra ID
- Dados administrativos atuais: SharePoint/Microsoft Graph

## Desenvolvimento

Requer Node.js 22 ou compatível.

```powershell
npm ci
npm run verify
```

O fluxo normal verifica lint, tipos, testes e build. Pull requests são validados pelo workflow de qualidade. O deploy oficial ocorre pela `main`.

## Banco de Notas

O Banco de Notas é desenvolvido no mesmo repositório e no mesmo shell do Centro. A coordenação para múltiplos agentes, decisões oficiais, fases, contratos e estado atual está em:

- [`docs/gradebook/README.md`](docs/gradebook/README.md)
- [`docs/gradebook/PROJECT_STATE.yaml`](docs/gradebook/PROJECT_STATE.yaml)
- [`docs/gradebook/ROADMAP.md`](docs/gradebook/ROADMAP.md)
- [`docs/gradebook/DECISIONS.md`](docs/gradebook/DECISIONS.md)

A issue principal do programa será registrada nesses documentos após a criação do mapa inicial de issues.

## Estrutura atual

- `src/`: interface do Centro de Administração e protótipo do Banco de Notas.
- `functions/`: entrada BFF de autenticação e APIs administrativas.
- `server/`: autenticação, Microsoft Graph e backend administrativo.
- `shared/`: contratos compartilhados usados pelo runtime.
- `tests/`: testes automatizados do Centro de Administração.
- `docs/gradebook/`: memória técnica e operacional do Banco de Notas.
