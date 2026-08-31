# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário inicial. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Estado de implementação

- **Fonte:** esquema `SourceContractV1` integrado por #193/PR #207; validação definitiva pendente em #198.
- **Entidades acadêmicas:** `congelado-v1`, integradas por #194/PR #208.
- **Lançamentos e resultados:** `proposto`; issue #196 pronta para execução.
- **Lote, reconciliação e Auditoria:** `proposto`; issue #197 permanece bloqueada por #196.
- **Read models:** `proposto`; serão detalhados nas issues dos módulos consumidores.

## Estados de maturidade

- **proposto:** ainda pode mudar sem migração;
- **congelado-v1:** consumidores podem implementar em paralelo;
- **deprecated:** permanece durante migração;
- **retirado:** não pode ser usado.

O contrato só recebe `congelado-v1` quando a issue correspondente for aceita pelo integrador.

## Identificadores

Identificadores técnicos não devem depender apenas de nomes de exibição. Dentro da fonte, a evidência original preserva exatamente ano, turma, nome e marcas significativas. O modelo interno terá IDs próprios e manterá aliases/origens separados.

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

### `SourceFileManifestV1`

- nome, extensão, MIME informado, tamanho, data de modificação;
- SHA-256, versão de importação e data de leitura;
- professor/ano sugeridos e confirmação do usuário quando necessária.

### `SourceCellEvidenceV1`

- arquivo/hash/guia/célula;
- valor bruto, valor em cache e fórmula;
- tipo físico da célula;
- classificação semântica;
- lote e instante de importação.

Classificações semânticas iniciais:

```text
empty
manual-number
manual-negative
manual-zero-legacy
official-zero-marker
formula-nonzero
formula-zero-empty
formula-error
text-invalid
not-applicable
```

A implementação integrada usa nomes TypeScript mais explícitos em `shared/gradebook-contracts/source/source-contract-v1.ts`; consumidores devem importar esses tipos, não recriar esta lista.

## Avaliação — proposta para #196

### `AssessmentComponentV1`

- `id`, atribuição, trimestre, tipo, nome, máximo, ordem e aplicabilidade;
- tipos iniciais: `written`, `simulation`, `qualitative-activity`, `parallel-recovery`.

### `GradeEntryV1`

- `id`, estudante/matrícula, componente, valor de origem e valor semântico;
- presença, classificação, evidência da célula e versão atual;
- nunca apagar versão anterior.

### `TermResultV1`

- trimestre e máximo;
- quantitativo original/considerado;
- qualitativo operacional;
- paralela e aplicabilidade;
- nota importada oficial;
- nota calculada pelo motor;
- percentual e estado de cobertura;
- `authorityMode`: `imported-source` ou `native-engine`;
- divergência e versão de regra.

### `FinalRecoveryV1`

- trimestre recuperado;
- nota original, nota de recuperação e nota substituta;
- aplicabilidade e evidência de origem;
- a nota original permanece preservada mesmo quando a recuperação for menor.

### `AnnualResultV1`

- total original, total pós-recuperação;
- resultado acadêmico antes de decisão colegiada;
- decisão final, quando existente;
- versão das regras e cobertura.

Estados internos iniciais devem ser estáveis e separados dos rótulos exibidos:

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

## Importação, reconciliação e auditoria — proposta para #197

### `ImportBatchResultV1`

- `batchId`, arquivos, sucessos, falhas e progresso final;
- estatísticas agregadas;
- diagnósticos por arquivo;
- status: `received`, `processing`, `review-required`, `approved`, `rejected`, `partially-approved`, `failed`.

### `ReconciliationResultV1`

- registro/resultado comparado;
- valor importado, valor nativo, diferença, tolerância e regra;
- status: `match`, `expected-difference`, `mismatch`, `not-comparable`.

### `AuditOccurrenceV1`

- nível, categoria, entidade, mensagem e ação recomendada;
- arquivo, guia e célula quando aplicáveis;
- estado: `open`, `acknowledged`, `resolved`, `dismissed-with-reason`;
- usuário, data e justificativa de resolução.

Níveis iniciais:

```text
information
warning
blocking-error
critical-error
```

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
