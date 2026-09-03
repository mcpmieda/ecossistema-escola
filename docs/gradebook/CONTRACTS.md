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

| Contrato                                                 | Estado atual                                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SourceContractV1`                                       | histórico congelado; F1 validada definitivamente 7/7; sem reinterpretação retroativa                                                                    |
| `SourceContractV2`                                       | contrato prospectivo fixado pela #365, implementado pela #366 e integrado/revalidado pela #367                                                          |
| entidades acadêmicas V1                                  | congelado + persistência D1 local                                                                                                                       |
| resultados acadêmicos V1                                 | histórico congelado + motor nativo/equivalência; tipos `written/simulation` continuam interpretáveis somente sob V1                                     |
| `AssessmentComponent/Results V2`                         | evolução mínima da #365 com `quantitative-assessment`, identidade estrutural estável e componente completo somente quando a definição estiver resolvida |
| import/reconciliação/Auditoria V1                        | congelado + planejador/executor/persistência                                                                                                            |
| `GradebookImportPersistenceTransportV1`                  | contrato #409 fechado; uma fonte reconhecida por request, sem workbook/binário/plano do cliente; implementação reservada à #410                         |
| `Performance Comparison V2`                              | contrato compartilhado da #371; percentual profile-aware/configuração server-side; runtime ainda não integrado                                          |
| `Reconciliation V2`                                      | contrato compartilhado da #371; correção determinística auditável sem reinterpretar V1; runtime ainda não integrado                                     |
| `OperationalWorkspace V1`                                | HTTP/UI local-preview + hardening                                                                                                                       |
| `AuditWorkspace V1`                                      | D1/runtime/HTTP/UI local-preview                                                                                                                        |
| `ClassPerformanceReadModelV1` + Performance Transport V1 | D1/read model/runtime/HTTP/UI local-preview                                                                                                             |
| `BulletinModelV1` + Bulletin Transport V1                | preview/emissão/snapshots duráveis/history/reprint/PDF individual + batch bounded                                                                       |
| `Institutional Reports V1`                               | cinco famílias oficiais + HTTP/UI; indicadores derivados sem semântica ficam fail-closed                                                                |
| `Council Workspace/Decision V1`                          | projeção oficial upstream + decisões duráveis/history/CAS                                                                                               |
| `Council Institutional V2`                               | revisão/fechamento/fotografia/histórico + votação opcional, mesmo bridge V1                                                                             |

Migrations D1 locais/remotas: 0001–0005 / 27 tabelas. A 0004 persiste snapshots de Boletins e decisões V1 do Conselho; a 0005 persiste a sessão institucional V2 sem alterar a porta provider-independent. A #399 confirmou schema remoto 5/27 com gate OFF.

## F1 — contrato da fonte

A #184 está `completed` e F1 = **7/7** segundo o contrato e protocolo então vigentes. O protocolo privado controlado, smoke autenticado completo e falha isolada passaram; nenhum arquivo real foi modificado e nenhum dado identificável foi publicado.

A descoberta posterior que originou a #365 é uma omissão de modelagem dos cabeçalhos de avaliação. Ela não invalida nem reescreve retroativamente a F1: `SourceContractV1` continua sendo a autoridade para interpretar evidência histórica V1, enquanto `SourceContractV2` é prospectivo.

## Onda 21 — fidelidade das definições de avaliação

A sequência pré-piloto `#365 contrato → #366 implementação → #367 integração/readiness` foi concluída. O projeto retorna aos gates manuais F9 sem ativação automática.

### SourceContractV2

Nos trimestres regulares:

- `R3` = máximo/configuração da `Avaliação quantitativa 1`;
- `S3` = máximo/configuração da `Avaliação quantitativa 2`;
- `R/S` linhas `5+` = lançamentos individuais;
- `AA3:AJ3` = máximo/configuração bruta dos slots qualitativos;
- `AA4:AJ4` = nome/descrição livre;
- `AA5:AJ...` = lançamentos individuais dos mesmos slots.

O contrato V2 preserva máximo/configuração como estado documental:

- `numeric` — número bruto preservado;
- `ambiguous-empty` — vazio preservado;
- `ambiguous-marker` — `*` preservado;
- `missing-field` — campo ausente;
- `unrecognized` — valor bruto não reconhecido para esse cabeçalho.

Somente máximo numérico finito e positivo, junto das demais evidências suficientes, permite resolução. Vazio, `*`, campo ausente, valor não reconhecido ou máximo não positivo ficam `insufficient-data`; não viram `not-applicable` sem evidência explícita e não recebem `maximum = 0` artificial.

O texto livre qualitativo é preservado mesmo se a definição estiver incompleta. R/S não possuem nome pedagógico livre na fonte; seus únicos rótulos seguros são estruturais. É proibido inferir `S => simulation` ou `R => written` por posição física.

### AssessmentComponent/Results V2

`ASSESSMENT_COMPONENT_TYPES_V2` usa:

- `quantitative-assessment`;
- `qualitative-activity`;
- `parallel-recovery`.

`written` e `simulation` permanecem no vocabulário V1 apenas para interpretar registros históricos que foram materializados sob V1. V2 não os usa para classificar R/S.

`AssessmentComponentV2.maximum` continua numérico porque V2 só materializa componente acadêmico completo quando a definição da fonte está resolvida. Cabeçalho incompleto permanece como `SourceAssessmentDefinitionV2`/resolução `insufficient-data`, preservando evidência sem fabricar componente.

### Identidade/versionamento dos componentes

A identidade de origem V2 é estrutural e inclui:

- referência da fonte lógica confirmada;
- `academicYearId`;
- `teachingAssignmentId` resolvido;
- trimestre;
- slot de origem `R | S | AA...AJ`.

`TeachingAssignmentV1` já vincula professor, turma, componente e ano; esses campos não são duplicados na chave para evitar duas fontes de verdade. O ID acadêmico externo continua opaco.

Nome e máximo são **excluídos** da chave. Assim, mudança de nome/máximo no mesmo slot pode versionar a mesma definição; omissão/ambiguidade posterior não autoriza apagar histórico; contextos/trimestres/slots/fontes diferentes não colidem.

### Agregados e regras que não mudam

A granularidade nova não recalcula nem redefine:

- `T` total quantitativo importado;
- `Z` avaliação/recuperação paralela;
- `AK` total qualitativo importado;
- `AM` nota oficial trimestral importada;
- `AN` acumulado anual importado.

Também não cria pesos, percentuais por atividade, médias, rankings, comparação entre períodos, materialidade ou tolerância. A comparação proporcional integrada na onda 22 permanece uma projeção independente sobre percentuais oficiais já resolvidos.

## Valores/resultados

`AcademicGradeValueV1` mantém estados distintos para ausência, numérico, zero oficial/legado, não aplicável e dado insuficiente. Cobertura não é convertida silenciosamente em zero ou reprovação.

`ApplicabilityV1` continua distinguindo `applicable | not-applicable | insufficient-data`. A evolução V2 usa esse vocabulário existente e não inventa outro estado acadêmico.

`AnnualFinalDecisionV1` permanece separado do estado calculado. Uma decisão `recorded` pode registrar `basis: 'class-council'`, mas motor/projeção não fabricam deliberação humana.

## Importação → persistência — transporte V1 (#409)

`GradebookImportPersistenceTransportV1`, em `shared/gradebook-contracts/imports/import-persistence-transport-v1.ts`, fecha somente a fronteira serializável para a futura #410. O arquivo continua lido e reconhecido no navegador; XLSB/XLSX/XLS, `File`, `ArrayBuffer`, workbook/worksheet SheetJS, caminho local, estado React e funções não atravessam HTTP.

### Request

A unidade é `one-recognized-source-file-per-request`. O request V1 contém apenas:

- manifesto JSON-safe V2 e SHA-256 observado localmente;
- sugestões reconhecidas (`academicYear`, `teacherName`) isoladas e não autoritativas;
- contexto confirmado por referências opacas existentes: `academicYearId` e `logicalSourceId`;
- por guia acadêmica, labels reconhecidos separados do `teachingAssignmentId` confirmado;
- por linha, somente `sourceRow`, `studentId`/`enrollmentId` confirmados e observações acadêmicas;
- definições por slot estrutural R/S/AA:AJ sem ID, tipo, ordem ou proveniência técnica enviados; esses campos são reconstruídos pelo contrato oficial;
- valores reconhecidos de avaliações/agregados/REC e diagnósticos sanitizados necessários ao fail-closed.

Nome de arquivo, professor, turma, disciplina, aluno e atividade não é chave técnica. O servidor deve buscar e validar as referências opacas contra o ano, assignment, turma, enrollment e fonte lógica atuais. A identidade de componente continua derivada de `logicalSourceId + academicYearId + teachingAssignmentId + term + sourceSlot`; identidade de GradeEntry/registro, lote/versão, estado `new | changed | unchanged`, plano, writes, `expectedVersion`, CAS e `authorityMode` são exclusivamente server-side.

`ImportBatchResultV1`, `AssessmentDefinitionMaterializationV2`, `AssessmentComponentV2`, `GradeEntryV1` e demais `AcademicRecordV1` não atravessam inteiros: eles carregam IDs, versões, lado calculated, autoridade ou decisões de planejamento pertencentes ao servidor. O transporte reutiliza somente o subconjunto JSON-safe do manifesto e as observações de fonte necessárias; o backend deriva o `SourceFileManifestId` do SHA-256 e reconstrói os contratos oficiais antes de chamar os planners.

### Bounds e inspeção

- seleção no navegador: até 50 arquivos, preservada;
- arquivos por request: exatamente 1;
- body HTTP máximo contratado: 8 MiB;
- até 128 guias, 512 observações de aluno por guia e 20.000 observações por request;
- cada guia trimestral carrega exatamente os 12 slots R/S/AA:AJ, no máximo 12 valores por aluno;
- até 256 diagnósticos;
- processamento futuro: bounded e sequencial, sem queue, worker ou storage intermediário remoto.

`inspectGradebookImportPersistenceRequestV1`, `isGradebookImportPersistenceRequestV1`, `containsGradebookImportPersistenceForbiddenClientFieldV1` e `isGradebookImportPersistenceResponseV1` rejeitam chaves desconhecidas e shapes incoerentes. O inspector classifica fail-closed `forbidden-client-payload | payload-too-large | invalid-context | duplicate-identity | blocked-definition | blocking-diagnostic | invalid-academic-shape`; incompatibilidade com D1 exige validação server-side antes de planejar.

São explicitamente proibidos no request: binário/buffer/workbook/worksheet/path; `ImportChangePlanV1`, promotion request, writes/mutações; `expectedVersion`/`expectedBatchVersion`/CAS; SQL/DDL; `authorityMode`/resultado nativo; decisão de Conselho; payload persistido e IDs de recurso/banco Cloudflare.

### Response e segurança

A resposta sanitizada distingue `applied | no-changes | review-required | blocked | conflict | invalid-request | not-authorized | unavailable`. Somente estados de revisão com localização acadêmica mínima e contagens agregadas de definições, componentes, registros e writes planejados/confirmados podem ser devolvidos. SQL, payload bruto, versões/CAS internos, evidência de célula, resource IDs e detalhes D1 não fazem parte da resposta.

A #410 deve usar um único bridge no padrão existente, aplicar `readBoundedJson` com o limite contratado, inspector compartilhado, `requireAuth`, `gradebook.persistence.admin`, `enforceOfficialOrigin`, `enforceWriteOrigin`, `no-store` e `GRADEBOOK_PRODUCTION_ENABLED`; validar todas as referências no D1; reconstruir materialização V2 e registros oficiais; chamar somente `planAssessmentImportReconciliationV2`/`planImportReconciliation` e `executeImportChangePlan`/UoW transacional; mapear apenas a resposta sanitizada. Nenhum storage acadêmico persistente no browser, planner/executor paralelo, migration, schema ou autoridade nova é autorizado.

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

A #366 passou a alimentar a lente `assessments` com componentes oficiais V2, preservando o read model/HTTP/UI V1, seis queries físicas e o hard stop de comparação. A #367 revalidou a composição sem criar métrica nova.

## Compatibilidade conjunta da onda 21

Testes de integração congelam:

- R3/S3 e AA3:AJ4 separados dos lançamentos da linha 5+;
- R/S como `quantitative-assessment`, sem inferência `simulation`;
- definição incompleta sem `maximum = 0`, componente fictício ou GradeEntry órfão;
- identidade estável, CAS, append-only e executor transacional únicos;
- T/Z/AK/AM/AN e motor 2026 sem recomposição granular;
- Centrais, Desempenho, Boletins e Relatórios compatíveis com V1/V2;
- snapshots/reprints V1 históricos sem reinterpretação;
- migrations 0001–0004, produção fail-closed e readiness `prepared-for-manual-authorization`.

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
- sessão/reunião V2 continua provider-independent no contrato e usa o store D1 da 0005 no runtime central; a implementação local permanece apenas para testes isolados.

## Compatibilidade conjunta da onda 18

Testes de integração congelam:

- seis bridges únicos, auth server-side e no-store;
- produção antes do binding;
- migration 0004 apenas local/preview;
- snapshots Bulletin + decisões Council duráveis e CAS;
- F6 sem comparação inventada nos contratos históricos; a evolução V2 posterior permanece isolada;
- F7 V2 no bridge existente, sem diretor inventado;
- F8 PDF individual/batch e reprint sobre snapshot canônico;
- Reports sem indicador acadêmico novo;
- superfícies lazy/isoladas e deep-link de Reports;
- ausência de storage acadêmico persistente no browser;
- ausência de retry silencioso de writes;
- foco/teclado/a11y preservados.

## Onda 22 — comparação proporcional e correção determinística

A #371 congelou os contratos compartilhados; #372 e #373 os consomem sem ampliar sua semântica. A composição da #374 preserva produção, piloto e `authorityMode` desativados.

### Performance Comparison V2

`shared/gradebook-contracts/performance/performance-comparison-contract-v2.ts` preserva `ClassPerformanceReadModelV1` e adiciona uma evolução explícita para a comparação:

- `basis = percentage` exclusivamente sobre percentual oficial já resolvido pelo perfil aplicável a cada período;
- `current` é o período em foco e `reference` é o período explicitamente selecionado; não existe referência oculta;
- relação `proportionally-higher | proportionally-equal | proportionally-lower` sem epsilon/tolerância;
- perfil diferente continua comparável quando a compatibilidade semântica é oficialmente declarada; identidade de perfil não cria compatibilidade por heurística;
- cobertura parcial/insuficiente/não aplicável e percentual ausente/não aplicável/insuficiente permanecem `not-comparable` com razão fechada e sanitizada;
- zero continua valor comparável, nunca ausência;
- nenhuma média, ranking, tendência composta, índice ou percentual por atividade é criado.

A configuração usa a forma já existente de `PlatformConfiguration`/`PLATAFORMA_CONFIGURACOES`: chave `gradebook.performance.proportional-comparison`, escopo `global`, versão/vigência e `active` mapeado server-side para `enabled`. Sem linha aplicável, o default canônico é `enabled: true`. Estado desabilitado é explícito e não vira `match` nem `not-comparable`.

O snapshot atual possui somente leitura por `platform.settings.read`. A configuração aparece na área global Configurações e alimenta o bridge existente de Desempenho, mas a escrita administrativa permanece `not-integrated-hard-stop`: a representação e o read path estão fechados, sem capability/role ou write path inventado.

### Reconciliation V2

`shared/gradebook-contracts/audit/reconciliation-contract-v2.ts` preserva os estados `match | expected-difference | mismatch | not-comparable`, mantém o V1 histórico intacto e remove `tolerance` da nova forma V2. O caso V2 separa explicitamente:

1. divergência;
2. impacto acadêmico oficial ou potencialmente material quando não resolvível com segurança;
3. investigação;
4. elegibilidade para correção automática;
5. resultado da correção/reprocessamento;
6. liberação institucional;
7. stop/continuidade do piloto.

Uma prova elegível exige causa raiz identificada, evidência oficial não vazia, exatamente uma operação candidata, zero julgamento humano, destino interno versionável e precondição CAS ou conjunto imutável de inputs. As únicas classes contratuais são `renormalize-imported-record`, `reprocess-derived-result` e `reapply-official-reconciliation`; mutação arbitrária, edição da fonte documental, decisão de Conselho e alteração de código/regra em runtime são proibidas.

Defeito de software permanece `not-eligible / software-change-required`; após correção normal do código, um reprocessamento determinístico pode produzir nova referência de versão preservando a anterior e a evidência. Materialidade numérica heurística continua proibida.

Durante futuro piloto, o gate contratual mantém `imported-source`. `mismatch` com impacto acadêmico oficial interrompe o fluxo; impacto não resolvido é tratado como `potentially-material` e também interrompe. Retomada só é representável depois de `reconciled` ou `accepted-with-reason`.

A implementação integrada reutiliza o mesmo Audit Workspace, `planImportReconciliation`, `executeImportChangePlan`, UoW, CAS e rollback. A receita elegível e suas referências de evidência ficam server-only; o transporte sanitizado não expõe prova, evidência bruta ou mutação arbitrária. Nenhum schema/migration foi criado para os estados V2.

## Regras de evolução

1. mudança de significado exige nova versão/adaptação explícita;
2. regra acadêmica exige decisão oficial antes do código;
3. consumidores usam contratos públicos, não tabelas;
4. adapters não alteram semântica por conveniência física;
5. escrita de integridade aparece em plano/UoW/CAS explícito;
6. não criar implementação concorrente da mesma regra;
7. não criar bridge concorrente para a mesma superfície;
8. produção acadêmica só muda mediante autorização própria;
9. migrations, capabilities, papéis, bindings, secrets ou recursos remotos exigem escopo/decisão próprios;
10. snapshots, registros e evidências históricas continuam interpretados pela versão contratual que os produziu.
