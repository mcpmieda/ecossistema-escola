# Banco de Notas — Homologação M365, compartilhamento e Excel

Período da evidência: 26–27/08/2026

Branch: `feat/banco-de-notas-foundation`

PR: `#52` — open, draft, sem merge.

## Resultado consolidado

Foi comprovado, com dados exclusivamente sintéticos, o ciclo operacional:

```text
professor destinatário
→ Excel Online
→ SharePoint
→ Microsoft Graph
→ Banco de Notas
```

A conta autorizada abriu o modelo genérico no Excel Online, editou uma nota mapeada, o serviço Microsoft salvou o workbook, o backend baixou o mesmo arquivo, validou sua integridade e o analyzer OOXML encontrou o novo valor no mesmo mapping. Depois da prova, a permissão individual foi revogada e o XLSX foi excluído.

Produção, D1 de produção, Pages de produção e sync permaneceram inalterados.

## Boundary autorizado

Todo o ensaio foi limitado a:

`CENTROADMIN → ARQUIVOS_PLATAFORMA → BANCO_NOTAS_HOMOLOGACAO`

A pasta dedicada foi resolvida em runtime. IDs de drive/item não foram embutidos no produto.

A pasta permanece como boundary autorizado de homologação. Todos os XLSX sintéticos criados durante as provas foram removidos.

## Readiness Microsoft 365

Run `33003875460` — success:

- GitHub OIDC → Entra workload federation;
- audience válida;
- `Sites.Selected` presente;
- site acessível;
- bibliotecas institucionais descobertas;
- nenhuma escrita nesta etapa;
- sync não ativado.

## Storage Graph/SharePoint

Run final do gate: `33025586408` — success.

Foi comprovado:

1. geração de XLSX sintético genérico;
2. SHA-256 local;
3. resolução de drive/pasta sem hardcode;
4. upload pelo gateway Graph real do produto;
5. leitura de metadata;
6. download do item recém-criado;
7. MIME XLSX e assinatura ZIP;
8. reanálise OOXML;
9. preservação de turma, componente, estudante e mappings;
10. findings vazios;
11. remoção do arquivo;
12. retenção somente da pasta dedicada.

## Normalização do pacote pelo SharePoint

O XLSX local e o pacote devolvido pelo SharePoint não são necessariamente byte a byte idênticos. O serviço acrescentou metadados gerenciados, incluindo `customXml`, propriedades customizadas e relações/content types auxiliares.

O gate permanente em `server/banco-notas/xlsx-sharepoint-integrity.ts` é fail-closed:

- aceita igualdade exata quando não há normalização;
- quando há normalização, exige preservação das partes originais do produto;
- valida relações, content types e propriedades core;
- aceita somente adições server-managed conhecidas;
- rejeita alteração de worksheets;
- rejeita remoção de partes originais;
- rejeita adições inesperadas sob `xl/`;
- rejeita macros/VBA e relações externas no pacote editado.

A integridade não foi enfraquecida para acomodar diferenças legítimas do serviço.

## Identidade Entra e D1 de homologação

A conta autorizada foi confirmada no Entra como membro habilitado:

`GUI@escolaieda.com`

O Object ID real foi conferido, mas não é reproduzido nesta evidência.

Run D1 `33026452850` — success:

- professor sintético ligado ao OID autorizado;
- modelo sintético ligado ao professor;
- estado `ready_to_share`;
- `environment=homologation`;
- `sync_enabled=0`;
- migrations `0001`–`0007` confirmadas.

Identificadores da prova:

- `teacherModelId` do D1: `homologation-share-model-20260826`;
- `teacherId` do D1: `homologation-share-teacher-20260826`;
- `modelId` genérico dentro do workbook: `71111111-1111-4111-8111-111111111111`.

Esses identificadores pertencem a camadas diferentes e não devem ser confundidos.

## Compartilhamento individual

Run final: `33026888705` — success.

O share comprovou:

- destinatário individual exatamente `GUI@escolaieda.com`;
- OID concedido igual ao OID esperado;
- role mínima de teste `write`;
- login obrigatório;
- `sendInvitation=false`;
- nenhum `Anyone`;
- nenhum link anônimo;
- nenhuma concessão para a organização inteira;
- nenhum grupo;
- nenhum novo usuário adicional além do destinatário;
- pacote baixado e reanalisado antes de considerar o share válido;
- sync desligado.

Uma primeira tentativa, run `33026678794`, falhou fechada ao classificar uma permissão efetiva preexistente como nova. A compensação revogou a permissão recém-criada e removeu o XLSX. O critério foi corrigido para comparar o baseline antes/depois sem flexibilizar as proibições de compartilhamento amplo.

## Compatibilidade com Excel Online

O primeiro XLSX compartilhado abriu com reparação e somente leitura. A causa estava no serializer OOXML:

1. células e definições de colunas eram emitidas fora da ordem crescente;
2. a worksheet apontava `workbookViewId=0`, mas o workbook não possuía `<bookViews>`.

A correção permanente em `server/banco-notas/xlsx-workbook-serializer.ts` passou na CI `33073736978`.

O arquivo incompatível foi substituído de forma one-shot no run `33074034916`; a permission e o item anteriores foram removidos. O workbook corrigido abriu normalmente no Excel Online em modo de edição, sem reparação.

## Edição sintética controlada

Conta: `GUI@escolaieda.com`

Worksheet: `Turma Sintética - Matemática`

Estudante: `Estudante Sintético`

Componente: `Matemática`

Mapping editado:

- `gradeKey`: `2026|73333333-3333-4333-8333-333333333333|74444444-4444-4444-8444-444444444444|75555555-5555-4555-8555-555555555555`;
- `field`: `NotaT1`;
- `sheetKey`: `generated:73333333-3333-4333-8333-333333333333:74444444-4444-4444-8444-444444444444`;
- `cellAddress`: `B2`;
- valor anterior: ausente/nulo;
- valor digitado na interface: `8,5`;
- valor numérico OOXML: `8.5`.

Nenhum layout, worksheet, estudante ou estrutura foi alterado. O Excel Online confirmou o salvamento.

## Round-trip Excel → Graph → Banco

Run técnico principal: `33075802785` — success.

A prova confirmou:

- arquivo correto localizado no boundary dedicado;
- identidade/permissão do destinatário conferida;
- download pelo Microsoft Graph;
- tamanho baixado: `13.938` bytes;
- MIME XLSX;
- SHA-256 observado com prefixo `22e6947e...`;
- pacote classificado como `excel_edited`;
- integridade semântica aprovada;
- reanálise OOXML aprovada;
- `reanalyzedValue=8.5`;
- mesmo `gradeKey`, `field`, `sheetKey` e `B2`;
- `sync_enabled=0`.

O schema/analyzer passou a expor `sourceValue` opcional e possui regressões que distinguem zero de ausência.

O gate `assertEditedSharePointWorkbookIntegrity` exige, entre outros pontos:

- ausência de macros/VBA e relações externas;
- uma worksheet visível e `_BancoNotas` em `veryHidden`;
- estudante e modelo esperados;
- mapping e célula esperados;
- valor exato esperado.

## Revogação e cleanup final

A permission individual foi revogada e a ausência foi confirmada via Graph.

A primeira exclusão do arquivo recebeu `423 Locked` por lock de coautoria/WOPI do Excel Online. A aba foi fechada, mas o lock persistiu temporariamente.

Foi implementado suporte opt-in a:

`Prefer: bypass-shared-lock`

O header é enviado somente quando `remove(..., bypassSharedLock: true)` é solicitado. A revogação de permission e a exclusão comum continuam sem esse header. Testes permanentes garantem a separação.

Run final de cleanup: `33076985566` — success.

Artefato redigido comprovou:

- `recipientPermissionAlreadyAbsent=true`;
- `permissionBoundaryVerified=true`;
- `permissionRevocationConfirmed=true`;
- `workbookRemoved=true`;
- `workbookRemovalConfirmed=true`;
- `dedicatedFolderRetained=true`;
- `syncEnabled=false`.

O campo `recipientIdentityMatch=false` no artefato final decorre de a permission já estar ausente; não havia identidade ativa a comparar. A ausência e o boundary foram comprovados pelos campos específicos acima.

## Encerramento dos mecanismos temporários

Commit de limpeza: `a539417e09740db54c4f97ebbb62acc741bd0de2`.

Foram removidos:

- job M365 one-shot de `.github/workflows/ci.yml`;
- teste externo temporário `tests/banco-notas-m365-storage-homologation.test.ts`;
- OID e UPN reais do workflow D1 padrão;
- etapa automática de preparação do professor autorizado.

Foram preservados:

- serializer compatível com Excel Online;
- analyzer com valores das células;
- gate de integridade SharePoint/Excel;
- transporte Graph binário;
- `bypass-shared-lock` opt-in;
- unit tests e regressões permanentes;
- script manual protegido para preparação de share em homologação.

## Baseline limpa final

CI `33078535334` — success:

- formatting — success;
- lint — success;
- typecheck — success;
- semantic contract — success;
- testes — `302/302` em `55` arquivos;
- build — success;
- GitHub Actions security — success;
- deploy de produção — skipped;
- recovery pós-deploy — skipped.

D1 homologation `33078530136` — success:

- database exclusivo reutilizado;
- Wrangler `4.125.0`;
- migrations `0001`–`0007` confirmadas;
- core smoke — success;
- analysis profiles smoke — success;
- estado final de identidade/status com sync `0`;
- nenhuma preparação pessoal automática no workflow.

## Segurança e limites

- nenhum dado real de estudante foi usado;
- nenhum secret, token, cookie, senha ou MFA foi registrado;
- nenhuma permission ampla foi criada;
- nenhum arquivo temporário permaneceu;
- nenhuma permission individual do ensaio permaneceu;
- nenhuma produção foi implantada ou alterada;
- nenhum add-in foi publicado;
- sync permaneceu desligado;
- o PR #52 permaneceu draft e sem merge.

O ensaio utilizou um **modelo genérico limpo**. Os **golden masters privados externos** não entraram em Git, runtime, D1, fixtures públicas, SharePoint definitivo ou distribuição.

## Próximos gates independentes

1. audience e delegated scope reais do add-in Entra;
2. bearer/ownership end-to-end do add-in sem publicação pública antecipada;
3. atomicidade por binding D1 real em runtime Cloudflare de homologação autorizado;
4. módulos funcionais e browser QA do produto.
