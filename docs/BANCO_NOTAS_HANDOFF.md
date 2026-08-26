# Banco de Notas — Handoff

Data: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **Fase 1 consolidada, grade-events interno e núcleo de importação/modelo genérico endurecido; permanece draft, sem merge e sem produção.**

## Evidência funcional mais recente

Head funcional: `fb1ed728183a048681109d3d0134921295324a7f`.

Workflow `32919405343` / run `#545` — **success**:

- segurança de GitHub Actions — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- **203/203 testes em 35 arquivos** — success;
- build — success;
- deploy production — skipped;
- recovery pós-deploy — skipped.

O warning histórico de chunk JavaScript acima de 500 kB permanece não bloqueador.

## Avanço mais recente

- bearer Entra continua fail closed e o endpoint público do add-in continua desconectado enquanto faltam audience/scope reais;
- `.env.example` agora lista, sem valores, `BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE`;
- import jobs passaram a suportar blockers reais em `analyzed` e resolução auditável antes de prosseguir;
- findings originais permanecem append-only;
- a migration `0004_banco_notas_import_finding_resolution.sql` cria stream separado, também append-only, para resolução de finding;
- cada resolução registra finding, operador, motivo e horário e só pode ocorrer uma vez;
- progressão para `generated` ou além fica bloqueada enquanto houver `error` não resolvido;
- state re-entry no mesmo estado é bloqueado no storage para reduzir corrida concorrente;
- OpenAPI de importação/modelos foi atualizado para `0.2.0` com `id`, `resolvedAt` e `resolvedFindingIds`;
- orquestração Graph agora compensa falhas: revoga permissão e remove arquivo quando uma operação falha depois de armazenar/compartilhar;
- falha da própria compensação é explicitamente promovida e auditada, não ocultada.

## Comece por aqui

1. leia `AGENTS.md` e `.app-factory.json`;
2. leia `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
3. leia `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`;
4. leia `docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md`;
5. leia `specs/banco-notas/semantic-contract.json`, `semantic-assurance.json` e `verification-plan.json`;
6. leia `api/banco-notas-grade-events-v1.openapi.yaml`, `api/banco-notas-grade-events-v1.asyncapi.yaml` e `api/banco-notas-models-v1.openapi.yaml`;
7. revise migrations `0001` a `0004` antes de qualquer D1 remoto;
8. revise `server/banco-notas/d1-repository.ts`, `import-jobs.ts`, `generic-model.ts`, `grade-events.ts`, `d1-grade-event-store.ts` e `teacher-model-graph.ts`;
9. leia `VERIFICATION.md`, `PROJECT_STATE.md` e `ARCHITECTURE.md` para preservar o Centro existente.

## Decisões duráveis

- repositório definitivo: `mcpmieda/ecossistema-escola`;
- Banco de Notas é módulo nativo do Centro, não outro deploy/repositório;
- rota `/banco-de-notas` e subrotas path-based;
- API administrativa `/api/banco-notas/v1/*`;
- UI HeroUI React v3 nativa;
- shadcn, ReUI, facades e Ambient Constellation são proibidos no módulo;
- D1 é estado transacional estruturado;
- SharePoint/OneDrive são arquivos e versões;
- Graph somente no backend;
- GitHub nunca é runtime;
- fontes `legacy_import` e `linked_teacher_model` são explícitas e não se misturam silenciosamente;
- default por ano + override docente;
- autoridade possui vigência, operador, motivo e auditoria;
- `SyncEnabled=false` por padrão;
- ausência de lançamento é diferente de zero;
- snapshot de nota é `(gradeKey, field)`;
- reutilização incompatível da chave de idempotência é conflito;
- stale permanece auditável sem regredir snapshot;
- add-in só será exposto com bearer Entra/audience/scope próprios, nunca cookie administrativo improvisado.

## Migrations disponíveis

- `0001_banco_notas_foundation.sql`;
- `0002_banco_notas_cross_year_integrity.sql`;
- `0003_banco_notas_import_job_state_machine.sql`;
- `0004_banco_notas_import_finding_resolution.sql`.

Ainda não foram aplicadas num D1 remoto.

A migration `0004` não modifica o finding original para marcá-lo como resolvido. Ela cria `import_finding_resolutions`, preservando ambos os históricos como append-only. O campo legado `import_findings.resolved_at` do schema inicial não deve ser usado como caminho de mutação; a resolução canônica passa pelo stream separado.

## Import jobs

State machine:

```text
draft
→ analyzed
→ generated
→ validated
→ ready_to_share
→ shared
→ connected
```

`failed` é terminal permitido a partir dos estados intermediários previstos.

Regra de blockers:

- `draft → analyzed` pode registrar `error` findings;
- o job permanece revisável em `analyzed`;
- a transição seguinte pode resolver findings existentes, com motivo auditável;
- `generated` e estados posteriores exigem zero `error` findings não resolvidos;
- não pular gates;
- não resolver finding de outro job, inexistente ou já resolvido;
- mesma transição concorrente não deve ser aceita silenciosamente.

## Pipeline genérico

Fluxo atual:

```text
LegacyIntermediateModel
→ RelationshipResolution / snapshot
→ TransformationPlan
→ GenericModelInstance
```

Já existem contracts, planner, geração determinística e fixtures sintéticas. A instância nasce em `homologation` com `syncEnabled=false`.

Ainda falta o analisador/serializador XLSX cloud real. Não declarar conversão XLSB cloud. O bridge COM legado é apenas ponte de migração/regressão.

Antes do serializador definitivo, revisar o layout físico atualmente determinado pelo gerador: colunas de nota e ordenação de alunos precisam virar definição versionada/ordem escolar estável, e não convenção permanente escondida no código.

## Grade-events e Entra

O núcleo interno de grade-events está implementado e testado, mas o roteamento público do add-in permanece propositalmente desligado.

O validador bearer já cobre RS256/JWKS/issuer/tenant/audience/scope/lifetime, incluindo indisponibilidade do provedor. Audience e delegated scope reais ainda não foram provisionados.

Quando o add-in definitivo for criado, usar access token para a API própria, sem client secret no cliente. Não reusar o cookie administrativo.

## Graph

`TeacherModelGraphGateway` continua sendo boundary abstrato. Não existe adapter Graph real conectado.

A orquestração agora exige operações de compensação:

- `revokeShare` para permissão criada;
- `remove` para arquivo armazenado;
- auditoria da compensação;
- erro explícito se a compensação falhar.

Quando o adapter real for implementado, não remover esses gates e não fazer compartilhamento anônimo ou em massa.

## Golden masters privados

`NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` são golden masters externos de homologação.

Eles não são templates e não podem entrar em Git, runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição. Nenhuma regra do produto pode depender de nomes, abas, turmas, componentes ou células desses arquivos.

## O que a evidência atual NÃO prova

- SQLite não substitui Cloudflare D1 remoto;
- testes estruturais não substituem browser QA real;
- não existe D1 de homologação provisionado nesta evidência;
- não houve aplicação real no SharePoint;
- não houve chamada Graph real;
- não houve app registration/audience/scope do add-in provisionado;
- não existe parser/serializador XLSX cloud conectado;
- não houve sync end-to-end;
- não houve deploy do Banco de Notas.

## Bloqueios externos observados

- Wrangler sem autenticação/token/account disponível;
- `az`/`m365` e configuração administrativa Microsoft indisponíveis;
- sem audience/scope Entra do add-in;
- sem preview navegável de homologação conectado a D1 real.

## Próximo marco operacional

Quando houver credenciais externas:

1. provisionar/reutilizar somente `banco-notas-homologation`;
2. aplicar migrations `0001` + `0002` + `0003` + `0004`;
3. executar smoke remoto sintético para defaults, cross-year, idempotência, state machine, resolução append-only e rollback;
4. provisionar audience/delegated scope Entra próprios;
5. conectar grade-events público somente depois do gate bearer real;
6. conectar analisador/serializador XLSX cloud;
7. implementar adapter Graph real e aplicar SharePoint de homologação;
8. testar store/share/reconcile + compensação no Microsoft real;
9. executar browser QA desktop/mobile/deep-link/refresh;
10. executar regressão privada externa dos golden masters;
11. preparar piloto individual com sync desligado até reconciliação.

## Regras para não regredir

- não reconstruir Cloudflare/Entra/BFF/Graph/SharePoint existentes;
- não criar segundo design system;
- não inserir golden masters ou PII no Git;
- não usar GitHub como runtime;
- não acumular wrappers, overrides temporários, CSS duplicado ou código morto;
- não ativar sync em massa;
- não expor add-in sem bearer Entra próprio;
- não alegar D1/Graph/SharePoint/browser QA real sem execução real;
- não fazer merge, retirar draft ou deploy de produção sem autorização humana explícita.
