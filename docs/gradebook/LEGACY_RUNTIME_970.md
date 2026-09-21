# B-16: inventario do runtime legado da #970

## Atualizacao da integracao B-05/B-15

O inventario abaixo preserva a evidencia da baseline auditada. Na implementacao
posterior da #970, os servicos atuais passam a usar SQL nativo e tipos PostgreSQL;
`GRADEBOOK_DATABASE` substitui o alias nominal de banco, sem renomear o binding
fisico local `GRADEBOOK_D1`. A autorizacao compartilhada foi movida para
`server/gradebook/authorization-v1.ts` e o handler administrativo para
`server/gradebook/http/persistence-admin-routes-v1.ts`, sem mudar URLs ou ACL.

Essas mudancas nao tornam orfaos os 26 candidatos. Nao houve exclusao de runtime,
schema, migrations ou testes legados. B-16 permanece condicionado a uma decisao
explicita sobre os consumidores de compatibilidade listados abaixo; a medicao
zero do B-15 nao autoriza remover o tradutor. Esta documentacao nao declara
deploy ou homologacao produtiva: a proveniencia fica na issue e nos PRs.

## Resultado e escopo

Inspecao em 21/09/2026, sobre `origin/main@de029416ce73a172160bf5e2527690fae3931d73`.
Corpo da [issue #970](https://github.com/mcpmieda/ecossistema-escola/issues/970)
lido pela API GitHub, com `updatedAt=2026-09-21T11:31:39Z`.
Branch candidata: `fix/970-retire-legacy`, worktree isolado `work/b16`.

**Inventario: 26/26 (100%). Arquivos comprovadamente orfaos: 0/26.
Arquivos removidos: 0/26 (0%). B-16 nao esta encerrado.**

Todos os 26 arquivos com `.prepare(` possuem caminho de imports de valor desde
uma entrada HTTP e desde testes existentes. A ausencia das tabelas no catalogo
relacional nao prova ausencia de consumidores. A compatibilidade HTTP e os
ensaios D1 locais ainda impedem a retirada autorizada nesta subtarefa.

Entrega somente documental: nenhuma mudanca de contrato, runtime, autorizacao,
adaptador, tipo compartilhado, modulo relacional, migration ou `Aprendizados/`.
Nao foram apagados testes, consultados dados reais, acessados bancos remotos,
criados recursos, publicados commits ou abertos PRs. GitHub foi usado apenas
para leitura da issue e atualizacao da referencia `origin/main`.

Fontes de autoridade: `AGENTS.md`, `README.md`, `PROJECT_STATE.yaml`,
`DECISIONS.md` (incluindo BN-DEC-022/023 e suas referencias anteriores),
`CONSUMER_MAP.md`, `CONTRACTS.md`, `CONTRACT_VERSION_MAP.md`, `SOURCE_CONTRACT.md`,
`TEST_MATRIX.md`, `PRODUCTION_READINESS.md` e `STORAGE_RUNTIME_MAP.md`.
As referencias documentais desta lista sao relativas a `docs/gradebook/`, salvo
`AGENTS.md`. O handoff restringe a escrita ao inventario e a orfaos comprovados.

## Medicao e prova

O grafo foi extraido com a API AST do TypeScript, sobre arquivos JS/TS versionados
por `git ls-files`, excluindo `Aprendizados/`. Foram examinados imports, reexports,
imports dinamicos literais, `require` literal e imports de tipo. Caminhos foram
normalizados para `/`; imports relativos resolveram para arquivos, extensoes ou
`index`. Imports exclusivamente de tipo foram excluidos da busca de caminhos de
execucao, mas conservados como consumidores de contrato.

Resultado: **926 arquivos examinados; 3.472 arestas; zero imports relativos
nao resolvidos; 35 arquivos JS/TS em `persistence/d1/`; 26 com `.prepare(`,
somando 122 ocorrencias**. Os caminhos HTTP e os dispatches de versao abaixo
foram tambem lidos manualmente. O grafo comprova dependencia de modulo; nao
comprova que cada metodo ou ramo SQL foi executado em producao ou pelos testes.

Reproducao da contagem, na raiz do checkout (PowerShell):

```powershell
$units = @(git ls-files server/gradebook/persistence/d1 | ForEach-Object {
  $source = Get-Content -LiteralPath $_ -Raw
  $count = ([regex]::Matches($source, '\.prepare\(')).Count
  if ($count -gt 0) { [pscustomobject]@{ Path = $_; Prepare = $count } }
})
$units | Format-Table -AutoSize
$units.Count
($units | Measure-Object -Property Prepare -Sum).Sum
```

Para reproduzir as arestas testemunhas, buscar o nome de cada arquivo sem `.ts`
e conferir o import e a chamada nos consumidores indicados. Exemplo:

```powershell
rg -n 'd1-audit-workspace-source-v1|d1-bounded-import-transport-v1' server functions tests src shared scripts
rg -n 'createGradebookD1RuntimeV1|createWorkspace|createInstitutionalWorkspace' server/gradebook/http functions
rg -n 'replaceImportSqlParametersV1' server/gradebook/persistence
```

### O numero 122 nao significa 122 consultas distintas a tabelas legadas

- `runtime/d1-runtime-v1.ts`: uma sondagem `SELECT 1 AS gradebook_runtime_probe`, sem tabela.
- `runtime/d1-migration-runner-v1.ts`: execucao de statements de migrations locais, `sqlite_master` e `gradebook_schema_migrations`.
- `durability/d1-durability-transaction-v1.ts`: repasse de SQL e guarda CAS `changes()`, alem de savepoints via `.exec`.
- `transaction/d1-transient-observation-v1.ts`: repasse de SQL e observacao de erro, sem tabela propria.
- `transaction/d1-bounded-import-transport-v1.ts`: staging/repasse e um helper de placeholders importado pelo tradutor PostgreSQL atual.
- Fontes como Performance e Conselho usam uma chamada `.prepare` em helper para executar varios textos SQL. Contar chamadas nao mede a quantidade de consultas em uma jornada.

O SQL academico desses modulos usa o schema antigo: `academic_years`, familias
`academic_entity_*`, `academic_record_*`, `source_file_*`, `logical_source_*`,
`import_batch_*`, `import_diagnostics`, `audit_record_*`,
`audit_occurrence_transitions`, `bulletin_snapshot_*`, `council_decision_*` e
`council_session_*`. O staging usa `gradebook_import_stage_*`.
Esses nomes pertencem a `LEGACY_D1_COMPAT_RELATION_NAMES_V1` (29 entradas),
nao a `GRADEBOOK_CURRENT_TABLES_V1` (30 tabelas). Nao recriar tais relacoes.

## Inventario das 26 unidades

Paths da primeira coluna e consumidores abreviados sao relativos a
`server/gradebook/persistence/d1/`. Paths de testes sao relativos a
`tests/gradebook/`. Cada teste e uma testemunha de import direto ou transitivo,
nao uma alegacao de cobertura de todos os ramos do modulo.

Composicoes usadas na tabela:

- **R** = `runtime/d1-runtime-v1.ts`.
- **U** = `composition/d1-persistence-unit-of-work-v1.ts`.
- **D** = `durability/d1-bulletin-council-durability-v1.ts`.
- **B** = `transaction/d1-import-bootstrap-transaction-v2.ts`.
- **C** = `read/d1-import-catalog-bootstrap-read-v1.ts`.
- **A** = `server/gradebook/http/d1-admin-routes-v1.ts` (fora do prefixo).

**Decisao para todas as linhas: manter.** R e A sao alcancados por
`functions/[[path]].ts`; U, D e B sao compostos por R; C e composto por U.

| Unidade                                               | `.prepare` | Consumidor de valor / funcao                                                            | Teste testemunha                                                                                                                                 |
| ----------------------------------------------------- | ---------: | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `audit-workspace/d1-audit-workspace-source-v1.ts`     |          4 | R; fonte da Auditoria V1, usada por Relatorios V1                                       | `audit-workspace/d1-audit-workspace-source-v1.test.ts`                                                                                           |
| `audit/d1-audit-repository-v1.ts`                     |         15 | U; registros e transicoes de Auditoria                                                  | `persistence/d1-audit/d1-audit-repository-v1.test.ts`                                                                                            |
| `bulletins/d1-bulletin-snapshot-repository-v1.ts`     |          8 | D; snapshots/historico V1                                                               | `persistence/d1-durability/d1-bulletin-snapshot-repository-v1.test.ts`                                                                           |
| `council/d1-council-decision-store-v1.ts`             |         10 | D; decisoes versionadas                                                                 | `persistence/d1-durability/d1-council-decision-store-v1.test.ts`                                                                                 |
| `council/d1-council-official-projection-source-v1.ts` |          1 | R; projecao oficial para Conselho V1/V2                                                 | `council-projection/d1-council-official-projection-source-v1.test.ts`                                                                            |
| `durability/d1-council-session-store-v2.ts`           |          5 | D; sessoes/votos/fechamento V2                                                          | `persistence/d1-durability/d1-council-session-store-v2.test.ts`                                                                                  |
| `durability/d1-durability-transaction-v1.ts`          |          2 | Repositorios de snapshots, decisoes e sessoes; batch/CAS/savepoint                      | `persistence/d1-durability/d1-bulletin-snapshot-repository-v1.test.ts` (transitivo)                                                              |
| `entities/d1-academic-entity-repository-v1.ts`        |          6 | U; entidades versionadas                                                                | `persistence/d1-entities/d1-academic-entity-repository-v1.test.ts`                                                                               |
| `imports/d1-import-repository-extension-v1.ts`        |         11 | U; batches, arquivos e diagnosticos antigos                                             | `persistence/d1-imports/d1-import-repository-extension-v1.test.ts`                                                                               |
| `imports/d1-import-staging-baseline-v1.ts`            |          1 | A; contagens sanitizadas do piloto/staging local                                        | `http/d1-admin-routes-v1.test.ts` (transitivo)                                                                                                   |
| `imports/d1-logical-source-repository-v2.ts`          |          3 | U; fontes logicas do bootstrap                                                          | `persistence/d1-import-bootstrap-v2/d1-import-bootstrap-v2.test.ts`                                                                              |
| `operational-workspace/academic-year-catalog-v1.ts`   |          1 | R; catalogo de anos antigo                                                              | `operational-workspace/academic-year-catalog-v1.test.ts`                                                                                         |
| `performance/d1-class-performance-source-v1.ts`       |          1 | R; matriz/detalhes V1                                                                   | `performance-source/d1-class-performance-source-v1.test.ts`                                                                                      |
| `read/d1-import-catalog-bootstrap-read-v1.ts`         |          1 | U; leitura agregada de catalogo                                                         | `persistence/d1-composition/d1-persistence-unit-of-work-v1.test.ts` (transitivo)                                                                 |
| `read/d1-import-catalog-bulk-read-v1.ts`              |          2 | U e C; entidades/vinculos em lote                                                       | `persistence/d1-composition/d1-persistence-unit-of-work-v1.test.ts` (transitivo)                                                                 |
| `read/d1-import-planning-bulk-read-v1.ts`             |          3 | U e C; planejamento em lote                                                             | `persistence/d1-composition/d1-persistence-unit-of-work-v1.test.ts` (transitivo)                                                                 |
| `read/d1-read-adapter-v1.ts`                          |          8 | C, catalog/planning bulk, source-file read e write adapter; tambem tipos compartilhados | `persistence/d1-read-adapter/d1-read-adapter-v1.test.ts`                                                                                         |
| `read/d1-source-file-read-v2.ts`                      |          1 | U; versoes de fonte                                                                     | `persistence/d1-read-adapter/d1-source-file-read-v2.test.ts` (via U)                                                                             |
| `read/d1-student-status-bulk-read-v1.ts`              |          1 | U e C; situacao de alunos em lote                                                       | `persistence/d1-composition/d1-persistence-unit-of-work-v1.test.ts` (transitivo)                                                                 |
| `runtime/d1-migration-runner-v1.ts`                   |          3 | R e A; schema local/preview                                                             | `persistence/d1-runtime/d1-migration-runner-v1.test.ts`                                                                                          |
| `runtime/d1-runtime-v1.ts`                            |          1 | Entrada central e cinco handlers; sondagem e composicao autorizada                      | `persistence/d1-runtime/d1-runtime-v1.test.ts`                                                                                                   |
| `transaction/d1-batch-promotion-transaction-v1.ts`    |          6 | R, B e bootstrap bulk write; promocao atomica                                           | `persistence/d1-transaction/d1-batch-promotion-transaction-v1.test.ts`                                                                           |
| `transaction/d1-bounded-import-transport-v1.ts`       |          8 | B; `postgres/postgres-database-v1.ts` importa `replaceImportSqlParametersV1`            | `persistence/d1-import-bootstrap-v2/d1-bootstrap-manifest-version-evidence-v2.test.ts` (via B); `postgres-adapters/postgres-database-v1.test.ts` |
| `transaction/d1-import-bootstrap-bulk-write-v1.ts`    |          3 | B; escritas em lote de entidades, registros e associacoes                               | `persistence/d1-import-bootstrap-v2/d1-import-bootstrap-v2.test.ts` (via B)                                                                      |
| `transaction/d1-transient-observation-v1.ts`          |          1 | Batch promotion; observacao de falha e repasse                                          | `persistence/d1-transaction/d1-batch-promotion-transaction-v1.test.ts` (transitivo)                                                              |
| `write/d1-write-adapter-v1.ts`                        |         16 | U e batch promotion; tambem porta/tipos de modulos relacionais e Portal                 | `persistence/d1-write-adapter/d1-write-adapter-v1.test.ts`                                                                                       |
| **Total**                                             |    **122** | **26 unidades com consumidores**                                                        | **Nenhum teste retirado**                                                                                                                        |

### Os nove arquivos sem `.prepare(` tambem nao sao orfaos

| Arquivo no mesmo prefixo                            | Evidencia de necessidade                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `canonical-json-v1.ts`                              | Importado pelos repositorios de Auditoria e importacao; teste `persistence/d1-canonical-json/canonical-json-v1.test.ts` |
| `composition/d1-persistence-unit-of-work-v1.ts`     | R e B; testes de composicao e leitura de fontes                                                                         |
| `durability/d1-bulletin-council-durability-v1.ts`   | R; testes de schema/durabilidade e `readiness/synthetic-operational-rehearsal-v1.test.ts`                               |
| `read/d1-read-validation-v1.ts`                     | Read adapter e planning bulk; reexport e testes de validacao                                                            |
| `runtime/d1-migration-sql-v1.ts`                    | Import dinamico literal do migration runner; carrega SQL historico local                                                |
| `runtime/d1-runtime-authorization-v1.ts`            | Auth/capability usada por rotas atuais, importacao e runtime; nao e exclusivo do legado                                 |
| `runtime/sql-modules.d.ts`                          | Declaracao ambiente para `*.sql`, incluida por `tsconfig.server.json`; ausencia de import nao implica ausencia de uso   |
| `schema/migrations.ts`                              | Catalogo do runner e de fixtures/readiness; nao alterar migrations                                                      |
| `transaction/d1-import-bootstrap-transaction-v2.ts` | R; testes diretos de bootstrap/manifests                                                                                |

## Rotas e contratos ainda expostos

Todas as rotas academicas abaixo sao despachadas por `functions/[[path]].ts`
sob `withOfficialGradebookDatabaseV1`. No provider PostgreSQL, esse wrapper
injeta a facade em `GRADEBOOK_D1`; nao injeta um banco D1 fisico.

| Rota                                               | Contrato legado e ramo ainda composto                                                                                                                                                                                       | Contrato atual a preservar                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| POST `/api/gradebook/operational-workspace`        | `operational-workspace-transport-v1.ts`; apos dispatch V2 e validacao V1, handler cria R, catalogo de anos e read models. `maintenanceVersion: 1` ja e recusado                                                             | `operational-workspace-transport-v2.ts`                                      |
| POST `/api/gradebook/performance`                  | `performance-transport-v1.ts`; apos dispatch V6/V5/V4/V3/V2, `createProvider` cria R e `classPerformanceReadModel()`                                                                                                        | V2-V6, que sao capacidades distintas                                         |
| POST `/api/gradebook/bulletins`                    | `bulletin-transport-v1.ts`/`bulletin-contract-v1.ts`; apos dispatch V2, cria R, U, read models, catalogo e snapshots                                                                                                        | `relational-bulletin-v2.ts`, snapshots atuais e renderizador PDF reutilizado |
| POST `/api/gradebook/reports`                      | `institutional-reports-contract-v1.ts`; apos dispatch V2, `createService` cria R e compoe Performance, Conselho e Auditoria V1                                                                                              | `relational-institutional-reports-v2.ts`                                     |
| POST `/api/gradebook/council-workspace`            | `council-workspace-contract-v1.ts`: `queue`, `student`, `decision`; `council-institutional-contract-v2.ts`: `closure-review`, `vote`, `tie-break`, `closure-close`, `closure-history`. Callbacks da entrada central criam R | `relational-council-v3.ts`                                                   |
| GET `/api/gradebook/admin/persistence/status`      | Em local/preview, A cria R, inspeciona schema e baseline de staging; rota fica antes do wrapper geral                                                                                                                       | Em producao, status PostgreSQL atual via wrapper proprio                     |
| POST `/api/gradebook/admin/persistence/migrations` | Em local/preview, A chama runner historico apos auth/origem/validacao                                                                                                                                                       | Em producao, retorna `410 retired` sem executar migrations antigas           |

Os nomes de contrato da tabela estao sob `shared/gradebook-contracts/`, em suas
pastas de dominio. Os handlers estao sob `server/gradebook/http/`:
`operational-workspace-routes-v1.ts`, `performance-routes-v1.ts`,
`bulletin-routes-v1.ts`, `institutional-reports-routes-v1.ts`,
`council-routes-v1.ts` e `d1-admin-routes-v1.ts`.

Nao ha endpoint dedicado de Audit Workspace V1, retirado pela #664. Isso nao
torna sua fonte orfa: Relatorios V1 ainda chama `runtime.auditWorkspace()`.
Importacao publica usa V11 -> V10 -> V9; o bootstrap antigo permanece composto
em R e exercitado em fixtures, nao como fallback da importacao atual.

**Gate observado:** `runtimeEnvironment()` admite producao quando
`GRADEBOOK_PRODUCTION_ENABLED === 'true'`. Ele nao testa o provider para recusar
as versoes antigas. Os comentarios que descrevem bloqueio incondicional em
producao nao substituem esse codigo. O teste
`persistence/d1-runtime/d1-production-gate-v1.test.ts` cobre o gate habilitado.
A configuracao atual do repositorio usa PostgreSQL; quando um ramo legado
consulta tabelas ausentes, a composicao pode chegar ao tradutor e falhar.
Esta e uma conclusao estatica, nao evidencia de trafego ou erro remoto observado.

## Proximo passo minimo para decisao do lider

Nao alterar contratos nesta entrega. A proposta concreta para destravar a
separacao produtiva e registrar uma decisao de compatibilidade que limite os
transportes legados acima a D1 local/preview e responda `unavailable`/503 no
provider PostgreSQL, antes de instanciar R ou executar SQL legado. Manter auth,
ACL, origem, limites de corpo, validacao e `no-store` antes desse retorno.
Usar os DTOs de falha existentes; nao criar versao, fallback ou schema.

Os cinco pontos minimos sao os ramos V1 dos handlers de Operational Workspace,
Performance, Boletins e Relatorios, e o ramo Conselho V1/V2. A rota administrativa
ja separa producao e fixtures: preservar seu status atual e o `410` de migrations.
A mudanca deve ser aprovada como retirada de compatibilidade pelo lider, pois
`CONTRACT_VERSION_MAP.md` ainda classifica essas versoes como COMPATIBILITY.

Aceite desse proximo passo: requests legadas validas sob PostgreSQL nao criam
runtime nem chamam `prepare/exec/query`; requests nao autorizadas continuam
401/403 sem tocar banco; rotas atuais permanecem funcionais; local/preview D1,
schema sintetico, historico/snapshots, CAS e readiness continuam passando.
Usar spies que falhem imediatamente em acesso SQL indevido e testar o gate por
mutacao. Uma resposta generica 503 isolada nao prova ausencia de acesso ao banco.

Esse bloqueio de rotas **nao torna os 26 arquivos orfaos**: fixtures e testes
locais continuarao dependendo deles. Para retirar o tradutor do caminho oficial,
o lider deve separar a composicao local da facade PostgreSQL, migrar os tipos
compartilhados e eliminar sua dependencia de `replaceImportSqlParametersV1`
apos B-15. Alterar `postgres-database-v1.ts`, tipos/adaptadores compartilhados,
modulos relacionais ou a entrada central exige o ajuste de escopo previsto no
handoff. Nao apagar testes locais para fabricar a prova exigida pela #970.

## Confirmacao de B-13 e coordenacao com B-15

Confirmado na mesma baseline `de029416`: a facade
`server/gradebook/persistence/postgres/postgres-database-v1.ts` **nao contem
heuristica de parametro cujo conteudo parece JSON**. A afirmacao de heuristica
residual dessa natureza no corpo da #970 nao corresponde a esta implementacao.

- `castJsonColumnParametersV1` (linha 161) acrescenta casts pelo nome da coluna no SQL legado.
- `jsonParameterIndexesV1` (linha 185) identifica placeholders com `::jsonb`.
- `execute` (linha 382) aplica `typed(value, 25)` aos indices assim identificados; nao interpreta o conteudo da string.
- `normalizeValue`/`normalizeRow` (linhas 199/213) normalizam resultados conhecidos. O `JSON.parse` da linha 221 e chamado apenas para `payload_json` e `file_payload_json`, nao para inferir o tipo de parametros arbitrarios.
- `query` (linha 405) envia SQL e parametros diretamente a `unsafe`, sem essas regex de inferencia SQL; ainda compartilha a normalizacao de linhas de resultado.

O teste `tests/gradebook/postgres-adapters/postgres-database-v1.test.ts` inclui
`keeps JSON-looking text textual when the SQL column is not JSON` e
`does not parse parameter contents to decide whether a placeholder is JSONB`.
Ambos passaram na execucao registrada abaixo: texto com aparencia de JSON em
`file_name` continua texto; JSON malformado em `metadata_json` recebe OID 25 por
contexto SQL, deixando a validacao JSONB para o servidor.

Portanto, o restante deve ser descrito como retirada da inferencia **por SQL
legado** e da compatibilidade correspondente, nao como retirada de sniffing do
conteudo. Isso depende dos consumidores aqui inventariados; esta constatacao
nao encerra B-13/B-15 nem autoriza remover a normalizacao conhecida.

Contrato implementado pela fatia 5: `executeNative<Row>(text, readonly GradebookPostgresValueV1[])` retorna
`{ rows, changes }`; `postgresJsonTextV1` produz o marcador explicito
`{ jsonText: string }` que instrui OID 25, sem inferencia SQL na porta nativa.
As escritas atuais, incluindo snapshots de boletim, usam essa porta. O tradutor
continua restrito ao protocolo de compatibilidade; sua inferencia por SQL nao
e utilizada pelas consultas migradas.

## Validacao e limites da entrega candidata

Grafo e buscas foram executados no worktree desta branch; nenhum arquivo do
checkout principal foi editado. Dependencias locais preparadas com
`npm ci --offline --no-audit --no-fund`, sem registry ou infraestrutura remota.

**Testes focados: 47 arquivos, 276 testes aprovados, exit 0**, em Windows,
Node `v24.16.0`, Vitest `4.1.11`, 21/09/2026 as 09:08 (America/Sao_Paulo).
Duracao: 74,18 segundos. Codigo testado: SHA-base acima, sem alteracoes de
runtime; o unico arquivo novo da candidata e este inventario.

Comando reproduzivel (PowerShell):

```powershell
$targets = @(
  'tests/gradebook/persistence',
  'tests/gradebook/readiness',
  'tests/gradebook/http/d1-admin-routes-v1.test.ts',
  'tests/gradebook/audit-workspace/d1-audit-workspace-source-v1.test.ts',
  'tests/gradebook/council-projection/d1-council-official-projection-source-v1.test.ts',
  'tests/gradebook/council-v2/council-institutional-d1-restart-v2.test.ts',
  'tests/gradebook/performance-source',
  'tests/gradebook/operational-workspace/academic-year-catalog-v1.test.ts',
  'tests/gradebook/operational-workspace/operational-workspace-http-v1.test.ts',
  'tests/gradebook/performance-http/performance-routes-v1.test.ts',
  'tests/gradebook/bulletins-http',
  'tests/gradebook/reports/institutional-reports-http-v1.test.ts',
  'tests/gradebook/council-http',
  'tests/gradebook/postgres-cutover',
  'tests/gradebook/postgres-adapters'
)
npm test -- @targets
```

Nao foram adicionados testes novos que apenas fixassem a existencia dos arquivos
legados. A evidencia usa os testes comportamentais existentes sem enfraquece-los.

Nao ha alegacao de `npm run verify`, CI, deploy, smoke autenticado, uso externo,
ausencia de consumidores externos ou validacao de ACL produtiva nesta entrega.
A verificacao completa pertence ao head final do lider, conforme o handoff e
`AGENTS.md`. A retirada permanece pendente de decisao de compatibilidade e da
preservacao explicita de local/preview/readiness.
