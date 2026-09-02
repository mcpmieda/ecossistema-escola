# Schema D1 V1 do Banco de Notas

## Estado e limite

O schema canônico está integrado até a migration 0004 em local/preview e produção. A onda 23 confirmou D1/binding produtivos, aplicou remotamente 0001–0004 e validou schema version 4 / 25 tabelas com zero migration pendente. Identificadores remotos permanecem fora do repositório.

O domínio permanece independente de D1. Adaptadores convertem contratos e portas em SQL sem expor tabelas aos consumidores.

## Migrations registradas

| Versão | Arquivo | Responsabilidade |
| -----: | --- | --- |
| 1 | `0001_gradebook_context_entities_imports_v1.sql` | anos/configurações, entidades, fontes, manifestos, lotes e diagnósticos |
| 2 | `0002_gradebook_records_audit_v1.sql` | registros acadêmicos, reconciliação, ocorrências e transições de Auditoria |
| 3 | `0003_logical_source_record_catalog_v1.sql` | associação anual/versionada entre fonte lógica e stream acadêmico |
| 4 | `0004_bulletin_council_durability_v1.sql` | snapshots de Boletins e decisões de Conselho, streams + versões |

As migrations usam criação condicional e registro idempotente em `gradebook_schema_migrations`. `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` contém a ordem integral 0001–0004 e é a referência do runner local/preview.

Após 0004 existem **25 tabelas**.

## Princípios físicos

- IDs de domínio são `TEXT` opacos; nomes não participam de chaves técnicas;
- relações acadêmicas incluem `academic_year_id` e impedem referências entre anos;
- streams mantêm `current_version` para controle otimista;
- histórico fica em tabelas `*_versions` append-only;
- nenhuma FK usa `ON DELETE CASCADE`;
- payload contratual completo pode ser preservado em JSON válido sem tornar JSON fonte de descoberta relacional;
- nome do arquivo é metadado versionado; SHA-256 identifica conteúdo;
- binários não fazem parte do schema;
- não existe purge/retention automática inventada.

## Catálogo de tabelas 0001–0003

### Contexto e entidades

`gradebook_schema_migrations`, `academic_years`, `academic_year_configuration_versions`, `academic_year_versions`, `academic_entity_streams`, `academic_entity_versions`.

### Fonte e importação

`logical_sources`, `source_file_streams`, `source_file_versions`, `source_file_logical_source_candidates`, `import_batch_streams`, `import_batch_versions`, `import_batch_files`, `import_diagnostics`.

Mesmo hash renomeado não cria outra identidade acadêmica. Hash diferente exige confirmação de fonte lógica quando o contexto não for inequívoco.

### Registros acadêmicos

`academic_record_streams`, `academic_record_versions` para `grade-entry`, `term-result`, `final-recovery` e `annual-result`.

### Catálogo por fonte lógica

`logical_source_record_streams`, `logical_source_record_versions`.

Item ausente em uma nova versão não é desativado automaticamente. Estado `inactive` exige decisão explícita e nova versão da associação.

### Reconciliação e Auditoria

`audit_record_streams`, `audit_record_versions`, `audit_occurrence_transitions`.

## Migration 0004 — durabilidade F7/F8

A #340 adiciona exatamente quatro tabelas:

| Tabela | Papel |
| --- | --- |
| `bulletin_snapshot_streams` | raiz/versionamento do snapshot de Boletim |
| `bulletin_snapshot_versions` | histórico imutável do snapshot, contexto e payload canônico |
| `council_decision_streams` | raiz/versionamento da decisão por aluno/turma/ano |
| `council_decision_versions` | histórico append-only da decisão humana, justificativa, ator e instante |

A 0004 não cria tabela para sessão/reunião institucional do Conselho V2. Esse agregado permanece provider-independent/process-local em local/preview nesta versão; a integração #343 não amplia schema silenciosamente.

### Access patterns e índices

A 0004 inclui índices para:

- histórico de snapshot por `snapshot_id`/versão;
- paginação de snapshots por ano/turma/aluno;
- paginação de snapshots por ano/turma;
- histórico de decisão por ano/turma/aluno e versão.

Os testes usam `EXPLAIN QUERY PLAN` para confirmar os índices e preservar anti-N+1.

## Versionamento e compare-and-set

O adaptador de escrita executa atomicamente:

1. `expectedVersion: null`: criar somente stream ausente com versão 1;
2. stream existente: atualizar raiz somente quando `current_version = expectedVersion`;
3. zero linhas atualizadas: retornar `version-conflict`;
4. acrescentar a nova linha histórica com `previous_version` correta;
5. confirmar raiz e histórico juntos; qualquer erro reverte tudo.

Continuidade:

```text
versão 1  → previous_version IS NULL
versão N  → previous_version = N - 1
```

A mesma disciplina vale para os novos streams de snapshot/decisão: append-only, imutabilidade e optimistic concurrency transacional.

## Associação transacional de fonte

A associação fonte lógica ↔ stream continua explícita e na mesma UoW de fonte/registro:

```text
versão de fonte
      ↓
versão do registro acadêmico
      ↓
versão da associação fonte ↔ stream
      ↓
commit único
```

Conflito em qualquer etapa provoca rollback integral. A 0004 não altera essa semântica.

## Leitura/escrita integrada

O runtime local/preview dispõe de:

- entidades, fontes, lotes, registros e associações;
- Audit Workspace e transições;
- read models operacionais e Performance;
- projeção oficial de Conselho #332;
- `GradebookD1BulletinSnapshotRepositoryV1`;
- `GradebookD1CouncilDecisionStoreV1`.

Boletim histórico/reprint lê o snapshot persistido e não relê dados acadêmicos atuais. Conselho recupera decisão/histórico após reinstanciação do adapter/runtime no mesmo D1.

## Verificação local

As suítes aplicam/reaplicam 0001–0004 em SQLite em memória e verificam:

- idempotência das migrations;
- 25 tabelas após aplicação integral;
- FKs e isolamento anual;
- ausência de cascades destrutivos;
- histórico e continuidade de versão;
- hash, renomeação e fontes candidatas;
- registros acadêmicos e Auditoria;
- associação fonte ↔ stream;
- snapshot/decision append, CAS e recuperação após reinstanciação;
- paginação/bounds e índices da 0004;
- nenhuma DDL fora de migration;
- nenhuma operação remota.

Somente dados sintéticos são usados.

## Produção

Estado consolidado pela onda 23:

- D1 acadêmico produtivo: presente e inequivocamente associado ao binding protegido;
- binding `GRADEBOOK_D1`: presente;
- migrations remotas: 0001–0004, 4/4;
- schema: version 4 / **25 tabelas de domínio**, zero pendência;
- tabela interna reservada do provedor, quando presente, não integra a contagem contratual das 25 tabelas;
- smoke sintético de Performance e Boletins/snapshot/reprint: verde;
- recovery pós-smoke: corpus sintético restaurado para zero raízes residuais;
- production gate final: OFF;
- piloto real: não iniciado;
- `authorityMode: imported-source`.

A presença do schema remoto não autoriza operação acadêmica real. Toda nova janela depende do gate server-side, auth/capability existentes e autorização própria.
