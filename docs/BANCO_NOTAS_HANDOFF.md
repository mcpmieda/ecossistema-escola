# Banco de Notas — Handoff

Data: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

## Comece por aqui

1. Leia `AGENTS.md`.
2. Leia `.app-factory.json`.
3. Leia `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`.
4. Leia `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`.
5. Leia `specs/banco-notas/semantic-contract.json`.
6. Leia `specs/banco-notas/semantic-assurance.json`.
7. Leia `specs/banco-notas/verification-plan.json`.
8. Leia `docs/CONTRATO_MODULOS.md`, `ARCHITECTURE.md` e o `PROJECT_STATE.md` global.

## Contexto externo que já foi auditado

### App Factory

Repositório: `mcpmieda/app-factory`.

Aplicar V1.4, Project Adoption Gate, HeroUI Native Contract, Change Hygiene e Semantic/Independent Verification.

Exceção explícita: o Banco de Notas usa HeroUI em toda a interface, mas **não usa Ambient Constellation**.

### Terreno anterior do Banco

Repositório: `mcpmieda/escolaieda`.

Baseline auditada: `211251908efe078a8b75396e71e94827293da860`.

Arquivos relevantes:

- `notas-integracao/README.md`
- `API_NOTAS_SYNC.md`
- `api/notas-sync-v1.openapi.yaml`
- `api/modelos-professor-v1.openapi.yaml`
- `api/notas-sync-events-v1.asyncapi.yaml`
- `notas-integracao/addin/manifest.xml`
- `notas-integracao/js/sync-client.js`
- `scripts/gerar-modelo-professor-v3.ps1`
- `scripts/assistente-importacao-modelos.ps1`
- `scripts/testes-modelo-professor-v3.mjs`
- `scripts/testes-notas-integracao.mjs`

Não continue construindo o Banco definitivo nesse repositório. Migre o que for válido para `ecossistema-escola` e preserve o antigo como evidência/POC.

## Documentos privados de produto e golden masters de homologação

- `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado.docx`
- `Dossie_Tecnico_Modelo_Professor_Integracao_Banco_de_Notas_v1.0.docx`
- `Plano_Mestre_antigo_antes_do_dossie.Reconstrucao_Planilha_Banco_de_Notas_v0.3.docx`
- `Modelo_Professor_Nina_2026_Homologado.xlsx`
- `NOTAS NINA 2026.xlsb`
- `NOTAS ALANNA 2026.xlsb`
- `RELAÇÃO 2026.xlsb`

Nenhum desses arquivos reais deve ser copiado para o Git.

### Regra crítica de uso

`NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` são exclusivamente golden masters privados externos. Não são templates oficiais e não podem entrar no runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição.

O produto deve gerar uma instância nova de um modelo genérico limpo para qualquer professor. Nina e Alanna servem apenas para provar regressão privada e generalização complementar. Nenhuma regra de produção pode depender de nomes, número/ordem de abas, turmas, disciplinas, células ou outras particularidades desses arquivos.

Leia e preserve `docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md` antes de tocar em conversor, importador, gerador, fixtures, migrations, D1 ou SharePoint do Banco.

## Decisão de rota

Definitivo: `/banco-de-notas` e subrotas path-based.

Não usar `#bancodenotas` como rota definitiva. O shell antigo pode manter os hashes atuais até refatoração independente.

## Decisão de fonte

Configuração por ano letivo com override por professor:

- `legacy_import`
- `linked_teacher_model`

Sem merge silencioso. `SourceAssignment` define autoridade e vigência.

## Decisão de persistência

- D1: dados transacionais estruturados e auditoria do Banco.
- SharePoint/OneDrive: arquivos e versões.
- Graph: operações Microsoft pelo backend.
- Queues: jobs pesados/assíncronos.
- Add-in: baixa latência do novo modelo.

Não promover `NOTAS_POC_*` a banco oficial.

## Primeiro bloco de implementação

> Estado em 25/08/2026: este bloco foi implementado no PR #52. A única pendência operacional é provisionar os recursos externos de homologação; nenhum deploy de produção foi feito.

Faça em uma única fatia grande:

1. Atualize specs globais do Centro para retirar a integração do primeiro sistema da lista `out` e incorporar o Banco de forma explícita, sem enfraquecer invariantes atuais.
2. Adicione bindings D1 em ambiente local/homologação e migrations iniciais para `data_sources`, `source_assignments`, `school_years`, `teachers`, `teacher_assignments`, `import_jobs`, `teacher_models`, `cell_mappings`, `grade_events`, `grade_snapshots`, `rulesets`, `relationship_snapshots`, `share_audit`, `reconciliation_runs`, `audit_events`.
3. Modele constraints de idempotência/sequence/source authority antes de UI.
4. Adicione capabilities `grades.*` na política atual e testes allow/deny.
5. Adicione manifesto `banco-de-notas` em `server/modules/contracts.ts`, `baseRoute=/banco-de-notas`, health `/api/banco-notas/health`.
6. Crie registro idempotente para `PLATAFORMA_MODULOS` somente por mecanismo de infra seguro; não faça a lista ser fonte da autorização.
7. Implemente `GET /api/banco-notas/health` e APIs iniciais de Fonte/ano.
8. Implemente roteamento path-based do módulo e shell HeroUI nativo.
9. Implemente `Configurações > Fonte` de ponta a ponta com D1, inclusive overrides por professor e SourceAuthority.
10. Garanta loading/empty/error/permission-denied/mobile/reduced-motion.
11. Proíba por teste imports shadcn/ReUI e qualquer retorno de Ambient Constellation.
12. Execute `npm run verify`, CI e browser QA.
13. Atualize `BANCO_NOTAS_IMPLEMENTATION_STATE.md`, este handoff e `VERIFICATION.md`.

### Comando único de provisionamento D1 de homologação

```powershell
powershell -ExecutionPolicy Bypass -File infra/banco-notas/cloudflare/provision-homologation.ps1
```

O comando autentica o Wrangler quando necessário, cria `banco-notas-homologation`, grava o binding somente em configuração local ignorada e aplica as migrations. Não cria recurso de produção nem seleciona plano pago.

## Bloco seguinte

Depois da base Fonte estar funcional:

- migrar OpenAPI/AsyncAPI;
- implementar grade-events transacional;
- migrar/adaptar add-in;
- implementar storage/share/reconcile Graph;
- homologar uma instância do modelo genérico com `SyncEnabled=false`;
- executar regressão Nina/Alanna apenas como entrada privada externa, sem incorporá-las ao produto;
- testar ida, stale, reversão, reconciliação e concorrência;
- só depois preparar piloto.

## Regras para não regredir

- não reconstruir autenticação/BFF;
- não criar segundo design system;
- não reintroduzir Ambient;
- não colocar dados reais no Git;
- não usar SharePoint como event store definitivo;
- não usar GitHub no runtime;
- não acumular wrappers/facades/código de tentativa;
- não ativar sync em massa;
- não apagar o caminho legado antes de provar regressão equivalente.
- não transformar golden master privado em template, fixture, seed, migration, fallback ou dependência de runtime.
