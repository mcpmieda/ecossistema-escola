# Centro de Administração — candidata de validação v0.1.0

Data: 2026-08-24

## Estado

`EM VALIDACAO CONTROLADA`

Esta candidata inicia o Centro de Administração como parte nativa do `ecossistema-escola`. Ela pode ser implantada no domínio oficial para inspeção por `ADMINISTRADOR`, mas **não está liberada definitivamente aos demais usuários**.

A liberação oficial continua submetida ao protocolo de `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md` e só pode começar após a frase exata:

`APROVADO PARA PRODUÇÃO`

## Fontes de verdade

- intenção funcional: `Especificacao_Geral_Centro_de_Administracao_v2.0`;
- arquitetura, código, segurança, CI/CD e estado implantado: este repositório;
- método de engenharia, Semantic Assurance, Change Hygiene, qualidade de UI e verificação: `mcpmieda/app-factory`;
- identidade humana e papéis: grupos Microsoft 365 já mapeados pela fundação Entra;
- dados operacionais compartilhados: SharePoint `CENTROADMIN` via Graph Backend existente.

## Classificação App Factory

- System Engineering: `production-system`;
- Semantic Assurance: `domain`;
- UI: `professional-default`;
- density: `comfortable`;
- surface: `layered`;
- emphasis: `balanced`;
- Motion Profile: `ambient` no login, atenuado para `subtle` no espaço operacional;
- `prefers-reduced-motion`: obrigatório.

A stack existente React/Vite + Cloudflare Pages/Functions foi preservada. O perfil `web-admin` da App Factory não autoriza uma migração para Next.js/shadcn quando o projeto existente já possui fundação coerente e o pedido exige preservá-la.

## Escopo funcional da v0.1.0

### Entrada e login

- substitui somente a experiência visual da página técnica anterior;
- mantém `/auth/login`, `/auth/callback`, PKCE, state, nonce, certificados, cookie selado e duração da sessão sem reconstrução;
- não adiciona biblioteca ou provedor de autenticação;
- informa claramente que o Centro está em validação restrita.

### Autorização

- mantém os cinco papéis institucionais existentes;
- adiciona uma camada server-side de capacidades derivadas desses papéis;
- a candidata concede `platform.validation.access` e capacidades de leitura do Centro apenas a `ADMINISTRADOR`;
- esconder UI não é o controle de segurança: `/api/admin/bootstrap` exige as capacidades no BFF;
- declaração de papéis malformada no catálogo de módulos falha fechada.

### Visão geral operacional

O frontend solicita um único read model de caso de uso em `/api/admin/bootstrap`.

O BFF reutiliza um único token Graph e compõe os dados com:

1. descoberta das listas já existentes no `CENTROADMIN`;
2. batch Graph para `PLATAFORMA_MODULOS`, `PLATAFORMA_CONFIGURACOES` e `PLATAFORMA_AUDITORIA`;
3. filtro de módulos pelas roles declaradas e roles da sessão;
4. resumo de módulos visíveis, configurações ativas e atividade recente;
5. estado `ok` ou `degraded` conforme disponibilidade das fontes.

O navegador não consulta SharePoint/Graph diretamente e não recebe tokens privilegiados.

### Interface autenticada

A primeira shell real contém:

- visão geral;
- catálogo de sistemas registrados;
- estado da fundação;
- atividade recente de auditoria;
- identidade mínima da sessão;
- indicação persistente de candidata em validação;
- estados de loading, acesso negado, falha, vazio e operação parcial;
- layout responsivo e foco visível.

Navegação futura, busca global, notificações, preferências, configuração administrativa e módulos de negócio não foram simulados. Eles entram em fatias funcionais posteriores quando houver contrato e implementação reais.

## Infraestrutura preservada

Nenhuma nova infraestrutura foi criada. Permanecem sem alteração de responsabilidade:

- Cloudflare Pages + Pages Functions;
- domínio `admin.escolaieda.com`;
- Microsoft Entra ID;
- BFF e sessão HttpOnly/Secure/SameSite=Lax;
- Microsoft Graph app-only por certificado;
- `Sites.Selected` e grant apenas no `CENTROADMIN`;
- SharePoint como persistência compartilhada;
- grupos institucionais existentes;
- GitHub Actions, gates, deploy e rotação automática A/B;
- política de segredos e hardening de supply chain.

## Dados e escrita

A v0.1.0 é somente leitura para dados administrativos do Centro. Não existe botão de mutação de configuração, módulo ou auditoria nesta candidata. Isso reduz risco no primeiro estado de validação sem criar persistência falsa.

## Contratos e evidência

- `specs/semantic-contract.json` — invariantes e critérios observáveis;
- `specs/semantic-assurance.json` — modelo de domínio e requisitos normalizados;
- `tests/capabilities.test.ts` — autorização por capacidade permitida/negada;
- `tests/admin-overview.test.ts` — composição do read model, filtro fail-closed e degradação parcial;
- testes existentes de OIDC, sessão, Graph, segurança, roles e contratos permanecem regressão obrigatória;
- CI existente executa format, lint, typecheck, testes, build, actionlint e zizmor antes de qualquer deploy de `main`.

## Critérios da candidata

A candidata só pode ser apresentada como pronta para validação quando:

- CI completo estiver verde;
- o endpoint público `/api/health` continuar saudável;
- `/api/admin/bootstrap` permanecer protegido para sessão sem autorização;
- login continuar redirecionando ao Entra pelo fluxo existente;
- o domínio oficial carregar a nova experiência;
- nenhum artefato temporário, implementação paralela, CSS de sobrescrita ou dependência desnecessária permanecer após Change Hygiene.

Mesmo com todos esses critérios atendidos, o estado continua `EM VALIDACAO CONTROLADA` até a aprovação oficial definida no protocolo.
