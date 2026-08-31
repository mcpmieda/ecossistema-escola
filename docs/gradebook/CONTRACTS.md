# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário inicial. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Estado de implementação

- **Fonte:** esquema e suíte sintética integrados por #193/#198; execução controlada com o corpus real permanece como gate da F1.
- **Entidades acadêmicas:** `congelado-v1`, integradas por #194/PR #208.
- **Lançamentos e resultados:** `congelado-v1`, integrados por #196/PR #212.
- **Lote, manifesto, reconciliação e Auditoria:** `congelado-v1`, integrados por #197/PR #216.
- **Semântica nativa das células:** implementada por #201/PR #217 como função pura do domínio, consumindo os contratos congelados.
- **Portas de persistência:** issue #219 pronta; a tecnologia física aprovada é Cloudflare D1, mas os contratos do domínio permanecem independentes do fornecedor.
- **Read models:** `proposto`; serão detalhados nas issues dos módulos consumidores.

## Estados de maturidade

- **proposto:** ainda pode mudar sem migração;
- **congelado-v1:** consumidores podem implementar em paralelo;
- **deprecated:** permanece durante migração;
- **retirado:** não pode ser usado.

O contrato só recebe `congelado-v1` quando a issue correspondente for aceita pelo integrador.

## Identificadores

Identificadores técnicos não dependem apenas de nomes de exibição. Dentro da fonte, a evidência original preserva exatamente ano, turma, nome e marcas significativas. O modelo interno possui IDs próprios e mantém aliases/origens separados.

Nome de arquivo também não é identidade permanente. O hash identifica conteúdo binário idêntico; uma fonte lógica pode possuir várias versões e vários nomes observados. Associação ambígua exige confirmação, conforme BN-DEC-017.

## Entidades centrais — congelado-v1

Implementação pública: `shared/gradebook-contracts/entities/index.ts`.

### `AcademicYearV1`

- `id`, `year`, `schoolId`;
- calendário e estado temporal;
- perfil de avaliação ativo;
- versão da configuração.

### `TeacherV1`

- `id`, `displayName`, `sourceNames`, `status`.

### `ClassGroupV1`

- `id`, `academicYearId`, `code`, `grade`, `section`, `shift` opcional.

### `SubjectV1`

- `id`, `code`, `displayName`, `shortName`, `status`.

### `TeachingAssignmentV1`

- `id`, `academicYearId`, `teacherId`, `classGroupId`, `subjectId`;
- `sourceDisciplineIndex` (`D1`, `D2`, `D3`...);
- vigência e origem da confirmação.

### `StudentV1`

- `id`, `displayName`;
- nomes/origens preservados separadamente;
- sem exigir identificador nacional ou permanente no escopo inicial.

### `EnrollmentV1`

- `id`, `academicYearId`, `studentId`, `classGroupId`;
- período de vigência e posição atual/histórica.

### `StudentStatusEventV1`

- `id`, `enrollmentId`, `status`, `sourceText`;
- origem/destino quando houver `FOI PARA` / `ESTAVA NO`;
- data quando disponível, fonte e lote.

## Evidência de origem

### `SourceCellEvidenceV1`

Implementação pública: `shared/gradebook-contracts/source/source-contract-v1.ts`.

Preserva:

- arquivo/hash/guia/célula;
- valor bruto, valor em cache e fórmula;
- classificação semântica;
- erro de origem quando aplicável.

Classificações semânticas oficiais incluem:

```text
missing-field
not-applicable
empty
manual-positive-number
manual-negative-number
manual-legacy-zero
manual-official-zero-marker
formula-nonzero
formula-zero
formula-error-or-missing-cache
invalid-text
```

Consumidores importam os tipos oficiais; não recriam listas equivalentes.

### `SourceFileManifestV1`

Implementação pública: `shared/gradebook-contracts/imports/import-contract-v1.ts`.

Preserva:

- ID técnico do manifesto;
- nome, extensão, MIME informado, tamanho e data de modificação;
- SHA-256;
- versões do contrato da fonte e do parser;
- instante de leitura;
- ano/professor sugeridos e confirmações quando disponíveis.

O manifesto não contém caminho local. O SHA-256 ainda será calculado e exibido no importador pela issue #199.

## Avaliação — congelado-v1

Implementação pública: `shared/gradebook-contracts/results/results-contract-v1.ts`.

O valor acadêmico é uma união discriminada. Os estados `absent`, `official-zero`, `legacy-zero`, `not-applicable` e `insufficient-data` permanecem estruturalmente distintos; `numeric` representa um número sem apagar sua evidência de origem.

Todo valor sujeito à migração preserva simultaneamente:

- `imported.value` e uma ou mais `imported.evidence` do `SourceContractV1`;
- `calculated.value` produzido pelo motor nativo;
- `authorityMode`: `imported-source` ou `native-engine`, sem remover o lado não autoritativo.

Cobertura usa estados `complete`, `partial`, `insufficient-data` e `not-applicable`, com contagens e motivos. Resultados registram também a versão da regra aplicada.

### `AssessmentComponentV1`

- `id`, `academicYearId`, `teachingAssignmentId`, trimestre, tipo, nome, máximo, ordem e aplicabilidade;
- tipos iniciais: `written`, `simulation`, `qualitative-activity`, `parallel-recovery`.

### `GradeEntryV1`

- `id`, ano, estudante, matrícula e componente;
- valor importado/evidência e valor calculado ficam separados;
- `authorityMode`, `ruleVersion`, versão do lançamento e referência opcional ao lançamento substituído;
- uma nova versão não apaga silenciosamente a anterior.

### `TermResultV1`

- trimestre e máximo;
- quantitativo original, paralela, aplicabilidade da paralela e quantitativo considerado;
- qualitativo operacional;
- nota oficial e percentual com valores importado/calculado separados;
- `authorityMode`, cobertura e versão da regra.

### `FinalRecoveryV1`

- trimestre recuperado;
- nota original, aplicabilidade, nota de recuperação e nota substituta em campos separados;
- cada valor preserva fonte e cálculo nativo;
- `authorityMode`, cobertura e versão da regra.

### `AnnualResultV1`

- total original e total pós-recuperação em campos separados;
- estado acadêmico importado e calculado preservados simultaneamente;
- decisão final separada do estado acadêmico, com resultado, fundamento e referência opcionais;
- `authorityMode`, cobertura e versão da regra.

Estados internos são estáveis e independentes dos rótulos exibidos:

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

## Importação, reconciliação e Auditoria — congelado-v1

Implementações públicas:

- `shared/gradebook-contracts/imports/import-ids-v1.ts`;
- `shared/gradebook-contracts/imports/import-contract-v1.ts`;
- `shared/gradebook-contracts/audit/audit-contract-v1.ts`.

### `ImportBatchResultV1`

Representa arquivos e diagnósticos sem transformar uma falha individual em falha total. Estados do lote:

```text
received
processing
review-required
partially-approved
approved
rejected
failed
```

O estado `approved` exige estruturalmente ausência de arquivo rejeitado/falho e ausência de erro bloqueante/crítico no resumo. Arquivos mantêm estado próprio e podem coexistir no mesmo lote.

### `ImportFileDiagnosticV1`

- sempre aponta para `ImportFileId`;
- pode apontar para manifesto, guia, célula, evidência e entidade técnica;
- usa a gravidade comum da Auditoria;
- não expõe caminho local.

### `ReconciliationResultV1`

Reutiliza `ComparedGradeValueV1` e preserva valor importado, valor nativo, diferença, tolerância, explicação e versão da regra. Estados:

```text
match
expected-difference
mismatch
not-comparable
```

Nenhuma reconciliação substitui silenciosamente o valor de fonte ou do motor.

### `AuditOccurrenceV1`

- gravidade: `information`, `warning`, `blocking-error` ou `critical-error`;
- categoria, entidade, mensagem e ação recomendada;
- referência a arquivo, guia e célula quando aplicável;
- estado: `open`, `acknowledged`, `resolved`, `dismissed-with-reason`;
- histórico de transição preservando estado anterior, ator, data e justificativa.

Erros críticos permanecem distinguíveis e não podem ser apresentados como sucesso completo.

## Interpretação semântica nativa — implementada

Implementação: `src/gradebook-domain/source/interpret-source-cell.ts`.

`interpretSourceCell(evidence, profile)` é pura e determinística. Ela transforma `SourceCellEvidenceV1` em `AcademicGradeValueV1`, preservando presença, valor bruto, validade, classificação, evidência e achados locais.

Os achados determinísticos dessa função ainda não são uma ocorrência persistida completa. A camada de aplicação os converterá em `AuditOccurrenceV1`, adicionando ID, lote, instante, estado e contexto de entidade sem perder a proveniência original.

## Persistência

Cloudflare D1 é o armazenamento físico aprovado em BN-DEC-016. Isso não altera os contratos de domínio:

- portas de persistência ficam em `src/gradebook-domain/ports/persistence/**`;
- adaptadores D1 ficarão na camada de servidor/infraestrutura;
- entidades e resultados não importam tipos Cloudflare ou SQL;
- atualizações acadêmicas criam versões e preservam histórico;
- promoção de lote deve ser transacional;
- consultas são sempre associadas a ano/contexto e possuem paginação/limite explícito.

A issue #219 materializará as portas antes do desenho físico das migrations.

## Read models

Read models são contratos de consulta, não entidades persistidas por cada tela.

- `StudentAcademicRecordV1`;
- `ClassPerformanceReadModelV1`;
- `TeacherOverviewReadModelV1`;
- `SubjectOverviewReadModelV1`;
- `CouncilStudentRecordV1`;
- `BulletinModelV1`;
- `GlobalSearchResultV1`.

Cada read model deve informar ano/contexto, versão ou timestamp dos dados, cobertura e permissões aplicadas.

## Regras de evolução

1. Campo novo opcional pode permanecer na mesma versão.
2. Campo obrigatório novo, mudança de significado ou remoção exige nova versão.
3. Adaptadores temporários devem ter issue e data/condição de retirada.
4. Uma alteração acadêmica exige decisão em `DECISIONS.md` antes do código.
5. Consumidores não importam tabelas/implementações internas; usam contratos públicos.
6. Desempenho, Conselho e Boletins não mantêm enumerações próprias de situações ou resultados.
7. D1 não pode vazar para os contratos do domínio; somente adaptadores concretos conhecem o fornecedor.
