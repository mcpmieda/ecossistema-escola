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

## Composição D1 após a onda 18

`createGradebookD1RuntimeV1` compõe, após auth/gate/binding:

- `createGradebookD1PersistenceUnitOfWorkV1`;
- `createGradebookOperationalReadModelsV1`;
- `createOperationalWorkspaceAcademicYearCatalogV1`;
- `GradebookD1AuditWorkspaceSourceV1`;
- `createGradebookD1ClassPerformanceSourceV1` + `createClassPerformanceReadModelV1`;
- `createGradebookD1CouncilOfficialProjectionSourceV1`;
- `createGradebookD1BulletinCouncilDurabilityV1`;
- `GradebookD1BatchPromotionTransactionV1`;
- `GradebookD1MigrationRunnerV1`.

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(...)
  ├── classPerformanceReadModel()
  ├── bulletinSnapshotRepository()
  ├── councilDecisionStore()
  ├── councilWorkspace(...)
  ├── councilInstitutionalWorkspace(...)
  ├── planningRepositories()
  ├── inspectSchema()/runMigrations()
  └── promoteImportChangePlan()
```

PDF continua sem método D1 próprio: o renderer recebe `BulletinSnapshotV1` já autorizado. O runtime apenas fornece o repositório persistente local/preview usado por emissão/histórico/reprint.

## Bridges acadêmicos

| Método | Rota | Superfície |
| --- | --- | --- |
| `POST` | `/api/gradebook/operational-workspace` | Operational Workspace |
| `POST` | `/api/gradebook/audit-workspace` | Audit Workspace |
| `POST` | `/api/gradebook/performance` | Desempenho |
| `POST` | `/api/gradebook/bulletins` | Boletins |
| `POST` | `/api/gradebook/reports` | Relatórios |
| `POST` | `/api/gradebook/council-workspace` | Conselho V1/V2 |

Existe exatamente um bridge de cada tipo. Council V1/V2 compartilham o mesmo bridge. Todos usam autenticação/autorização server-side e `no-store`.

## Operational Workspace

`operationalReadModels()` fornece Aluno, Turma, Professor, Componente e pesquisa. `operationalWorkspaceAcademicYears()` enumera apenas anos persistidos. Request gates abortam/deduplicam e descartam respostas obsoletas.

## Audit Workspace

Listas batch/keyset; resolução `appendVersion`/CAS; ator = `session.oid`; instante = servidor; promoção permanece separada.

## Desempenho F6

`GradebookD1ClassPerformanceSourceV1` executa seis queries em lote por materialização. Mantém quatro lentes, regular/recovery, paginação independente, drill-down, comparison fail-closed, annual non-result `insufficient-data`, recovery oficial e `authorityMode: imported-source`.

## Conselho F7 V1/V2

```text
D1 → 6 queries em lote → GradebookD1CouncilOfficialProjectionRecordsSourceV1
   → createCouncilOfficialProjectionSourceV1
   → CouncilWorkspaceSourceV1
      ├── Council Workspace V1 → D1 CouncilDecisionStoreV1
      └── Council Institutional V2 → session store provider-independent
```

- `resolveNativeAnnualOutcome` fica somente na projeção upstream;
- Council Workspace não recebe callback de cálculo;
- 0/1/2/3+/insuficiente vêm da projeção oficial;
- T1/T2/T3 e REC preservam autoridade importada; REC ambígua falha fechada;
- decisões/histórico usam `GradebookD1CouncilDecisionStoreV1`, append-only/CAS e recuperam após reinstanciação do runtime;
- decisão humana usa justificativa/expectedVersion/CAS e identidade server-side;
- fechamento V2 cria fotografia histórica imutável e rejeita mutações posteriores;
- votação é opcional, sem abstenção, e não cria decisão;
- desempate permanece fail-closed sem identidade/capability formal de diretor;
- a sessão/reunião V2 não foi adicionada à migration 0004 e permanece process-local/preview nesta versão.

## Boletins F8 e durabilidade

O handler de Boletins usa `runtime.bulletinSnapshotRepository()`.

- preview e emissão usam o mesmo `BulletinModelV1`;
- lote acadêmico preserva materialização agregada e isolamento por aluno;
- snapshots usam `GradebookD1BulletinSnapshotRepositoryV1`, append-only/versionado/imutável;
- IDs de snapshot são opacos e gerados server-side;
- reimpressão usa exclusivamente snapshot histórico e faz zero leitura acadêmica atual;
- reinicializar runtime/adapter com o mesmo D1 recupera o histórico.

### PDF não pertence ao runtime D1

```text
POST /api/gradebook/bulletins
  ↓ snapshot autorizado/no-store
BulletinSnapshotV1
  ↓ BulletinPdfInputV1
renderer client-side lazy
  ↓
PDF individual ou batch bounded
```

- nenhum endpoint PDF novo;
- nenhum acesso a `GRADEBOOK_D1` pelo renderer;
- nenhum fetch acadêmico no renderer;
- reimpressão PDF recebe snapshot histórico já autorizado;
- renderer não recalcula dados acadêmicos;
- nenhum storage acadêmico persistente no navegador;
- batch PDF é sequencial: máximo 3 documentos, 72 páginas totais e uma geração concorrente;
- reprint batch aceita somente snapshots históricos.

## Relatórios F8

`POST /api/gradebook/reports` reutiliza runtime/read models/fontes oficiais. Não cria armazenamento paralelo nem novo motor acadêmico. Indicadores derivados sem semântica oficial permanecem fail-closed.

## Migration 0004

Catálogo local:

1. `0001_gradebook_context_entities_imports_v1.sql`;
2. `0002_gradebook_records_audit_v1.sql`;
3. `0003_logical_source_record_catalog_v1.sql`;
4. `0004_bulletin_council_durability_v1.sql`.

A 0004 cria quatro tabelas e índices de paginação/history. Total local após runner: 25 tabelas. Reexecução permanece idempotente. Não existe DDL dos adapters/factory e nenhuma migration remota foi aplicada.

Não há `ON DELETE CASCADE`, purge automático ou prazo de retenção inventado; o V1 é append-only.

## Rotas administrativas

| Método | Rota | Operação |
| --- | --- | --- |
| `GET` | `/api/gradebook/admin/persistence/status` | resumo do schema local |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplica migrations locais pendentes no ambiente autorizado |

Exigem sessão + `gradebook.persistence.admin`; escrita exige origin oficial; respostas `no-store` e sanitizadas.

## F9 / shell

A rota e as superfícies são lazy; entrar no Banco dispara zero requests acadêmicos automáticos. A busca global seleciona área por hash query, sem bridge paralelo. Produção e autoridade nativa continuam desativadas.

## F1 — sincronização de confiança

F1 está definitivamente concluída em **7/7** e #184 está `completed`. O registro sanitizado confirma protocolo privado/smoke completos, zero arquivo real modificado, zero dado identificável publicado e zero gate histórico antigo restante.

## Erros/logs e browser storage

Não expor SQL, parâmetros/binding, secrets, nomes/notas/payload acadêmico ou exceção bruta do driver. Workspaces convertem erro/autorização em estados não divulgadores.

A auditoria F9 trava em teste a ausência de persistência acadêmica via localStorage, sessionStorage, IndexedDB, Cache API e service worker.

## Limites preservados

- nenhum D1/binding remoto;
- nenhuma migration remota;
- nenhum secret/capability/papel novo;
- nenhuma ativação acadêmica em produção;
- nenhuma mudança de `authorityMode`;
- nenhuma regra acadêmica no adapter/HTTP/UI/renderer/wiring;
- sessão institucional V2 ainda não tem durabilidade cross-restart;
- PDF permanece raster/client-side;
- somente dados sintéticos em testes públicos.
