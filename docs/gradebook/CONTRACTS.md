# Contratos compartilhados — Banco de Notas

Este documento congela o vocabulário inicial. Nenhum módulo pode criar uma segunda definição com significado diferente.

## Estado de implementação

- **Fonte:** `SourceContractV1` e suíte sintética integrados; validação privada do corpus real permanece como gate da F1.
- **Entidades acadêmicas:** `congelado-v1`, integradas por #194/PR #208.
- **Lançamentos e resultados:** `congelado-v1`, integrados por #196/PR #212.
- **Lote, manifesto, reconciliação e Auditoria:** `congelado-v1`, integrados por #197/PR #216.
- **Manifesto no fluxo real:** implementado por #199/PR #225.
- **Motor:** célula, arredondamento, composição, paralela, resultado trimestral e recuperação final implementados.
- **Portas de persistência:** `congelado-v1`, incluindo associação fonte lógica ↔ stream pela #243/PR #249.
- **Schema D1:** migrations locais 0001–0003 integradas; nenhum recurso remoto criado.
- **Leitura D1 local:** implementada pela #235/PR #241.
- **Planejamento/executor de reimportação:** implementados, incluindo associação explícita pela #243.
- **Escrita/transação D1 local:** implementada por #245/PR #258, sem recurso remoto.
- **Regressões de isolamento:** restauradas por #254/PR #259 contra a porta oficial de associação.
- **Resultado anual/elegibilidade:** implementado por #255/PR #260.
- **Runtime D1, contexto 2026 e equivalência anual:** prontos para #261, #262 e #263.
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

## Evidência de origem

### `SourceCellEvidenceV1`

Preserva arquivo/hash, guia, célula, valor bruto, cache, fórmula, classificação semântica e proveniência. Estados como vazio, fórmula zero, zero oficial `0,1`, zero legado, erro, texto inválido e não aplicável permanecem distintos.

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

### Semântica de célula

`interpretSourceCell` converte evidência em valor acadêmico sem apagar proveniência e sem acessar UI, banco, rede ou relógio.

### Arredondamento

`roundAcademicGrade` aplica:

- 0,00–0,24: inteiro inferior;
- 0,25–0,74: meio ponto;
- 0,75–0,99: inteiro superior;
- comportamento negativo simétrico;
- proteção contra ruído comum de ponto flutuante.

### Composição trimestral

`composeNativeTermResult` implementa máximos 30/30/40, peso 45% quantitativo e 55% qualitativo operacional, preservando nota bruta e arredondada separadas.

### Recuperação paralela

`resolveNativeParallelRecovery` deriva máximos quantitativos 13,5/13,5/18 e cortes 8,1/8,1/10,8. A paralela é aplicável somente abaixo de 60% do máximo quantitativo; quando válida, prevalece o maior valor, preservando ambos.

### Resultado trimestral consolidado

`composeNativeTermOutcome`, integrado pela #242/PR #252, reutiliza paralela e composição para produzir:

- quantitativo original, paralela e considerado;
- qualitativo operacional;
- nota bruta;
- nota nativa arredondada;
- percentual pelo máximo do trimestre;
- cobertura consolidada;
- achados por etapa, sem duplicar regras.

### Recuperação final

`resolveNativeFinalRecovery`, integrado pela #244/PR #253, reutiliza o perfil 30/30/40 e aplica:

- corte anual 60;
- limites trimestrais 18/18/24;
- REC apenas quando o total original é inferior a 60 e o trimestre está abaixo do próprio limite;
- substituição obrigatória pela REC aplicável, mesmo quando menor;
- preservação de original, REC, substituta, total original e total pós-REC;
- ausência de REC obrigatória não vira zero.

### Resultado anual

`resolveNativeAnnualOutcome`, integrado por #255/PR #260, produz resultados por componente, cobertura e contagens anuais:

- total original `>= 60`: `approved-direct`;
- original `< 60` e pós-REC `>= 60`: `approved-after-recovery`;
- pós-REC `< 60`: componente não aprovado;
- 0 componentes não aprovados: aprovação direta ou pós-REC;
- 1 ou 2: `eligible-for-council`;
- 3 ou mais: `not-eligible-for-council`;
- cobertura incompleta: `insufficient-data`, sem reprovação inventada.

Decisão `pending` não altera o cálculo. Decisão `recorded` preserva cálculo e decisão separadamente e usa somente o `resultingState` explícito como estado efetivo. O Conselho não é automatizado.

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

A #243/PR #249 definiu uma única representação pública:

- `LogicalSourceRecordAssociationStreamV1`;
- `LogicalSourceRecordAssociationV1`;
- `LogicalSourceRecordRepositoryV1`.

A associação contém ano, fonte lógica confirmada, stream acadêmico/chave estável, estado `active` ou `inactive`, manifesto/versão de origem e versão otimista.

Regras:

- item `new` planeja ativação inicial;
- item `changed` mantém/versiona a associação quando necessário;
- item `unchanged`, mesmo hash ou renomeação não cria associação nova;
- item ausente não é desativado automaticamente;
- fonte ambígua ou arquivo bloqueado não planeja associação;
- fonte, registro e associação são aplicados na mesma transação;
- conflito de associação reverte toda a promoção.

## Schema e adaptadores D1

Migrations locais:

1. contexto, entidades, fontes e lotes;
2. registros acadêmicos, reconciliação e Auditoria;
3. catálogo versionado fonte lógica ↔ stream.

O schema possui 21 tabelas, FKs por ano, histórico append-only, índices e ausência de cascades destrutivos.

O adaptador de leitura local implementa manifesto por hash/ID, registro atual e associações atuais por fonte lógica. Não descobre vínculos por nome de arquivo nem por varredura de JSON.

A #245/PR #258 implementou escrita e transação físicas locais para fonte, registro e associação, com compare-and-set, savepoint por append e rollback integral. Binding, banco remoto, runner de migrations e backend autorizado continuam inexistentes; a #261 tratará apenas runtime local/preview e autorização explícita, sem produção silenciosa.

## Planejamento e execução da reimportação

`planImportReconciliation` distingue:

```text
unchanged
new
changed
missing-from-new-source
blocked
```

O plano discrimina estimativas de:

- versões de fonte;
- versões acadêmicas;
- versões de associação.

`executeImportChangePlan` valida o plano antes da transação e aplica, nesta ordem:

1. versão de fonte;
2. registro acadêmico novo/alterado;
3. associação fonte lógica ↔ stream.

Itens iguais, ausentes, bloqueados ou em revisão não são escritos automaticamente. Conflito/falha exige rollback integral.

A #254/PR #259 restaurou explicitamente regressões herdadas de isolamento de arquivos, falhas de leitura, determinismo e promoção parcial, discriminando versões de fonte, registro e associação. Nenhum defeito funcional foi revelado.

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
8. Toda escrita necessária à integridade deve aparecer explicitamente no plano e na unidade de trabalho.
