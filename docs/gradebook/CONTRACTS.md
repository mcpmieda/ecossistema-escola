# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário público e registra a maturidade das implementações. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Regra transversal

- `authorityMode` continua `imported-source`;
- ano acadêmico é explícito;
- UI/HTTP/renderer não implementam regra de nota;
- adapters físicos não reinterpretam contratos;
- autorização efetiva pertence ao servidor;
- produção acadêmica permanece fail-closed antes do binding.

## Estado dos contratos

| Contrato | Estado atual |
| --- | --- |
| `SourceContractV1` | congelado; F1 validada definitivamente 7/7 |
| entidades acadêmicas V1 | congelado + persistência D1 local |
| resultados acadêmicos V1 | congelado + motor nativo/equivalência |
| import/reconciliação/Auditoria V1 | congelado + planejador/executor/persistência |
| `OperationalWorkspace V1` | HTTP/UI local-preview + hardening |
| `AuditWorkspace V1` | D1/runtime/HTTP/UI local-preview |
| `ClassPerformanceReadModelV1` + Performance Transport V1 | D1/read model/runtime/HTTP/UI local-preview |
| `BulletinModelV1` + Bulletin Transport V1 | preview/emissão/snapshots duráveis/history/reprint/PDF individual + batch bounded |
| `Institutional Reports V1` | cinco famílias oficiais + HTTP/UI; indicadores derivados sem semântica ficam fail-closed |
| `Council Workspace/Decision V1` | projeção oficial upstream + decisões duráveis/history/CAS |
| `Council Institutional V2` | revisão/fechamento/fotografia/histórico + votação opcional, mesmo bridge V1 |

Migrations D1 locais: 0001–0004 / 25 tabelas. A 0004 é exclusiva da durabilidade de snapshots de Boletins e decisões de Conselho.

## F1 — contrato da fonte

A #184 está `completed` e F1 = **7/7**. O protocolo privado controlado, smoke autenticado completo e falha isolada passaram; nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e não resta gate histórico real antigo.

## Valores/resultados

`AcademicGradeValueV1` mantém estados distintos para ausência, numérico, zero oficial/legado, não aplicável e dado insuficiente. Cobertura não é convertida silenciosamente em zero ou reprovação.

`AnnualFinalDecisionV1` permanece separado do estado calculado. Uma decisão `recorded` pode registrar `basis: 'class-council'`, mas motor/projeção não fabricam deliberação humana.

## Pesquisa acadêmica e navegação

`GlobalSearchRequestV1` exige ano, query, escopo, página/cursor e ordem. O request não transporta autorização confiável do cliente. A implementação de matching permanece única.

A navegação usa `#/banco-de-notas?area=<id>`; o shell valida `area` contra a enumeração fechada `importacao | operational | audit | performance | bulletins | reports | council`.

## Operational Workspace F5

- um único `POST /api/gradebook/operational-workspace`;
- estados/ano explícitos;
- navegação `kind + id` opaca;
- abort/dedupe/stale-response discard;
- paginação sem duplicação;
- nenhuma regra acadêmica/evidência bruta no payload.

## Audit Workspace F4

`GradebookD1AuditWorkspaceSourceV1 → GradebookD1RuntimeV1.auditWorkspace(...) → POST /api/gradebook/audit-workspace`.

Resolução usa `expectedVersion`/CAS; ator e instante server-side. Promoção permanece exclusiva de `planImportReconciliation` + `executeImportChangePlan`.

## Performance F6

- `ClassPerformanceReadModelV1` + transporte serializável único;
- quatro lentes `result | quantitative | qualitative | assessments`;
- `regular | recovery`;
- cursores rows/columns independentes;
- detalhe aluno/célula sob demanda;
- imported/calculated separados;
- `PERFORMANCE_AUTHORITY_MODE_V1 === 'imported-source'`;
- comparação solicitada sem resolvedor oficial → `not-comparable`;
- annual non-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`; demais lentes recovery são trimestrais;
- raw source evidence/`officialRecords` não atravessam HTTP;
- UI possui cancelamento/dedupe/stale discard sem cálculo acadêmico.

## Boletins F8

Contratos:

- `bulletins/bulletin-contract-v1.ts` — `BulletinModelV1`, emissão, snapshots e `BulletinArtifactInputV1`/`BulletinPdfInputV1`;
- `bulletins/bulletin-transport-v1.ts` — transporte HTTP da experiência.

Invariantes:

- `synthetic | composition | detailed` derivados de resultados oficiais;
- preview e emissão usam o mesmo materializador;
- lote acadêmico compartilha materialização agregada e isola resultados por aluno;
- snapshots profundamente imutáveis, append-only, versionados e persistidos em D1 local/preview;
- emissão idêntica reutiliza versão; mudança efetivamente impressa cria nova versão;
- reimpressão usa exclusivamente snapshot histórico e faz zero leitura acadêmica atual;
- `BULLETIN_AUTHORITY_MODE_V1 === 'imported-source'`;
- `native-engine` não é autoridade ativa nesta onda.

### PDF canônico

```text
BulletinSnapshotV1
  ↓
BulletinPdfInputV1 / BulletinArtifactInputV1
  ↓
renderer client-side lazy
  ↓
PDF individual ou batch bounded
```

- PDF oficial recebe somente snapshot/modelo canônico;
- renderer não faz fetch acadêmico e não calcula nota/REC/resultado;
- fonte Geist já empacotada; sem CDN/fonte privada/fonte do SO;
- Blob URLs temporárias/revogadas; nenhum storage acadêmico persistente no navegador;
- batch PDF é sequencial e bounded: `maxDocuments: 3`, `maxTotalPages: 72`, `concurrentDocuments: 1`;
- reprint batch aceita exclusivamente snapshots históricos;
- falha de um snapshot não corrompe artefatos válidos;
- nenhum queue/worker/storage remoto foi criado.

## Relatórios institucionais F8

`Institutional Reports V1` projeta somente dados/read models/snapshots oficiais e usa um único `POST /api/gradebook/reports`.

Famílias:

- resultados/aproveitamento oficial por turma;
- composição;
- recuperação;
- Conselho;
- Auditoria.

O contrato registra o hard stop de indicadores derivados: taxas, médias, rankings ou agregações que exigem semântica acadêmica não congelada permanecem `official-semantics-not-integrated`; nenhum consumidor pode substituí-lo por heurística local.

## Conselho F7 V1/V2

`CouncilWorkspaceSourceV1` recebe projeções oficiais já resolvidas. #332 fornece a fonte D1 upstream:

```text
D1 → createGradebookD1CouncilOfficialProjectionSourceV1(...)
   → CouncilWorkspaceSourceV1
      ├── createCouncilWorkspaceV1
      └── createCouncilInstitutionalWorkspaceV2
   → POST /api/gradebook/council-workspace
```

### V1

- `resolveNativeAnnualOutcome` fica somente upstream;
- Council Workspace não chama o resolvedor;
- 0/1/2/3+/insuficiente vêm da projeção oficial;
- lado calculated não vira autoridade;
- T1/T2/T3 usam `officialGrade.imported.value`;
- REC usa `recoveryGrade.imported.value` apenas quando aplicável/unívoca;
- decisão humana requer justificativa + expectedVersion/CAS + histórico append-only;
- decisões persistem em D1 local/preview pela #340;
- ator/instante server-side.

### V2 institucional

- revisão explícita antes do fechamento;
- reunião `open | closed` ou equivalente do contrato;
- fechamento cria fotografia imutável da fila/decisões;
- histórico de fechamentos não é reinterpretado retroativamente;
- edição/contagem depois do fechamento é rejeitada;
- votação numérica é opcional, com inteiros não negativos;
- não existe campo de abstenção;
- votação não cria decisão;
- empate nunca é resolvido automaticamente;
- identidade de diretor permanece `not-formalized-fail-closed` e `ADMINISTRADOR` não é inferido como diretor;
- sessão/reunião V2 continua provider-independent/process-local nesta versão; a 0004 não adiciona persistência para esse agregado.

## Compatibilidade conjunta da onda 18

Testes de integração congelam:

- seis bridges únicos, auth server-side e no-store;
- produção antes do binding;
- migration 0004 apenas local/preview;
- snapshots Bulletin + decisões Council duráveis e CAS;
- F6 comparison fail-closed;
- F7 V2 no bridge existente, sem diretor inventado;
- F8 PDF individual/batch e reprint sobre snapshot canônico;
- Reports sem indicador acadêmico novo;
- superfícies lazy/isoladas e deep-link de Reports;
- ausência de storage acadêmico persistente no browser;
- ausência de retry silencioso de writes;
- foco/teclado/a11y preservados.

## Regras de evolução

1. mudança de significado exige nova versão/adaptação explícita;
2. regra acadêmica exige decisão oficial antes do código;
3. consumidores usam contratos públicos, não tabelas;
4. adapters não alteram semântica por conveniência física;
5. escrita de integridade aparece em plano/UoW/CAS explícito;
6. não criar implementação concorrente da mesma regra;
7. não criar bridge concorrente para a mesma superfície;
8. produção acadêmica só muda mediante autorização própria;
9. migrations, capabilities, papéis, bindings, secrets ou recursos remotos exigem escopo/decisão próprios.
