# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. O shell, identidade e publicação são compartilhados com o Centro; domínio, persistência e experiências acadêmicas permanecem separados e testáveis.

## Fluxo principal

```text
Planilhas dos professores
  ↓
leitura local + SHA-256 + manifesto
  ↓
reconhecimento + evidência de origem
  ↓
contexto acadêmico explícito
  ↓
planejamento idempotente + revisão humana
  ↓
executor transacional
  ↓
D1 local/preview autorizado
  ↓
modelo acadêmico versionado
  ↓
motor nativo + equivalência
  ↓
read models / projeções oficiais / workspaces
  ↓
Centrais / Auditoria / Desempenho / Conselho / Boletins
```

Planejamento não grava; revisão não promove; executor não resolve ambiguidades; adaptador físico não cria regra acadêmica; UI não recalcula notas.

## Autoridade

`authorityMode` continua `imported-source`. O motor nativo permanece comparativo. A projeção oficial do Conselho pode usar o motor nativo upstream para produzir a classificação calculada, mas o lado calculated nunca substitui a autoridade importada dos resultados exibidos nem autoriza uma decisão humana implícita.

## Contexto acadêmico

Ano/perfil são dependências explícitas. Nenhum módulo escolhe “ano atual” pelo relógio. As superfícies reutilizam o catálogo/pesquisa do Operational Workspace para localizar contexto, sem criar bridge acadêmico paralelo.

## D1 e ambientes

```text
Domínio/aplicação
  ↓
portas/provider-independent sources
  ↓
adaptadores D1
  ↓
GradebookD1RuntimeV1
  ↓
D1 do ambiente autorizado
```

```text
local      → binding injetado permitido
preview    → binding injetado permitido
production → falha antes de inspecionar GRADEBOOK_D1
```

Migrations locais continuam 0001–0003, 21 tabelas. A onda 16 e a #332 não criaram migration/schema novo. Não existe D1 acadêmico remoto, binding ou migration de produção.

## Autorização e HTTP

Todas as superfícies acadêmicas expostas reutilizam:

- `requireAuth`;
- `authorizeGradebookD1RuntimeV1`;
- capability existente `gradebook.persistence.admin`;
- contexto opaco emitido/validado no servidor;
- `Cache-Control: no-store`.

Roles/capabilities, ator e timestamps confiáveis não vêm do navegador.

Bridges únicos:

```text
POST /api/gradebook/operational-workspace
POST /api/gradebook/audit-workspace
POST /api/gradebook/performance
POST /api/gradebook/bulletins
POST /api/gradebook/council-workspace
```

## GradebookD1RuntimeV1 após a onda 16

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(serverResolutionIdentity, existingPlans?)
  ├── classPerformanceReadModel()
  ├── councilWorkspace(serverDecisionIdentity)
  ├── planningRepositories()
  ├── inspectSchema()/runMigrations()
  └── promoteImportChangePlan()
```

A composição física só ocorre depois do gate de ambiente e da autorização opaca. `councilWorkspace()` recebe como source a projeção oficial D1 da #332 e usa um store de decisão process-local/preview, append-only e descartável.

## Operational Workspace F5

```text
PersistenceUnitOfWorkV1.entities
  ↓
createGradebookOperationalReadModelsV1
  ↓
Operational Workspace
  ↓
POST /api/gradebook/operational-workspace
  ↓
HeroUI
```

Ano é explícito; navegação é `kind + id` opaca; request gates abortam/deduplicam e descartam respostas obsoletas; troca de ano invalida o contexto anterior.

## Audit Workspace F4

```text
GradebookD1AuditWorkspaceSourceV1
  ↓
GradebookD1RuntimeV1.auditWorkspace(...)
  ↓
POST /api/gradebook/audit-workspace
  ↓
HeroUI
```

Listas são em lote/keyset; resolução usa CAS. Ator = `session.oid`; instante = servidor. Promoção continua exclusiva de `planImportReconciliation` + `executeImportChangePlan`.

## Desempenho F6 end-to-end

```text
D1 existente
  ↓
GradebookD1ClassPerformanceSourceV1
  ↓  seis queries em lote
createClassPerformanceReadModelV1
  ↓
GradebookD1RuntimeV1.classPerformanceReadModel()
  ↓
POST /api/gradebook/performance
  ↓
PerformancePage
```

Semântica congelada:

- quatro lentes: resultado, quantitativo, qualitativo e avaliações;
- regular/recovery;
- linhas/colunas paginadas independentemente;
- detalhe aluno/célula sob demanda;
- raw source evidence/`officialRecords` não atravessam HTTP;
- `comparisonPeriod: null` → sem comparação;
- comparação solicitada sem resolvedor oficial → `not-comparable`;
- anual em lente não-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`;
- outras lentes recovery continuam trimestrais;
- UI possui abort/dedupe/stale-response discard e não calcula regra acadêmica.

## Boletins F8 end-to-end

```text
resultados/read models oficiais
  ↓
Bulletin materializer
  ↓
BulletinModelV1
  ├── preview
  └── emission → local snapshot repository
                  ↓
                history/reprint
  ↓
POST /api/gradebook/bulletins
  ↓
BulletinPage
```

Preview e emissão usam a mesma materialização canônica. Lote compartilha leitura agregada e isola alunos bloqueados. Snapshots são profundamente imutáveis, append-only e versionados; reimpressão lê exclusivamente o snapshot histórico e faz zero leitura acadêmica atual.

O armazenamento permanece process-local/preview e descartável. **PDF/renderização pendente por decisão arquitetural**: a #328 não adiciona renderer, biblioteca, worker, fontes ou storage de PDF.

## Conselho F7 end-to-end

A #332 resolveu o hard stop de composição por introduzir uma projeção oficial upstream:

```text
D1 0001–0003 existente
  ↓  seis consultas read-only em lote
GradebookD1CouncilOfficialProjectionRecordsSourceV1
  ↓
createCouncilOfficialProjectionSourceV1
  ├── resolveNativeAnnualOutcome (somente aqui, upstream)
  ├── queueState 0/1/2/3+/insuficiente
  ├── T1/T2/T3 imported
  └── REC imported, somente aplicável + unívoca
  ↓
CouncilWorkspaceSourceV1
  ↓
createCouncilWorkspaceV1
  ├── decisão humana separada
  └── CouncilDecisionStoreV1 local/preview
  ↓
POST /api/gradebook/council-workspace
  ↓
CouncilWorkspacePage
```

Invariantes:

- Council Workspace **não** chama `resolveNativeAnnualOutcome` e não recebe callback de cálculo;
- 0 componentes não aprovados → segue resultado anual oficial;
- 1–2 → elegível apenas pela projeção oficial resolvida;
- 3+ → não elegível pela projeção oficial;
- cobertura incompleta → `insufficient-data`, sem decisão inventada;
- T1/T2/T3 vêm de `TermResultV1.officialGrade.imported`;
- REC vem de `FinalRecoveryV1.recoveryGrade.imported` somente quando aplicável e unívoca;
- REC ausente → `not-applicable`;
- REC ambígua/incompatível → `insufficient-data`;
- alteração apenas do lado calculated não muda a elegibilidade projetada;
- decisão formal coerente preexistente não abre segunda decisão;
- decisão humana exige justificativa e `expectedVersion`/CAS;
- ator e instante vêm do servidor;
- votação, desempate, frequência, participantes e exceções não formalizadas continuam fora da V1.

## F1 — confiança da fonte

A F1 está definitivamente concluída em **7/7**. A #184 foi fechada como `completed` depois de protocolo privado controlado e smoke autenticado completos, incluindo falha isolada. O registro sanitizado confirma zero arquivo real modificado, zero dado identificável publicado e zero gate histórico real antigo restante.

Essa conclusão retira apenas os antigos gates históricos da F1; políticas gerais de segurança e futuros gates de ativação de produção permanecem vigentes.

## Limites dos módulos

### Plataforma
Shell, autenticação, navegação e publicação. Não contém regra de nota.

### Contratos
Vocabulário compartilhado e transportes mínimos. Não conhecem SQL/D1/React.

### Domínio/motor
Funções puras para semântica, arredondamento, trimestre, recuperação, anual e equivalência.

### Aplicação
Orquestra read models/workspaces/emissão contra portas. Não executa SQL.

### Persistência
SQL, keyset/cursor físico, versionamento, CAS, histórico e atomicidade. A projeção D1 do Conselho só materializa dados existentes e não altera schema.

### UI
Apresenta e navega. Nunca implementa cálculo acadêmico concorrente.

## Regras de dependência

- domínio não importa UI/Cloudflare/Graph;
- contratos não dependem de persistência concreta;
- UI não acessa SQL/tabelas;
- aplicação não executa SQL;
- adapters não alteram significado do contrato;
- Desempenho/Conselho/Boletins não mantêm motores próprios;
- Microsoft Graph/SharePoint não é acessado diretamente pelo navegador para dados acadêmicos;
- produção permanece fail-closed até autorização própria;
- não criar bridges concorrentes para a mesma capacidade.

## Publicação

```text
main → Deploy Cloudflare Pages → admin.escolaieda.com
```

A publicação de código não ativa dados acadêmicos: sem D1/binding acadêmico de produção, as superfícies físicas continuam indisponíveis antes do binding.
