# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário inicial. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Estado de implementação

- **Fonte:** `SourceContractV1` e suíte sintética integrados; validação controlada com o corpus real permanece como gate da F1.
- **Entidades acadêmicas:** `congelado-v1`, integradas por #194/PR #208.
- **Lançamentos e resultados:** `congelado-v1`, integrados por #196/PR #212.
- **Lote, manifesto, reconciliação e Auditoria:** `congelado-v1`, integrados por #197/PR #216.
- **Manifesto no fluxo real:** implementado por #199/PR #225.
- **Semântica nativa das células:** implementada por #201/PR #217.
- **Arredondamento acadêmico:** implementado por #218/PR #224.
- **Composição trimestral nativa:** implementada por #226/PR #231.
- **Recuperação paralela nativa:** implementada por #234/PR #240.
- **Portas de persistência:** `congelado-v1`, com extensão explícita da associação pendente em #243.
- **Schema D1:** migrations 0001–0003 implementadas localmente por #227/#235; nenhum recurso remoto foi criado.
- **Leitura D1 local:** implementada por #235/PR #241.
- **Planejamento idempotente de reimportação:** implementado por #228/PR #232; extensão de associação pendente em #243.
- **Executor transacional abstrato:** implementado por #236/PR #239; extensão de associação pendente em #243.
- **Próximos contratos executáveis:** resultado trimestral consolidado em #242 e recuperação final em #244.
- **Read models:** propostos; serão detalhados nas issues dos módulos consumidores.

## Estados de maturidade

- **proposto:** ainda pode mudar sem migração;
- **congelado-v1:** consumidores podem implementar em paralelo;
- **implementado-v1:** existe comportamento executável coberto por testes;
- **implementado-local-v1:** existe schema/adaptador testado localmente, mas não provisionado em produção;
- **deprecated:** permanece durante migração;
- **retirado:** não pode ser usado.

Um contrato só recebe `congelado-v1` quando a issue correspondente é aceita pelo integrador.

## Identificadores

Identificadores técnicos não dependem apenas de nomes de exibição. A fonte preserva exatamente ano, turma, nome e marcas significativas. O modelo interno usa IDs próprios e mantém aliases/origens separados.

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
- sem exigir identificador nacional permanente no escopo inicial.

### `EnrollmentV1`

- `id`, `academicYearId`, `studentId`, `classGroupId`;
- período de vigência e posição atual/histórica.

### `StudentStatusEventV1`

- `id`, `enrollmentId`, `status`, `sourceText`;
- origem/destino quando houver `FOI PARA` / `ESTAVA NO`;
- data quando disponível, fonte e lote.

## Evidência de origem — congelado-v1

### `SourceCellEvidenceV1`

- arquivo/hash/guia/célula;
- valor bruto, cache e fórmula;
- classificação semântica;
- evidência imutável da origem.

Classificações oficiais distinguem vazio, campo inexistente, não aplicável, número manual positivo/negativo, zero legado, marcador oficial `0,1`, fórmula não zero, fórmula zero, fórmula sem cache/erro e texto inválido. Consumidores importam os tipos de `shared/gradebook-contracts/source/source-contract-v1.ts`; não recriam enumerações locais.

### `SourceFileManifestV1`

Implementação contratual: `shared/gradebook-contracts/imports/import-contract-v1.ts`.

Campos:

- ID do manifesto;
- nome, extensão e MIME informado;
- tamanho e data de modificação;
- SHA-256;
- versões do contrato da fonte e do parser;
- instante de leitura;
- ano/professor sugeridos e confirmados quando disponíveis.

Regras:

- SHA-256 é calculado antes do reconhecimento;
- mesmo conteúdo renomeado mantém o mesmo hash;
- nome é metadado, não identidade permanente;
- hash diferente é evidência de bytes diferentes, não decisão automática de nova fonte lógica;
- nenhum caminho local faz parte do contrato.

## Avaliação e resultados — congelado-v1

Implementação pública: `shared/gradebook-contracts/results/results-contract-v1.ts`.

### Valores acadêmicos

`AcademicGradeValueV1` distingue:

```text
absent
numeric
official-zero
legacy-zero
not-applicable
insufficient-data
```

Todo valor comparável preserva simultaneamente:

- `imported.value` e uma ou mais evidências;
- `calculated.value` do motor nativo;
- `authorityMode`: `imported-source` ou `native-engine`, sem apagar o lado não autoritativo.

Cobertura usa `complete`, `partial`, `insufficient-data` e `not-applicable`, com contagens e motivos. Resultados registram a versão da regra.

### `AssessmentComponentV1`

- ano, atribuição, trimestre, tipo, nome, máximo, ordem e aplicabilidade;
- tipos iniciais: escrita, simulado, atividade qualitativa e recuperação paralela.

### `GradeEntryV1`

- ano, estudante, matrícula e componente;
- valor importado/evidência e valor calculado separados;
- autoridade, versão de regra, versão do lançamento e referência ao lançamento substituído.

### `TermResultV1`

- trimestre e máximo;
- quantitativo original, paralela, aplicabilidade e quantitativo considerado;
- qualitativo operacional;
- nota oficial e percentual comparados;
- autoridade, cobertura e versão de regra.

### `FinalRecoveryV1`

- trimestre recuperado;
- nota original, aplicabilidade, nota de recuperação e nota substituta separadas;
- autoridade, cobertura e versão de regra.

### `AnnualResultV1`

- total original e pós-recuperação;
- estado acadêmico importado e calculado;
- decisão final separada do cálculo;
- autoridade, cobertura e versão de regra.

Estados internos são estáveis e independentes dos rótulos da interface:

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

Falha de um arquivo não equivale a falha total. Um lote `approved` não pode conter falha, rejeição, bloqueio ou erro crítico no resumo.

### `ImportFileDiagnosticV1`

Aponta para lote e arquivo; opcionalmente manifesto, guia, célula, evidência e entidade. Não contém caminho local.

### `ReconciliationResultV1`

Preserva valor importado e nativo, diferença, tolerância, versão da regra e estado:

```text
match
expected-difference
mismatch
not-comparable
```

### `AuditOccurrenceV1`

Preserva gravidade, categoria, entidade, origem, mensagem, ação recomendada e histórico de estado:

```text
open
acknowledged
resolved
dismissed-with-reason
```

Gravidades:

```text
information
warning
blocking-error
critical-error
```

Resolução ou descarte exige ator, data e justificativa, mantendo a transição anterior.

## Motor nativo — implementações V1

### Semântica de célula

`src/gradebook-domain/source/interpret-source-cell.ts` consome `SourceCellEvidenceV1`, produz `AcademicGradeValueV1`, preserva proveniência e gera achados determinísticos sem acessar React, SheetJS, banco, rede ou relógio.

### Arredondamento

`src/gradebook-domain/rules/rounding/round-academic-grade.ts` implementa:

- decimal 0,00–0,24: inteiro inferior;
- 0,25–0,74: meio ponto;
- 0,75–0,99: inteiro superior;
- comportamento negativo simétrico;
- proteção contra ruído comum de ponto flutuante.

### Composição trimestral

`src/gradebook-domain/calculations/term/compose-native-term-result.ts` implementa:

- máximos 30, 30 e 40;
- 45% quantitativo e 55% qualitativo operacional;
- máximos derivados 13,5/16,5 nos dois primeiros trimestres e 18/22 no terceiro;
- nota bruta separada da nota arredondada;
- cobertura e achados sem converter ausência em zero.

### Recuperação paralela

`src/gradebook-domain/calculations/parallel-recovery/resolve-native-parallel-recovery.ts` implementa:

- máximo quantitativo derivado do perfil integrado;
- corte de aplicabilidade em 60% do máximo quantitativo: 8,1 para T1/T2 e 10,8 para T3;
- aplicabilidade somente quando o quantitativo original fica estritamente abaixo do corte;
- maior valor entre original e paralela quando aplicável;
- preservação dos dois valores, do ganho, da aplicabilidade, da cobertura e dos achados;
- paralela indevida, conflito de estado, negativo e excesso de faixa como achados explícitos;
- nenhum uso do total trimestral para decidir a paralela.

A #242 consolidará paralela + composição sem recriar essas regras. A #244 implementará a recuperação final.

## Portas de persistência — congelado-v1 com extensão pendente

Implementação pública: `src/gradebook-domain/ports/persistence/persistence-ports-v1.ts`.

Portas atuais:

- `AcademicEntityRepositoryV1`;
- `ImportPersistenceRepositoryV1`;
- `AcademicRecordRepositoryV1`;
- `AuditPersistenceRepositoryV1`;
- `PersistenceUnitOfWorkV1`;
- `BatchPromotionTransactionPortV1`.

Conceitos transversais:

- `AcademicPersistenceContextV1` exige ano letivo;
- paginação usa cursor e limite explícito;
- `VersionedRecordV1`, `VersionExpectationV1` e `VersionedWriteResultV1` protegem contra sobrescrita silenciosa;
- registros acadêmicos são acrescentados como versões;
- `LogicalSourceIdV1` separa identidade lógica de nome/hash;
- relação de fonte pode ser `unmatched`, `candidate` ou `confirmed`;
- promoção de lote roda em unidade de trabalho atômica e recebe apenas arquivos aprovados.

Essas portas não importam D1, SQL, Wrangler ou Cloudflare.

### Extensão obrigatória da #243

A migration 0003 e o adaptador de leitura introduziram o catálogo relacional fonte lógica ↔ stream. Porém, a unidade de trabalho atual ainda não possui uma porta pública de escrita para essa associação.

A #243 deve formalizar, sem dependência do fornecedor:

```text
LogicalSourceRecordAssociationV1
LogicalSourceRecordAssociationStreamV1
LogicalSourceRecordRepositoryV1
```

Também deve incluir a associação no plano, na estimativa e no executor. O adaptador D1 futuro não pode gravar essa relação como efeito colateral oculto de outro append.

## Schema D1 — implementado localmente V1

Cloudflare D1 foi aprovado na #200. As issues #227 e #235 integraram:

- migrations 0001, 0002 e 0003;
- 21 tabelas;
- ano/configuração, entidades, fontes, lotes, registros, reconciliação e Auditoria;
- catálogo versionado de streams por fonte lógica;
- histórico append-only e ponteiros de versão atual;
- FKs tipadas e isoladas por ano;
- índices para hash, fontes, lotes, registros atuais, catálogo, histórico e paginação;
- testes sobre SQLite descartável.

Estado: `implementado-local-v1`. Nenhum banco, binding ou migration remota existe ainda.

## Leitura D1 local — implementado-local-v1

`server/gradebook/persistence/d1/read/d1-read-adapter-v1.ts` implementa:

- `findSourceFileByHash`;
- `getSourceFileVersion`;
- `AcademicRecordRepositoryV1.getCurrent`;
- `listCurrentStreams` do catálogo por fonte lógica.

A leitura reconstrói contratos a partir do payload preservado e confere colunas normalizadas. JSON inválido, shape incompatível e referência quebrada geram erros estáveis e sanitizados. A associação não é descoberta por nome de arquivo nem por `json_extract`.

## Planejamento idempotente — implementado-v1 com extensão pendente

`server/gradebook/application/import/import-reconciliation-v1.ts` implementa `planImportReconciliation`.

Estados dos itens:

```text
unchanged
new
changed
missing-from-new-source
blocked
```

Comportamentos:

- mesmo hash produz no-op acadêmico;
- renomeação pode gerar somente versão de metadados da fonte;
- hash novo com fonte confirmada compara chaves acadêmicas estáveis;
- somente novos/alterados são planejados para append;
- valor ausente exige revisão e não é apagado;
- fonte ambígua não é associada silenciosamente;
- arquivo inválido fica fora da promoção sem descartar os demais;
- expectativas de versão e estimativa de writes são preservadas;
- o planejamento executa zero writes.

A #243 adicionará ao plano a escrita explícita das associações fonte lógica ↔ stream.

## Executor transacional abstrato — implementado-v1 com extensão pendente

`server/gradebook/application/import/execution/execute-import-change-plan-v1.ts` implementa `executeImportChangePlan`.

O executor:

- valida integralmente o plano antes de escrever;
- não abre transação quando não há mudança promovível;
- aplica versões de fonte e apenas itens acadêmicos `new`/`changed`;
- nunca escreve `unchanged`, `missing-from-new-source` ou `blocked`;
- rejeita plano adulterado;
- converte conflito otimista em resultado explícito;
- exige rollback integral da porta transacional;
- retorna apenas contagens, versões técnicas e erros sanitizados.

A implementação está testada com unidade de trabalho transacional em memória. Ela ainda não executa SQL/D1. A #243 incluirá associação no mesmo contrato transacional; a #245 implementará a escrita física local depois dessa adaptação.

## Read models

Read models são contratos de consulta, não entidades persistidas por cada tela:

- `StudentAcademicRecordV1`;
- `ClassPerformanceReadModelV1`;
- `TeacherOverviewReadModelV1`;
- `SubjectOverviewReadModelV1`;
- `CouncilStudentRecordV1`;
- `BulletinModelV1`;
- `GlobalSearchResultV1`.

Cada read model informa ano/contexto, versão ou timestamp, cobertura e permissões aplicadas.

## Regras de evolução

1. Campo novo opcional pode permanecer na mesma versão.
2. Campo obrigatório novo, mudança de significado ou remoção exige nova versão.
3. Adaptadores temporários devem ter issue e condição de retirada.
4. Alteração acadêmica exige decisão em `DECISIONS.md` antes do código.
5. Consumidores usam contratos públicos, não tabelas ou implementações internas.
6. Desempenho, Conselho e Boletins não mantêm enumerações próprias de situações ou resultados.
7. Schema/adaptador D1 não altera o significado dos contratos.
8. Nome do arquivo nunca substitui hash, fonte lógica ou confirmação de contexto.
9. Relação necessária à integridade não pode ser ocultada em JSON nem em efeito colateral do adaptador.
10. Escritas relacionadas à mesma promoção devem ser explícitas no plano, nas portas, na estimativa e na transação.
