# Banco de Notas — Implementation State

Última atualização: 25/08/2026

Branch ativa: `feat/banco-de-notas-foundation`

## Estado

Fase: **0 — adoção, auditoria e arquitetura pré-implementação**.

Status: **PRE-IMPLEMENTATION READY — implementação material ainda não iniciada neste branch**.

A fundação do Centro de Administração v1 em `main` permanece intacta e em produção. Este branch nasceu de `b2f743543f7365e591120b2363b5f274bf314cb0`.

## O que foi auditado

### App Factory

- baseline V1.4;
- Project Adoption Gate;
- UI Policy;
- HeroUI Native Redesign Contract;
- Change Hygiene e continuidade por GitHub;
- escolha explícita de HeroUI prevalece sobre shadcn/ReUI;
- exceção explícita do produto permite desativar o default Ambient Constellation.

### Ecossistema Escolar

- Centro v1 já em produção;
- HeroUI React v3 já é dependência oficial;
- Ambient Constellation foi removido fisicamente e há regressões que impedem seu retorno;
- Entra/BFF/cookie HttpOnly/capabilities/Graph/SharePoint/Cloudflare/CI/recovery existentes devem ser preservados;
- contrato de módulos exige manifesto versionado, baseRoute path-based, health endpoint e capabilities;
- `PLATAFORMA_MODULOS` é inventário, não autorização;
- browser não deve acessar SharePoint diretamente;
- `public/_routes.json` limita Pages Functions a `/auth/*` e `/api/*`.

### Terreno técnico anterior (`mcpmieda/escolaieda`)

Baseline auditada: `211251908efe078a8b75396e71e94827293da860`.

Confirmado:

- POC `notas-integracao`;
- add-in Office.js;
- `grade.changed`, `grade.recalculated`, `grade.reverted`, stale;
- Idempotency-Key e Sequence;
- OpenAPI/AsyncAPI;
- API de modelos/import jobs;
- scripts de geração/conversão professor-a-professor;
- listas SharePoint POC isoladas;
- gerador v3 usa Excel COM e, portanto, é prova/oráculo de regressão, não runtime cloud definitivo.

## Documentos de produto auditados

1. `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado` — regra funcional/pedagógica principal.
2. `Dossie_Tecnico_Modelo_Professor_Integracao_Banco_de_Notas_v1.0` — integração posterior e vinculada; prevalece sobre a hipótese antiga de importação isolada.
3. `Plano_Mestre_antigo_antes_do_dossie.Reconstrucao_Planilha_Banco_de_Notas_v0.3` — histórico técnico/regressão.

## Decisões já fechadas

- Banco de Notas será o primeiro sistema especializado integrado ao Centro.
- Repositório definitivo: `mcpmieda/ecossistema-escola`.
- Rota definitiva: `/banco-de-notas`, não `#bancodenotas`.
- APIs: `/api/banco-notas/v1/*`.
- Arquitetura: modular monolith no mesmo repo/deploy, com Worker auxiliar apenas quando processamento assíncrono justificar.
- Persistência transacional: Cloudflare D1.
- Jobs assíncronos: Cloudflare Queues quando necessário.
- Arquivos/modelos: SharePoint/OneDrive.
- Integração Microsoft: Graph pelo backend.
- Nova fonte de baixa latência: add-in Office.js → API Cloudflare.
- Fonte legada: importação auditável e idempotente, mantida para anos/arquivos antigos.
- Autoridade da fonte explícita por professor/ano durante migração.
- `SyncEnabled=false` por default.
- HeroUI React v3 em todas as páginas do Banco.
- shadcn/ReUI não entram no módulo.
- Ambient Constellation proibido.
- GitHub nunca participa do runtime.
- O produto possui um modelo genérico limpo; arquivos de Nina e Alanna são somente golden masters privados externos de homologação.
- A transformação de planilhas legadas deve funcionar para qualquer professor sem branch, regra, aba, turma, disciplina ou mapeamento fixo derivado desses golden masters.
- Golden masters privados não entram em runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição.

## Artefatos criados neste branch

- `.app-factory.json`
- `AGENTS.md`
- `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`
- `specs/banco-notas/semantic-contract.json`
- `specs/banco-notas/semantic-assurance.json`
- `specs/banco-notas/verification-plan.json`
- este arquivo
- `docs/BANCO_NOTAS_HANDOFF.md`

## Lacunas conhecidas antes do piloto

- provisionar e vincular D1/Queues no Cloudflare;
- adaptar root semantic contract/verification global para o novo escopo antes do merge de código funcional;
- implementar migrations e repositórios D1;
- declarar capabilities do Banco;
- criar manifesto do módulo e registro operacional idempotente;
- criar shell HeroUI e roteamento path-based;
- implementar API de fontes/import jobs/teacher models/grade events;
- decidir/provisionar audience/scope Entra do add-in;
- portar/adaptar add-in da POC para a API definitiva;
- migrar contratos OpenAPI/AsyncAPI válidos do repositório antigo para este repositório;
- implementar storage/Graph definitivo;
- implementar e versionar o modelo genérico limpo e o contrato intermediário de transformação;
- provar generalização com fixtures sintéticas estruturalmente variadas e, adicionalmente, executar regressão Nina/Alanna somente em homologação privada externa;
- resolver fonte institucional estável de AlunoId/turma;
- substituir a dependência COM do caminho legado antes de declarar importação cloud totalmente autônoma.

## Próximo bloco recomendado

**Fase 1 — fundação executável do módulo** em um único avanço:

1. sincronizar o contrato semântico global para permitir o primeiro sistema integrado;
2. adicionar bindings/configuração D1 e migrations iniciais;
3. criar domínio/repositórios base;
4. adicionar capabilities e manifesto `banco-de-notas`;
5. criar `/api/banco-notas/health` e APIs base de Fonte;
6. criar rota `/banco-de-notas` com shell HeroUI nativo e Configurações > Fonte funcional;
7. adicionar testes de autorização, rota, source authority e ausência de Ambient;
8. rodar `npm run verify` e CI;
9. atualizar este estado e o handoff.

Nenhum passo desta fase deve criar dado real no Git ou ativar sincronização de professor.
