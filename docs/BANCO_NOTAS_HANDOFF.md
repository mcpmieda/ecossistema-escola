# Banco de Notas — Handoff

Data: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

## Ponto exato de retomada

A fundação App Factory está consolidada e a homologação D1 remota deixou de ser bloqueio.

Evidência D1:

- database exclusivo: `banco-notas-homologation`;
- workflow `Banco de Notas D1 homologation`;
- run `32973613431` / execução `#12` — **success**;
- commit validado remotamente: `7f13d6b85c18296ae0fa005dadb4000ec63515e5`;
- Wrangler `4.125.0`;
- provisionamento/migrations — success;
- smoke principal — success;
- smoke migration `0006`/analysis profiles — success.

Leia a evidência completa em `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md`.

## D1

Migrations aplicadas e validadas remotamente:

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`.

O provisionador usa Wrangler atual: `d1 list --json`, criação sem `--json`, nome exato `banco-notas-homologation`, UUID validado e conjunto de migrations travado em `0001`–`0006`.

O smoke principal comprovou no D1 real defaults seguros, `sync_enabled=0`, autoridade, cross-year, state machine, análise obrigatória, provenance e históricos append-only. O smoke de profiles comprovou a migration `0006` e as regras de persistência/compatibilidade dos analysis profiles.

## Importação XLSX

O analyzer XLSX concreto já está implementado. Não retomar a partir da premissa antiga de que ele falta.

Componentes centrais:

- `server/banco-notas/ooxml-zip.ts`;
- `server/banco-notas/xlsx-legacy-analyzer.ts`;
- `server/banco-notas/import-analysis.ts`;
- `server/banco-notas/d1-import-analysis-repository.ts`;
- `server/banco-notas/d1-import-analysis-profile-repository.ts`;
- `server/banco-notas/workbook-pipeline.ts`;
- `server/banco-notas/xlsx-workbook-serializer.ts`.

Pipeline atual:

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

O modelo e o arquivo gerado continuam genéricos, sem regras por professor, turma, aba, disciplina ou célula privada.

### XLSB

XLSB permanece fail-closed. Não existe parser XLSB cloud comprovado e não deve ser improvisado.

## Golden masters

Nina/Alanna são somente evidência privada externa. Nunca usar como:

- template oficial;
- seed/migration;
- fixture pública;
- fallback de runtime;
- dado D1;
- regra especial de parser/serializer;
- arquivo distribuído no produto final.

## Grade-events

`server/banco-notas/d1-grade-event-store.ts` já usa `db.batch()` para gravar evento + snapshot e contém validações de fonte/modelo/ano/ambiente/sync/autoridade/mapping.

Próximo bloco prioritário: **provar atomicidade usando binding D1 real/compatível**, incluindo o caso em que a segunda statement falha e a primeira não pode permanecer parcialmente gravada.

O add-in público continua bloqueado.

## Round-trip XLSX

Analyzer e serializer OOXML reais já existem e possuem testes independentes. O próximo avanço deve reforçar o round-trip completo e provar preservação das invariantes canônicas entre análise, transformação, apresentação e serialização.

Compatibilidade operacional com Excel/Graph/SharePoint real ainda não foi homologada.

## Graph / SharePoint

- D1 continua sendo a fonte estruturada/transacional;
- SharePoint/OneDrive ficam para arquivos/modelos/versões;
- Graph permanece backend-only;
- `TeacherModelGraphGateway` continua abstrato;
- nenhuma conexão Graph/SharePoint real deve ser ativada nesta retomada sem o bloco específico de integração.

É seguro preparar tipos, contratos, configuração, validação fail-closed e testes sintéticos.

## Entra / add-in

O validador bearer Entra já existe e é fail-closed.

O endpoint público continua bloqueado enquanto não existirem audience e delegated scope reais. Não preencher valores fictícios e não liberar o endpoint apenas para avançar testes.

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
- não fazer merge ou deploy de produção.

## Ordem recomendada de leitura

1. `AGENTS.md` e `.app-factory.json`;
2. `docs/BANCO_NOTAS_IMPLEMENTATION_STATE.md`;
3. `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md`;
4. `server/banco-notas/d1-grade-event-store.ts`;
5. `server/banco-notas/xlsx-legacy-analyzer.ts`;
6. `server/banco-notas/xlsx-workbook-serializer.ts`;
7. `server/banco-notas/workbook-pipeline.ts`;
8. `server/banco-notas/import-analysis.ts`;
9. migrations `0001`–`0006`;
10. OpenAPI/AsyncAPI + semantic/verification specs.

## Próxima sequência segura

1. atomicidade real via binding D1;
2. round-trip XLSX;
3. preparação Graph/SharePoint sem ativação externa;
4. preparação Entra/add-in sem liberar endpoint;
5. browser QA somente quando houver ambiente navegável e automação estiver autorizada.
