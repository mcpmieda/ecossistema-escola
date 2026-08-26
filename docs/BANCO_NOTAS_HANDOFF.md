# Banco de Notas — Handoff

Data: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

## Ponto exato de retomada

A fundação está consolidada. O D1 remoto de homologação está validado até a migration `0007`; o adapter Graph backend-only foi preparado e possui round-trip XLSX sintético real até download/hash/reanálise, mas Microsoft/Graph/SharePoint externos ainda não foram homologados por ausência de sessão/credencial administrativa apropriada no ambiente anterior.

Checkpoint operacional: `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`.

## D1 remoto

Database exclusivo: `banco-notas-homologation`.

Evidência mais recente do bloco de identidade:

- workflow `Banco de Notas D1 homologation`;
- run `32981705701` — **success**;
- commit validado: `2467240b53bf3bbc5996905ba940b544cb35f266`;
- CI correspondente `32981711631` — **success**;
- produção skipped;
- sync final desligado.

Migrations comprovadas:

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`;
7. `0007_banco_notas_teacher_entra_identity.sql`.

A `0007` protege o futuro sync com identidade institucional. O smoke remoto comprovou falta de OID, unicidade, lock de troca de OID e lock de inativação durante sync temporário, retornando ao final para `sync_enabled=0`.

## Importação XLSX e modelo genérico

O analyzer e o serializer OOXML XLSX são concretos. Não retomar a partir da hipótese antiga de que faltam.

Fluxo de produto:

```text
XLSX legado
→ analyzer OOXML real
→ LegacyIntermediateModel
→ relationship resolution
→ TransformationPlan
→ GenericModelInstance
→ apresentação canônica
→ XLSX OOXML novo
```

O produto definitivo continua sendo um **modelo genérico limpo**, independente de professor, turma, aba, disciplina ou célula privada.

XLSB permanece fail-closed.

## Golden masters

Os **golden masters privados externos** continuam somente como evidência privada de homologação/regressão. Não são template oficial, seed, fixture pública, fallback, runtime, dado D1 ou arquivo de distribuição.

Nunca introduzir regra de produção dependente de arquivo/pessoa específica.

## Graph / SharePoint

O adapter concreto está em `server/banco-notas/teacher-model-graph-gateway.ts` e continua backend-only.

Estado atual:

- upload XLSX binário;
- compartilhamento individual autenticado;
- verificação do destinatário por Entra OID;
- metadata separada do download;
- download binário do arquivo armazenado;
- SHA-256 local calculado sobre os bytes realmente baixados;
- reanálise OOXML como gate antes de auditar sucesso;
- compensação com revoke/delete após falhas;
- target resolvido por `BANCO_NOTAS_GRAPH_DRIVE_ID` e `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID`, ambos fail-closed se ausentes.

Existe teste integrado sintético:

```text
serializer XLSX real
→ boundary Graph
→ download
→ SHA-256
→ analyzer XLSX real
```

Isso comprova o contrato interno; **não equivale a homologação real do tenant Microsoft**.

Nenhuma chamada Graph/SharePoint real foi realizada neste bloco reconstruído.

## Entra / add-in

O validador bearer Entra já é fail-closed para assinatura, issuer, tenant, audience, scope e lifetime.

A migration `0007` e o authorizer D1 exigem ownership `teacherModelId ↔ teacher ↔ entraObjectId`.

O endpoint público continua bloqueado enquanto `BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` não possuírem valores reais e homologados. Não inventar valores para avançar teste.

## Grade-events

`D1GradeEventStore` usa um único `D1Database.batch()` para evento + snapshot e possui prova local de rollback quando a segunda operação falha.

A prova remota por binding D1 real ainda depende de runtime Worker/Pages de homologação autorizado. Não ampliar permissões ou criar runtime temporário inseguro só para produzir evidência.

## CI

Última baseline completamente verde anterior ao diff Graph reconstruído:

- run `32981711631` — success no commit `2467240`;
- formatting, lint, typecheck, semantic contract, testes e build aprovados;
- deploy/recovery de produção skipped.

A execução intermediária Graph `32985041877` falhou em typecheck porque um mock ainda não implementava o método novo `download`. Esse mock foi atualizado nos commits posteriores.

Antes de declarar o bloco Graph encerrado, exigir CI final no HEAD atual.

## Ordem recomendada de leitura

1. `AGENTS.md` e `.app-factory.json`;
2. `docs/BANCO_NOTAS_CODEX_CHECKPOINT.md`;
3. `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
4. `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md`;
5. `server/banco-notas/teacher-model-graph.ts`;
6. `server/banco-notas/teacher-model-graph-gateway.ts`;
7. `tests/banco-notas-teacher-model-graph-roundtrip.test.ts`;
8. `server/banco-notas/d1-addin-authorizer.ts`;
9. `server/banco-notas/d1-grade-event-store.ts`;
10. migrations `0001`–`0007`.

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
- analyzer/serializer não criam segunda regra paralela de células;
- XLSB continua fail-closed;
- golden masters privados não entram no produto;
- PR #52 permanece open + draft;
- não fazer merge ou deploy de produção sem autorização humana explícita.

## Próxima sequência segura

1. fechar CI do HEAD Graph reconstruído;
2. atualizar PR/evidências com a baseline final;
3. homologar Graph/SharePoint real somente quando houver autenticação Microsoft de homologação adequada;
4. preparar audience/scope Entra reais sem liberar add-in prematuramente;
5. comprovar binding D1 real quando houver runtime homologado;
6. avançar para os módulos funcionais do Banco de Notas e QA em ambiente navegável.
