# Banco de Notas — Handoff

## Retomada — Professores V1 (28/08/2026)

Branch `feat/banco-notas-professores-v1`, criada sobre a `main` integrada em `0d61a96e4c7567d565548ac6bedcc9b9c1c5c6c1`.

O vertical slice read-only está implementado: diretório, filtros, paginação, detalhe, assignments, modelos, identidade, fontes, pendências, atividade e navegação com Turmas/Acompanhamento. A regra de atenção é compartilhada com Acompanhamento e não transforma `sync_enabled=0` isolado em erro.

Regressão local: 372 testes em 72 arquivos; browser QA desktop/mobile sintético aprovado, incluindo retorno seguro de Turmas/Acompanhamento. Não houve migration, deploy, D1 remoto, Graph/Entra, publicação do add-in ou alteração de sync.

Leitura principal: `docs/BANCO_NOTAS_PROFESSORES_V1.md`.

Próximo marco recomendado após encerrar PR Draft e CI: Pesquisa Global V1. Não inferir autorização de merge, produção ou operações de escrita.

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

Audience e scope reais foram homologados em 27/08/2026. O Excel Online obteve um token NAA delegado v2 e todos os checks sanitizados passaram. Ver `docs/BANCO_NOTAS_NAA_HOMOLOGATION_2026-08-27.md`.

Regras para o próximo agente:

- preservar a registration de homologação já auditada;
- menor privilégio;
- sem consentimento amplo desnecessário;
- sem publicação do add-in;
- endpoint público continua bloqueado até uma prova bearer/ownership em runtime de homologação autorizado;
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

## Hardening Entra v2 do add-in — 27/08/2026

- Corrigida a semântica de access token v2: `aud` é o client ID GUID da API, não o App ID URI.
- `api://<client-id>/BancoNotas.Sync` permanece sendo o scope solicitado pelo cliente.
- O bearer agora valida `ver=2.0`, `azp` self-preauthorized e rejeita drift de cliente confidencial quando `azpacr` estiver presente.
- `BANCO_NOTAS_ADDIN_AUDIENCE` passa a exigir UUID.
- O plano Entra removeu `Directory.Read.All`; nenhuma escrita no tenant foi feita.
- Endpoint público desconectado, sync `0`, produção intocada e PR #52 draft.
- Evidência: `docs/BANCO_NOTAS_ENTRA_ADDIN_TOKEN_V2_HARDENING_2026-08-27.md`.
- Gate histórico concluído: auditoria Entra read-only executada antes do apply.

## Auditoria Entra read-only do add-in — 27/08/2026

- Run `33092136016` aprovado com GitHub OIDC e Microsoft Graph GET-only.
- Resultado: `success_no_candidate`; zero registrations com o nome canônico.
- `Application.ReadWrite.OwnedBy` listou o tenant com sucesso; a referência oficial permite `GET /applications` para todas as applications.
- Nenhuma escrita no tenant ocorreu; nenhuma application, service principal, permissão, consentimento ou credencial foi alterada.
- Endpoint público desconectado, sync `0`, produção intocada e PR #52 draft.
- Evidência: `docs/BANCO_NOTAS_ENTRA_ADDIN_AUDIT_2026-08-27.md`.
- Gate histórico concluído: registration de homologação credential-free criada sem publicar o add-in.

## Homologação NAA real — 27/08/2026

- A registration credential-free, o audience GUID e `BancoNotas.Sync` estão homologados.
- A redirect bridge dedicada do MSAL Browser v5 eliminou os timeouts do harness anterior.
- Aquisição silenciosa real no Excel Online passou em 662 ms.
- Evidência não contém token, UPN nem valor de OID.
- Redirect local removido; zero Graph permissions, grants, app roles ou credenciais.
- Rota pública desconectada, `sync_enabled=0`, produção intocada e PR #52 draft.

## Homologação runtime bearer/ownership + atomicidade D1 — 28/08/2026

- Excel Online real obteve bearer delegado NAA 1.1 e o enviou ao runtime isolado em Cloudflare Pages Functions.
- Validação sanitizada aprovada para token v2, tenant, issuer, audience, scope, authorized party, lifetime e presença de OID; nenhum token, OID, conta ou PII foi persistido.
- Ownership positivo aceito; ownership incorreto, modelo inexistente e professor inativo rejeitados.
- A guarda de sync rejeitou ingestão com zero escritas enquanto desabilitada.
- O binding real BANCO_NOTAS_DB comprovou atomicidade de evento + snapshot via D1Database.batch(): caminho positivo completo e falha controlada sem escrita parcial.
- Estado final no D1 de homologação: modelo e assignment com sync_enabled=0; fixtures negativas removidas.
- Deployment isolado: 239e9bc8-d504-41e1-8d15-d2b092039872; workflow de deploy 33160734080 — success.
- Redirect SPA temporário do preview removido do Entra; dois redirects institucionais preservados; zero secrets/certificados.
- Limpeza do preview Pages: pendente neste commit e disparada pelas evidências versionadas.
- Nenhum Worker, Pages ou D1 de produção foi alterado. PR #52 permanece open, draft e sem merge.

Evidências: docs/evidence/BancoNotas-Bearer-Ownership-Homologation-2026-08-27.json e docs/evidence/BancoNotas-D1-Binding-Atomicity-Homologation-2026-08-27.json.

## Encerramento do runtime temporário — 28/08/2026

- CI `33163724110` / #1008: **success**.
- Formatting, lint, typecheck, semantic contract, validação do manifest, testes e builds: success.
- Testes: **323 passed em 59 arquivos**.
- Actions security: success.
- Semgrep `33163724064`: success.
- Factory Control Plane `33163724062`: success.
- Job `98824370212` (`Remove isolated Banco de Notas homologation runtime`): success.
- A consulta de deployments do Cloudflare retornou `RUNTIME_HOMOLOGATION_PAGES_PREVIEW_ALREADY_ABSENT` para o ID exato `239e9bc8-d504-41e1-8d15-d2b092039872`.
- O redirect SPA temporário do preview continua ausente no Entra; redirects institucionais e contrato credential-free permanecem preservados.
- `sync_enabled=0`; produção Pages, Worker e D1 não foram alterados.
- `Deploy production` e `Verify recovery after deploy`: skipped.
- PR #52 permanece open, draft e sem merge.

## Retomada — Acompanhamento V1 (28/08/2026)

Branch de produto: `feat/banco-notas-acompanhamento`. O código local contém o vertical slice completo e seus testes. A branch deve permanecer stacked sobre `feat/banco-de-notas-foundation` enquanto o PR #52 estiver aberto, com publicação apenas em PR draft e sem merge ou deploy de produção.

Documento funcional e evidências: `docs/BANCO_NOTAS_ACOMPANHAMENTO_V1.md`.

## Integração controlada — estado final deste marco (28/08/2026)

- Fundação integrada à `main` pelo PR #52: merge `cf48d837556fe6df1baaa21d0e0015e4535efe87`.
- Acompanhamento V1 retargetado e integrado pelo PR #129 com base final `main` após regressão e CI verdes.
- Os merges não autorizam release: nenhum deploy de produção, alteração D1 remota, mudança Entra/Graph ou publicação do add-in.
- `sync_enabled=0` e endpoint público continuam protegidos.
- Próxima retomada funcional: abrir missão própria para Turmas e Alunos V1; não inferir autorização de piloto ou produção.

## Retomada — Turmas e Alunos V1 (28/08/2026)

Branch `feat/banco-notas-turmas-alunos-v1`, baseada na `main` integrada em `22657ede13a22561e4b7d350b629719a79ed084f`.

O módulo é consulta operacional: roster apenas por gradeKey exata em mappings da versão mais recente; sem enrollment paralelo, SMECEL inferido ou CRUD. Antes da integração, exigir regressão completa, browser QA sintético, PR Draft e CI verde. Não fazer merge nem deploy nesta missão. Produção, D1 remoto, Graph/Entra e add-in fora do escopo; manter `sync_enabled=0`.

Leitura principal: `docs/BANCO_NOTAS_TURMAS_ALUNOS_V1.md`.

Publicação: PR Draft #134 para `main`; commits iniciais `822eeb6` e `eb3f148`; CI `33199767149` e Semgrep `33199767176` verdes. O PR deve permanecer sem merge. Factory Control Plane não se aplica a este diff pelos filtros de paths do workflow.

## Retomada — Pesquisa Global V1 (28/08/2026)

Branch `feat/banco-notas-pesquisa-global-v1`, baseada em `main` no commit `8eed2e9bc00ff4d53749f4c1ac630bf0f182fa52`.

O escopo é exclusivamente read-only: buscar alunos, professores e turmas canônicos, ranquear no servidor e navegar para módulos existentes. Não criar migration, índice paralelo, FTS, vínculo inferido, IA, write, deploy ou sync. Antes de encerrar, exigir `npm run verify`, auditoria high, diff check, browser QA sintético, PR Draft e CI/Application Security/Semgrep verdes. O PR deve permanecer sem merge.

Browser QA sintético desktop/mobile passou, incluindo cancelamento real, estados operacionais e destinos canônicos. O alvo de Acompanhamento encontrado incorreto na QA foi corrigido e revalidado como `/acompanhamento/turmas/:id`; fixture, servidor e aba foram removidos.

Leitura principal: `docs/BANCO_NOTAS_PESQUISA_GLOBAL_V1.md`.

Publicação: PR Draft #136 para `main`; primeira rodada CI `33221412326` e Semgrep `33221412336` verdes, sem reviews/threads pendentes e com zero deployments. O PR deve permanecer Draft e sem merge.
