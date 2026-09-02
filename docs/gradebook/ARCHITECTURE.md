# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. Shell, identidade e publicação são compartilhados; domínio, persistência e experiências acadêmicas permanecem separados e testáveis.

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
Centrais / Auditoria / Desempenho / Conselho / Boletins / Relatórios
```

Planejamento não grava; revisão não promove; executor não resolve ambiguidades; adaptador físico não cria regra acadêmica; UI/renderer não recalculam notas.

## Autoridade

`authorityMode` continua `imported-source` na onda 18. O motor nativo permanece comparativo e a eventual troca de autoridade pertence a F9/#347. Conselho continua separando cálculo de decisão humana.

## Contexto acadêmico

Ano/perfil são dependências explícitas. Nenhum módulo escolhe “ano atual” pelo relógio. Superfícies reutilizam catálogo/pesquisa autorizados para localizar contexto sem criar bridge acadêmico paralelo.

## D1 e ambientes

```text
Domínio/aplicação → portas/sources → adapters D1 → GradebookD1RuntimeV1 → D1 autorizado
```

```text
local      → binding injetado permitido
preview    → binding injetado permitido
production → falha antes de inspecionar GRADEBOOK_D1
```

Migrations locais: 0001–0004, 25 tabelas. A 0004 adiciona somente:

```text
bulletin_snapshot_streams
bulletin_snapshot_versions
council_decision_streams
council_decision_versions
```

Os quatro históricos são append-only, sem cascade/purge inventado. Nenhuma migration 0004 foi aplicada remotamente.

## Autorização e HTTP

Todas as superfícies acadêmicas expostas reutilizam `requireAuth`, `authorizeGradebookD1RuntimeV1`, capability `gradebook.persistence.admin`, contexto opaco server-side e `Cache-Control: no-store`. Roles/capabilities, ator e timestamps confiáveis não vêm do navegador.

Bridges únicos:

```text
POST /api/gradebook/operational-workspace
POST /api/gradebook/audit-workspace
POST /api/gradebook/performance
POST /api/gradebook/bulletins
POST /api/gradebook/reports
POST /api/gradebook/council-workspace
```

Council V1 e V2 compartilham o mesmo bridge; V2 não cria segundo endpoint.

## Shell após onda 18

A rota `banco-de-notas` é carregada sob demanda. Áreas: Importação, Centrais, Auditoria, Desempenho, Boletins, Relatórios e Conselho.

- zero requests acadêmicos automáticos na entrada;
- superfícies acadêmicas iniciam contexto somente quando ativadas;
- error boundary da rota e boundary por superfície;
- painéis inativos ficam fora do foco/a11y;
- busca global usa `#/banco-de-notas?area=<id>`;
- `area` é validada contra lista fechada;
- dados acadêmicos não são persistidos em localStorage/sessionStorage/IndexedDB/Cache API/service worker.

## GradebookD1RuntimeV1

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

A composição física ocorre somente depois de autorização opaca e do gate de ambiente. Snapshots de Boletins e decisões de Conselho usam a factory D1 durável da #340. A sessão/reunião institucional V2 permanece provider-independent/process-local nesta versão porque a 0004 não define armazenamento para esse agregado.

## Operational Workspace F5

Ano explícito; pesquisa autorizada; navegação `kind + id` opaca; abort/dedupe/stale discard; paginação resiliente. Cadastro/confirmação docente e atribuições anuais ficam para #354.

## Audit Workspace F4

Listas batch/keyset; resolução CAS; ator = `session.oid`; instante = servidor. Promoção continua exclusiva de `planImportReconciliation` + `executeImportChangePlan`. Fechamento autoritativo bullet-a-bullet: #353.

## Desempenho F6

```text
D1 → GradebookD1ClassPerformanceSourceV1 → createClassPerformanceReadModelV1
   → GradebookD1RuntimeV1.classPerformanceReadModel()
   → POST /api/gradebook/performance → PerformancePage
```

- quatro lentes;
- regular/recovery;
- paginação independente rows/columns;
- drill-down aluno/célula;
- raw source evidence não atravessa HTTP;
- comparison sem resolvedor oficial continua `not-comparable`;
- annual non-result sem projeção oficial continua `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`; demais lentes usam trimestre;
- UI não calcula regra acadêmica.

Comparabilidade proporcional e gráficos úteis ficam para #355, sem criar métricas por conveniência.

## Boletins F8 + PDF

```text
resultados/read models oficiais
  ↓
Bulletin materializer
  ↓
BulletinModelV1
  ├── preview
  └── emissão → D1 BulletinSnapshotV1
                  ├── history/reprint
                  ├── PDF individual
                  └── batch PDF bounded/sequencial
```

- preview e emissão usam a mesma materialização;
- snapshots são imutáveis, append-only, versionados e duráveis em D1 local/preview;
- reimpressão usa somente snapshot histórico e faz zero leitura acadêmica atual;
- renderer client-side P&B/raster, lazy e sem fetch acadêmico;
- batch PDF: máximo 3 documentos, 72 páginas totais e uma geração concorrente;
- reprint batch: somente snapshots históricos;
- nenhum queue/worker/storage remoto foi criado.

## Relatórios F8

```text
read models/resultados/snapshots oficiais
  ↓
InstitutionalReportsServiceV1
  ↓
POST /api/gradebook/reports
  ↓
InstitutionalReportsPage
```

Famílias: resultados/aproveitamento oficial, composição, recuperação, Conselho e Auditoria. Qualquer indicador derivado sem semântica oficial usa hard stop fail-closed; o serviço não cria média, ranking ou taxa acadêmica por conta própria.

## Conselho F7 V2

```text
D1 → projeção oficial #332 → CouncilWorkspaceSourceV1
   ├── Council Workspace V1 → decisões duráveis D1
   └── Council Institutional V2 → revisão/fechamento/fotografia
          ↓
POST /api/gradebook/council-workspace
```

- `resolveNativeAnnualOutcome` fica somente na projeção upstream;
- Council Workspace não recalcula elegibilidade;
- 0/1/2/3+/insuficiente vêm da projeção oficial;
- T1/T2/T3 e REC usam somente autoridade imported já resolvida;
- decisões humanas têm justificativa, expectedVersion/CAS e ator/instante server-side;
- fechamento cria fotografia histórica imutável e bloqueia mutações posteriores;
- votação numérica é opcional e não cria decisão;
- empate sem identidade/capability formal de diretor permanece fail-closed;
- `ADMINISTRADOR` nunca é inferido como diretor.

## F1 — confiança da fonte

F1 está definitivamente concluída em **7/7**. #184 está `completed`; protocolo privado controlado, smoke autenticado e falha isolada passaram; zero arquivo real modificado, zero dado identificável publicado e zero gate histórico antigo restante.

## Limites dos módulos

- **Plataforma:** shell, autenticação, navegação/publicação; sem regra de nota.
- **Contratos:** vocabulário/transportes; sem SQL/D1/React.
- **Domínio/motor:** funções puras de semântica e cálculo.
- **Aplicação:** orquestra workspaces/read models/emissão; não executa SQL.
- **Persistência:** SQL/cursor/versionamento/CAS/histórico/atomicidade.
- **UI/renderer:** apresenta e navega; não cria cálculo acadêmico concorrente.

## Regras de dependência

- domínio não importa UI/Cloudflare/Graph;
- contratos não dependem de persistência concreta;
- UI não acessa SQL/tabelas;
- adapters não alteram significado do contrato;
- Desempenho/Conselho/Boletins/Relatórios não mantêm motores acadêmicos próprios;
- Graph/SharePoint não é acessado diretamente pelo navegador para dados acadêmicos;
- produção permanece fail-closed até autorização própria;
- não criar bridges concorrentes.

## Publicação

```text
main → Deploy Cloudflare Pages → admin.escolaieda.com
```

Publicação de código não ativa dados acadêmicos: sem D1/binding acadêmico de produção, superfícies físicas continuam indisponíveis antes do binding.
