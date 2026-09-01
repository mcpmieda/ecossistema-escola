# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário e registra quais contratos possuem implementação executável. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Estado de implementação

- **Fonte:** `SourceContractV1` e suíte sintética integrados; validação privada do corpus real permanece gate da F1.
- **Entidades acadêmicas:** `congelado-v1`, integradas por #194/PR #208.
- **Lançamentos e resultados:** `congelado-v1`, integrados por #196/PR #212.
- **Lote, manifesto, reconciliação e Auditoria:** `congelado-v1`, integrados por #197/PR #216.
- **Motor nativo:** célula, arredondamento, composição, paralela, resultado trimestral, REC final e resultado anual implementados.
- **Equivalência anual:** implementada por #263/PR #266.
- **Contexto acadêmico 2026:** implementado por #262/PR #267.
- **Portas de persistência:** `congelado-v1`, incluindo associação fonte lógica ↔ stream.
- **Schema D1:** migrations locais 0001–0003 integradas; nenhum recurso remoto criado.
- **Leitura/escrita/transação D1 local:** implementadas para contexto, entidades, fontes, lotes, registros, associações e Auditoria.
- **Runtime D1 local/preview:** implementado, com produção fechada antes do binding.
- **Read models operacionais:** implementados e compostos pela #281.
- **Pesquisa global acadêmica:** contrato #286, implementação #287, composição #288.
- **Operational Workspace F5:** contrato #293 + transporte/bridge/UI local-preview #302; integração #306 preserva bridge único.
- **Audit Workspace F4:** contrato #294 + implementação/read-source D1 #303; integração #306 compõe internamente no runtime, sem HTTP/UI.
- **Desempenho F6:** contrato #295 + read model provider-independent #304; sem fonte física/runtime/HTTP.
- **Boletins F8:** contrato #296 + emissão provider-independent #305; sem PDF/HTTP/snapshot remoto.

## Estados de maturidade

- **proposto:** ainda pode mudar sem migração;
- **congelado-v1:** consumidores podem implementar em paralelo;
- **implementado-v1:** comportamento executável coberto por testes;
- **implementado-local-v1:** adaptador/read model testado localmente, sem provisionamento;
- **implementado-local-preview-v1:** composição disponível no runtime permitido apenas em local/preview;
- **deprecated:** permanece durante migração;
- **retirado:** não pode ser usado.

## Identificadores e entidades

Identificadores técnicos são opacos e não dependem de nomes de exibição. Ano letivo participa de todas as relações acadêmicas persistentes. Entidades V1:

- `AcademicYearV1`;
- `TeacherV1`;
- `ClassGroupV1`;
- `SubjectV1`;
- `TeachingAssignmentV1`;
- `StudentV1`;
- `EnrollmentV1`;
- `StudentStatusEventV1`;
- `AssessmentComponentV1`.

Transferências mantêm origem histórica e posição vigente separadas. Nomes não se tornam chaves técnicas e matching aproximado não decide identidade.

## Contexto acadêmico

A composição oficial da #262 exige ano, perfil e versão de configuração explícitos. Nenhum módulo escolhe ano pelo relógio. Os perfis nativos são referenciados, não copiados. Contexto ausente, duplicado, inativo ou incompatível falha. `authorityMode` permanece `imported-source`.

O `academic-year` é lido/versionado localmente pelo repositório oficial. A #302 adiciona somente um catálogo read-only do workspace que enumera `academic_year_id + year` já persistidos; ele não cria segunda implementação do ano.

## Valores e resultados acadêmicos

`AcademicGradeValueV1` distingue:

```text
absent
numeric
official-zero
legacy-zero
not-applicable
insufficient-data
```

Todo valor comparável preserva simultaneamente fonte importada e cálculo nativo. Cobertura usa `complete | partial | insufficient-data | not-applicable`. A decisão final humana permanece separada do estado calculado.

O motor nativo continua sendo a única implementação de semântica, arredondamento, composição, recuperações e resultado anual. Interfaces, Auditoria, Desempenho e Boletins não podem reimplementar regras.

## Persistência e runtime

Portas públicas:

- `AcademicEntityRepositoryV1`;
- `ImportPersistenceRepositoryV1`;
- `AcademicRecordRepositoryV1`;
- `AuditPersistenceRepositoryV1`;
- `LogicalSourceRecordRepositoryV1`;
- `PersistenceUnitOfWorkV1`;
- `BatchPromotionTransactionPortV1`.

Conceitos transversais:

- contexto exige `academicYearId`;
- consultas listáveis usam cursor;
- versões usam expectativa otimista;
- históricos são append-only;
- promoção ocorre em UoW atômica;
- somente arquivos previamente aprovados entram na promoção.

O schema continua exatamente em 0001–0003/21 tabelas. Nenhuma implementação da onda 14 adiciona migration, binding ou recurso remoto.

O runtime reconhece `local | preview | production`; produção falha antes de inspecionar `GRADEBOOK_D1`. A capability `gradebook.persistence.admin` permanece concedida somente ao papel já existente `ADMINISTRADOR`. Uma autorização opaca emitida no servidor é obrigatória antes de construir/expor o runtime.

## Pesquisa acadêmica V1

Implementação pública do contrato:
`shared/gradebook-contracts/search/global-search-contract-v1.ts`.

Implementação provider-independent:
`server/gradebook/application/read-models/search/academic-global-search-read-model-v1.ts`.

Composição única:
`createGradebookOperationalReadModelsV1(...).search`.

`GlobalSearchRequestV1` exige ano explícito, query, escopo, limite, cursor opaco e ordem oficial. O request não transporta papel, capabilities, booleano `authorized` ou token.

Resultados contêm somente:

- aluno: `kind`, `id`, `displayName`;
- turma: `kind`, `id`, `code`;
- professor: `kind`, `id`, `displayName`;
- componente: `kind`, `id`, `displayName`.

A implementação faz inclusão literal após normalização de caixa/diacríticos, sem fuzzy matching, heurística de identidade ou segundo ranking. Falha/incompatibilidade vira não divulgação.

## Operational Workspace F5

Contrato base:
`shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1.ts`.

Transporte integrado pela #302:
`shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1.ts`.

Invariantes:

- estados `loading | ready | empty | unavailable | not-authorized`;
- ano sempre explícito;
- navegação `kind + id` opaco;
- pesquisa é alias direto do `GlobalSearch...V1`;
- autorização efetiva no servidor;
- rota física, token, role, capability list, nota, resultado, evidência bruta e `authorityMode` selecionável são proibidos no payload.

A implementação #302 adiciona:

- catálogo read-only de anos persistidos;
- projeções mínimas das quatro Centrais;
- único bridge `POST /api/gradebook/operational-workspace`;
- `requireAuth` + autorização opaca + `no-store`;
- HeroUI no shell atual.

Produção continua indisponível porque o runtime falha antes do binding. A #306 não cria segundo bridge.

## Audit Workspace F4

Contrato:
`shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1.ts`.

Implementação #303:

- `AuditWorkspaceSourceV1` como porta CQRS provider-independent;
- `GradebookD1AuditWorkspaceSourceV1` para listas correntes em D1;
- `createAuditWorkspaceV1` para listagem, detalhe e resolução;
- filtros combinados por AND, ordem estável e cursor keyset vinculado ao escopo;
- detalhe reutiliza `ImportPersistenceRepositoryV1.getImportBatch` e `AuditPersistenceRepositoryV1.getCurrent`;
- resolução reutiliza `AuditPersistenceRepositoryV1.appendVersion`/CAS;
- ator/instante são fornecidos pelo servidor e sobrescrevem qualquer tentativa de alegação do cliente;
- promoção é somente `promotionEligibility` informativa a partir de `ImportChangePlanV1` já existente.

Composição #306:

```text
GradebookD1RuntimeV1.auditWorkspace(resolutionIdentity, existingPlans?)
  → requireGradebookD1RuntimeAuthorizationV1
  → GradebookD1AuditWorkspaceSourceV1
  → mesma PersistenceUnitOfWorkV1.imports/audit
  → createAuditWorkspaceV1
```

O runtime constrói `isAuthorized()` internamente a partir da autorização opaca. O caller não fornece booleano de autorização; fornece somente identidade/instante server-side da resolução. Não existe rota HTTP nem UI de Auditoria nesta onda.

Promoção continua exclusivamente em `planImportReconciliation` + `executeImportChangePlan`.

## Desempenho F6

Contrato:
`shared/gradebook-contracts/performance/class-performance-read-model-v1.ts`.

Implementação #304:
`server/gradebook/application/read-models/performance/class-performance-read-model-v1.ts`.

Superfície provider-independent:

```ts
createClassPerformanceReadModelV1(source: ClassPerformanceSourceV1)
```

`ClassPerformanceSourceV1.loadMatrix` fornece uma projeção em lote já resolvida. A camada de aplicação:

- suporta lentes `result | quantitative | qualitative | assessments`;
- pagina linhas/colunas por cursores opacos;
- ordena pelos comparadores do contrato;
- preserva `imported` e `calculated` separados;
- exige `PERFORMANCE_AUTHORITY_MODE_V1 === 'imported-source'`;
- carrega detalhe de aluno/célula sob demanda;
- não contém fórmula, arredondamento, recuperação, classificação ou tolerância.

A #306 não cria fonte D1, adapter físico, runtime, endpoint ou UI. A fonte física em lote é #315 e deve evitar N+1 por aluno/componente.

## Boletins F8

Contrato:
`shared/gradebook-contracts/bulletins/bulletin-contract-v1.ts`.

Implementação #305:

- `createBulletinModelMaterializerV1` materializa `synthetic | composition | detailed` sobre read models/registros oficiais;
- `createBulletinEmissionServiceV1` emite snapshots versionados por porta;
- snapshots são profundamente imutáveis;
- reimpressão usa somente snapshot histórico e não recalcula;
- mesma emissão idêntica pode reutilizar a versão; mudança relevante cria nova versão;
- lote parcial mantém `ready` e `blocked` separados;
- autorização, emissor, relógio e ID são server-side;
- `BULLETIN_AUTHORITY_MODE_V1 === 'imported-source'` e `native-engine` é rejeitado também em projeções internas.

A implementação inclui apenas repositório em memória/local de teste. A #306 não cria PDF, HTML, endpoint, persistência remota de snapshots ou composição física de lote em alta escala. O hardening/materialização agregada é #316.

## Compatibilidade conjunta da onda 14

O teste `tests/gradebook/integration/wave-14-implementations.integration.test.ts` fixa simultaneamente:

- implementações de Auditoria, Desempenho e Boletins disponíveis;
- `PERFORMANCE_AUTHORITY_MODE_V1` e `BULLETIN_AUTHORITY_MODE_V1` em `imported-source`;
- somente Audit Workspace composto no runtime físico;
- nenhum import físico de Desempenho/Boletins no runtime;
- Functions preservando somente o bridge do Operational Workspace;
- ausência de rota HTTP de Auditoria, Desempenho ou Boletins.

O teste de composição `tests/gradebook/persistence/d1-composition/audit-workspace-runtime-v1.test.ts` cobre a UoW real sintética, listagem, resolução CAS/ator server-side, não autorização e produção antes do binding.

## Regras de evolução

1. Campo opcional novo pode permanecer na mesma versão quando não muda significado.
2. Mudança obrigatória, remoção ou mudança de significado exige nova versão/adaptador.
3. Alteração acadêmica exige decisão oficial antes do código.
4. Consumidores usam contratos públicos, não tabelas internas.
5. Interface, Desempenho, Conselho e Boletins não recriam regras.
6. Schema/adaptador D1 não altera semântica para acomodar SQL.
7. Toda escrita necessária à integridade aparece explicitamente no plano/UoW.
8. O mesmo contrato não recebe implementações concorrentes na composição D1.
9. Operational Workspace mantém um único bridge HTTP.
10. Produção acadêmica permanece fail-closed até autorização própria.
11. `authorityMode: imported-source` não muda silenciosamente.
12. Novas migrations, capabilities, papéis, bindings, secrets ou recursos remotos exigem escopo/decisão próprios.