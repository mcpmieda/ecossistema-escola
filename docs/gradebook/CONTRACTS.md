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
| `BulletinModelV1` + Bulletin Transport V1 | preview/emissão/lote/snapshots/histórico/reimpressão/PDF individual canônico |
| `Council Workspace/Decision V1` | projeção oficial upstream + workspace/decisão/history/CAS HTTP/UI local-preview |

Migrations D1 continuam 0001–0003 / 21 tabelas. A onda 17 não altera schema.

## F1 — contrato da fonte

A #184 está `completed` e F1 = **7/7**. O protocolo privado controlado, smoke autenticado completo e falha isolada passaram; nenhum arquivo real foi modificado, nenhum dado identificável foi publicado e não resta gate histórico real antigo.

## Valores/resultados

`AcademicGradeValueV1` mantém estados distintos para ausência, numérico, zero oficial/legado, não aplicável e dado insuficiente. Cobertura não é convertida silenciosamente em zero ou reprovação.

`AnnualFinalDecisionV1` permanece separado do estado calculado. Uma decisão `recorded` pode registrar `basis: 'class-council'`, mas motor/projeção não fabricam deliberação humana.

## Pesquisa acadêmica e navegação

`GlobalSearchRequestV1` exige ano, query, escopo, página/cursor e ordem. O request não transporta autorização confiável do cliente. A implementação de matching permanece única.

A navegação do shell não cria novo contrato acadêmico: resultados de áreas do Banco usam `#/banco-de-notas?area=<id>`. `normalizePlatformRoute` considera apenas a parte de rota antes de `?/#`, e o shell valida `area` contra a enumeração fechada de superfícies.

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

- contrato acadêmico/read model `ClassPerformanceReadModelV1`;
- transporte serializável único `performance-transport-v1.ts`;
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
- snapshots profundamente imutáveis, append-only e versionados;
- emissão idêntica reutiliza versão; mudança efetivamente impressa cria nova versão;
- reimpressão usa exclusivamente snapshot histórico e faz zero leitura acadêmica atual;
- `BULLETIN_AUTHORITY_MODE_V1 === 'imported-source'`;
- `native-engine` rejeitado como autoridade;
- storage de snapshot permanece local/preview descartável.

### PDF canônico — #335

PDF não cria novo modelo acadêmico.

```text
BulletinSnapshotV1
  ↓
BulletinPdfInputV1 / BulletinArtifactInputV1
  ↓
renderer client-side lazy
  ↓
PDF
```

- PDF oficial recebe somente snapshot canônico;
- reimpressão PDF usa o mesmo snapshot histórico, sem nova leitura/materialização e sem nova versão;
- renderer não faz fetch acadêmico e não calcula nota/REC/resultado;
- presentation helpers são compartilhados com a tela para manter semântica;
- renderer é carregado por `import()`;
- fonte Geist já empacotada; sem CDN/fonte privada/fonte do SO;
- Blob URLs temporárias/revogadas; nenhum storage acadêmico persistente no navegador;
- PDF em lote não faz parte desta versão; geração de arquivo é individual por snapshot;
- PDF raster não é tagged/text-selectable; essa limitação não altera o conteúdo canônico.

## Conselho F7

`CouncilWorkspaceSourceV1` recebe projeções oficiais já resolvidas e não oferece callback de cálculo. #332 fornece a fonte local/preview:

```text
D1 → createGradebookD1CouncilOfficialProjectionSourceV1(...)
   → CouncilWorkspaceSourceV1 → createCouncilWorkspaceV1
   → POST /api/gradebook/council-workspace
```

- `resolveNativeAnnualOutcome` fica somente upstream;
- Council Workspace não chama o resolvedor;
- 0/1/2/3+/insuficiente vêm de `NativeAnnualOutcomeV1`;
- lado calculated não vira autoridade;
- T1/T2/T3 usam `officialGrade.imported.value`;
- REC usa `recoveryGrade.imported.value` apenas quando aplicável/unívoca;
- REC ausente `not-applicable`; REC ambígua `insufficient-data`;
- decisão formal coerente preexistente impede segunda decisão;
- decisão humana requer justificativa + expectedVersion/CAS + histórico append-only;
- ator/instante server-side;
- store atual process-local/preview e sem durabilidade cross-restart.

## Compatibilidade conjunta da onda 17

A composição #335+#336 foi revalidada após resolução dos dois testes compartilhados. CI combinado: **100 arquivos / 819 testes**.

Testes congelam:

- cinco bridges únicos, auth server-side e no-store;
- produção antes do binding;
- F6 comparison fail-closed e recovery correto;
- F7 projeção #332 e workspace sem resolver elegibilidade;
- F8 preview/emissão/PDF/reprint sobre modelo/snapshot canônico;
- renderer PDF sob demanda e fora do entry inicial;
- shell/5 superfícies lazy e isoladas;
- ausência de storage acadêmico persistente no browser;
- ausência de retry silencioso de writes;
- deep-link da busca para área do Banco sem nova rota/bridge;
- foco/teclado/a11y/reduced-motion preservados.

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
