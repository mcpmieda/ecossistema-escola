# Banco de Notas — Implementation State

Última atualização: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

Estado: **fundação consolidada + D1 remoto homologado + importação/análise OOXML XLSX reais + perfis de análise persistidos + modelo genérico + serialização XLSX real; sync continua desligado.**

## Evidência remota D1

Homologação comprovada em `banco-notas-homologation`:

- workflow `Banco de Notas D1 homologation`;
- execução `#12` / run `32973613431` — **success**;
- commit remotamente validado: `7f13d6b85c18296ae0fa005dadb4000ec63515e5`;
- Wrangler observado: `4.125.0`;
- provisionamento — success;
- smoke principal — success;
- smoke de analysis profiles/XLSX — success.

Evidência detalhada: `docs/BANCO_NOTAS_D1_HOMOLOGATION_VERIFICATION_2026-08-26.md`.

O provisionador usa o contrato atual do Wrangler: `d1 list --json`, `d1 create` sem `--json`, resolução por nome exato e aplicação remota das migrations. Não usa mais uma URI manual para localizar/criar D1.

## Fundação preservada

- módulo nativo do Centro em `/banco-de-notas`;
- API administrativa `/api/banco-notas/v1/*` e health `/api/banco-notas/health`;
- HeroUI React v3 nativo, sem Ambient Constellation;
- capabilities `grades.*` com autorização server-side;
- D1 como fonte estruturada/transacional;
- SharePoint/OneDrive reservados a arquivos/modelos e versões;
- Graph backend-only;
- fontes `legacy_import` e `linked_teacher_model`, com autoridade temporal auditável;
- `SyncEnabled=false` por padrão;
- integridade cross-year no storage;
- Origin oficial exigido nas mutações administrativas;
- golden masters privados isolados do produto.

## Migrations D1

O conjunto atual é exatamente:

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`.

As migrations `0001`–`0006` estão aplicadas e exercitadas no D1 remoto de homologação. Os smokes comprovaram defaults seguros, autoridade/sync, integridade cross-year, state machine, provenance, análise obrigatória, append-only de análise/findings/resoluções e invariantes de analysis profiles.

O provisionador recusa conjunto local diferente de `0001`–`0006` e recusa duplicidade do database de homologação.

## Import jobs, analyzer e perfis

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

`draft → analyzed` continua reservado ao pipeline backend verificado.

O analyzer XLSX concreto **já existe**:

- `server/banco-notas/ooxml-zip.ts` — leitura ZIP/OOXML controlada;
- `server/banco-notas/xlsx-legacy-analyzer.ts` — analyzer XLSX real;
- `server/banco-notas/import-analysis.ts` — pipeline e validações de proveniência;
- migration `0006` + repositório de analysis profiles — persistência do perfil estrutural usado na interpretação.

Garantias atuais:

- hash, formato, tamanho e ano são validados antes da análise;
- profile/análise ficam persistidos e auditáveis;
- formato/profile incompatível falha fechado;
- análise/profile são append-only conforme as regras do storage;
- findings e resoluções permanecem históricos separados;
- erro não resolvido bloqueia os gates posteriores.

### XLSB

Não existe parser XLSB cloud comprovado. XLSB continua **fail-closed**. O bridge COM legado não é tratado como parser cloud nem como dependência do produto final.

## Modelo genérico e golden masters

Fluxo:

```text
XLSX legado
→ analyzer OOXML real
→ LegacyIntermediateModel
→ correspondências canônicas
→ TransformationPlan
→ GenericModelInstance
→ GenericWorkbookPresentation
→ XLSX OOXML novo
```

O modelo gerado é genérico. Nenhuma regra de runtime pode depender de professor, nome, turma, componente, aba ou célula específica de arquivos privados.

Nina/Alanna permanecem golden masters privados externos: não entram em runtime, migration, D1, fixture pública, template oficial, SharePoint final ou distribuição.

## Serializador XLSX

`server/banco-notas/xlsx-workbook-serializer.ts` produz pacote ZIP/OOXML determinístico com abas visíveis e `_BancoNotas` `veryHidden`, incluindo identidade, proveniência e mappings físicos versionados.

Os mesmos dados produzem os mesmos bytes/hash. O boundary valida MIME, tamanho, hash e identidade antes da entrega do artefato.

O round-trip interno analyzer → modelo → serializer possui cobertura estrutural, mas a homologação operacional em Excel/Graph/SharePoint real ainda não foi executada.

## Grade-events

O núcleo está implementado:

- idempotência por hash canônico;
- zero distinto de ausência;
- stale auditável sem regressão de snapshot;
- snapshot por `(gradeKey, field)`;
- `D1GradeEventStore` valida fonte, ano, ambiente, modelo, sync, autoridade e mapping;
- evento e snapshot são enviados no mesmo `db.batch()`.

Próxima prova técnica: exercitar a atomicidade desse `db.batch()` em binding D1 real/compatível, inclusive rollback quando a segunda operação falha.

O endpoint público do add-in permanece bloqueado.

## Entra / add-in

O backend possui validação bearer Entra fail-closed para RS256/JWKS/issuer/tenant/audience/scope/lifetime.

`BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` continuam vazios/placeholder. O add-in público não pode ser liberado antes de audience e delegated scope reais.

Nenhuma configuração externa Entra foi alterada nesta etapa.

## Graph / SharePoint

`TeacherModelGraphGateway` continua abstrato e backend-only. A orquestração exige upload/share individual autenticado, verificação de metadata/hash, auditoria e compensação em falha.

Ainda não há adapter Graph real conectado nem provisionamento SharePoint do módulo aplicado. Preparação de contratos/configuração é segura; ativação externa permanece bloqueada para etapa posterior.

## Bloqueios externos restantes

- audience/delegated scope Entra reais do add-in;
- adapter Graph real e conexão SharePoint/OneDrive do módulo;
- round-trip operacional no Microsoft Excel/Graph/SharePoint;
- browser QA em ambiente navegável;
- sync end-to-end, que continua deliberadamente desabilitado.

A homologação D1 **não é mais bloqueio**.

## Próxima sequência segura

1. validar atomicidade real do `D1GradeEventStore` via binding D1;
2. ampliar round-trip XLSX real e seus invariantes;
3. preparar Graph/SharePoint sem ativar integração externa;
4. preparar Entra/add-in sem liberar endpoint público;
5. executar browser QA somente quando houver ambiente navegável e automação de navegador estiver autorizada.

## Regra de liberação

O PR #52 permanece draft. Não fazer merge, retirar draft, habilitar sync, alterar D1/Pages de produção ou fazer deploy de produção sem autorização humana explícita.
