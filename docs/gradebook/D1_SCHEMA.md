# Schema D1 V1 do Banco de Notas

## Estado e limite desta entrega

**Estado:** base integrada pela issue #227/PR #233 e extensão de catálogo proposta pela issue #235.

Este documento descreve o schema relacional inicial compatível com Cloudflare D1 e com as portas de persistência V1. A entrega contém somente SQL versionado, registro das migrations e testes sobre SQLite descartável. Nenhum banco, binding, secret, recurso remoto ou migration de produção foi criado ou executado.

O domínio permanece independente de D1. O adaptador será responsável por converter contratos e portas em comandos SQL, sem expor tabelas aos consumidores.

## Migrations registradas

O registro TypeScript fica em `server/gradebook/persistence/d1/schema/migrations.ts` e define a ordem canônica:

| Versão | Arquivo                                          | Responsabilidade                                                                                              |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1      | `0001_gradebook_context_entities_imports_v1.sql` | anos/configurações, entidades, fontes lógicas, manifestos, versões de arquivo, lotes, arquivos e diagnósticos |
| 2      | `0002_gradebook_records_audit_v1.sql`            | streams de lançamentos/resultados, reconciliações, ocorrências e transições de Auditoria                      |
| 3      | `0003_logical_source_record_catalog_v1.sql`      | associação explícita, versionada e anual entre fontes lógicas e streams acadêmicos                            |

As três migrations usam `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e `INSERT OR IGNORE` no catálogo `gradebook_schema_migrations`. Assim, a aplicação repetida sobre o mesmo banco é segura. A ordem continua obrigatória porque as versões posteriores referenciam tabelas anteriores.

`GRADEBOOK_D1_MIGRATIONS` permanece como o catálogo congelado da base 0001–0002 para compatibilidade com a entrega #227. `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` é a ordem completa 0001–0003 consumida pela extensão e pelos seus testes.

## Princípios físicos

- Todo identificador de domínio é armazenado como `TEXT` opaco; nomes de exibição não participam de chaves técnicas.
- Toda relação acadêmica relevante inclui `academic_year_id`; FKs compostas impedem referências acidentais entre anos.
- Streams mantêm `current_version` como ponteiro de controle otimista. O conteúdo de cada versão é acrescentado nas tabelas `*_versions` e não é apagado pelo fluxo normal.
- Nenhuma FK usa `ON DELETE CASCADE`. Evidência, nota, resultado, diagnóstico e transição histórica não desaparecem por exclusão de um registro pai.
- Campos consultados, relações e estados operacionais são normalizados. O payload contratual completo também é preservado em JSON válido para que o adaptador não perca campos congelados V1.
- O nome do arquivo é metadado versionado. SHA-256 identifica conteúdo e recebe índice/constraint próprios.
- Arquivos binários não fazem parte do schema.

## Catálogo de tabelas

### Contexto e entidades

| Tabela                                 | Papel                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gradebook_schema_migrations`          | versões de schema aplicadas                                                                                                                        |
| `academic_years`                       | identidade estável do ano por escola e ponteiro CAS atual                                                                                          |
| `academic_year_configuration_versions` | versões append-only do perfil/configuração anual                                                                                                   |
| `academic_year_versions`               | estado e calendário versionados do ano                                                                                                             |
| `academic_entity_streams`              | identidade e versão atual de professor, turma, componente curricular, atribuição, estudante, matrícula, evento de situação e componente avaliativo |
| `academic_entity_versions`             | payload histórico e relações tipadas de cada entidade                                                                                              |

`academic_entity_versions` aceita os tipos `teacher`, `class-group`, `subject`, `teaching-assignment`, `student`, `enrollment`, `student-status-event` e `assessment-component`. Checks por tipo exigem:

- atribuição → professor + turma + componente curricular;
- matrícula → estudante + turma;
- evento de situação → matrícula;
- componente avaliativo → atribuição + trimestre.

As referências armazenam também o tipo esperado e usam FK composta `(academic_year_id, entity_kind, entity_id)`. Um ID de estudante não pode satisfazer uma referência de professor, nem um registro de outro ano pode satisfazer a relação.

### Fonte e importação

| Tabela                                  | Papel                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `logical_sources`                       | continuidade lógica confirmável por ano/contexto, independente de nome e hash                    |
| `source_file_streams`                   | identidade do manifesto, versão atual e SHA-256 atual                                            |
| `source_file_versions`                  | nomes observados, manifesto, hash, parser, leitura e relação `unmatched`/`candidate`/`confirmed` |
| `source_file_logical_source_candidates` | candidatos explícitos para associação ambígua                                                    |
| `import_batch_streams`                  | identidade e versão atual do lote                                                                |
| `import_batch_versions`                 | estados, resumo e payload histórico do lote                                                      |
| `import_batch_files`                    | arquivo do lote ligado à versão exata do manifesto quando existente                              |
| `import_diagnostics`                    | diagnóstico ligado a lote, arquivo, manifesto, localização, entidade e evidência                 |

`source_file_streams` possui unicidade `(academic_year_id, current_sha256)`. O mesmo conteúdo renomeado permanece no mesmo stream e pode gerar outra versão com outro `file_name`; um segundo stream atual com o mesmo hash é rejeitado. Hash diferente pode ser associado a uma fonte lógica somente como candidato ou confirmação explícita.

### Registros acadêmicos

| Tabela                     | Papel                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `academic_record_streams`  | chave estável e versão atual de lançamento, resultado trimestral, recuperação final ou resultado anual |
| `academic_record_versions` | histórico append-only com ID do registro, autoridade, versão da regra e payload                        |

Checks estruturais seguem `AcademicRecordStreamV1`:

- `grade-entry` exige estudante, matrícula e componente avaliativo;
- `term-result` e `final-recovery` exigem estudante, matrícula, atribuição e trimestre 1/2/3;
- `annual-result` exige estudante, matrícula e atribuição, sem trimestre.

### Catálogo de registros por fonte lógica

| Tabela                           | Papel                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `logical_source_record_streams`  | estado e versão atuais da associação anual entre fonte lógica e stream acadêmico                                       |
| `logical_source_record_versions` | histórico append-only da associação, com estado, manifesto/versão de origem e instante em que a relação foi registrada |

A chave da associação contém `academic_year_id`, `logical_source_id`, `record_kind` e `stream_key`. FKs compostas exigem que a fonte lógica e o stream acadêmico pertençam ao mesmo ano. A versão histórica referencia uma versão de manifesto confirmada para a mesma fonte lógica; referências cruzadas entre ano, manifesto e fonte são rejeitadas.

Uma nova versão de arquivo não desativa nem remove associações ausentes. Mudanças para `inactive` exigem registro explícito de uma nova versão da associação em uma futura operação de escrita/transação.

### Reconciliação e Auditoria

| Tabela                         | Papel                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `audit_record_streams`         | identidade e versão atual de ocorrência ou reconciliação                                      |
| `audit_record_versions`        | payload histórico, estado/gravidade, alvo acadêmico e proveniência de lote/manifesto/entidade |
| `audit_occurrence_transitions` | sequência imutável de mudanças de estado, ator, data, nota e justificativa                    |

Reconciliações exigem alvo acadêmico e versão de regra. Estados comparáveis exigem diferença e tolerância; `not-comparable` exige diferença nula. Ocorrências exigem gravidade, categoria e estado. Resolução ou descarte exige justificativa não vazia; reconhecimento preserva a transição `open → acknowledged`.

## Versionamento e compare-and-set

As raízes `*_streams` e `academic_years` materializam a versão atual para `VersionExpectationV1`. O adaptador deve executar em uma transação:

1. Para `expectedVersion: null`, inserir a raiz com `current_version = 1`; conflito de chave significa que já existe uma versão.
2. Para uma versão existente, atualizar a raiz com condição `current_version = expectedVersion`.
3. Exigir exatamente uma linha alterada; zero linhas produz `version-conflict` com consulta da versão atual.
4. Inserir a nova linha histórica com `version = expectedVersion + 1` e `previous_version = expectedVersion`.
5. Confirmar raiz e versão no mesmo commit; qualquer erro reverte ambas.

As tabelas históricas têm PK por stream/versão e check de continuidade:

```text
versão 1  → previous_version IS NULL
versão N  → previous_version = N - 1
```

Isso torna uma expectativa obsoleta observável por update condicional e também impede versões duplicadas ou saltos na trilha. O SQL não implementa sozinho a unidade de trabalho: atomicidade e retorno de `VersionedWriteResultV1` pertencem ao adaptador.

## Índices críticos

Os índices V1 cobrem:

- ano/tipo/ID para paginação por cursor de entidades;
- histórico de entidade, arquivo, lote, registro acadêmico e Auditoria por versão descendente;
- SHA-256 atual por ano;
- fonte lógica e versões de arquivo;
- lote/arquivo/status e diagnóstico por arquivo/gravidade;
- registros atuais por estudante/matrícula e por atribuição/trimestre;
- ocorrências atuais por estado/gravidade;
- reconciliações por alvo;
- proveniência de Auditoria por manifesto/versão;
- transições por ocorrência/sequência.
- associações atuais/ativas por ano, fonte lógica, tipo e chave de stream;
- histórico de associação em versão descendente e proveniência por manifesto/versão.

Cursores futuros devem usar as últimas colunas estáveis dos índices (`entity_id`, `manifest_id`, `import_batch_id`, `stream_key` ou `audit_record_id`) em vez de offsets globais.

## Datas e UTC

Instantes são `TEXT` ISO 8601 normalizados em UTC e terminam em `Z`, por exemplo `2026-08-31T18:00:00.000Z`. Checks rejeitam instantes sem esse marcador. Campos acadêmicos `starts_on` e `ends_on` são datas civis sem horário no formato `YYYY-MM-DD`; não representam um instante nem sofrem conversão de fuso.

O adaptador deve gerar `recorded_at` no servidor autorizado. A migration usa o relógio SQLite somente para registrar quando a própria versão de schema foi aplicada.

## Verificação local descartável

`tests/gradebook/persistence/d1-schema/d1-schema.test.ts` preserva a verificação da base 0001–0002. `tests/gradebook/persistence/d1-read-adapter/d1-read-adapter-v1.test.ts` usa `node:sqlite` com banco `:memory:` e `PRAGMA foreign_keys = ON`, aplica e reaplica a ordem completa 0001–0003 e verifica adicionalmente:

- catálogo, registro idempotente e ausência de cascades destrutivos;
- FKs tipadas e isolamento anual;
- histórico, continuidade de versão e compare-and-set;
- hash, renomeação e candidatos de fonte lógica;
- vínculos lote → arquivo → diagnóstico → manifesto/hash;
- formatos dos streams acadêmicos e consulta paginada indexada;
- reconciliação, proveniência e transições de Auditoria;
- timestamps UTC e presença dos índices críticos;
- isolamento anual, histórico e proveniência da associação fonte lógica ↔ stream;
- plano indexado da listagem atual e preservação quando chega nova versão de arquivo;
- reconstrução dos contratos e falhas controladas para JSON, shape ou referência inválidos.

Todos os IDs, nomes, payloads e valores usados são sintéticos. Nenhum binding ou banco remoto é necessário para essa verificação.

## Extensão de compatibilidade da issue #235

O planejador da #228 possui `LogicalSourceRecordCatalogV1` para enumerar os streams acadêmicos atuais de uma fonte lógica. Essa leitura é necessária para detectar `missing-from-new-source` sem apagar valores anteriores.

As migrations 0001–0002 não registravam diretamente a associação:

```text
logical_source_id ↔ record_kind + stream_key
```

É tecnicamente possível encontrar referências dentro de payloads/evidências, mas isso exigiria varredura de JSON, seria difícil de indexar e criaria acoplamento implícito. Essa solução foi rejeitada. A migration 0003 materializa a associação em colunas normalizadas, preserva seu histórico e fornece índice parcial para a leitura das relações atuais/ativas.

O adaptador descrito em `D1_READ_ADAPTER.md` consome essa relação sem consultar nomes de arquivo e sem extrair a associação de `payload_json`.

## Lacunas deliberadas para as próximas issues

Esta entrega ainda não inclui:

- binding D1 em `wrangler.jsonc` ou configuração por ambiente;
- criação de banco persistente/remoto ou execução de migration fora dos testes descartáveis;
- operações de escrita das portas de repositório;
- implementação física de `BatchPromotionTransactionPortV1`;
- autorização/capabilities do backend e endpoints;
- runner operacional de migrations, rollout, backup ou recuperação;
- política humana de escolha/confirmação de fonte lógica;
- armazenamento de binários;
- métricas de Saúde e limites.

A #236 implementa o executor transacional contra portas, ainda independente do D1. Depois que #235 e #236 forem integradas, será seguro criar a escrita/promoção transacional concreta no D1 e, separadamente, provisionar bindings por ambiente.
