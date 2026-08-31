# Schema D1 V1 do Banco de Notas

## Estado e limite desta entrega

**Estado:** base integrada pela issue #227/PR #233 e catálogo/leitura local integrados pela issue #235/PR #241.

Este documento descreve o schema relacional inicial compatível com Cloudflare D1 e com as portas de persistência V1. A entrega contém somente SQL versionado, registro das migrations e testes sobre SQLite descartável. Nenhum banco, binding, secret, recurso remoto ou migration de produção foi criado ou executado.

O domínio permanece independente de D1. O adaptador converte contratos e portas em comandos SQL sem expor tabelas aos consumidores.

## Migrations registradas

O registro TypeScript fica em `server/gradebook/persistence/d1/schema/migrations.ts`:

| Versão | Arquivo | Responsabilidade |
|---:|---|---|
| 1 | `0001_gradebook_context_entities_imports_v1.sql` | anos/configurações, entidades, fontes lógicas, manifestos, versões de arquivo, lotes, arquivos e diagnósticos |
| 2 | `0002_gradebook_records_audit_v1.sql` | streams de lançamentos/resultados, reconciliações, ocorrências e transições de Auditoria |
| 3 | `0003_logical_source_record_catalog_v1.sql` | associação explícita, versionada e anual entre fontes lógicas e streams acadêmicos |

As três migrations usam criação condicional e registro idempotente em `gradebook_schema_migrations`. A ordem é obrigatória porque as versões posteriores referenciam tabelas anteriores.

`GRADEBOOK_D1_MIGRATIONS` permanece como catálogo congelado da base 0001–0002 para compatibilidade com #227. `GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS` contém a ordem completa 0001–0003. O futuro runner operacional deverá usar explicitamente o catálogo integral aceito pelo integrador, sem omitir a migration 0003.

## Princípios físicos

- Identificadores de domínio são `TEXT` opacos; nomes de exibição não participam de chaves técnicas.
- Relações acadêmicas relevantes incluem `academic_year_id`; FKs compostas impedem referências entre anos.
- Streams mantêm `current_version` como ponteiro de controle otimista.
- Conteúdo histórico fica em tabelas `*_versions` e não é apagado pelo fluxo normal.
- Nenhuma FK usa `ON DELETE CASCADE`.
- Campos consultados e relações são normalizados; o payload contratual completo também é preservado em JSON válido.
- Nome do arquivo é metadado versionado. SHA-256 identifica conteúdo.
- Arquivos binários não fazem parte do schema.

## Catálogo de tabelas

### Contexto e entidades

| Tabela | Papel |
|---|---|
| `gradebook_schema_migrations` | versões de schema aplicadas |
| `academic_years` | identidade estável do ano por escola e ponteiro CAS atual |
| `academic_year_configuration_versions` | versões append-only do perfil/configuração anual |
| `academic_year_versions` | estado e calendário versionados do ano |
| `academic_entity_streams` | identidade e versão atual das entidades acadêmicas |
| `academic_entity_versions` | payload histórico e relações tipadas de cada entidade |

`academic_entity_versions` aceita professor, turma, componente curricular, atribuição, estudante, matrícula, evento de situação e componente avaliativo. Checks por tipo exigem as relações corretas e impedem que um ID de outra categoria ou ano satisfaça a referência.

### Fonte e importação

| Tabela | Papel |
|---|---|
| `logical_sources` | continuidade lógica confirmável por ano/contexto, independente de nome e hash |
| `source_file_streams` | identidade do manifesto, versão atual e SHA-256 atual |
| `source_file_versions` | nomes observados, manifesto, hash, parser, leitura e relação `unmatched`/`candidate`/`confirmed` |
| `source_file_logical_source_candidates` | candidatos explícitos para associação ambígua |
| `import_batch_streams` | identidade e versão atual do lote |
| `import_batch_versions` | estados, resumo e payload histórico do lote |
| `import_batch_files` | arquivo do lote ligado à versão exata do manifesto quando existente |
| `import_diagnostics` | diagnóstico ligado a lote, arquivo, manifesto, localização, entidade e evidência |

`source_file_streams` possui unicidade por ano e hash atual. O mesmo conteúdo renomeado permanece na mesma continuidade lógica; hash diferente pode ser candidato ou confirmação explícita, nunca decisão automática baseada no nome.

### Registros acadêmicos

| Tabela | Papel |
|---|---|
| `academic_record_streams` | chave estável e versão atual de lançamento, resultado trimestral, recuperação final ou resultado anual |
| `academic_record_versions` | histórico append-only com ID, autoridade, versão da regra e payload |

Checks estruturais seguem `AcademicRecordStreamV1`:

- `grade-entry`: estudante, matrícula e componente avaliativo;
- `term-result` e `final-recovery`: estudante, matrícula, atribuição e trimestre;
- `annual-result`: estudante, matrícula e atribuição, sem trimestre.

### Catálogo de registros por fonte lógica

| Tabela | Papel |
|---|---|
| `logical_source_record_streams` | estado e versão atuais da associação anual entre fonte lógica e stream acadêmico |
| `logical_source_record_versions` | histórico append-only da associação, com estado e manifesto/versão de origem |

A chave contém `academic_year_id`, `logical_source_id`, `record_kind` e `stream_key`. FKs compostas exigem que fonte, stream e manifesto confirmado pertençam ao mesmo ano e contexto.

Uma nova versão de arquivo não desativa associações ausentes. Mudança para `inactive` exige decisão explícita e nova versão; nunca ocorre apenas porque um item desapareceu da planilha.

### Reconciliação e Auditoria

| Tabela | Papel |
|---|---|
| `audit_record_streams` | identidade e versão atual de ocorrência ou reconciliação |
| `audit_record_versions` | payload histórico, estado/gravidade, alvo acadêmico e proveniência |
| `audit_occurrence_transitions` | sequência imutável de mudanças de estado, ator, data e justificativa |

Reconciliações exigem alvo acadêmico e versão de regra. Estados comparáveis exigem diferença e tolerância; `not-comparable` exige diferença nula. Resolução ou descarte de ocorrência exige justificativa.

## Versionamento e compare-and-set

As raízes `*_streams` e `academic_years` materializam a versão atual. O adaptador de escrita deve executar em uma transação:

1. Para `expectedVersion: null`, inserir a raiz com versão 1; conflito significa que o stream já existe.
2. Para stream existente, atualizar a raiz somente quando `current_version = expectedVersion`.
3. Exigir exatamente uma linha alterada; zero linhas produz `version-conflict`.
4. Inserir a nova linha histórica com versão seguinte e `previous_version` correta.
5. Confirmar raiz e histórico no mesmo commit; qualquer erro reverte ambos.

As tabelas históricas exigem:

```text
versão 1  → previous_version IS NULL
versão N  → previous_version = N - 1
```

O SQL não implementa sozinho a unidade de trabalho. Atomicidade e retorno de `VersionedWriteResultV1` pertencem ao adaptador.

## Índices críticos

Os índices cobrem:

- ano/tipo/ID e paginação por cursor;
- históricos por versão descendente;
- SHA-256 atual por ano;
- fonte lógica e versões de arquivo;
- lote/arquivo/status e diagnósticos;
- registros atuais por estudante/matrícula e por atribuição/trimestre;
- ocorrências por estado/gravidade;
- reconciliações por alvo;
- proveniência por manifesto/versão;
- associações atuais/ativas por ano, fonte lógica, tipo e stream;
- histórico de associação e proveniência do manifesto.

Cursores futuros usam colunas estáveis dos índices, não offsets globais.

## Datas e UTC

Instantes são `TEXT` ISO 8601 em UTC terminados em `Z`. Datas civis acadêmicas usam `YYYY-MM-DD`. O adaptador gera `recorded_at` no servidor autorizado; o relógio SQLite nas migrations registra somente a aplicação do schema.

## Leitura D1 local integrada

`server/gradebook/persistence/d1/read/d1-read-adapter-v1.ts` implementa sobre uma interface estrutural de leitura:

- `findSourceFileByHash`;
- `getSourceFileVersion`;
- `AcademicRecordRepositoryV1.getCurrent`;
- `listCurrentStreams` por fonte lógica.

O adaptador:

- filtra obrigatoriamente por ano;
- reconstrói contratos e versões;
- confere hash, manifesto, autoridade, regra e chave estável;
- lista somente associações atuais/ativas;
- produz erros sanitizados para leitura, JSON, shape e referência quebrada;
- não usa nome de arquivo nem varredura de JSON para descobrir associação.

## Verificação local descartável

A suíte aplica/reaplica as migrations 0001–0003 em SQLite em memória e verifica:

- catálogo e idempotência das migrations;
- ausência de cascades destrutivos;
- FKs tipadas e isolamento anual;
- histórico, continuidade de versão e compare-and-set;
- hash, renomeação e candidatos de fonte lógica;
- vínculos de lote, arquivo, diagnóstico e manifesto;
- shape e índices dos streams acadêmicos;
- reconciliação, Auditoria e UTC;
- associação fonte lógica ↔ stream, histórico, proveniência e índice de atuais;
- reconstrução dos contratos e falhas controladas.

Todos os dados são sintéticos. Nenhum binding ou banco remoto é necessário.

## Adaptação contratual pendente — issue #243

A migration 0003 e a leitura local representam a associação fonte lógica ↔ stream. O executor da #236, contudo, opera contra `PersistenceUnitOfWorkV1`, que ainda não expõe uma porta pública para **versionar a associação**. O plano da #228 também não estima nem ordena esse write.

A solução correta é a #243:

- formalizar associação, stream e repositório independentes do D1;
- adicionar a porta à unidade de trabalho;
- incluir a associação no plano e na estimativa;
- aplicar a associação na mesma transação de fonte e registro acadêmico;
- preservar controle otimista e rollback;
- não desativar automaticamente item ausente.

É proibido resolver isso como efeito colateral escondido do append acadêmico ou inferência por JSON/nome de arquivo.

## Lacunas deliberadas para as próximas issues

Ainda não existem:

- operações físicas de escrita das portas;
- implementação D1 de `BatchPromotionTransactionPortV1`;
- binding em `wrangler.jsonc` ou configuração por ambiente;
- banco persistente/remoto e migrations fora dos testes;
- autorização/capabilities e endpoints;
- runner operacional, rollout, backup e recuperação;
- política humana de confirmação de fonte lógica;
- armazenamento de binários;
- métricas de Saúde e limites.

A #245 implementará a escrita/promoção transacional local somente depois que a #243 for integrada. Provisionamento e bindings continuarão em issues separadas e explícitas.
