# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. O shell, identidade e publicação são os mesmos do Centro; domínio, persistência e experiências acadêmicas permanecem separados e testáveis.

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
planejamento idempotente
  ↓
revisão humana
  ↓
executor transacional
  ↓
D1 local/preview autorizado
  ↓
modelo acadêmico versionado
  ↓
motor nativo + equivalência
  ↓
read models / workspaces
  ↓
Centrais / Auditoria / Desempenho / Conselho / Boletins
```

Planejamento não grava; revisão não promove; executor não resolve ambiguidades; adaptador físico não cria regra acadêmica; UI não recalcula notas.

## Autoridade

`authorityMode` continua `imported-source`. O motor nativo permanece comparativo. Nenhuma onda atual autoriza mudança automática ou implícita de autoridade.

## Contexto acadêmico

Ano/perfil são dependências explícitas. Nenhum módulo escolhe “ano atual” pelo relógio. O Operational Workspace enumera anos persistidos e exige seleção explícita.

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

Migrations locais continuam 0001–0003, 21 tabelas. Não existe D1 acadêmico remoto, binding ou migration de produção.

## Autorização

Todas as superfícies físicas acadêmicas reutilizam:

- `requireAuth` quando expostas por HTTP;
- `authorizeGradebookD1RuntimeV1`;
- capability existente `gradebook.persistence.admin`;
- contexto opaco emitido/validado no servidor;
- `Cache-Control: no-store` para HTTP acadêmico.

Roles/capabilities, ator e timestamps confiáveis não vêm do navegador.

## GradebookD1RuntimeV1 após a onda 15

```text
GradebookD1RuntimeV1
  ├── persistenceUnitOfWork()
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(serverResolutionIdentity, existingPlans?)
  ├── classPerformanceReadModel()
  ├── planningRepositories()
  ├── inspectSchema()/runMigrations()
  └── promoteImportChangePlan()
```

A composição de todas essas superfícies ocorre somente depois do gate de ambiente e da autorização opaca. A #318 acrescenta apenas `classPerformanceReadModel()` e sua fonte D1; não cria HTTP/UI de Performance.

## Operational Workspace F5

Arquitetura:

```text
PersistenceUnitOfWorkV1.entities
  ↓
createGradebookOperationalReadModelsV1
  ├── students
  ├── classGroups
  ├── teachers
  ├── subjects
  └── search
  ↓
OperationalWorkspace service/transport
  ↓
POST /api/gradebook/operational-workspace
  ↓
HeroUI
```

Invariantes:

- exatamente um bridge;
- ano explícito;
- navegação `kind + id` opaca;
- pesquisa acadêmica reutiliza o matching existente;
- request gate aborta/deduplica e descarta respostas obsoletas;
- troca de ano invalida contexto anterior;
- paginação não duplica itens.

## Audit Workspace F4

Arquitetura:

```text
AuditWorkspaceV1
  ↑
AuditWorkspaceSourceV1
  ↑
GradebookD1AuditWorkspaceSourceV1
  ↑
GradebookD1RuntimeV1.auditWorkspace(...)
  ↓
POST /api/gradebook/audit-workspace
  ↓
HeroUI
```

Listas são em lote/keyset; detalhe usa IDs conhecidos; resolução usa CAS/`appendVersion`. Ator = `session.oid`; instante = servidor. Promoção é apenas informativa no workspace e continua exclusiva de `planImportReconciliation` + `executeImportChangePlan`.

## Desempenho F6 após #315/#318

```text
D1 existente
  ↓
GradebookD1ClassPerformanceSourceV1
  ↓  seis queries em lote
createClassPerformanceReadModelV1
  ↓
GradebookD1RuntimeV1.classPerformanceReadModel()
```

A fonte física carrega a matriz em seis queries por materialização e não consulta D1 por célula/aluno.

Semântica congelada:

- `comparisonPeriod: null` → sem comparação;
- comparação solicitada sem resolvedor oficial → `not-comparable`;
- anual em lente não-result sem projeção oficial → `insufficient-data`;
- `recovery + result` usa `FinalRecoveryV1`;
- outras lentes recovery continuam trimestrais;
- nenhuma comparação é inventada no adapter.

A #318 **não** cria transport/HTTP/UI de Performance. Isso pertence à #325.

## Boletins F8 após #316

```text
read models/resultados oficiais
  ↓
Bulletin materializer
  ↓
BulletinModelV1
  ↓
emission service
  ↓
local snapshot repository
```

A materialização de lote compartilha a base da turma, evitando repetir a Central por aluno. Snapshots são profundamente imutáveis, append-only e versionados; reimpressão lê somente o snapshot histórico e não recalcula dados atuais.

Ainda não existem handler HTTP, UI, PDF ou persistência remota. A #326 leva essa capacidade até local/preview. O repositório não possui renderer PDF aprovado hoje; se incluir renderer exigir decisão nova, #326 registra um único bloqueio explícito de PDF.

## Conselho F7

A fundação anual já define apenas:

- 0 componentes não aprovados → estado anual aprovado conforme cálculo;
- 1–2 → elegibilidade básica quando a cobertura é suficiente;
- 3+ → não elegível por esse fundamento;
- cobertura insuficiente → nenhuma elegibilidade final inventada;
- `AnnualFinalDecisionV1` formal permanece separado do estado calculado.

A #327 pode construir fila, visão T1/T2/T3/REC, decisão humana, justificativa, histórico e CAS. Não pode inventar votação, desempate, frequência, participantes ou exceções.

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

SQL, keyset/cursor físico, versionamento, CAS, histórico e atomicidade.

### UI

Apresenta e navega. Nunca implementa cálculo acadêmico concorrente.

## Próxima onda e paralelismo

```text
#325 Performance E2E ─┐
#326 Boletins E2E    ─┼─> #328 integração
#327 Conselho V1     ─┘
```

As frentes mantêm módulos próprios; wiring central em `functions/[[path]].ts`, `src/App.tsx` e runtime fica preferencialmente reservado à #328 para reduzir conflitos.

F9 transversal é reavaliada depois da #328; segurança/no-store/a11y/recuperação continuam requisitos obrigatórios em todas as frentes.

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