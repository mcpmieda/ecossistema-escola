# Ecossistema Escolar

Plataforma institucional da Escola Iêda Alves de Oliveira MCPM. A fundação técnica está implantada e o **Centro de Administração v0.1.0** está em construção como candidata de validação restrita a `ADMINISTRADOR`.

A presença da candidata em `https://admin.escolaieda.com` não representa liberação definitiva. O protocolo de produção exige a frase exata `APROVADO PARA PRODUÇÃO` e todos os gates técnicos aplicáveis.

- Domínio oficial: <https://admin.escolaieda.com>
- Runtime: Cloudflare Pages + Pages Functions, plano Free
- Identidade: Microsoft Entra ID, tenant único, sessão BFF em cookie HttpOnly
- Dados: SharePoint `CENTROADMIN`, acessado pelo backend via `Sites.Selected`
- Entrega: GitHub Actions, branch `main`
- Manutenção: GitHub OIDC → Entra, rotação automática e sobreposta dos certificados Web/Graph

## Estado atual

- fundação Cloudflare/Entra/Graph/SharePoint: operacional e preservada;
- login institucional: lógica existente preservada; experiência visual remodelada na candidata;
- Centro de Administração: v0.1.0 em validação controlada;
- acesso da candidata: capacidades server-side concedidas somente a `ADMINISTRADOR`;
- primeiro read model: módulos registrados, configurações ativas, atividade recente e estado das fontes;
- módulos de negócio especializados: ainda não incorporados ao Centro.

Consulte [CENTRO_ADMINISTRACAO_VALIDACAO.md](docs/CENTRO_ADMINISTRACAO_VALIDACAO.md) para escopo, gates e estado da candidata.

## Desenvolvimento

Requer Node.js 20 ou superior.

```powershell
npm ci
npm run verify
```

Para executar localmente, copie apenas os nomes de `.env.example` para um arquivo local ignorado pelo Git e use valores de desenvolvimento próprios. Credenciais de produção nunca devem ser exportadas do Cloudflare.

## Estrutura

- `src/`: interface React do ecossistema e Centro de Administração.
- `functions/`: roteador BFF das rotas `/auth/*` e `/api/*`.
- `server/`: autenticação, sessão, autorização, capacidades, Graph, read models e contratos.
- `infra/`: provisionamento idempotente e manutenção técnica.
- `specs/`: contratos semânticos versionados de funcionalidades relevantes.
- `tests/`: testes unitários, autorização, integração lógica e segurança.
- `docs/`: arquitetura, operação, auditoria, validação e relatórios.

Para a fundação original, consulte [RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md](docs/RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md).
