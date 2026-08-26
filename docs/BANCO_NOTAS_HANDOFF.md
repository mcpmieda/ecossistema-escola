# Banco de Notas — Handoff

Data: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **Fase 1 consolidada, grade-events interno e pipeline de importação/modelo genérico endurecido; permanece draft, sem merge e sem produção.**

## Evidência funcional mais recente

Base funcional verificada: `88ea66896271408d57343c046d81b5d042b7810f`.

Workflow `32924002605` / run `#600` — **success**:

- segurança de GitHub Actions — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- **229/229 testes em 39 arquivos** — success;
- build — success;
- deploy production — skipped;
- recovery pós-deploy — skipped.

O warning histórico de chunk JavaScript acima de 500 kB permanece não bloqueador.

## Avanço mais recente

- criada `0005_banco_notas_import_analysis.sql`;
- `draft → analyzed` não é mais uma transição administrativa genérica;
- o pipeline backend valida hash/formato/ano do job e tamanho/hash dos bytes antes de executar analyzer;
- a análise verificada é persistida em `import_analyses`, com um artefato imutável por import job;
- D1/SQLite rejeita `analyzed` sem artefato de análise;
- análise, findings, auditoria e mudança para `analyzed` são persistidos atomicamente;
- retry idempotente de uma análise idêntica não duplica histórico; retry incompatível é conflito;
- falha do analyzer deixa o job sem avanço;
- `POST /v1/import-jobs/{jobId}` rejeita `targetState=analyzed` e direciona esse gate ao pipeline verificado;
- OpenAPI de importação/modelos foi sincronizado para `0.3.0` e exclui `analyzed` dos targets administrativos documentados;
- bearer Entra continua fail closed e o endpoint público do add-in continua desconectado enquanto faltam audience/scope reais;
- `.env.example` lista, sem valores, `BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE`;
- import jobs suportam blockers reais em `analyzed` e resolução auditável antes de prosseguir;
- findings originais permanecem append-only e `0004_banco_notas_import_finding_resolution.sql` mantém stream separado de resolução;
- progressão para `generated` ou além fica bloqueada enquanto houver `error` não resolvido;
- state re-entry no mesmo estado é bloqueado no storage;
- orquestração Graph compensa falhas com revoke de permissão e remoção do arquivo, promovendo e auditando falha de compensação;
- o modelo genérico possui layout físico explicitamente versionado e posição escolar canônica via `studentPosition`;
- boundaries `LegacyWorkbookAnalyzer` e `GenericWorkbookSerializer` permanecem obrigatórios;
- analyzer sem suporte explícito a XLSB falha fechado; **não existe parser XLSB cloud declarado**;
- metadata do XLSX serializado precisa corresponder exatamente à versão/layout/proveniência da instância genérica.

## Comece por aqui

1. leia `AGENTS.md` e `.app-factory.json`;
2. leia `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
3. leia `docs/BANCO_NOTAS_ARCHITECTURE_V1.md`;
4. leia `docs/BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md`;
5. leia `specs/banco-notas/semantic-contract.json`, `semantic-assurance.json` e `verification-plan.json`;
6. leia `api/banco-notas-grade-events-v1.openapi.yaml`, `api/banco-notas-grade-events-v1.asyncapi.yaml` e `api/banco-notas-models-v1.openapi.yaml`;
7. revise migrations `0001` a `0005` antes de qualquer D1 remoto;
8. revise `server/banco-notas/d1-repository.ts`, `d1-import-analysis-repository.ts`, `import-jobs.ts`, `import-analysis.ts`, `generic-model.ts`, `workbook-pipeline.ts`, `grade-events.ts`, `d1-grade-event-store.ts` e `teacher-model-graph.ts`;
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
- add-in só será exposto com bearer Entra/audience/scope próprios, nunca cookie administrativo improvisado;
- `draft → analyzed` exige análise backend verificada e artefato persistido; não reabrir esse gate por endpoint administrativo genérico;
- layout físico do modelo é versionado; não reintroduzir mapa de colunas hardcoded no gerador/serializador;
- posição escolar do aluno é dado canônico da correspondência e não ordenação técnica por UUID;
- parser/serializer concreto deve entrar por boundary explícito, com hash/proveniência verificados; não acoplar biblioteca de workbook diretamente ao domínio.

A produção continua obrigada a gerar um **modelo genérico limpo**, sem especialização por professor, workbook, aba, turma, disciplina ou célula de golden master.

## Migrations disponíveis

- `0001_banco_notas_foundation.sql`;
- `0002_banco_notas_cross_year_integrity.sql`;
- `0003_banco_notas_import_job_state_machine.sql`;
- `0004_banco_notas_import_finding_resolution.sql`;
- `0005_banco_notas_import_analysis.sql`.

Ainda não foram aplicadas num D1 remoto.

`0004` cria `import_finding_resolutions`, preservando finding e resolução como históricos append-only separados.

`0005` cria `import_analyses`, exige proveniência coerente com o import job, bloqueia update/delete e impede a mudança de estado para `analyzed` quando o artefato não existe.

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

A diferença crítica agora é que `draft → analyzed` é realizado por `analyzeImportJob`, não pelo endpoint administrativo genérico.

Fluxo do gate de análise:

```text
job draft
→ verifica sourceHash/sourceFormat/schoolYear
→ analyzeLegacyWorkbook verifica bytes/analyzer
→ D1ImportAnalysisRepository.commitImportAnalysis
→ import_analyses + findings + audit + state=analyzed no mesmo batch
```

Regra de blockers:

- a análise verificada pode registrar `error` findings e concluir em `analyzed`;
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

O layout físico é parte versionada da definição. A posição do aluno vem da correspondência canônica; o gerador apenas projeta essa posição na linha física.

## Boundary de workbook

Arquivos principais:

- `shared/banco-notas-workbook-pipeline.ts`;
- `server/banco-notas/workbook-pipeline.ts`;
- `server/banco-notas/import-analysis.ts`;
- `shared/banco-notas-import-analysis.ts`;
- `server/banco-notas/d1-import-analysis-repository.ts`;
- `tests/banco-notas-workbook-pipeline.test.ts`;
- `tests/banco-notas-import-analysis.test.ts`;
- `tests/banco-notas-d1-import-analysis-repository.test.ts`.

O boundary de análise exige metadata de origem, valida tamanho/hash antes de executar o adapter, exige suporte explícito ao formato, preserva `analyzerId` e confere se o `LegacyIntermediateModel` continua ligado à mesma origem/ano/formato. O adapter recebe uma cópia dos bytes e mutação dessa cópia invalida a execução.

O boundary de serialização aceita somente metadata de artefato XLSX compatível com a instância genérica, verifica tamanho/hash, prende o artefato a `modelId`, `definitionVersion`, `layoutVersion`, `mappingVersion`, `sourceHash` e `relationshipSnapshotId`, preserva `serializerId` e devolve uma cópia dos bytes verificados.

Ainda faltam os adapters cloud reais. Não declarar conversão XLSB cloud. O bridge COM legado é apenas ponte de migração/regressão. O serializer XLSX futuro deve consumir o layout versionado existente, não criar uma segunda tabela de colunas ou regra de ordenação.

## Grade-events e Entra

O núcleo interno de grade-events está implementado e testado, mas o roteamento público do add-in permanece propositalmente desligado.

O validador bearer cobre RS256/JWKS/issuer/tenant/audience/scope/lifetime, incluindo indisponibilidade do provedor. Audience e delegated scope reais ainda não foram provisionados.

Quando o add-in definitivo for criado, usar access token para a API própria, sem client secret no cliente. Não reusar o cookie administrativo.

## Graph

`TeacherModelGraphGateway` continua sendo boundary abstrato. Não existe adapter Graph real conectado.

A orquestração exige operações de compensação:

- `revokeShare` para permissão criada;
- `remove` para arquivo armazenado;
- auditoria da compensação;
- erro explícito se a compensação falhar.

Quando o adapter real for implementado, não remover esses gates e não fazer compartilhamento anônimo ou em massa.

## Golden masters privados

`NOTAS NINA 2026.xlsb`, `NOTAS ALANNA 2026.xlsb` e `Modelo_Professor_Nina_2026_Homologado.xlsx` são **golden masters privados externos** de homologação.

Eles não são templates e não podem entrar em Git, runtime, D1, migrations, fixtures públicas, bundle, SharePoint definitivo ou distribuição. Nenhuma regra do produto pode depender de nomes, abas, turmas, componentes ou células desses arquivos.

## O que a evidência atual NÃO prova

- SQLite não substitui Cloudflare D1 remoto;
- testes estruturais não substituem browser QA real;
- não existe D1 de homologação provisionado nesta evidência;
- não houve aplicação real no SharePoint;
- não houve chamada Graph real;
- não houve app registration/audience/scope do add-in provisionado;
- não existe analyzer/serializer cloud real conectado;
- não existe parser XLSB cloud comprovado;
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
2. aplicar migrations `0001` + `0002` + `0003` + `0004` + `0005`;
3. executar smoke remoto sintético para defaults, cross-year, idempotência, state machine, resolução append-only, análise persistente obrigatória e rollback;
4. provisionar audience/delegated scope Entra próprios;
5. conectar grade-events público somente depois do gate bearer real;
6. implementar/conectar analyzer XLSX cloud e serializer XLSX real pelos boundaries existentes; suporte XLSB cloud exige adapter próprio comprovado;
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
- não reabrir `draft → analyzed` como transição administrativa sem artefato de análise verificada;
- não reintroduzir mapa físico de colunas hardcoded ou ordenação por UUID no gerador/serializador;
- não acoplar parser/serializer concreto diretamente ao domínio, contornando o boundary de hash/proveniência;
- não ativar sync em massa;
- não expor add-in sem bearer Entra próprio;
- não alegar D1/Graph/SharePoint/browser QA/parser XLSB cloud real sem execução real;
- não fazer merge, retirar draft ou deploy de produção sem autorização humana explícita.
