# Banco de Notas — Implementation State

Última atualização: 26/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — **open, draft, sem merge e sem produção**.

Estado: **fundação consolidada + D1 remoto homologado até migration 0007 + importação/análise OOXML XLSX reais + modelo genérico + serialização XLSX real + boundary Graph backend-only preparado; sync continua desligado.**

## Evidência remota D1

Homologação comprovada em `banco-notas-homologation`:

- workflow `Banco de Notas D1 homologation`;
- run final do bloco de identidade: `32981705701` — **success**;
- commit remotamente validado: `2467240b53bf3bbc5996905ba940b544cb35f266`;
- CI correspondente: `32981711631` — **success**;
- migrations `0001`–`0007` presentes e exercitadas remotamente;
- estado final sintético comprovado com `sync_enabled=0`.

A migration `0007_banco_notas_teacher_entra_identity.sql` introduz o vínculo institucional do professor com Entra OID e protege o futuro sync. O smoke remoto comprovou:

- tentativa de sync sem OID falha;
- OID do professor é único;
- troca de OID é bloqueada enquanto houver modelo com sync temporariamente habilitado no smoke;
- inativação do professor é bloqueada nessa mesma condição;
- o smoke desabilita novamente o sync e verifica estado final seguro.

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

O analyzer XLSX OOXML concreto está implementado. O fluxo atual é:

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

Há prova de round-trip completo no boundary sintético:

```text
serializer XLSX real
→ boundary Graph simulado
→ download dos mesmos bytes
→ SHA-256 local
→ analyzer XLSX real
```

O modelo permanece genérico e nenhuma regra de runtime depende de professor, turma, aba, disciplina ou célula de golden master privado.

### XLSB

XLSB permanece **fail-closed**. Não há parser XLSB cloud comprovado.

## Golden masters

Os **golden masters privados externos** permanecem exclusivamente como evidência privada de regressão/homologação. Não entram em Git, runtime, migrations, D1, fixtures públicas, SharePoint definitivo ou distribuição.

O produto continua obrigado a gerar um **modelo genérico limpo**.

## Grade-events

O núcleo está implementado com:

- idempotência por hash canônico;
- zero distinto de ausência;
- stale auditável sem regressão de snapshot;
- snapshot por `(gradeKey, field)`;
- validações de fonte, ano, ambiente, modelo, sync, autoridade e mapping;
- evento + snapshot no mesmo `D1Database.batch()`.

Existe regressão local que força falha na segunda statement e comprova rollback. A prova por binding D1 real em Worker/Pages de homologação ainda não foi executada porque requer runtime autorizado; não ampliar permissões apenas para fabricar essa prova.

## Graph / SharePoint

O boundary Graph deixou de ser apenas abstrato e possui adapter backend-only concreto preparado, ainda **não ativado contra o tenant real**.

Garantias atuais:

- upload somente de `.xlsx`;
- nome de arquivo validado fail-closed;
- compartilhamento individual com `requireSignIn=true`;
- verificação do Entra OID do destinatário retornado pelo Graph;
- metadata e download separados;
- SHA-256 calculado localmente sobre os bytes efetivamente baixados;
- reanálise OOXML obrigatória antes da auditoria de sucesso;
- revoke/delete como compensação explícita em falhas;
- falha de metadata, tamanho, hash ou reanálise dispara compensação;
- `BANCO_NOTAS_GRAPH_DRIVE_ID` e `BANCO_NOTAS_GRAPH_PARENT_ITEM_ID` são configuração opcional e fail-closed, sem IDs fictícios no código.

Ainda não foi realizada chamada Graph/SharePoint real nesta etapa. A homologação externa depende de sessão/credencial Microsoft apropriada de homologação.

## Entra / add-in

O backend já valida bearer Entra fail-closed para RS256/JWKS/issuer/tenant/audience/scope/lifetime.

A migration `0007` e o authorizer D1 adicionam a segunda camada necessária: o usuário autenticado deve corresponder ao professor proprietário do `teacherModelId`.

`BANCO_NOTAS_ADDIN_AUDIENCE` e `BANCO_NOTAS_ADDIN_SCOPE` continuam sem valores reais no repositório. O endpoint público do add-in permanece bloqueado.

## CI

Baseline verde comprovada antes da reconstrução Graph:

- run `32981711631` — **success**;
- formatting, lint, typecheck, semantic contract, testes e build aprovados;
- produção skipped.

Durante a reconstrução do diff Graph perdido houve uma execução intermediária, run `32985041877`, que falhou em typecheck porque um mock antigo ainda não possuía o novo método `download`. O teste foi atualizado nos commits posteriores.

A CI final do HEAD Graph reconstruído deve ser comprovada antes de declarar este bloco liberável.

## Bloqueios externos restantes

- audience/delegated scope Entra reais de homologação;
- drive/pasta SharePoint/OneDrive de homologação resolvidos e autorização Microsoft adequada;
- round-trip operacional real no Graph/SharePoint/Excel;
- atomicidade por binding D1 real em runtime Cloudflare de homologação autorizado;
- browser QA em ambiente navegável;
- construção dos módulos funcionais ainda planejados da interface.

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
- não fazer merge nem deploy de produção sem decisão humana explícita.

## Próxima sequência segura

1. obter CI final verde do bloco Graph reconstruído;
2. homologar Graph/SharePoint real somente em ambiente Microsoft autenticado e separado de produção;
3. preparar audience/scope Entra reais sem publicar add-in antes do gate completo;
4. comprovar atomicidade D1 por binding quando houver runtime de homologação autorizado;
5. avançar os módulos funcionais do Banco de Notas;
6. browser QA e release somente após homologação end-to-end.
