# Banco de Notas — Handoff

Data: 27/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

## Ponto exato de retomada

A fundação e a integração de arquivos Microsoft estão consolidadas.

O ciclo abaixo foi comprovado e limpo:

```text
professor destinatário
→ Excel Online
→ SharePoint
→ Microsoft Graph
→ analyzer OOXML do Banco de Notas
```

A nota sintética em `B2` foi alterada de ausência para `8,5`; o backend reanalisou `8.5` no mesmo mapping. A permission foi revogada, o XLSX foi removido e somente a pasta de homologação permaneceu.

**Não retomar recriando share, arquivo ou homologação M365.** Esse gate já está fechado.

Checkpoint: `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`.

Evidência completa: `docs/BANCO_NOTAS_M365_SHARE_AND_EXCEL_HOMOLOGATION_2026-08-26.md`.

## Próximo bloco prioritário

O próximo grande bloco seguro é:

1. auditar app registrations Entra existentes;
2. definir/reutilizar a app adequada ao add-in;
3. homologar audience e delegated scope reais;
4. provar bearer e ownership end-to-end;
5. manter o add-in não publicado;
6. depois comprovar atomicidade no binding D1 real de homologação.

Se esses gates fecharem, avançar módulos funcionais.

## Baseline final deste bloco

Head de código fechado:

`a539417e09740db54c4f97ebbb62acc741bd0de2`

CI:

- run `33078535334` / #884 — **success**;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **302/302 em 55 arquivos**;
- build — success;
- Actions security — success;
- produção/recovery — skipped.

D1 remoto:

- run `33078530136` / #19 — **success**;
- `banco-notas-homologation` reutilizado;
- migrations `0001`–`0007`;
- core smoke — success;
- profiles smoke — success;
- sync final `0`;
- workflow sem OID/UPN pessoal.

## D1 remoto

Database exclusivo:

`banco-notas-homologation`

Migrations comprovadas:

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`;
7. `0007_banco_notas_teacher_entra_identity.sql`.

A `0007` protege identidade Entra, unicidade e locks durante sync.

O workflow padrão foi limpo da preparação de uma pessoa específica. Para uma futura homologação conscientemente autorizada, existe script manual protegido; não recolocar OID/UPN em YAML.

## Importação e modelo genérico

Analyzer e serializer OOXML são reais.

```text
XLSX legado
→ analyzer OOXML
→ LegacyIntermediateModel
→ relationships
→ TransformationPlan
→ GenericModelInstance
→ apresentação canônica
→ XLSX OOXML
```

O produto definitivo continua sendo um **modelo genérico limpo**, independente de professor, turma, aba, disciplina ou célula privada.

Os **golden masters privados externos** continuam somente como evidência privada. Não são seed, fixture pública, template oficial, fallback, runtime ou arquivo de distribuição.

XLSB permanece fail-closed.

## Correções permanentes para Excel Online

`server/banco-notas/xlsx-workbook-serializer.ts` agora garante:

- ordem crescente de colunas;
- ordem crescente de células;
- `<bookViews>` coerente com `workbookViewId=0`.

O workbook passou a abrir no Excel Online sem reparação.

O analyzer passou a expor `sourceValue` e distingue zero de ausência.

## Gate de integridade SharePoint/Excel

`server/banco-notas/xlsx-sharepoint-integrity.ts` trata:

- pacote byte-identical;
- normalização server-managed do SharePoint;
- pacote editado pelo Excel.

Permite somente mudanças justificadas e falha fechado em:

- alteração indevida de worksheets;
- remoção de partes originais;
- adição inesperada em `xl/`;
- macros/VBA;
- relações externas;
- modelo/mapping/célula/valor inesperados.

Não voltar para comparação cega do hash do ZIP inteiro após SharePoint.

## Evidência M365 operacional

Boundary:

`CENTROADMIN → ARQUIVOS_PLATAFORMA → BANCO_NOTAS_HOMOLOGACAO`

Runs:

- `33003875460` — readiness OIDC/Entra/Sites.Selected;
- `33025586408` — storage/download/reanálise/cleanup;
- `33026888705` — share individual;
- `33073736978` — serializer editável;
- `33074034916` — substituição controlada;
- `33075802785` — Excel → Graph → analyzer;
- `33076985566` — revogação e remoção final.

Edição comprovada:

- conta: `GUI@escolaieda.com`;
- worksheet: `Turma Sintética - Matemática`;
- field: `NotaT1`;
- célula: `B2`;
- anterior: nulo;
- novo/reanalisado: `8.5`;
- sync: `0`.

## Distinção de IDs

- D1 `teacherModelId`: `homologation-share-model-20260826`;
- D1 `teacherId`: `homologation-share-teacher-20260826`;
- workbook `modelId`: `71111111-1111-4111-8111-111111111111`.

Não usar o `modelId` do workbook como chave da linha `teacher_models`.

## Share e cleanup

O ensaio provou:

- destinatário individual por OID;
- role `write`;
- login obrigatório;
- nenhum `Anyone`;
- nenhum link anônimo;
- nenhuma organização inteira;
- nenhum grupo;
- permission revogada;
- XLSX removido.

O Excel Online manteve lock WOPI e o Graph retornou `423`. O gateway ganhou opção explícita `bypassSharedLock`; somente essa remoção envia `Prefer: bypass-shared-lock`.

Não usar o header indiscriminadamente.

## Código temporário encerrado

Removidos no commit `a539417e09740db54c4f97ebbb62acc741bd0de2`:

- job M365 one-shot da CI;
- teste externo temporário;
- OID/UPN reais do workflow D1;
- preparação automática para share.

Preservados:

- serializer/analyzer corrigidos;
- gate de integridade;
- gateway Graph;
- bypass opt-in;
- unit tests permanentes;
- evidência documental.

## Entra / add-in

Já existe validador fail-closed para:

- RS256/JWKS;
- issuer;
- tenant;
- audience;
- scope;
- lifetime.

Já existe ownership D1:

`teacherModelId ↔ teacher ↔ entraObjectId`

Ainda faltam valores reais e homologados para:

- `BANCO_NOTAS_ADDIN_AUDIENCE`;
- `BANCO_NOTAS_ADDIN_SCOPE`.

Regras para o próximo agente:

- auditar antes de criar;
- reutilizar app existente se adequada;
- menor privilégio;
- sem consentimento amplo desnecessário;
- sem publicação do add-in;
- endpoint público continua bloqueado até o gate completo;
- testar tenant/audience/scope/OID/ownership negativos.

## Grade-events e binding D1

O store usa um único `D1Database.batch()` para evento + snapshot e possui prova local de rollback.

Falta a prova no binding real de homologação.

Somente criar runtime de homologação se:

- claramente separado de produção;
- com acesso mínimo;
- sem endpoint público permanente;
- com cleanup comprovado.

## Módulos funcionais seguintes

Após Entra/add-in e binding D1:

1. Acompanhamento;
2. Alunos;
3. Turmas;
4. Professores;
5. Pesquisa global;
6. depois Conselho de Classe e Boletins.

## Estado de recursos externos

- pasta `BANCO_NOTAS_HOMOLOGACAO`: permanece;
- XLSX do ensaio: ausente;
- permission individual do ensaio: ausente;
- jobs one-shot: ausentes;
- sync: `0`;
- produção: inalterada.

## Stash histórico

Foi registrado anteriormente:

`stash@{0}: safety-before-recover-pr52-2026-08-26`

Não aplicar automaticamente. Auditar antes e restaurar somente algo comprovadamente ausente do branch atual.

## Decisões que não podem regredir

- D1 é a fonte estruturada/transacional;
- SharePoint/OneDrive são arquivos/modelos;
- Graph é backend-only;
- sync nasce e permanece desligado;
- zero é diferente de ausência;
- fontes não se misturam silenciosamente;
- layout/mappings são versionados;
- `studentPosition` é canônico;
- `_BancoNotas` é aba interna reservada;
- XLSB continua fail-closed;
- golden masters privados não entram no produto;
- PR #52 permanece open + draft;
- não fazer merge nem deploy sem decisão humana explícita.

## Ordem recomendada de leitura

1. `AGENTS.md` e `.app-factory.json`;
2. `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`;
3. `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
4. `docs/BANCO_NOTAS_M365_SHARE_AND_EXCEL_HOMOLOGATION_2026-08-26.md`;
5. `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md`;
6. `server/banco-notas/xlsx-workbook-serializer.ts`;
7. `server/banco-notas/xlsx-sharepoint-integrity.ts`;
8. `server/banco-notas/xlsx-legacy-analyzer.ts`;
9. `server/banco-notas/teacher-model-graph-gateway.ts`;
10. `server/banco-notas/d1-addin-authorizer.ts`;
11. `server/auth/entra-access-token.ts`.
