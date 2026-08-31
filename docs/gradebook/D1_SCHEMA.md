# Schema D1 V1 do Banco de Notas

## Estado e limite desta entrega

**Estado:** integrado pela issue #227/PR #233 no commit `781a2a25640366f1807de7d98cf0157f5c3cfea1`.

Este documento descreve o schema relacional inicial compatível com Cloudflare D1 e com as portas de persistência V1. A entrega contém somente SQL versionado, registro das migrations e testes sobre SQLite descartável. Nenhum banco, binding, secret, recurso remoto ou migration de produção foi criado ou executado.

O domínio permanece independente de D1. O adaptador será responsável por converter contratos e portas em comandos SQL, sem expor tabelas aos consumidores.

## Migrations registradas

O registro TypeScript fica em `server/gradebook/persistence/d1/schema/migrations.ts` e define a ordem canônica:

| Versão | Arquivo                                          | Responsabilidade                                                                                              |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 1      | `0001_gradebook_context_entities_imports_v1.sql` | anos/configurações, entidades, fontes lógicas, manifestos, versões de arquivo, lotes, arquivos e diagnósticos |
| 2      | `0002_gradebook_records_audit_v1.sql`            | streams de lançamentos/resultados, reconciliações, ocorrências e transições de Auditoria                      |

As duas migrations usam `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e `INSERT OR IGNORE` no catálogo `gradebook_schema_migrations`. Assim, a aplicação repetida sobre o mesmo banco é segura. A ordem continua obrigatória porque a versão 2 referencia tabelas da versão 1.

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

Cursores futuros devem usar as últimas colunas estáveis dos índices (`entity_id`, `manifest_id`, `import_batch_id`, `stream_key` ou `audit_record_id`) em vez de offsets globais.

## Datas e UTC

Instantes são `TEXT` ISO 8601 normalizados em UTC e terminam em `Z`, por exemplo `2026-08-31T18:00:00.000Z`. Checks rejeitam instantes sem esse marcador. Campos acadêmicos `starts_on` e `ends_on` são datas civis sem horário no formato `YYYY-MM-DD`; não representam um instante nem sofrem conversão de fuso.

O adaptador deve gerar `recorded_at` no servidor autorizado. A migration usa o relógio SQLite somente para registrar quando a própria versão de schema foi aplicada.

## Verificação local descartável

`tests/gradebook/persistence/d1-schema/d1-schema.test.ts` usa `node:sqlite` com banco `:memory:` e `PRAGMA foreign_keys = ON`. A suíte aplica as migrations em ordem, reaplica ambas e verifica:

- catálogo, registro idempotente e ausência de cascades destrutivos;
- FKs tipadas e isolamento anual;
- histórico, continuidade de versão e compare-and-set;
- hash, renomeação e candidatos de fonte lógica;
- vínculos lote → arquivo → diagnóstico → manifesto/hash;
- formatos dos streams acadêmicos e consulta paginada indexada;
- reconciliação, proveniência e transições de Auditoria;
- timestamps UTC e presença dos índices críticos.

Todos os IDs, nomes, payloads e valores usados são sintéticos. O workflow da #227 passou com 28 arquivos/246 testes e build aprovado.

## Lacuna de compatibilidade identificada na integração

O planejador da #228 possui `LogicalSourceRecordCatalogV1` para enumerar os streams acadêmicos atuais de uma fonte lógica. Essa leitura é necessária para detectar `missing-from-new-source` sem apagar valores anteriores.

As migrations 0001–0002 ainda não registram diretamente a associação:

```text
logical_source_id ↔ record_kind + stream_key
```

É tecnicamente possível encontrar referências dentro de payloads/evidências, mas isso exigiria varredura de JSON, seria difícil de indexar e criaria acoplamento implícito. Essa solução foi rejeitada.

A issue #235 adicionará uma migration 0003 com relação explícita, isolada por ano, versionada/auditável e indexada, além do primeiro adaptador D1 local de leitura. Até essa integração, o schema V1 é válido como base, mas não é suficiente para a detecção persistente completa de registros ausentes por fonte lógica.

## Lacunas deliberadas para as próximas issues

Esta entrega ainda não inclui:

- catálogo relacional fonte lógica ↔ streams acadêmicos — #235;
- binding D1 em `wrangler.jsonc` ou configuração por ambiente;
- criação de banco local/remoto ou execução de migration fora dos testes descartáveis;
- adaptadores completos das quatro portas de repositório;
- implementação física de `BatchPromotionTransactionPortV1`;
- autorização/capabilities do backend e endpoints;
- runner operacional de migrations, rollout, backup ou recuperação;
- política humana de escolha/confirmação de fonte lógica;
- armazenamento de binários;
- métricas de Saúde e limites.

A #235 implementará a extensão relacional e leituras locais. A #236 implementará o executor transacional contra portas, ainda independente do D1. Depois que ambas forem integradas, será seguro criar a escrita/promoção transacional concreta no D1 e, separadamente, provisionar bindings por ambiente.
