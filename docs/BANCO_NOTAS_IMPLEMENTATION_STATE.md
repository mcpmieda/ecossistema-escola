# Banco de Notas — Implementation State

Última atualização: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

Estado: **fundação consolidada + D1 remoto homologado até migration 0007 + importação/análise OOXML XLSX reais + modelo genérico + serialização XLSX real + M365 readiness comprovado via GitHub Control Plane + ciclo D1 → Graph do modelo docente implementado e testado; sync continua desligado.**

## D1 remoto

Homologação comprovada em `banco-notas-homologation`:

- workflow `Banco de Notas D1 homologation`;
- run final do bloco de identidade: `32981705701` — **success**;
- commit remotamente validado: `2467240b53bf3bbc5996905ba940b544cb35f266`;
- CI correspondente: `32981711631` — **success**;
- migrations `0001`–`0007` presentes e exercitadas remotamente;
- estado final sintético comprovado com `sync_enabled=0`.

A migration `0007_banco_notas_teacher_entra_identity.sql` introduz o vínculo institucional do professor com Entra OID e protege o futuro sync. O smoke remoto comprovou falta de OID, unicidade, lock de troca de OID e lock de inativação durante sync temporário, retornando ao final para `sync_enabled=0`.

Nenhum D1/Pages de produção foi alterado.

## Migrations D1

Conjunto atual:

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`;
7. `0007_banco_notas_teacher_entra_identity.sql`.

O provisionador de homologação está travado nesse conjunto e recusa banco/nome incompatível.

## Fundação preservada

- módulo nativo do Centro em `/banco-de-notas`;
- API administrativa same-origin `/api/banco-notas/v1/*`;
- HeroUI React v3 nativo, sem Ambient Constellation;
- capabilities e autorização server-side;
- D1 como fonte estruturada/transacional;
- SharePoint/OneDrive reservados a arquivos/modelos/versões;
- Graph backend-only;
- fontes `legacy_import` e `linked_teacher_model` com autoridade temporal auditável;
- `SyncEnabled=false` por padrão;
- integridade cross-year;
- Origin oficial nas mutações administrativas;
- golden masters privados isolados do produto.

## Importação e modelo genérico

Analyzer e serializer XLSX OOXML concretos estão implementados.

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

Há cobertura real de serializer → analyzer e round-trip pelo boundary Graph sintético.

XLSB permanece **fail-closed**. Não há parser XLSB cloud comprovado.

Os **golden masters privados externos** permanecem exclusivamente como evidência privada de regressão/homologação. Não entram em Git, runtime, migrations, D1, fixtures públicas, SharePoint definitivo ou distribuição.

O produto continua obrigado a gerar um **modelo genérico limpo**, sem regra dependente de professor, turma, aba, disciplina ou célula privada.

## Grade-events

O núcleo continua com:

- idempotência por hash canônico;
- zero distinto de ausência;
- stale auditável sem regressão de snapshot;
- snapshot por `(gradeKey, field)`;
- validações de fonte, ano, ambiente, modelo, sync, autoridade e mapping;
- evento + snapshot no mesmo `D1Database.batch()`;
- regressão local que força falha na segunda statement e comprova rollback.

A prova por binding D1 real em Worker/Pages de homologação ainda não foi executada porque requer runtime autorizado. Não ampliar permissões apenas para fabricar essa prova.

## M365 readiness — comprovado

O GitHub Control Plane existente foi reaproveitado; não foi criada uma segunda infraestrutura Microsoft para o Banco.

Workflow `M365 operations`:

- run `33003875460` / `#3` — **success**;
- operação `banco-notas-readiness`;
- autenticação GitHub OIDC → Entra workload federation;
- audience válida;
- `Sites.Selected` presente;
- acesso ao site confirmado;
- `13` listas e `4` drives visíveis;
- storage boundary Microsoft confirmado como arquivos-only;
- fonte estruturada/transacional confirmada como D1;
- `syncActivation=not-performed`;
- `writeOperation=false`.

Essa prova fecha a prontidão de autenticação/acesso do Control Plane, mas **não** deve ser confundida com execução do adapter runtime do Banco contra o tenant.

## SharePoint / OneDrive

Consulta read-only confirmou no site `CENTROADMIN`:

- `Documentos`;
- `ARQUIVOS_PLATAFORMA`;
- `SNAPSHOTS_PLATAFORMA`;
- `RELATORIOS_PLATAFORMA`.

`ARQUIVOS_PLATAFORMA` é o candidato institucional para modelos/arquivos do Banco. O ID observado em descoberta não foi hardcoded no produto.

Ainda falta resolver ou provisionar o parent item/pasta dedicado do Banco. Nenhum diretório ou arquivo foi criado nesta etapa.

## Ciclo D1 → Graph do modelo docente

Foi implementado `D1TeacherModelRepository` sobre `teacher_models`, `teacher_model_versions`, `cell_mappings` e `share_audit`, além do serviço que conecta o gate D1 à orquestração Graph existente.

Garantias atuais:

- versão + mappings persistidos atomicamente no D1;
- novas versões somente enquanto o modelo estiver em estado compatível;
- retry idempotente do mesmo hash/mapping/definition;
- duplicidade de mapping validada conforme os índices do D1;
- `ready_to_share` exige homologação, `sync_enabled=0`, professor ativo, Entra OID, versão e mappings;
- candidato a upload precisa corresponder ao hash, definitionVersion e mappingVersion persistidos;
- SHA-256 dos bytes locais é validado antes de qualquer upload Graph;
- upload somente de `.xlsx`;
- compartilhamento individual com `requireSignIn=true`;
- destinatário confirmado por Entra OID;
- metadata e download separados;
- SHA-256 recalculado sobre os bytes realmente baixados;
- reanálise OOXML obrigatória antes do sucesso;
- só então o D1 passa `ready_to_share → shared` e grava `drive_item_id`;
- falha após upload aciona revoke/delete;
- falha deixa o modelo em `ready_to_share` para nova tentativa;
- `share_audit` registra `requested`, `succeeded` e `failed`.

O adapter concreto continua backend-only e usa `BANCO_NOTAS_GRAPH_DRIVE_ID` e `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID`, ambos opcionais/fail-closed. Nenhum ID fictício foi embutido no código.

## CI corrente do código

Head de código validado: `9959c6f143339c25e15fad7f50755339d4e47242`.

GitHub Actions `CI and deploy` run `33005219880` / `#762` — **success**:

- `Validate application` — success;
- `Validate GitHub Actions security` — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **294/294 em 54 arquivos**;
- build — success;
- `Deploy production` — skipped;
- `Verify recovery after deploy` — skipped.

O warning histórico de chunk JavaScript acima de 500 kB permanece não bloqueador.

Evidência consolidada: `docs/BANCO_NOTAS_M365_READINESS_E_D1_GRAPH_LIFECYCLE_2026-08-26.md`.

## Entra / add-in

O backend já valida bearer Entra fail-closed para RS256/JWKS/issuer/tenant/audience/scope/lifetime.

A migration `0007` e o authorizer D1 adicionam ownership `teacherModelId ↔ teacher ↔ entraObjectId`.

`BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` continuam sem valores reais no repositório. O endpoint público do add-in permanece bloqueado.

## Bloqueios externos restantes

1. resolver/provisionar parent item/pasta dedicada dentro da biblioteca institucional escolhida;
2. executar o primeiro round-trip operacional do adapter runtime Graph/SharePoint: upload → share → metadata → download → hash → reanálise → limpeza/compensação;
3. homologar audience/delegated scope Entra reais do add-in;
4. comprovar atomicidade por binding D1 real em runtime Cloudflare de homologação autorizado;
5. realizar browser QA em ambiente navegável;
6. avançar os módulos funcionais ainda planejados da interface.

## Regras que não podem regredir

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
- não fazer merge nem deploy de produção sem decisão humana explícita.

## Próxima sequência segura

1. resolver o parent de homologação sem hardcode e sem ampliar permissões;
2. executar o round-trip operacional Graph/SharePoint somente em homologação, preservando compensação e limpeza;
3. preparar audience/scope Entra reais sem liberar o endpoint público antes do gate completo;
4. comprovar atomicidade D1 por binding quando houver runtime homologado autorizado;
5. continuar os módulos funcionais do Banco;
6. browser QA e release somente após homologação end-to-end.
