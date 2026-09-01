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

Uma sessão autorizada gera no servidor um contexto opaco. Sem ele:

- runtime não é construído;
- binding não é inspecionado;
- read models/workspaces não são expostos;
- runner/promoção não alcançam D1.

Cada método do runtime revalida o contexto opaco. Roles/capabilities, `actorId` ou timestamps confiáveis não são aceitos do navegador.

## Composição após a onda 15

Depois de autorização, gate de ambiente e validação estrutural do binding, `createGradebookD1RuntimeV1` compõe:

- `createGradebookD1PersistenceUnitOfWorkV1`;
- `createGradebookOperationalReadModelsV1`;
- `createOperationalWorkspaceAcademicYearCatalogV1`;
- `GradebookD1AuditWorkspaceSourceV1`;
- `createGradebookD1ClassPerformanceSourceV1`;
- `createClassPerformanceReadModelV1`;
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
  ├── planningRepositories()
  ├── inspectSchema()
  ├── runMigrations()
  └── promoteImportChangePlan()
```

A ordem obrigatória continua:

```text
require opaque authorization
  ↓
runtimeEnvironment(env)
  ↓
requireDatabase(env.GRADEBOOK_D1)
```

Logo `production` falha antes do binding, inclusive para a composição de Desempenho.

## Operational Workspace

`operationalReadModels()` fornece Aluno, Turma, Professor, Componente e pesquisa.

`operationalWorkspaceAcademicYears()` enumera somente IDs/anos persistidos, sem relógio.

Bridge único:

| Método | Rota |
| --- | --- |
| `POST` | `/api/gradebook/operational-workspace` |

Regras:

- same-origin;
- `requireAuth` + autorização opaca;
- `no-store`;
- produção indisponível antes do binding;
- nenhuma mutation acadêmica;
- request gate no cliente aborta/deduplica e descarta respostas obsoletas;
- troca de ano invalida contexto anterior;
- paginação é deduplicada.

## Audit Workspace

Composição:

```text
GradebookD1AuditWorkspaceSourceV1
  + PersistenceUnitOfWorkV1.imports/audit
  ↓
createAuditWorkspaceV1
  ↓
GradebookD1RuntimeV1.auditWorkspace(...)
```

Bridge único após #314:

| Método | Rota |
| --- | --- |
| `POST` | `/api/gradebook/audit-workspace` |

Regras:

- `requireAuth` + `gradebook.persistence.admin`;
- `no-store`;
- listas D1 batch/keyset, sem N+1 por item;
- detalhe por ID conhecido;
- resolução via `appendVersion`/CAS;
- ator efetivo = `session.oid`;
- instante efetivo = servidor;
- promoção apenas informativa no workspace;
- executor de promoção continua separado.

## Desempenho — nova composição da #318

A #315 integrou a fonte física:

```text
GradebookD1ClassPerformanceSourceV1
  ↓
loadMatrix(...)
```

A fonte faz **seis queries em lote por materialização** e entrega ao read model uma projeção já resolvida, evitando D1 por aluno/célula.

A #318 compõe:

```text
GradebookD1ClassPerformanceSourceV1
  ↓
createClassPerformanceReadModelV1
  ↓
GradebookD1RuntimeV1.classPerformanceReadModel()
```

`classPerformanceReadModel()` revalida a mesma autorização opaca.

Invariantes físicas/semânticas:

- zero N+1;
- comparação solicitada sem resolvedor oficial → `not-comparable`;
- adapter não escolhe basis/current/reference de comparação;
- anual non-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`;
- outras lentes recovery continuam trimestrais;
- `authorityMode: imported-source`.

**Não existe rota HTTP/UI de Performance na #318.** #325 fará o end-to-end local/preview e #328 fará wiring central da próxima onda.

## Boletins

A #316 endureceu materialização/snapshots, mas a #318 não compõe handler/runtime de Boletins.

Estado:

- materialização agregada por turma;
- snapshots provider-independent locais, imutáveis e versionados;
- reimpressão sem leitura acadêmica atual;
- sem endpoint;
- sem PDF/renderer;
- sem tabela/migration/persistência remota.

#326 implementa a experiência local/preview. Se PDF exigir renderer/runtime/biblioteca nova, registra um único bloqueio explícito em vez de improvisar recurso.

## Runner de migrations

`GradebookD1MigrationRunnerV1` continua usando o catálogo canônico 0001–0003. Nenhuma migration foi adicionada nas ondas 14/15.

O runner verifica sequência, unicidade e prefixo aplicado. Reexecução sobre catálogo atual é idempotente.

Nenhum Wrangler/API de controle/conexão remota faz parte do runner de testes.

## Rotas administrativas

| Método | Rota | Operação |
| --- | --- | --- |
| `GET` | `/api/gradebook/admin/persistence/status` | resumo do schema local |
| `POST` | `/api/gradebook/admin/persistence/migrations` | aplica migrations locais pendentes no ambiente autorizado |

Exigem sessão + `gradebook.persistence.admin`; escrita exige origin oficial; respostas `no-store` e sanitizadas.

## Erros/logs

Não expor:

- SQL;
- parâmetros/binding;
- secrets;
- nomes/notas/payload acadêmico;
- exceção bruta do driver.

Workspaces convertem erro/autorização em estados/outcomes não divulgadores.

## Verificação combinada da onda 15

Testes cobrem:

- Operational/Audit bridges únicos;
- auth antes do binding;
- produção antes do binding;
- composição real do Audit Workspace;
- composição real do Class Performance provider;
- 6 queries / sem N+1 na fonte F6;
- comparison/anual/recovery fail-closed conforme contrato;
- hardening de Boletins;
- stale-response/year/pagination do F5;
- nenhum Performance/Bulletin HTTP na #318;
- `authorityMode: imported-source`.

## Próxima onda

- #325 — Performance transporte/HTTP/UI;
- #326 — Boletins HTTP/UI/preview/emissão/reimpressão/lote;
- #327 — Conselho V1;
- #328 — wiring central/runtime/Functions/App e integração.

## Limites preservados

- nenhum D1/binding remoto;
- nenhuma migration nova/remota;
- nenhum secret/capability/papel novo;
- nenhuma ativação acadêmica em produção;
- nenhuma mudança de `authorityMode`;
- nenhuma regra acadêmica no adapter/HTTP/UI;
- somente dados sintéticos em testes públicos.