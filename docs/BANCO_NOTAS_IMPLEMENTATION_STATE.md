# Banco de Notas — Implementation State

Última atualização: 27/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

Estado: **fundação consolidada + D1 remoto homologado até migration 0007 + analyzer/serializer OOXML reais + modelo genérico + ciclo D1 → Graph + round-trip real professor → Excel Online → SharePoint → Graph → analyzer comprovado e limpo; sync continua desligado.**

## Resumo executivo

O maior gate externo de arquivos/modelos foi fechado. O Banco de Notas já conseguiu:

1. gerar um workbook genérico;
2. armazená-lo no SharePoint pelo Graph backend-only;
3. compartilhá-lo individualmente com uma identidade Entra comprovada;
4. abri-lo e editá-lo no Excel Online como destinatário real;
5. baixar o arquivo pós-edição;
6. validar sua integridade semântica;
7. reanalisar o OOXML;
8. encontrar a nota `8.5` no mesmo mapping/célula;
9. revogar a permission;
10. remover o XLSX e confirmar a ausência.

A pasta dedicada de homologação foi mantida. Jobs, testes externos e identidades hardcoded usados somente na prova foram removidos.

## D1 remoto

Database exclusivo:

`banco-notas-homologation`

Run mais recente: `33078530136` — **success**.

Resultado:

- Wrangler `4.125.0`;
- database existente reutilizado;
- migrations `0001`–`0007` confirmadas;
- nenhum migration pendente;
- core smoke remoto aprovado;
- analysis profiles smoke aprovado;
- defaults/autoridade/cross-year/state machine/provenance/append-only aprovados;
- identidade Entra obrigatória e única;
- troca de OID e inativação bloqueadas durante sync sintético;
- estado final `sync_enabled=0`.

O workflow padrão não contém mais OID/UPN de uma pessoa nem prepara automaticamente um professor para share. O script manual protegido `prepare-share-homologation.ps1` permanece disponível somente para homologações conscientemente autorizadas.

Nenhum D1/Pages de produção foi alterado.

## Migrations D1

1. `0001_banco_notas_foundation.sql`;
2. `0002_banco_notas_cross_year_integrity.sql`;
3. `0003_banco_notas_import_job_state_machine.sql`;
4. `0004_banco_notas_import_finding_resolution.sql`;
5. `0005_banco_notas_import_analysis.sql`;
6. `0006_banco_notas_import_analysis_profiles.sql`;
7. `0007_banco_notas_teacher_entra_identity.sql`.

O provisionador está travado nesse conjunto e falha fechado em divergências.

## Fundação preservada

- módulo nativo do Centro em `/banco-de-notas`;
- API administrativa same-origin `/api/banco-notas/v1/*`;
- HeroUI React v3, sem Ambient Constellation;
- capabilities e autorização server-side;
- D1 como fonte estruturada/transacional;
- SharePoint/OneDrive para arquivos/modelos/versões;
- Graph backend-only;
- fontes `legacy_import` e `linked_teacher_model` com autoridade temporal auditável;
- `SyncEnabled=false` por padrão;
- integridade cross-year;
- Origin oficial nas mutações administrativas;
- layout/mappings versionados;
- `studentPosition` canônico;
- `_BancoNotas` como aba interna reservada.

## Importação, análise e modelo genérico

Pipeline real:

```text
XLSX legado
→ analyzer OOXML
→ LegacyIntermediateModel
→ relationship resolution
→ TransformationPlan
→ GenericModelInstance
→ GenericWorkbookPresentation
→ serializer OOXML
→ XLSX genérico
```

XLSB permanece fail-closed.

O produto continua obrigado a gerar um **modelo genérico limpo**, sem regra dependente de professor, turma, aba, disciplina ou célula privada.

Os **golden masters privados externos** continuam somente como evidência privada. Não entram em Git, runtime, migrations, D1, fixtures públicas, SharePoint definitivo ou distribuição.

## Compatibilidade com Excel Online

O serializer foi corrigido para cumprir estruturas exigidas pelo Excel Online:

- colunas emitidas em ordem crescente;
- células emitidas em ordem crescente;
- `<bookViews>` presente quando worksheets usam `workbookViewId=0`.

Regressões permanentes cobrem essas garantias.

O workbook corrigido abriu sem reparação e em modo de edição.

## Valores das células e zero vs ausência

O analyzer passou a expor `sourceValue` opcional nos slots de nota.

A interpretação cobre:

- valor numérico;
- valor string;
- célula ausente/nula;
- zero numérico distinto de ausência.

A edição sintética `B2: null → 8.5` foi reanalisada corretamente.

## Integridade SharePoint/Excel

`server/banco-notas/xlsx-sharepoint-integrity.ts` diferencia:

- pacote exato;
- pacote normalizado pelo SharePoint;
- pacote editado pelo Excel.

O gate fail-closed verifica:

- preservação das partes do produto;
- relações e content types;
- propriedades core;
- adições server-managed conhecidas;
- ausência de macros/VBA;
- ausência de relações externas;
- worksheet visível esperada;
- `_BancoNotas` em `veryHidden`;
- modelo, estudante, mapping, célula e valor esperados.

Alteração inesperada de worksheet, remoção de parte original ou adição inesperada sob `xl/` é rejeitada.

## Ciclo D1 → Graph do modelo docente

Componentes principais:

- `D1TeacherModelRepository`;
- `teacher-model-share-service.ts`;
- `teacher-model-graph.ts`;
- `teacher-model-graph-gateway.ts`;
- transporte binário em `server/graph/client.ts`.

Garantias:

- versão + mappings persistidos atomicamente;
- retry idempotente;
- homologation + sync desligado + professor ativo + Entra OID antes de share;
- hash local verificado antes de upload;
- somente `.xlsx`;
- sign-in obrigatório;
- destinatário validado por OID;
- metadata e download separados;
- integridade/reanálise antes do sucesso;
- compensação revoke/delete em falha;
- estado D1 não avança falsamente.

## Homologação M365 end-to-end

Boundary:

`CENTROADMIN → ARQUIVOS_PLATAFORMA → BANCO_NOTAS_HOMOLOGACAO`

Runs principais:

- `33003875460` — readiness OIDC/Entra/Sites.Selected — success;
- `33025586408` — storage/download/reanálise/cleanup — success;
- `33026888705` — share individual — success;
- `33073736978` — serializer compatível com Excel — success;
- `33074034916` — substituição controlada do workbook — success;
- `33075802785` — Excel → Graph → analyzer — success;
- `33076985566` — revogação e remoção final — success.

Prova funcional:

- conta destinatária: `GUI@escolaieda.com`;
- célula: `B2`;
- field: `NotaT1`;
- valor anterior: nulo;
- valor salvo/reanalisado: `8.5`;
- mesmo `gradeKey`, `sheetKey` e mapping;
- sync permaneceu `0`.

Cleanup final:

- permission ausente e revogação confirmada;
- arquivo removido e ausência confirmada;
- pasta dedicada retida;
- nenhum share amplo criado.

## Lock WOPI e remoção Graph

O Excel Online manteve temporariamente um lock de coautoria e o Graph retornou `423 Locked`.

Foi implementado `bypassSharedLock` opt-in no gateway. Somente a remoção explicitamente chamada com essa opção envia:

`Prefer: bypass-shared-lock`

Revogações e deletes comuns não recebem o header. Testes permanentes cobrem essa separação.

## Código temporário removido

No commit `a539417e09740db54c4f97ebbb62acc741bd0de2` foram removidos:

- job M365 one-shot da CI;
- teste externo temporário de tenant;
- OID/UPN reais do workflow D1;
- preparação automática pessoal para share.

A suíte normal não chama Microsoft 365 nem depende do tenant.

## CI corrente

Head de código fechado: `a539417e09740db54c4f97ebbb62acc741bd0de2`.

Run `33078535334` / CI #884 — **success**:

- Actions security — success;
- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — **302/302 em 55 arquivos**;
- build — success;
- deploy production — skipped;
- recovery — skipped.

O warning de chunk JavaScript acima de 500 kB permanece não bloqueador.

## Entra / add-in

O backend já valida bearer Entra fail-closed para:

- RS256/JWKS;
- issuer;
- tenant;
- audience;
- scope;
- lifetime.

A migration `0007` e o authorizer D1 protegem ownership `teacherModelId ↔ teacher ↔ entraObjectId`.

Ainda faltam valores reais e homologados para:

- `BANCO_NOTAS_ADDIN_AUDIENCE`;
- `BANCO_NOTAS_ADDIN_SCOPE`.

O endpoint público/add-in permanece bloqueado. Não inventar valores e não publicar antes do gate completo.

## Grade-events e atomicidade

`D1GradeEventStore` usa um único `D1Database.batch()` para evento + snapshot e possui prova local de rollback.

Ainda falta provar atomicidade pelo binding D1 real em Worker/Pages de homologação autorizado. Não ampliar permissões nem criar runtime inseguro para fabricar evidência.

## Bloqueios técnicos restantes

1. audience/delegated scope Entra reais do add-in;
2. bearer/ownership end-to-end do add-in;
3. atomicidade por binding D1 real de homologação;
4. módulos funcionais ainda planejados;
5. browser QA amplo e release controlada.

O storage, o share individual, a edição no Excel, o retorno via Graph e o cleanup **não são mais bloqueadores**.

## Próxima sequência segura

1. auditar apps Entra existentes e reutilizar quando adequado;
2. configurar audience/scope de homologação com menor privilégio;
3. testar tokens positivos e negativos, incluindo ownership;
4. manter o add-in não publicado;
5. validar atomicidade D1 por binding autorizado;
6. avançar Acompanhamento, Alunos, Turmas, Professores e Pesquisa;
7. QA e produção somente após gates e decisão humana explícita.

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
- XLSB continua fail-closed;
- golden masters privados não entram no produto;
- PR #52 permanece open + draft;
- não fazer merge ou deploy de produção sem decisão humana explícita.
