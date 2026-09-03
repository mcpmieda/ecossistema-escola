# Runtime D1 autorizado e gate produtivo V1

## Escopo

O runtime compõe adaptadores D1 para ambientes autorizados. A onda 23 provisionou o D1 acadêmico produtivo e o binding server-side sem versionar identificadores remotos; o acesso acadêmico de produção continua condicionado ao gate explícito e à autorização opaca.

A #395 / PR #398 adicionou ao código a durabilidade D1 da sessão institucional do Conselho V2 e a migration 0005. A #399 aplicou exclusivamente essa migration ao D1 acadêmico produtivo e confirmou schema 5/27, pendentes 0 e gate OFF.

```text
local      → binding injetado permitido
preview    → binding injetado permitido
production → gate OFF: fail-closed antes de usar GRADEBOOK_D1
production → gate ON: somente em janela autorizada, após auth/capability e schema requerido
```

O binding lógico `GRADEBOOK_D1` é injetado na publicação por configuração protegida de produção; IDs remotos não são versionados. `GRADEBOOK_PRODUCTION_ENABLED` permanece ausente/`false` entre janelas autorizadas.

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

Logo, com o gate OFF, `production` falha antes do uso acadêmico do binding. Abrir o gate não elimina `requireAuth`, `gradebook.persistence.admin`, origin ou `no-store`.

## Composição D1 atual

`createGradebookD1RuntimeV1` compõe, após auth/gate/binding:

- `createGradebookD1PersistenceUnitOfWorkV1`;
- `createGradebookOperationalReadModelsV1`;
- `createOperationalWorkspaceAcademicYearCatalogV1`;
- `GradebookD1AuditWorkspaceSourceV1`;
- `createGradebookD1ClassPerformanceSourceV1` + `createClassPerformanceReadModelV1`;
- `createGradebookD1CouncilOfficialProjectionSourceV1`;
- `createGradebookD1BulletinCouncilDurabilityV1`, contendo snapshots, decisões V1 e sessão institucional V2;
- `GradebookD1BatchPromotionTransactionV1`;
- `GradebookD1MigrationRunnerV1`.

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(...)
  ├── deterministicCorrectionWorkspace(...)
  ├── classPerformanceReadModel()
  ├── bulletinSnapshotRepository()
  ├── councilDecisionStore()
  ├── councilWorkspace(...)
  ├── councilInstitutionalWorkspace(...) → D1 CouncilSessionStoreV2
  ├── planningRepositories()
  ├── inspectSchema()/runMigrations()
  └── promoteImportChangePlan()
```

PDF continua sem método D1 próprio: o renderer recebe `BulletinSnapshotV1` já autorizado.

## Bridges acadêmicos

| Método | Rota                                   | Superfície            |
| ------ | -------------------------------------- | --------------------- |
| `POST` | `/api/gradebook/operational-workspace` | Operational Workspace |
| `POST` | `/api/gradebook/audit-workspace`       | Audit Workspace       |
| `POST` | `/api/gradebook/performance`           | Desempenho            |
| `POST` | `/api/gradebook/bulletins`             | Boletins              |
| `POST` | `/api/gradebook/reports`               | Relatórios            |
| `POST` | `/api/gradebook/council-workspace`     | Conselho V1/V2        |

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
      └── Council Institutional V2 → D1 CouncilSessionStoreV2
```

- `resolveNativeAnnualOutcome` fica somente na projeção upstream;
- Council Workspace não recebe callback de cálculo;
- 0/1/2/3+/insuficiente vêm da projeção oficial;
- T1/T2/T3 e REC preservam autoridade importada; REC ambígua falha fechada;
- decisões/histórico V1 usam `GradebookD1CouncilDecisionStoreV1`, append-only/CAS;
- decisão humana usa justificativa/expectedVersion/CAS e identidade server-side;
- sessão/reunião V2 usa `GradebookD1CouncilSessionStoreV2`, mantendo estado, versão, votos opcionais, fechamento e histórico em stream/versões D1;
- reinstanciar adapter/runtime sobre o mesmo D1 preserva reunião fechada e o guard que impede mutações posteriores;
- fechamento V2 cria fotografia histórica imutável e rejeita mutações posteriores;
- votação é opcional, sem abstenção, e não cria decisão;
- desempate permanece fail-closed sem identidade/capability formal de diretor.

A porta `CouncilSessionStoreV2` não mudou. A implementação local process-local continua existindo para testes unitários isolados, mas o runtime D1 central não a usa mais.

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

## Migrations

Catálogo de código/local:

1. `0001_gradebook_context_entities_imports_v1.sql`;
2. `0002_gradebook_records_audit_v1.sql`;
3. `0003_logical_source_record_catalog_v1.sql`;
4. `0004_bulletin_council_durability_v1.sql`;
5. `0005_council_session_durability_v2.sql`.

A 0004 cria quatro tabelas para snapshots/decisões. A 0005 cria duas tabelas para sessão institucional V2. O catálogo local atual totaliza 27 tabelas.

**Produção remota está em 0001–0005 / schema 5 / 27 tabelas / pendentes 0.** A #399 confirmou registry sequencial, catálogo físico sem faltantes/extras, tabelas, FKs e índices da 0005. O gate permaneceu OFF; nenhum runtime acadêmico, smoke de sessão ou piloto foi executado.

Não há `ON DELETE CASCADE`, purge automático ou prazo de retenção inventado; a persistência continua append-only.

## Rotas administrativas

| Método | Rota                                          | Operação                                                                          |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET`  | `/api/gradebook/admin/persistence/status`     | resumo do schema local/autorizado                                                 |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplica migrations pendentes somente em ambiente/janela explicitamente autorizados |

Exigem sessão + `gradebook.persistence.admin`; escrita exige origin oficial; respostas `no-store` e sanitizadas. A operação da #399 usou o canal operacional Wrangler com o runtime fechado, preservando a mesma migration canônica.

## F9 / produção controlada

A rota e as superfícies são lazy; entrar no Banco dispara zero requests acadêmicos automáticos. A busca global seleciona área por hash query, sem bridge paralelo.

A #382 executou uma janela produtiva sintética controlada no SHA `2fdefa87f186e84ed40637437d4b0199baff82c6` com schema remoto 4/25: shell público, status anônimo, status autorizado, Performance e Boletins/snapshot/reprint passaram. O corpus foi restaurado para zero raízes residuais e o production gate terminou OFF. Nenhum piloto real foi executado e `authorityMode` permaneceu `imported-source`.

A #394 classificou a ausência de durabilidade cross-restart da sessão V2 como `blocks-pilot`. A #395 removeu o bloqueio no código e a #399 fechou o gate de schema remoto. A validação sintética do caminho produtivo e seu recovery permanecem separados na #400 antes de qualquer issue de piloto real.

Bindings D1 remotos que expõem `batch()` usam batches guardados para promoção e durabilidade; SQLite local preserva transações/savepoints. CAS, rollback e o planner/executor oficiais continuam sendo as únicas fronteiras de write.

## F1 — sincronização de confiança

F1 está definitivamente concluída em **7/7** e #184 está `completed`. O registro sanitizado confirma protocolo privado/smoke completos, zero arquivo real modificado, zero dado identificável publicado e zero gate histórico antigo restante.

## Erros/logs e browser storage

Não expor SQL, parâmetros/binding, secrets, nomes/notas/payload acadêmico ou exceção bruta do driver. Workspaces convertem erro/autorização em estados não divulgadores.

A auditoria F9 trava em teste a ausência de persistência acadêmica via localStorage, sessionStorage, IndexedDB, Cache API e service worker.

## Limites preservados

- D1/binding/schema produtivos existem, mas o gate permanece OFF fora de janelas autorizadas;
- produção remota está em schema 5/27, com 0001–0005 aplicadas e zero pendência;
- nenhum secret, ID remoto ou bookmark é versionado;
- nenhuma mudança de `authorityMode`;
- nenhum piloto real executado;
- nenhuma regra acadêmica no adapter/HTTP/UI/renderer/wiring;
- `reconciliation_v2.case_store` permanece process-local com os controles da #394;
- sessão/reunião institucional V2 é durável no runtime D1 quando schema 5 estiver disponível;
- write administrativo da configuração de comparação permanece hard stop fora do escopo do piloto autorizado;
- PDF permanece raster/client-side;
- somente dados sintéticos em testes públicos.
