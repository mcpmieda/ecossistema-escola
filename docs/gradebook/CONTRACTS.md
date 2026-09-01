# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário inicial. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Estado de implementação

- **Fonte:** `SourceContractV1` e suíte sintética integrados; validação privada do corpus real permanece como gate da F1.
- **Entidades acadêmicas:** `congelado-v1`, integradas por #194/PR #208.
- **Lançamentos e resultados:** `congelado-v1`, integrados por #196/PR #212.
- **Lote, manifesto, reconciliação e Auditoria:** `congelado-v1`, integrados por #197/PR #216.
- **Motor nativo:** célula, arredondamento, composição, paralela, resultado trimestral, REC final e resultado anual implementados.
- **Equivalência anual:** implementada por #263/PR #266.
- **Contexto acadêmico 2026:** implementado por #262/PR #267.
- **Portas de persistência:** `congelado-v1`, incluindo associação fonte lógica ↔ stream.
- **Schema D1:** migrations locais 0001–0003 integradas; nenhum recurso remoto criado.
- **Leitura/escrita/transação D1 local:** implementadas para contexto anual, fonte, registros e associações.
- **Runtime D1 local/preview:** implementado por #261/PR #268, com produção fechada.
- **Repositórios completos de entidades, lotes e Auditoria:** integrados pela décima onda #269–#272.
- **Read models:** propostos; serão detalhados nas issues consumidoras.

## Estados de maturidade

- **proposto:** ainda pode mudar sem migração;
- **congelado-v1:** consumidores podem implementar em paralelo;
- **implementado-v1:** comportamento executável coberto por testes;
- **implementado-local-v1:** schema/adaptador testado localmente, sem provisionamento;
- **deprecated:** permanece durante migração;
- **retirado:** não pode ser usado.

## Identificadores e entidades

Identificadores técnicos são opacos e não dependem de nomes de exibição. A fonte preserva ano, turma, nome e marcas significativas; o modelo interno usa IDs próprios e aliases separados.

Entidades V1:

- `AcademicYearV1`;
- `TeacherV1`;
- `ClassGroupV1`;
- `SubjectV1`;
- `TeachingAssignmentV1`;
- `StudentV1`;
- `EnrollmentV1`;
- `StudentStatusEventV1`;
- `AssessmentComponentV1`.

Ano letivo participa de todas as relações acadêmicas persistentes. Transferências mantêm origem histórica e posição vigente separadas.

## Contexto acadêmico 2026

A #262/PR #267 integrou uma única composição oficial:

```ts
createAcademicContext2026V1(academicYear);
createActiveAcademicContextServiceV1(dependencies);
```

Regras:

- ano, perfil e versão de configuração são explícitos;
- nenhum módulo escolhe ano pelo relógio;
- os perfis de composição, paralela, resultado trimestral, REC final e resultado anual são referenciados diretamente, sem copiar pesos, máximos, cortes ou limites;
- contexto ausente, duplicado, inativo ou incompatível falha explicitamente;
- `authorityMode` permanece `imported-source`;
- o `academic-year` é lido e versionado localmente por `AcademicEntityRepositoryV1`, com compare-and-set e histórico append-only.

A décima onda não pode criar uma segunda implementação concorrente do `academic-year`.

## Evidência de origem

### `SourceCellEvidenceV1`

Preserva arquivo/hash, guia, célula, valor bruto, cache, fórmula, classificação semântica e proveniência. Vazio, fórmula zero, zero oficial `0,1`, zero legado, erro, texto inválido e não aplicável permanecem distintos.

### `SourceFileManifestV1`

Preserva ID, nome, extensão, MIME informado, tamanho, modificação, SHA-256, versão do contrato/parser, instante de leitura e confirmações de ano/professor quando disponíveis.

Regras:

- SHA-256 é calculado antes do reconhecimento;
- nome do arquivo é metadado, não identidade permanente;
- mesmo hash com outro nome não duplica conteúdo;
- hash diferente não confirma sozinho outra fonte lógica;
- nenhum caminho local faz parte do contrato.

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

Todo valor comparado preserva simultaneamente fonte importada e cálculo nativo. `authorityMode` seleciona a autoridade sem apagar o outro lado.

Cobertura usa:

```text
complete
partial
insufficient-data
not-applicable
```

Contratos centrais:

- `GradeEntryV1`;
- `TermResultV1`;
- `FinalRecoveryV1`;
- `AnnualResultV1`.

Estados acadêmicos internos:

```text
in-progress
approved-direct
approved-after-recovery
eligible-for-council
approved-by-council
failed-after-council-vote
failed-by-council-decision
failed-by-attendance
not-eligible-for-council
special-status
insufficient-data
```

A decisão final humana permanece em `AnnualFinalDecisionV1`, separada do estado calculado.

## Importação, reconciliação e Auditoria

### `ImportBatchResultV1`

Estados:

```text
received
processing
review-required
partially-approved
approved
rejected
failed
```

Falha de um arquivo não equivale a falha total. Erro crítico impede aparência de sucesso completo.

### `ReconciliationResultV1`

Estados:

```text
match
expected-difference
mismatch
not-comparable
```

### `AuditOccurrenceV1`

Preserva gravidade, categoria, alvo, origem, ação recomendada e histórico de estado. Resolução exige ator, data e justificativa.

## Motor nativo — implementado

### Semântica e arredondamento

`interpretSourceCell` converte evidência em valor acadêmico sem apagar proveniência. `roundAcademicGrade` aplica faixas 0,00–0,24, 0,25–0,74 e 0,75–0,99, com comportamento negativo simétrico e proteção contra ruído decimal.

### Composição trimestral e paralela

`composeNativeTermResult` implementa máximos 30/30/40 e peso 45% quantitativo / 55% qualitativo. `resolveNativeParallelRecovery` usa cortes 8,1/8,1/10,8 e preserva original, paralela e valor considerado.

### Resultado trimestral e recuperação final

`composeNativeTermOutcome` produz nota bruta, nota nativa, percentual, cobertura e achados. `resolveNativeFinalRecovery` usa corte anual 60, limites 18/18/24 e substitui obrigatoriamente a nota aplicável pela REC, inclusive quando menor, preservando o original.

### Resultado anual

`resolveNativeAnnualOutcome` distingue aprovação direta, aprovação após REC, componente não aprovado, elegibilidade com 1–2 componentes e não elegibilidade com 3+, sem fabricar estado quando a cobertura é insuficiente. Decisão formal registrada permanece separada e somente seu `resultingState` explícito prevalece.

### Equivalência anual fonte × motor

A #263/PR #266 integrou:

```ts
compareImportedAndNativeAnnualOutcome(input, profile);
```

Classificações:

- `match`: valores comparáveis idênticos;
- `expected-difference`: somente diferença explícita de estado de origem entre zeros semanticamente equivalentes;
- `mismatch`: valores comparáveis diferentes, sem tolerância ou correção;
- `not-comparable`: ausência, não aplicabilidade, cobertura parcial, dado insuficiente ou componente nativo sem base segura.

A função preserva valor/evidência importados, resultado nativo, coberturas e versões. Não cria arredondamento, tolerância, decisão de Conselho ou mudança de autoridade.

## Portas de persistência — congelado-v1

Implementação pública: `src/gradebook-domain/ports/persistence/persistence-ports-v1.ts`.

Portas:

- `AcademicEntityRepositoryV1`;
- `ImportPersistenceRepositoryV1`;
- `AcademicRecordRepositoryV1`;
- `AuditPersistenceRepositoryV1`;
- `LogicalSourceRecordRepositoryV1`;
- `PersistenceUnitOfWorkV1`;
- `BatchPromotionTransactionPortV1`.

Conceitos transversais:

- contexto exige `academicYearId`;
- consultas listáveis usam paginação por cursor;
- versões usam expectativa otimista;
- registros são append-only;
- promoção ocorre em unidade de trabalho atômica;
- apenas arquivos previamente aprovados entram na promoção.

### Associação fonte lógica ↔ stream

A associação contém ano, fonte lógica confirmada, stream/chave estável, estado `active` ou `inactive`, manifesto/versão de origem e versão otimista.

- item `new` planeja ativação inicial;
- item `changed` mantém/versiona quando necessário;
- item igual, mesmo hash ou renomeado não cria associação nova;
- item ausente não é desativado automaticamente;
- fonte ambígua ou arquivo bloqueado não planeja associação;
- fonte, registro e associação são aplicados na mesma transação;
- conflito reverte toda a promoção.

## Schema e adaptadores D1

Migrations locais:

1. contexto, entidades, fontes e lotes;
2. registros acadêmicos, reconciliação e Auditoria;
3. catálogo versionado fonte lógica ↔ stream.

O schema possui 21 tabelas, FKs por ano, histórico append-only, índices e ausência de cascades destrutivos.

Implementado e composto localmente:

- leitura por hash/manifesto;
- leitura/escrita do `academic-year`;
- leitura/escrita de registros acadêmicos;
- leitura/escrita das associações;
- leitura/escrita das oito demais entidades acadêmicas;
- lotes e histórico de versões por fonte lógica;
- ocorrências de Auditoria e resultados de reconciliação;
- históricos paginados de registros e associações;
- promoção `fonte → registro → associação` em uma transação;
- compare-and-set, savepoints e rollback integral.

A décima onda completou, em módulos independentes:

- #269: demais entidades acadêmicas;
- #270: lotes e versões de fonte por fonte lógica;
- #271: ocorrências e reconciliações.

A #272 compõe exatamente um fornecedor por operação em uma única unidade de trabalho. `academic-year`
continua pertencendo à implementação oficial da #262; fonte, registros e associações continuam nas
implementações previamente integradas. Nenhum valor importado ou nativo é substituído.

## Runtime D1 local/preview

A #261/PR #268 integrou:

- runtime explicitamente injetado;
- ambientes `local`, `preview` e `production` distintos;
- produção bloqueada antes de tocar no binding;
- validação estrutural do binding;
- runner que consome a lista canônica das migrations 0001–0003;
- conferência idempotente do catálogo aplicado;
- capability `gradebook.persistence.admin`, concedida somente a `ADMINISTRADOR`;
- rotas administrativas autenticadas, autorizadas, same-origin e `Cache-Control: no-store`;
- erros e logs sem binding, SQL, parâmetros, payload acadêmico ou secret.

Nenhum banco, binding, secret ou migration remota foi criado. Persistência acadêmica do site oficial permanece desativada.

## Planejamento e execução da reimportação

`planImportReconciliation` distingue:

```text
unchanged
new
changed
missing-from-new-source
blocked
```

O plano discrimina versões de fonte, registros acadêmicos e associações. `executeImportChangePlan` valida antes da transação e aplica somente arquivos prontos e itens novos/alterados. Itens iguais, ausentes, bloqueados ou em revisão não são escritos automaticamente.

## Read models

Read models são contratos de consulta, não bancos paralelos:

- `StudentAcademicRecordV1`;
- `ClassPerformanceReadModelV1`;
- `TeacherOverviewReadModelV1`;
- `SubjectOverviewReadModelV1`;
- `CouncilStudentRecordV1`;
- `BulletinModelV1`;
- `GlobalSearchResultV1`.

## Regras de evolução

1. Campo opcional novo pode permanecer na mesma versão.
2. Mudança obrigatória, remoção ou mudança de significado exige nova versão.
3. Adaptador temporário precisa de issue e condição de retirada.
4. Alteração acadêmica exige decisão oficial antes do código.
5. Consumidores usam contratos públicos, não tabelas internas.
6. Interface, Desempenho, Conselho e Boletins não recriam regras.
7. Schema/adaptador D1 não altera semântica para acomodar SQL.
8. Toda escrita necessária à integridade aparece explicitamente no plano e na unidade de trabalho.
9. O mesmo contrato não recebe implementações concorrentes na composição D1.
