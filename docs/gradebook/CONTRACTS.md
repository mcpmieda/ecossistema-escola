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
| `SourceContractV1` | congelado; F1 validada definitivamente 7/7 |
| entidades acadêmicas V1 | congelado + persistência D1 local |
| resultados acadêmicos V1 | congelado + motor nativo/equivalência |
| import/reconciliação/Auditoria V1 | congelado + planejador/executor/persistência |
| `OperationalWorkspace V1` | HTTP/UI local-preview + hardening |
| `AuditWorkspace V1` | D1/runtime/HTTP/UI local-preview |
| `ClassPerformanceReadModelV1` + Performance Transport V1 | D1/read model/runtime/HTTP/UI local-preview |
| `BulletinModelV1` + Bulletin Transport V1 | preview/emissão/lote/snapshots/histórico/reimpressão HTTP/UI; sem PDF |
| `Council Workspace/Decision V1` | projeção oficial upstream + workspace/decisão/history/CAS HTTP/UI local-preview |

Migrations D1 continuam 0001–0003 / 21 tabelas. A onda 16 e a #332 não alteram schema.

## F1 — contrato da fonte

A #184 está `completed` e F1 = **7/7**. O protocolo privado controlado, smoke autenticado completo e falha isolada passaram; nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e não resta gate histórico real antigo.

Os antigos marcadores `controlled-real-corpus-validation-not-yet-recorded` e `complete-manifest-failure-smoke-not-yet-recorded` foram satisfeitos. Políticas gerais de segurança e futuros gates próprios de produção continuam fora dessa conclusão histórica.

## Valores/resultados

`AcademicGradeValueV1` mantém estados distintos para ausência, numérico, zero oficial/legado, não aplicável e dado insuficiente. Cobertura não é convertida silenciosamente em zero ou reprovação.

`AnnualFinalDecisionV1` permanece separado do estado calculado. Uma decisão `recorded` pode registrar `basis: 'class-council'`, mas o motor/projeção não fabrica deliberação humana.

## Pesquisa acadêmica

`GlobalSearchRequestV1` exige ano, query, escopo, página/cursor e ordem. O request não transporta autorização confiável do cliente. A implementação de matching permanece única; nenhuma experiência cria fuzzy/ranking paralelo.

## Operational Workspace F5

- um único `POST /api/gradebook/operational-workspace`;
- estados explícitos e ano explícito;
- navegação `kind + id` opaca;
- request gate com abort/dedupe/stale-response discard;
- troca de ano invalida contexto anterior;
- paginação não duplica resultados;
- nenhuma regra acadêmica ou evidência bruta no payload.

## Audit Workspace F4

```text
GradebookD1AuditWorkspaceSourceV1
  ↓
GradebookD1RuntimeV1.auditWorkspace(...)
  ↓
POST /api/gradebook/audit-workspace
```

Resolução usa `expectedVersion`/CAS; ator e instante são server-side; claims do navegador são proibidos. Promoção permanece exclusiva de `planImportReconciliation` + `executeImportChangePlan`.

## Performance F6

Contratos:

- `performance/class-performance-read-model-v1.ts` — contrato acadêmico/read model;
- `performance/performance-transport-v1.ts` — única fronteira serializável HTTP da superfície.

Composição:

```text
GradebookD1ClassPerformanceSourceV1
  ↓
createClassPerformanceReadModelV1
  ↓
GradebookD1RuntimeV1.classPerformanceReadModel()
  ↓
POST /api/gradebook/performance
```

Invariantes:

- quatro lentes: `result | quantitative | qualitative | assessments`;
- `regular | recovery`;
- rows/columns usam cursores opacos independentes;
- detalhe aluno/célula sob demanda;
- imported/calculated permanecem separados;
- `PERFORMANCE_AUTHORITY_MODE_V1 === 'imported-source'`;
- sem `comparisonPeriod` → sem comparação;
- comparação solicitada sem resolvedor oficial → `not-comparable`;
- anual em lente não-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`;
- demais lentes recovery continuam trimestrais;
- `officialRecords`, raw source evidence e proveniência bruta não atravessam HTTP;
- UI possui cancelamento/dedupe/stale discard, sem cálculo acadêmico.

## Boletins F8

Contratos:

- `bulletins/bulletin-contract-v1.ts` — `BulletinModelV1`, emissão e snapshots;
- `bulletins/bulletin-transport-v1.ts` — único transporte HTTP da experiência.

Invariantes pós-#326/#328:

- modelos `synthetic | composition | detailed` continuam derivados de resultados oficiais;
- preview chama o mesmo materializador de `BulletinModelV1` usado pela emissão;
- lote compartilha materialização agregada e isola resultados por aluno;
- aluno bloqueado não invalida aluno válido;
- snapshots são profundamente imutáveis, append-only e versionados;
- emissão idêntica reutiliza versão conforme contrato; mudança efetiva cria nova versão;
- histórico lista snapshots do registry local/preview;
- reimpressão usa exclusivamente snapshot histórico, com zero leitura acadêmica atual e sem criar novo snapshot;
- `BULLETIN_AUTHORITY_MODE_V1 === 'imported-source'`;
- `native-engine` continua rejeitado como autoridade;
- storage de snapshot permanece local/preview descartável.

### PDF

`PDF/renderização pendente por decisão arquitetural`. Não existe renderer/biblioteca PDF aprovada nesta integração. A próxima evolução deve tratar PDF como uma única decisão/frente grande e continuar consumindo o mesmo `BulletinModelV1`/snapshot canônico, sem segundo motor de template.

## Conselho F7

Contrato: `council/council-workspace-contract-v1.ts`.

A #327 definiu uma única fronteira `CouncilWorkspaceSourceV1` que **recebe projeções oficiais já resolvidas** e deliberadamente não oferece callback de cálculo. A #332 fornece sua fonte real local/preview:

```text
D1 existente
  ↓
createGradebookD1CouncilOfficialProjectionSourceV1(...)
  ↓
CouncilWorkspaceSourceV1
  ↓
createCouncilWorkspaceV1
  ↓
POST /api/gradebook/council-workspace
```

Invariantes da projeção #332:

- `resolveNativeAnnualOutcome` fica somente na projeção oficial upstream;
- Council Workspace não chama o resolvedor;
- o resolvedor usa o perfil 2026 existente, sem alteração;
- elegibilidade 0/1/2/3+/insuficiente vem de `NativeAnnualOutcomeV1`, não de contagem no workspace/UI;
- alterar somente o lado calculated dos registros não altera a autoridade importada projetada;
- `officialAnnualState` preserva o lado imported do `AnnualResultV1`;
- T1/T2/T3 usam `TermResultV1.officialGrade.imported.value`;
- REC usa `FinalRecoveryV1.recoveryGrade.imported.value` somente quando aplicável e unívoca;
- REC ausente → `not-applicable`;
- REC ambígua/incompatível → `insufficient-data`, nunca heurística;
- decisão formal coerente preexistente impede segunda decisão; incoerência falha fechada.

Invariantes do workspace/decisão:

- decisão formal humana é separada do cálculo;
- decisão só pode ser registrada quando `queueState` oficial é `eligible-for-council`;
- justificativa obrigatória em toda versão;
- `expectedVersion`/CAS e histórico append-only;
- ator vem da sessão server-side e instante do servidor;
- projeção para `AnnualFinalDecisionV1` usa somente `basis: 'class-council'` e campos existentes;
- nenhuma votação, contagem de votos, desempate, abstenção, frequência, participante/papel ou exceção nova.

O store atual é process-local/preview e descartável; não há promessa de durabilidade cross-restart.

## Compatibilidade conjunta da onda 16

Testes de integração congelam:

- bridges Operational, Audit, Performance, Boletins e Conselho únicos;
- autorização opaca, `gradebook.persistence.admin` e `no-store`;
- produção bloqueada antes de `GRADEBOOK_D1`;
- F6 quatro lentes/comparison fail-closed/raw evidence ausente/recovery correto;
- F8 preview e emissão sobre a mesma base, lote, snapshot/history e reimpressão histórica;
- F7 fonte #332 realmente composta, workspace sem callback/resolver, decisão/histórico/CAS;
- wiring das três páginas no shell;
- stale-response, teclado/foco/a11y;
- ausência de semântica acadêmica nova no wiring.

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
