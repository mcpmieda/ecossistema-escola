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
Centrais / Auditoria / Desempenho / Conselho / Boletins
```

Planejamento não grava; revisão não promove; executor não resolve ambiguidades; adaptador físico não cria regra acadêmica; UI/renderer não recalculam notas.

## Autoridade

`authorityMode` continua `imported-source`. O motor nativo permanece comparativo. A projeção oficial do Conselho pode usar o motor upstream para produzir classificação calculada, mas o lado calculated nunca substitui a autoridade importada nem cria decisão humana implícita.

## Contexto acadêmico

Ano/perfil são dependências explícitas. Nenhum módulo escolhe “ano atual” pelo relógio. As superfícies reutilizam catálogo/pesquisa do Operational Workspace para localizar contexto, sem bridge paralelo.

## D1 e ambientes

```text
Domínio/aplicação → portas/sources → adapters D1 → GradebookD1RuntimeV1 → D1 autorizado
```

```text
local      → binding injetado permitido
preview    → binding injetado permitido
production → falha antes de inspecionar GRADEBOOK_D1
```

Migrations locais continuam 0001–0003, 21 tabelas. A onda 17 não cria migration/schema/binding/secret/recurso remoto.

## Autorização e HTTP

Todas as superfícies acadêmicas expostas reutilizam `requireAuth`, `authorizeGradebookD1RuntimeV1`, capability `gradebook.persistence.admin`, contexto opaco server-side e `Cache-Control: no-store`. Roles/capabilities, ator e timestamps confiáveis não vêm do navegador.

Bridges únicos:

```text
POST /api/gradebook/operational-workspace
POST /api/gradebook/audit-workspace
POST /api/gradebook/performance
POST /api/gradebook/bulletins
POST /api/gradebook/council-workspace
```

## Shell após F9 / onda 17

A rota `banco-de-notas` é carregada sob demanda. O shell do Banco possui as áreas Importação, Centrais, Auditoria, Desempenho, Boletins e Conselho; as cinco superfícies acadêmicas são `React.lazy` independentes.

- entrada do Banco: zero requests acadêmicos automáticos;
- uma superfície inicia contexto somente quando ativada;
- error boundary da rota e boundary por superfície;
- painéis inativos ficam fora do foco/a11y, preservando somente estado React efêmero quando já visitados;
- busca global usa `#/banco-de-notas?area=<id>` para ativar diretamente uma área sem criar rota ou bridge novo;
- query `area` é validada contra a lista fechada de superfícies;
- dados acadêmicos não são persistidos em localStorage/sessionStorage/IndexedDB/Cache API/service worker.

Medição combinada #335+#336: entry 552,28 kB / 167,15 kB gzip; caminho inicial conservador com `alert` 661,25 / 202,82 kB gzip, contra baseline 820,68 / 235,71 kB gzip. O warning Vite >500 kB permanece como limitação mensurada.

## GradebookD1RuntimeV1

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

A composição física só ocorre depois do gate de ambiente e autorização opaca. `councilWorkspace()` recebe a projeção oficial D1 da #332 e usa store de decisão process-local/preview, append-only e descartável.

## Operational Workspace F5

Ano explícito; pesquisa autorizada; navegação `kind + id` opaca; abort/dedupe/stale discard; troca de ano invalida contexto; paginação deduplica resultados.

## Audit Workspace F4

Listas batch/keyset; resolução CAS; ator = `session.oid`; instante = servidor. Promoção continua exclusiva de `planImportReconciliation` + `executeImportChangePlan`.

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

## Boletins F8 + PDF canônico

```text
resultados/read models oficiais
  ↓
Bulletin materializer
  ↓
BulletinModelV1
  ├── preview
  └── emissão → BulletinSnapshotV1
                  ├── history/reprint
                  └── BulletinPdfInputV1 → renderer browser lazy → PDF
```

Preview e emissão usam a mesma materialização. Snapshots são imutáveis, append-only e versionados; reimpressão usa somente snapshot histórico e faz zero leitura acadêmica atual.

A #335 fechou a decisão de PDF:

- renderer client-side, P&B/raster, Canvas → JPEG por página → PDF 1.4 mínimo;
- PDF oficial aceita exclusivamente `BulletinPdfInputV1`/`BulletinSnapshotV1`;
- renderer carregado por `import()`; chunk combinado ~9,71 kB / 3,81 kB gzip;
- usa Geist já empacotada, sem CDN/fonte privada/fonte do sistema;
- não faz fetch, não persiste snapshot no navegador e revoga Blob URLs;
- não calcula nota, percentual, REC, média, arredondamento, resultado ou elegibilidade;
- reimpressão PDF não cria versão nova;
- arquivo PDF é individual por snapshot; não há fan-out de PDF em lote nesta versão;
- snapshots continuam process-local/preview e descartáveis cross-restart.

## Conselho F7

```text
D1 → fonte D1 #332 (6 queries) → createCouncilOfficialProjectionSourceV1
   → CouncilWorkspaceSourceV1 → createCouncilWorkspaceV1
   → POST /api/gradebook/council-workspace → CouncilWorkspacePage
```

- `resolveNativeAnnualOutcome` fica somente na projeção upstream;
- Council Workspace não recalcula elegibilidade;
- 0/1/2/3+/insuficiente vêm da projeção oficial;
- T1/T2/T3 usam imported; REC imported apenas quando aplicável e unívoca;
- REC ausente `not-applicable`; ambígua `insufficient-data`;
- decisão humana separada, justificativa, expectedVersion/CAS, ator/instante server-side;
- store atual process-local/preview e sem durabilidade cross-restart.

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
- Desempenho/Conselho/Boletins não mantêm motores acadêmicos próprios;
- Graph/SharePoint não é acessado diretamente pelo navegador para dados acadêmicos;
- produção permanece fail-closed até autorização própria;
- não criar bridges concorrentes.

## Publicação

```text
main → Deploy Cloudflare Pages → admin.escolaieda.com
```

Publicação de código não ativa dados acadêmicos: sem D1/binding acadêmico de produção, as superfícies físicas continuam indisponíveis antes do binding.
