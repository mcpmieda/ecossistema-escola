# Runtime D1 local/preview e runner autorizado V1

## Escopo

O runtime compõe adaptadores D1 para desenvolvimento local e previews controlados. Ele não cria banco, binding, secret ou recurso remoto e não habilita consulta/persistência acadêmica em produção.

```text
local      → binding injetado permitido
preview    → binding injetado permitido
production → fail-closed antes de inspecionar GRADEBOOK_D1
```

O `wrangler.jsonc` de produção continua sem binding D1 acadêmico.

## Autorização

A capability `gradebook.persistence.admin` é concedida ao papel institucional `ADMINISTRADOR`. Uma sessão autorizada gera contexto opaco no servidor; sem ele, runtime/binding/read models/workspaces/runner/promoção permanecem inacessíveis.

Ordem obrigatória:

```text
require opaque authorization
  ↓
runtimeEnvironment(env)
  ↓
requireDatabase(env.GRADEBOOK_D1)
```

Logo `production` falha antes do binding para todas as superfícies acadêmicas.

## Composição D1 após a onda 17

`createGradebookD1RuntimeV1` continua compondo, após auth/gate/binding:

- `createGradebookD1PersistenceUnitOfWorkV1`;
- `createGradebookOperationalReadModelsV1`;
- `createOperationalWorkspaceAcademicYearCatalogV1`;
- `GradebookD1AuditWorkspaceSourceV1`;
- `createGradebookD1ClassPerformanceSourceV1` + `createClassPerformanceReadModelV1`;
- `createGradebookD1CouncilOfficialProjectionSourceV1`;
- `GradebookD1BatchPromotionTransactionV1`;
- `GradebookD1MigrationRunnerV1`.

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(...)
  ├── classPerformanceReadModel()
  ├── councilWorkspace(...)
  ├── planningRepositories()
  ├── inspectSchema()/runMigrations()
  └── promoteImportChangePlan()
```

A onda 17 não adiciona método D1 para PDF. O renderer PDF é client-side e recebe um `BulletinSnapshotV1` já retornado pelo bridge autorizado de Boletins.

## Bridges acadêmicos

| Método | Rota | Superfície |
| --- | --- | --- |
| `POST` | `/api/gradebook/operational-workspace` | Operational Workspace |
| `POST` | `/api/gradebook/audit-workspace` | Audit Workspace |
| `POST` | `/api/gradebook/performance` | Desempenho |
| `POST` | `/api/gradebook/bulletins` | Boletins |
| `POST` | `/api/gradebook/council-workspace` | Conselho |

Existe exatamente um bridge de cada tipo. Todos usam autenticação/autorização server-side e `no-store`.

## Operational Workspace

`operationalReadModels()` fornece Aluno, Turma, Professor, Componente e pesquisa. `operationalWorkspaceAcademicYears()` enumera apenas anos persistidos. Request gates abortam/deduplicam e descartam respostas obsoletas.

## Audit Workspace

Listas batch/keyset; resolução `appendVersion`/CAS; ator = `session.oid`; instante = servidor; promoção permanece separada.

## Desempenho F6

`GradebookD1ClassPerformanceSourceV1` executa seis queries em lote por materialização. Mantém quatro lentes, regular/recovery, paginação independente, drill-down, comparison fail-closed, annual non-result `insufficient-data`, recovery oficial e `authorityMode: imported-source`.

## Conselho F7 e projeção #332

```text
D1 → 6 queries em lote → GradebookD1CouncilOfficialProjectionRecordsSourceV1
   → createCouncilOfficialProjectionSourceV1
   → CouncilWorkspaceSourceV1
   → GradebookD1RuntimeV1.councilWorkspace(...)
```

- `resolveNativeAnnualOutcome` fica somente na projeção upstream;
- Council Workspace não recebe callback de cálculo;
- 0/1/2/3+/insuficiente vêm da projeção oficial;
- T1/T2/T3 e REC preservam autoridade importada; REC ambígua falha fechada;
- store de decisão é process-local/preview, append-only e descartável;
- decisão humana usa justificativa/expectedVersion/CAS e identidade server-side.

## Boletins F8 e PDF

O handler de Boletins compõe UoW/read models e registry local/preview de snapshots.

- preview e emissão usam o mesmo `BulletinModelV1`;
- lote acadêmico preserva materialização agregada e isolamento por aluno;
- snapshots locais append-only/versionados/imutáveis;
- reimpressão usa exclusivamente snapshot histórico e faz zero leitura acadêmica atual;
- nenhuma tabela/migration/storage remoto foi criado.

### PDF não pertence ao runtime D1

A #335 resolveu PDF no navegador:

```text
POST /api/gradebook/bulletins
  ↓ snapshot autorizado/no-store
BulletinSnapshotV1
  ↓ BulletinPdfInputV1
renderer client-side lazy
  ↓
PDF
```

- nenhum endpoint PDF novo;
- nenhum acesso a `GRADEBOOK_D1` pelo renderer;
- nenhum fetch acadêmico no renderer;
- reimpressão PDF recebe snapshot histórico já autorizado;
- renderer não recalcula dados acadêmicos;
- nenhum storage acadêmico persistente no navegador;
- PDF em lote não é disparado; arquivo individual por snapshot.

## F9 / shell

F9 não altera a superfície HTTP ou o runtime D1. A rota e as cinco superfícies são lazy; entrar no Banco dispara zero requests acadêmicos automáticos. A busca global pode selecionar uma área por hash query, mas isso não cria bridge nem endpoint.

## Runner de migrations

`GradebookD1MigrationRunnerV1` continua no catálogo 0001–0003. Nenhuma migration foi adicionada nas ondas 14–17 ou pela #332. Reexecução permanece idempotente.

## Rotas administrativas

| Método | Rota | Operação |
| --- | --- | --- |
| `GET` | `/api/gradebook/admin/persistence/status` | resumo do schema local |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplica migrations locais pendentes no ambiente autorizado |

Exigem sessão + `gradebook.persistence.admin`; escrita exige origin oficial; respostas `no-store` e sanitizadas.

## F1 — sincronização de confiança

F1 está definitivamente concluída em **7/7** e #184 está `completed`. O registro sanitizado confirma protocolo privado/smoke completos, zero arquivo real modificado, zero dado identificável publicado e zero gate histórico antigo restante.

## Erros/logs e browser storage

Não expor SQL, parâmetros/binding, secrets, nomes/notas/payload acadêmico ou exceção bruta do driver. Workspaces convertem erro/autorização em estados não divulgadores.

A auditoria F9 trava em teste a ausência de persistência acadêmica via localStorage, sessionStorage, IndexedDB, Cache API e service worker.

## Verificação combinada da onda 17

A composição PDF + F9 foi revalidada com **100 arquivos / 819 testes** antes do merge de #336 sobre #335. O build combinado mantém renderer PDF em chunk próprio (~9,71 kB / 3,81 kB gzip), entry 552,28 / 167,15 kB gzip e cinco bridges inalterados.

## Limites preservados

- nenhum D1/binding remoto;
- nenhuma migration nova/remota;
- nenhum secret/capability/papel novo;
- nenhuma ativação acadêmica em produção;
- nenhuma mudança de `authorityMode`;
- nenhuma regra acadêmica no adapter/HTTP/UI/renderer/wiring;
- snapshots/decisões locais continuam descartáveis;
- PDF é individual/raster e client-side;
- somente dados sintéticos em testes públicos.
