# Ecossistema Escolar — fundação técnica

Fundação institucional da Escola Iêda Alves de Oliveira MCPM. A aplicação pública é somente a página técnica mínima; os módulos de negócio ainda não existem.

- Produção: <https://admin.escolaieda.com>
- Runtime: Cloudflare Pages + Pages Functions, plano Free
- Identidade: Microsoft Entra ID, tenant único, sessão BFF em cookie HttpOnly
- Dados: SharePoint `CENTROADMIN`, acessado pelo backend via `Sites.Selected`
- Entrega: GitHub Actions, branch `main`
- Manutenção: GitHub OIDC → Entra, rotação automática e sobreposta dos certificados Web/Graph

## Desenvolvimento

Requer Node.js 20 ou superior.

```powershell
npm ci
npm run verify
```

Para executar localmente, copie apenas os nomes de `.env.example` para um arquivo local ignorado pelo Git e use valores de desenvolvimento próprios. Credenciais de produção nunca devem ser exportadas do Cloudflare.

## Estrutura

- `src/`: página React mínima.
- `functions/`: roteador BFF das rotas `/auth/*` e `/api/*`.
- `server/`: autenticação, sessão, autorização, Graph e contratos.
- `infra/`: provisionamento idempotente e manutenção técnica.
- `tests/`: testes unitários e de segurança.
- `docs/`: arquitetura, operação, auditoria e relatório completo.

Comece por [RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md](docs/RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md).
