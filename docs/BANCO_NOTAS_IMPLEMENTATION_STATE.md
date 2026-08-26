# Banco de Notas — Implementation State

Última atualização: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52`

Estado: **fundação consolidada + grade-events interno + importação auditável com análise verificada persistente + modelo genérico + geração XLSX real em código; PR draft, sem merge e sem produção.**

## Evidência funcional corrente

Head funcional verificado: `41172bc416d6a8bfcbc44871d48ae12fe05e724e`.

GitHub Actions: workflow `32927767229` / run `#627` — **success**:

- `Validate GitHub Actions security` — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **241/241 em 42 arquivos**;
- build — success;
- `Deploy production` — skipped;
- `Verify recovery after deploy` — skipped.

O warning histórico de chunk JavaScript acima de 500 kB permanece não bloqueador.

## Fundação preservada

- módulo nativo do Centro em `/banco-de-notas`, sem hash route;
- API administrativa `/api/banco-notas/v1/*` e health `/api/banco-notas/health`;
- HeroUI React v3 nativo, sem shadcn, ReUI, facades ou Ambient Constellation;
- capabilities `grades.*` com autorização server-side;
- D1 como estado transacional estruturado;
- SharePoint/OneDrive reservados para arquivos e versões;
- Graph somente pelo backend;
- fontes `legacy_import` e `linked_teacher_model`, com autoridade temporal auditável;
- `SyncEnabled=false` por padrão;
- proteção cross-year no storage;
- Origin oficial exigido nas mutações administrativas;
- golden masters privados isolados do produto.

## Migrations D1

Existem cinco migrations, ainda não aplicadas em D1 remoto:

1. `0001_banco_notas_foundation.sql` — schema base, fontes, modelos, mappings, eventos, snapshots, auditoria e importação;
2. `0002_banco_notas_cross_year_integrity.sql` — integridade cross-year;
3. `0003_banco_notas_import_job_state_machine.sql` — state machine e findings imutáveis;
4. `0004_banco_notas_import_finding_resolution.sql` — resolução append-only e proteção contra reentrada;
5. `0005_banco_notas_import_analysis.sql` — análise imutável e obrigatória antes de `analyzed`.

As invariantes são exercitadas em SQLite real por processos Node. Isso não substitui D1 remoto de homologação.

O script `infra/banco-notas/cloudflare/smoke-homologation.ps1` está preparado para o D1 remoto e possui travas explícitas: exige `-ConfirmSyntheticWrites`, confere `database_name=banco-notas-homologation`, não cria D1, não aplica migrations, não faz deploy e não habilita sync.

## Import jobs e análise verificada

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

`failed` é terminal permitido nos gates previstos.

`draft → analyzed` é reservado ao pipeline backend:

```text
ImportJob draft
→ valida sourceHash/sourceFormat/schoolYear
→ valida bytes por tamanho + SHA-256
→ executa LegacyWorkbookAnalyzer compatível
→ persiste ImportAnalysis imutável
→ persiste findings + auditoria
→ grava analyzed atomicamente
```

Garantias atuais:

- analyzer não roda se a origem divergir do job;
- `import_analyses` possui um artefato imutável por job;
- D1/SQLite bloqueia `analyzed` sem esse artefato;
- retry idempotente da mesma análise não duplica histórico;
- retry incompatível gera conflito;
- falha do analyzer não avança o job;
- `POST /v1/import-jobs/{jobId}` rejeita `targetState=analyzed`;
- findings originais e resoluções permanecem históricos separados append-only;
- erro não resolvido bloqueia `generated` e gates posteriores.

## Modelo genérico

Fluxo implementado:

```text
LegacyIntermediateModel
→ correspondências canônicas
→ TransformationPlan
→ GenericModelInstance
→ GenericWorkbookPresentation
→ artefato XLSX
```

A instância genérica nasce em `homologation` e com `syncEnabled=false`.

O layout físico é versionado por `layoutVersion`, `firstStudentRow` e coluna de cada `gradeField`. A posição escolar vem de `studentPosition`; o sistema não ordena alunos por UUID nem pela ordem acidental do workbook legado.

Correspondência ausente/ambígua, posição duplicada, grade key incompatível, sheet key incompatível ou layout divergente falham fechado antes da geração.

## Apresentação canônica do workbook

Foram adicionados:

- `shared/banco-notas-workbook-presentation.ts`;
- `server/banco-notas/workbook-presentation.ts`;
- `tests/banco-notas-workbook-presentation.test.ts`.

O contrato separa identidade canônica de texto de apresentação. O builder recebe roster canônico com `sheetKey`, `gradeKey`, `studentPosition` e nomes de exibição, valida tudo contra `GenericModelInstance` e deriva nomes de abas Excel de forma determinística.

Regras de aba:

- caracteres proibidos do Excel são removidos da apresentação;
- limite de 31 caracteres é respeitado;
- nomes são únicos sem distinção de maiúsculas/minúsculas;
- colisões recebem sufixo determinístico;
- `_BancoNotas` é reservado para metadados internos;
- IDs canônicos não precisam aparecer no nome visível da aba.

## Serializador XLSX real

Foram adicionados:

- `server/banco-notas/xlsx-workbook-serializer.ts`;
- `tests/banco-notas-xlsx-workbook-serializer.test.ts`.

O serializador implementa um pacote XLSX/OOXML real sem nova dependência de runtime. Ele cria ZIP determinístico com CRC32 e entradas OOXML para workbook, relationships, styles, propriedades e worksheets.

A saída inclui:

- abas visíveis por turma/componente;
- cabeçalhos de notas conforme o layout versionado;
- posição e nome do estudante segundo a apresentação canônica;
- aba `_BancoNotas` em estado `veryHidden` com identidade/proveniência e mappings de células;
- `modelId`, ano, versões de definição/layout/mapping/apresentação, `sourceHash` e `relationshipSnapshotId`;
- `sheetKey`, nome físico da aba, `cellAddress`, `gradeKey`, `field` e `studentPosition` por mapping.

A serialização é determinística: os mesmos dados produzem os mesmos bytes/hash. O boundary existente continua validando formato, MIME, tamanho, SHA-256 e proveniência antes de entregar o artefato.

Falha fechado quando apresentação e instância divergem em modelo, ano, campos, abas, roster, grade keys ou colunas.

**Limite da evidência:** já existe serializador XLSX real em código e regressão estrutural dos bytes OOXML/ZIP, mas o arquivo ainda não foi aberto/gravado em round trip por Excel/Graph/SharePoint real. Portanto, compatibilidade externa com Microsoft Excel ainda precisa de homologação. Não confundir isso com “serializador inexistente”.

## Analyzer de workbook

O boundary `LegacyWorkbookAnalyzer` continua ativo e protegido por hash/tamanho/proveniência, porém o adapter cloud concreto ainda não foi conectado.

- não existe parser XLSB cloud comprovado;
- XLSB continua fail closed sem adapter explícito;
- o bridge COM legado continua somente como ponte de migração/regressão;
- o próximo trabalho local relevante é implementar/conectar analyzer XLSX real sem criar regras dependentes dos golden masters.

## Grade-events e Entra

O núcleo interno de grade-events está implementado:

- idempotência com hash canônico;
- zero distinto de ausência;
- stale auditável sem regressão de snapshot;
- snapshot por `(gradeKey, field)`;
- store D1 valida fonte, ano, ambiente, modelo, sync, autoridade e mapping;
- evento + snapshot preparados no mesmo batch.

O endpoint público do add-in permanece deliberadamente desconectado.

O backend possui validador bearer Entra fail closed para RS256/JWKS/issuer/tenant/audience/scope/lifetime. `BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` permanecem apenas como placeholders vazios até provisionamento real.

## Graph e modelo docente

`TeacherModelGraphGateway` continua abstrato, sem adapter Graph real. A orquestração já exige:

```text
store
→ share individual autenticado
→ metadata/hash verification
→ success audit
```

Em falha após upload/share, tenta revoke e remoção do arquivo; falha de compensação é promovida e auditada.

Nenhuma chamada Graph real foi executada.

## Golden masters

Os arquivos privados Nina/Alanna permanecem exclusivamente como evidência externa de homologação. Não são template, seed, migration, fixture pública, fallback ou dependência de runtime.

Nenhuma regra do serializador/apresentação pode depender de professor, nome de aba, turma, componente ou célula desses arquivos.

## Bloqueios externos atuais

- Wrangler sem autenticação/token/account Cloudflare no ambiente usado aqui;
- D1 `banco-notas-homologation` não provisionado/aplicado nesta evidência;
- migrations `0001`–`0005` não validadas em D1 remoto;
- smoke remoto preparado, mas não executado;
- audience/delegated scope Entra do add-in não provisionados;
- SharePoint do módulo não aplicado ao tenant;
- adapter Graph real não conectado;
- analyzer XLSX real ainda não conectado;
- parser XLSB cloud não existe;
- artefato XLSX ainda não homologado em round trip no Excel/Graph/SharePoint;
- sem browser QA real e sem sync end-to-end.

## Próximo marco

Sem credenciais externas, continuar pelo analyzer XLSX real e pela composição do pipeline local completo usando somente fixtures sintéticas.

Quando houver autorização e credenciais externas:

1. provisionar/reutilizar apenas `banco-notas-homologation`;
2. aplicar migrations `0001`–`0005`;
3. executar `smoke-homologation.ps1 -ConfirmSyntheticWrites`;
4. homologar o XLSX gerado abrindo/gravando em Excel real e depois via Graph/SharePoint;
5. provisionar audience/delegated scope Entra;
6. só então expor grade-events público;
7. conectar adapter Graph real e SharePoint de homologação;
8. executar browser QA e regressão privada externa;
9. iniciar piloto individual mantendo sync desligado até reconciliação.

## Regra de liberação

O PR #52 permanece draft. Não fazer merge, retirar draft, habilitar sync ou fazer deploy de produção sem autorização humana explícita.
