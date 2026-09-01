# Schema D1 V1 do Banco de Notas

## Estado e limite

**Estado:** base integrada por #227/PR #233, catálogo/leitura local por #235/PR #241 e contrato transacional da associação por #243/PR #249.

Este documento descreve o schema relacional local compatível com Cloudflare D1. Nenhum banco, binding, secret, recurso remoto ou migration de produção foi criado ou executado.

O domínio permanece independente de D1. Adaptadores convertem contratos e portas em SQL sem expor tabelas aos consumidores.

## Migrations registradas

| Versão | Arquivo | Responsabilidade |
|---:|---|---|
| 1 | `0001_gradebook_context_entities_imports_v1.sql` | anos/configurações, entidades, fontes, manifestos, lotes e diagnósticos |
| 2 | `0002_gradebook_records_audit_v1.sql` | registros acadêmicos, reconciliação, ocorrências e transições de Auditoria |
| 3 | `0003_logical_source_record_catalog_v1.sql` | associação anual e versionada entre fonte lógica e stream acadêmico |

As migrations usam criação condicional e registro idempotente em `gradebook_schema_migrations`. A ordem 0001–0003 é obrigatória.

`GRADEBOOK_D1_MIGRATIONS` preserva a base 0001–0002. `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` contém a ordem integral 0001–0003 e deve ser a referência do futuro runner operacional.

## Princípios físicos

- IDs de domínio são `TEXT` opacos; nomes não participam de chaves técnicas.
- Relações acadêmicas incluem `academic_year_id` e impedem referências entre anos.
- Streams mantêm `current_version` para controle otimista.
- Histórico fica em tabelas `*_versions` append-only.
- Nenhuma FK usa `ON DELETE CASCADE`.
- Relações consultáveis são normalizadas; o payload contratual completo também é preservado em JSON válido.
- Nome do arquivo é metadado versionado; SHA-256 identifica conteúdo.
- Binários não fazem parte do schema.

## Catálogo de tabelas

### Contexto e entidades

| Tabela | Papel |
|---|---|
| `gradebook_schema_migrations` | versões aplicadas |
| `academic_years` | identidade do ano e ponteiro atual |
| `academic_year_configuration_versions` | perfil/configuração anual versionado |
| `academic_year_versions` | estado/calendário do ano |
| `academic_entity_streams` | identidade e versão atual das entidades |
| `academic_entity_versions` | histórico e relações tipadas |

### Fonte e importação

| Tabela | Papel |
|---|---|
| `logical_sources` | continuidade lógica por ano/contexto |
| `source_file_streams` | identidade do manifesto e hash atual |
| `source_file_versions` | nomes, hash, parser, leitura e relação lógica versionados |
| `source_file_logical_source_candidates` | candidatos explícitos para associação ambígua |
| `import_batch_streams` | identidade e versão atual do lote |
| `import_batch_versions` | histórico do lote |
| `import_batch_files` | arquivos do lote e manifesto correspondente |
| `import_diagnostics` | diagnósticos por lote/arquivo/origem |

Mesmo hash renomeado não cria outra identidade acadêmica. Hash diferente exige confirmação de fonte lógica quando o contexto não for inequívoco.

### Registros acadêmicos

| Tabela | Papel |
|---|---|
| `academic_record_streams` | chave estável e versão atual de lançamento/resultado |
| `academic_record_versions` | histórico append-only com autoridade, regra e payload |

Tipos:

- `grade-entry`;
- `term-result`;
- `final-recovery`;
- `annual-result`.

### Catálogo por fonte lógica

| Tabela | Papel |
|---|---|
| `logical_source_record_streams` | estado e versão atuais da associação fonte ↔ stream |
| `logical_source_record_versions` | histórico da associação com manifesto/versão de origem |

A chave inclui ano, fonte lógica, tipo e chave do stream. FKs exigem fonte, stream e manifesto confirmado no mesmo ano/contexto.

Item ausente em uma nova versão não é desativado automaticamente. Estado `inactive` exige decisão explícita e nova versão da associação.

### Reconciliação e Auditoria

| Tabela | Papel |
|---|---|
| `audit_record_streams` | identidade e versão atual de ocorrência/reconciliação |
| `audit_record_versions` | histórico, gravidade, alvo e proveniência |
| `audit_occurrence_transitions` | mudanças imutáveis de estado, ator e justificativa |

## Versionamento e compare-and-set

O adaptador de escrita deve executar, na mesma transação:

1. `expectedVersion: null`: criar somente stream ausente com versão 1;
2. stream existente: atualizar raiz somente quando `current_version = expectedVersion`;
3. zero linhas atualizadas: retornar `version-conflict`;
4. acrescentar a nova linha histórica com `previous_version` correta;
5. confirmar raiz e histórico juntos; qualquer erro reverte tudo.

Continuidade obrigatória:

```text
versão 1  → previous_version IS NULL
versão N  → previous_version = N - 1
```

## Associação transacional — contrato integrado

A #243 tornou a associação explícita também fora do SQL:

- `LogicalSourceRecordAssociationStreamV1`;
- `LogicalSourceRecordAssociationV1`;
- `LogicalSourceRecordRepositoryV1`;
- repositório disponível em `PersistenceUnitOfWorkV1`;
- versões de associação representadas no plano e na estimativa;
- execução na mesma unidade de trabalho de fonte e registro acadêmico.

Ordem planejada:

```text
versão de fonte
      ↓
versão do registro acadêmico
      ↓
versão da associação fonte ↔ stream
      ↓
commit único
```

Conflito em qualquer etapa provoca rollback integral. A associação não pode ser um efeito colateral oculto do append acadêmico.

## Índices críticos

Os índices cobrem:

- ano/tipo/ID e paginação;
- históricos por versão descendente;
- SHA-256 atual por ano;
- fonte lógica e versões de arquivo;
- lotes, arquivos e diagnósticos;
- registros atuais por estudante/matrícula e atribuição/trimestre;
- ocorrências e reconciliações;
- associações atuais/ativas por fonte lógica e stream;
- histórico/proveniência da associação.

## Leitura local integrada

O adaptador local implementa:

- `findSourceFileByHash`;
- `getSourceFileVersion`;
- `AcademicRecordRepositoryV1.getCurrent`;
- `LogicalSourceRecordRepositoryV1.getCurrent`;
- `listCurrentStreams` por fonte lógica.

Ele filtra por ano, reconstrói contratos, confere colunas normalizadas e produz erros sanitizados. Nome de arquivo e varredura de JSON não são usados para descobrir relações.

## Verificação local

As suites aplicam/reaplicam 0001–0003 em SQLite em memória e verificam:

- idempotência das migrations;
- FKs e isolamento anual;
- ausência de cascades destrutivos;
- histórico e continuidade de versão;
- hash, renomeação e fontes candidatas;
- registros acadêmicos e Auditoria;
- associação fonte ↔ stream, proveniência e índice de atuais;
- reconstrução dos contratos e referências quebradas.

Somente dados sintéticos são usados.

## Escrita e promoção transacional local — #245

A #245 implementa localmente:

- `appendSourceFileVersion`;
- `AcademicRecordRepositoryV1.appendVersion`;
- `LogicalSourceRecordRepositoryV1.appendVersion`;
- `BatchPromotionTransactionPortV1` concreto;
- compare-and-set, savepoint por append, commit e rollback sobre 0001–0003;
- integração do executor da #236/#243 com o adaptador físico local.

O ambiente descartável habilita `PRAGMA foreign_keys = ON` e aplica o catálogo integral `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` na ordem 0001–0003. A promoção usa `BEGIN IMMEDIATE`, valida a versão corrente do lote e os arquivos aprovados, executa fonte → registro → associação e confirma um único `COMMIT`. Conflito ou falha em qualquer etapa executa `ROLLBACK` integral.

Cada append usa `SAVEPOINT`: a raiz é criada ou avançada por compare-and-set antes da linha histórica, e qualquer falha subsequente restaura o ponteiro. `expectedVersion: null` usa inserção condicional da raiz; stream existente retorna conflito. Versões existentes atualizam somente quando `current_version = expectedVersion` e acrescentam uma única linha com `previous_version` correspondente.

A API, as mensagens de erro sanitizadas, a ordem SQL e a matriz local estão detalhadas em [`D1_WRITE_ADAPTER.md`](D1_WRITE_ADAPTER.md).

Ainda permanecem fora do escopo:

- binding em `wrangler.jsonc`;
- banco persistente/remoto;
- migrations fora dos testes;
- endpoints, autenticação e capabilities;
- runner operacional, rollout, backup e recuperação;
- métricas de Saúde e limites.

A #245 não autoriza provisionamento. Binding/preview e backend autorizado serão issues posteriores e separadas.
