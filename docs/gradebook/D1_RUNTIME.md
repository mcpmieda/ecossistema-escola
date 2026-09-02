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

A capability existente `gradebook.persistence.admin` é concedida ao papel institucional já existente `ADMINISTRADOR`.

Uma sessão autorizada gera no servidor um contexto opaco. Sem ele, runtime/binding/read models/workspaces/runner/promoção permanecem inacessíveis. Cada método do runtime revalida o contexto opaco. Roles/capabilities, `actorId` ou timestamps confiáveis não são aceitos do navegador.

A ordem obrigatória continua:

```text
require opaque authorization
  ↓
runtimeEnvironment(env)
  ↓
requireDatabase(env.GRADEBOOK_D1)
```

Logo `production` falha antes do binding para todas as superfícies acadêmicas.

## Composição após a onda 16

Depois de autorização, gate de ambiente e validação estrutural do binding, `createGradebookD1RuntimeV1` compõe:

- `createGradebookD1PersistenceUnitOfWorkV1`;
- `createGradebookOperationalReadModelsV1`;
- `createOperationalWorkspaceAcademicYearCatalogV1`;
- `GradebookD1AuditWorkspaceSourceV1`;
- `createGradebookD1ClassPerformanceSourceV1`;
- `createClassPerformanceReadModelV1`;
- `createGradebookD1CouncilOfficialProjectionSourceV1`;
- `GradebookD1BatchPromotionTransactionV1`;
- `GradebookD1MigrationRunnerV1`.

Superfícies:

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(resolutionIdentity, existingPlans?)
  ├── classPerformanceReadModel()
  ├── councilWorkspace(decisionIdentity)
  ├── planningRepositories()
  ├── inspectSchema()
  ├── runMigrations()
  └── promoteImportChangePlan()
```

`councilWorkspace()` usa a fonte oficial upstream da #332 e um `CouncilDecisionStoreV1` process-local/preview, append-only e descartável. Não existe storage remoto de decisões nesta onda.

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

`operationalReadModels()` fornece Aluno, Turma, Professor, Componente e pesquisa. `operationalWorkspaceAcademicYears()` enumera somente anos persistidos, sem relógio.

Request gates no cliente abortam/deduplicam e descartam respostas obsoletas; troca de ano invalida contexto anterior; paginação é deduplicada.

## Audit Workspace

```text
GradebookD1AuditWorkspaceSourceV1
  + PersistenceUnitOfWorkV1.imports/audit
  ↓
createAuditWorkspaceV1
  ↓
GradebookD1RuntimeV1.auditWorkspace(...)
```

Listas são batch/keyset; resolução usa `appendVersion`/CAS; ator efetivo = `session.oid`; instante efetivo = servidor; executor de promoção permanece separado.

## Desempenho F6

```text
GradebookD1ClassPerformanceSourceV1
  ↓  seis queries em lote por materialização
createClassPerformanceReadModelV1
  ↓
GradebookD1RuntimeV1.classPerformanceReadModel()
  ↓
POST /api/gradebook/performance
```

Invariantes:

- zero N+1 na matriz;
- quatro lentes e `regular | recovery`;
- paginação rows/columns independente;
- detalhe aluno/célula sob demanda;
- comparação solicitada sem resolvedor oficial → `not-comparable`;
- adapter não escolhe basis/current/reference de comparação;
- anual non-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`;
- outras lentes recovery continuam trimestrais;
- raw source evidence/`officialRecords` não atravessam HTTP;
- `authorityMode: imported-source`.

## Conselho F7 e projeção #332

A #332 adicionou apenas uma fonte read-only sobre o schema 0001–0003 existente:

```text
D1
  ↓  6 queries em lote
GradebookD1CouncilOfficialProjectionRecordsSourceV1
  ↓
createCouncilOfficialProjectionSourceV1
  ↓
CouncilWorkspaceSourceV1
  ↓
GradebookD1RuntimeV1.councilWorkspace(...)
```

A projeção upstream é o único lugar desse fluxo que chama `resolveNativeAnnualOutcome` e usa o perfil 2026 já existente. O Council Workspace não chama o resolvedor nem recebe callback de cálculo.

Semântica preservada:

- 0/1/2/3+/insuficiente vêm da projeção oficial upstream;
- lado calculated não vira autoridade;
- T1/T2/T3 usam `officialGrade.imported`;
- REC usa `recoveryGrade.imported` somente quando aplicável e unívoca;
- REC ausente → `not-applicable`;
- REC ambígua/incompatível → `insufficient-data`, sem heurística;
- decisão formal coerente já registrada impede segunda decisão;
- decisão humana posterior exige justificativa e `expectedVersion`/CAS;
- ator = sessão server-side; instante = servidor;
- nenhuma votação/desempate/frequência/participante/exceção é adicionada.

A fonte D1 faz seis queries read-only em lote por turma/ano e não cria DDL/DML/migration.

## Boletins F8

O handler de Boletins compõe a UoW/read models já existentes e um registry local/preview de snapshots.

- preview chama o mesmo materializador canônico da emissão;
- emissão individual e `emitBatch()` usam `BulletinModelV1`;
- lote preserva materialização agregada e isolamento por aluno;
- snapshots são locais, append-only, versionados e profundamente imutáveis;
- histórico lista o registry process-local;
- reimpressão usa exclusivamente snapshot histórico e faz zero leitura acadêmica atual;
- nenhuma tabela/migration/storage remoto foi criado.

**PDF/renderização pendente por decisão arquitetural.** Nenhum renderer/biblioteca/worker/storage de PDF é composto pelo runtime atual.

## Runner de migrations

`GradebookD1MigrationRunnerV1` continua usando o catálogo canônico 0001–0003. Nenhuma migration foi adicionada nas ondas 14, 15, 16 ou pela #332.

O runner verifica sequência, unicidade e prefixo aplicado. Reexecução sobre catálogo atual é idempotente. Nenhum Wrangler/API de controle/conexão remota faz parte do runner de testes.

## Rotas administrativas

| Método | Rota | Operação |
| --- | --- | --- |
| `GET` | `/api/gradebook/admin/persistence/status` | resumo do schema local |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplica migrations locais pendentes no ambiente autorizado |

Exigem sessão + `gradebook.persistence.admin`; escrita exige origin oficial; respostas `no-store` e sanitizadas.

## F1 — sincronização de confiança

F1 está definitivamente concluída em **7/7** e a #184 está `completed`. O registro sanitizado confirma protocolo privado controlado e smoke autenticado completos, zero arquivo real modificado, zero dado identificável publicado e zero gate histórico real antigo restante.

Isso retira os antigos gates históricos da F1; não altera os futuros gates de segurança/produção.

## Erros/logs

Não expor SQL, parâmetros/binding, secrets, nomes/notas/payload acadêmico ou exceção bruta do driver. Workspaces convertem erro/autorização em estados/outcomes não divulgadores.

## Verificação combinada da onda 16

Testes cobrem:

- cinco bridges únicos;
- auth opaca/capability/no-store;
- produção antes do binding;
- composição real de Performance e Council source #332 no runtime;
- F6 quatro lentes/comparison fail-closed/raw evidence ausente/recovery correto;
- F7 0/1/2/3+/insuficiente, T1/T2/T3/REC imported, REC ambígua fail-closed, decisão/histórico/CAS;
- F8 preview/emissão mesma base, lote, snapshots/history e reimpressão histórica;
- wiring das três páginas, stale-response e foco/a11y;
- ausência de regra acadêmica nova no wiring.

## Limites preservados

- nenhum D1/binding remoto;
- nenhuma migration nova/remota;
- nenhum secret/capability/papel novo;
- nenhuma ativação acadêmica em produção;
- nenhuma mudança de `authorityMode`;
- nenhuma regra acadêmica no adapter/HTTP/UI/wiring;
- snapshots/decisões locais continuam descartáveis;
- PDF continua pendente de decisão própria;
- somente dados sintéticos em testes públicos.
