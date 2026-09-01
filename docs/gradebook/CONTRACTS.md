# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário público e registra a maturidade das implementações. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Regra transversal

- `authorityMode` continua `imported-source`;
- ano acadêmico é explícito;
- UI/HTTP não implementam regra de nota;
- adapters físicos não reinterpretam contratos;
- autorização efetiva pertence ao servidor;
- produção acadêmica permanece fail-closed antes do binding.

## Estado dos contratos

| Contrato | Estado atual |
| --- | --- |
| `SourceContractV1` | congelado/implementado sinteticamente; validação privada final pendente |
| entidades acadêmicas V1 | congelado + persistência D1 local |
| resultados acadêmicos V1 | congelado + motor nativo/equivalência |
| import/reconciliação/Auditoria V1 | congelado + planejador/executor/persistência |
| `OperationalWorkspace V1` | HTTP/UI local-preview + hardening |
| `AuditWorkspace V1` | D1/runtime/HTTP/UI local-preview |
| `ClassPerformanceReadModelV1` | D1 físico + read model + runtime interno; sem HTTP/UI |
| `BulletinModelV1` | emissão + materialização agregada + snapshots locais; sem HTTP/UI/PDF |

Migrations D1 continuam 0001–0003 / 21 tabelas. A onda 15 não altera schema.

## Valores/resultados

`AcademicGradeValueV1` mantém estados distintos para ausência, numérico, zero oficial/legado, não aplicável e dado insuficiente. Cobertura não é convertida silenciosamente em zero ou reprovação.

`AnnualFinalDecisionV1` permanece separado do estado calculado. Uma decisão `recorded` pode registrar `basis: 'class-council'`, mas o motor não fabrica deliberação.

## Pesquisa acadêmica

`GlobalSearchRequestV1` exige ano, query, escopo, página/cursor e ordem. O request não transporta autorização confiável do cliente. A implementação de matching permanece única; nenhuma experiência cria fuzzy/ranking paralelo.

## Operational Workspace F5

Contratos:

- `operational-workspace-contract-v1.ts`;
- `operational-workspace-transport-v1.ts`.

Invariantes após #317:

- um único `POST /api/gradebook/operational-workspace`;
- estados `loading | ready | empty | unavailable | not-authorized`;
- ano explícito;
- navegação `kind + id` opaca;
- aliases diretos para pesquisa existente;
- request gate com abort, dedupe e stale-response discard;
- troca de ano invalida o contexto anterior;
- continuação/paginação não duplica resultados;
- nenhuma regra acadêmica ou evidência bruta no payload.

## Audit Workspace F4

Contrato: `audit-workspace-contract-v1.ts`.

Implementação atual:

```text
AuditWorkspaceV1
  ↑
AuditWorkspaceSourceV1
  ↑
GradebookD1AuditWorkspaceSourceV1
  ↑
GradebookD1RuntimeV1.auditWorkspace(...)
  ↓
POST /api/gradebook/audit-workspace
```

Invariantes:

- listas de lotes/ocorrências/reconciliações em lote/keyset;
- detalhe por referência opaca;
- resolução `expectedVersion`/CAS;
- ator = identidade autenticada do servidor;
- instante = servidor;
- claims de ator/autorização do navegador são proibidos;
- promoção apenas informativa;
- `planImportReconciliation` + `executeImportChangePlan` continuam exclusivos.

## Class Performance F6

Contrato: `performance/class-performance-read-model-v1.ts`.

Implementação provider-independent: `createClassPerformanceReadModelV1(source)`.

Fonte física após #315:

`GradebookD1ClassPerformanceSourceV1` produz a projeção oficial em **seis queries em lote por materialização**, sem query D1 por aluno/célula.

Composição #318:

```text
GradebookD1ClassPerformanceSourceV1
  ↓
createClassPerformanceReadModelV1
  ↓
GradebookD1RuntimeV1.classPerformanceReadModel()
```

Semântica congelada:

- quatro lentes: `result | quantitative | qualitative | assessments`;
- rows/columns usam cursores opacos independentes;
- imported/calculated permanecem separados;
- `PERFORMANCE_AUTHORITY_MODE_V1 === 'imported-source'`;
- sem `comparisonPeriod` → sem comparação;
- `comparisonPeriod` solicitado sem resolvedor oficial → `not-comparable`, nunca comparação inventada;
- anual em lente não-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`;
- demais lentes recovery continuam sobre resultados trimestrais;
- detalhe de aluno/célula é sob demanda.

A #318 não cria contrato/rota/UI de transporte. O end-to-end pertence à #325. Se o React precisar de detalhes hoje definidos apenas no servidor, #325 pode criar **um único transporte coeso** dentro do namespace Performance, sem evidência bruta ou regra acadêmica.

## Boletins F8

Contrato: `bulletins/bulletin-contract-v1.ts`.

Após #316:

- modelos `synthetic | composition | detailed` continuam derivados de contratos/read models oficiais;
- materialização de lote compartilha a base da turma;
- snapshots são profundamente imutáveis, append-only e versionados;
- mesma emissão idêntica reutiliza a versão conforme contrato;
- mudança realmente impressa cria nova versão;
- reimpressão usa exclusivamente snapshot histórico, com zero leitura acadêmica atual;
- `BULLETIN_AUTHORITY_MODE_V1 === 'imported-source'`;
- `native-engine` continua rejeitado como autoridade.

Ainda não há HTTP/UI/PDF ou persistência remota. A #326 pode criar um único transporte coeso se necessário. Preview e emissão devem consumir o mesmo `BulletinModelV1`.

### PDF

Não existe renderer/biblioteca PDF integrada. #326 só inclui PDF se isso não exigir nova decisão arquitetural/runtime. Caso contrário registra **um único bloqueio de PDF**, sem fragmentar contrato/renderer/storage em microissues.

## Conselho F7 — próxima V1

A fundação anual existente define somente:

- 0 não aprovados → resultado anual aprovado conforme cálculo;
- 1–2 → elegibilidade básica quando cobertura completa;
- 3+ → não elegível por esse fundamento;
- cobertura insuficiente → nenhuma conclusão final inventada;
- decisão humana formal separada do cálculo.

#327 fica autorizada a criar **um único contrato operacional de Conselho V1** para fila, visão T1/T2/T3/REC, decisão humana, justificativa, histórico e CAS. Não pode expandir `AnnualFinalDecisionV1` nem inventar votação, desempate, frequência, participantes ou exceções.

## Compatibilidade conjunta da onda 15

Testes de integração congelam:

- bridges Audit e Operational únicos;
- nenhum Performance/Bulletin HTTP na #318;
- Performance composto apenas no runtime interno;
- semântica fail-closed de comparação/anual/recovery;
- hardening de snapshots de Boletins;
- request gate do Operational Workspace;
- `imported-source` em F6/F8;
- produção bloqueada antes de `GRADEBOOK_D1`.

## Próxima onda

- #325 — F6 end-to-end, incluindo transporte/HTTP/UI;
- #326 — F8 end-to-end, incluindo preview/emissão/reimpressão/lote/HTTP/UI;
- #327 — F7 Conselho V1;
- #328 — integração/wiring central.

F9 permanece transversal e sem frente dedicada nesta onda.

## Regras de evolução

1. mudança de significado exige nova versão/adaptação explícita;
2. regra acadêmica exige decisão oficial antes do código;
3. consumidores usam contratos públicos, não tabelas;
4. adapters não alteram semântica por conveniência física;
5. toda escrita de integridade aparece em plano/UoW/CAS explícito;
6. não criar implementação concorrente da mesma regra;
7. não criar bridge concorrente para a mesma superfície;
8. produção acadêmica só muda mediante autorização própria;
9. migrations, capabilities, papéis, bindings, secrets ou recursos remotos exigem escopo/decisão próprios.