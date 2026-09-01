# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. Não é outro aplicativo e não cresce como uma página única. O shell global permanece em `src/platform`; importação, domínio, persistência, Auditoria e experiências evoluem em módulos separados.

## Fluxo de dados

```text
Planilhas dos professores
          ↓
Leitura local + SHA-256 + manifesto
          ↓
Reconhecimento e evidência de origem
          ↓
Contexto acadêmico explícito
          ↓
Planejamento idempotente
          ↓
Revisão humana dos pendentes
          ↓
Executor transacional
          ↓
Runtime D1 autorizado por ambiente
          ↓
Modelo acadêmico versionado
          ↓
Motor nativo + equivalência fonte × motor
          ↓
Resultados + Auditoria
          ↓
Read models + pesquisa autorizada
          ↓
Centrais / Auditoria / Desempenho / Conselho / Boletins
```

Planejamento, revisão e execução são etapas distintas. O planejador não grava; o executor não resolve ambiguidades; o adaptador não cria regras acadêmicas; a equivalência não muda a autoridade.

## Separação de autoridade

O valor importado e o calculado pelo motor permanecem separados. `authorityMode` seleciona a autoridade vigente sem apagar o outro lado. A autoridade continua `imported-source` até aceite explícito.

## Contexto acadêmico único

A #262 integrou o contexto oficial de 2026:

- ano letivo e perfil são dependências explícitas;
- nenhum módulo escolhe “ano atual” pelo relógio;
- os perfis nativos existentes são referenciados, não copiados;
- contexto ausente, duplicado, inativo ou incompatível falha;
- ano/configuração são versionados localmente com histórico append-only e CAS.

O `academic-year` possui uma implementação oficial. Repositórios e read models posteriores devem compô-la, não recriá-la. O Operational Workspace da #302 enumera o catálogo persistido e exige escolha explícita do ano; não infere ano pelo ID nem pelo relógio.

## Armazenamento

Cloudflare D1 é o armazenamento físico aprovado, mas o domínio permanece independente do fornecedor:

```text
Domínio/aplicação
       ↓
Portas V1
       ↓
Composição de repositórios D1
       ↓
Runtime injetado
       ↓
Migrations/schema
       ↓
D1 do ambiente autorizado
```

O domínio não importa `D1Database`, SQL, Wrangler ou bindings. Banco, bindings, migrations remotas e endpoints operacionais exigem issues próprias.

## Ambientes do runtime

A separação permanece explícita:

```text
local      → binding injetado e permitido
preview    → binding injetado e permitido
production → bloqueada antes de inspecionar o binding
```

O runtime valida o shape do binding, compõe leitura/escrita/transação e utiliza o runner canônico das migrations 0001–0003. As operações expostas pelo runtime exigem o contexto opaco emitido depois de `gradebook.persistence.admin`; o objeto de autorização não é reconstruível a partir de JSON.

Nenhum binding remoto ou banco foi criado. A presença do código não ativa persistência ou consulta acadêmica no site oficial.

## Limites dos módulos

### Plataforma

Shell, autenticação Entra, capabilities, navegação, pesquisa global de rotas, Saúde e limites e publicação. Não contém regra de nota.

### Importação

Arquivos, leitura binária, hash, manifesto, mapeamento, classificação de células e diagnósticos. O arquivo permanece local e o importador não grava diretamente no D1.

### Contratos

Vocabulário compartilhado. Mudança incompatível exige issue de contrato, versão e adaptação explícita. Contratos não conhecem React, D1, SQL, rotas ou fornecedor.

### Domínio e motor

Funções TypeScript puras e determinísticas para semântica, arredondamento, trimestre, paralela, REC final, resultado anual e equivalência. Não acessa React, HeroUI, DOM, banco, rede ou relógio global.

### Aplicação

Orquestra contexto, planejamento, revisão, execução, read models, Auditoria e emissão contra portas. Não executa SQL e não importa UI.

### Persistência

Responsável por paginação, versionamento, compare-and-set, histórico e atomicidade. As portas públicas abrangem entidades, importações, registros acadêmicos, Auditoria e associações.

### Schema D1

Migrations locais 0001–0003, 21 tabelas, FKs por ano, índices, ponteiros de versão atual e histórico append-only. Não há cascades destrutivos. A onda 14 não altera schema nem catálogo de migrations.

## Runtime D1 após a onda 14

A composição autorizada em `GradebookD1RuntimeV1` contém:

```text
GradebookD1RuntimeV1
  ├── PersistenceUnitOfWorkV1
  ├── operationalReadModels()
  ├── operationalWorkspaceAcademicYears()
  ├── auditWorkspace(serverResolutionIdentity, existingPlans?)
  ├── planningRepositories()
  ├── inspectSchema()/runMigrations()
  └── promoteImportChangePlan()
```

Todas essas superfícies são alcançadas somente após autorização opaca. `production` continua falhando antes de `GRADEBOOK_D1` ser inspecionado.

### Read models operacionais

Uma única fachada compõe:

```text
PersistenceUnitOfWorkV1.entities
              ↓
createGradebookOperationalReadModelsV1
              ├── students
              ├── classGroups
              ├── teachers
              ├── subjects
              └── search
```

A pesquisa acadêmica continua sendo a implementação da #287: matching literal após normalização de caixa/diacríticos, sem fuzzy matching, ranking aproximado ou heurística de identidade. A fachada não implementa segundo matching nem regra acadêmica.

### Operational Workspace F5

A #302 integrou:

- extensão serializável de transporte V1, sem alterar o significado do `OperationalWorkspace V1`;
- catálogo D1 read-only de `academic_year_id + year`;
- serviço que projeta os quatro read models existentes;
- um único bridge `POST /api/gradebook/operational-workspace`;
- `requireAuth`, `gradebook.persistence.admin`, autorização opaca e `no-store`;
- HeroUI no shell atual, com ano explícito, pesquisa existente e navegação por `kind + id` opaco;
- estados `loading | ready | empty | unavailable | not-authorized`.

O bridge existe no bundle de produção, mas o runtime retorna indisponibilidade antes do binding. Nenhum segundo bridge operacional é permitido.

### Audit Workspace F4

A #303 implementou duas fronteiras:

```text
AuditWorkspaceV1 (provider-independent)
        ↑
AuditWorkspaceSourceV1
        ↑
GradebookD1AuditWorkspaceSourceV1
```

O read-source D1 lista lotes, ocorrências e reconciliações correntes com filtro, ordem e cursor keyset; detalhe e resolução reutilizam `PersistenceUnitOfWorkV1.imports` e `.audit`; resolução usa `appendVersion`/CAS e recebe ator/instante exclusivamente do servidor. Elegibilidade de promoção é informativa e pode refletir somente um `ImportChangePlanV1` já produzido.

A #306 compõe essa implementação **internamente** no runtime:

- `GradebookD1AuditWorkspaceSourceV1` usa o mesmo database/runtime autorizado;
- `createAuditWorkspaceV1` recebe a mesma UoW;
- `isAuthorized()` é construído pelo próprio runtime a partir da autorização opaca;
- o caller fornece apenas `resolutionIdentity()` server-side;
- não existe endpoint nem UI de Auditoria nesta onda.

### Desempenho F6

A #304 implementou `createClassPerformanceReadModelV1(source)` e a fronteira `ClassPerformanceSourceV1`.

A matriz:

- possui quatro lentes;
- pagina linhas/colunas independentemente com cursores opacos;
- preserva cobertura/comparabilidade, imported/calculated e `imported-source`;
- recebe uma projeção física já resolvida em `loadMatrix`, impedindo N+1 na fronteira de aplicação;
- carrega detalhes sob demanda.

A #306 **não** cria fonte D1, composição de runtime, endpoint ou UI para Desempenho. A fonte física em lote pertence à #315.

### Boletins F8

A #305 implementou materialização e emissão provider-independent:

- modelos `synthetic | composition | detailed` sobre contratos/read models oficiais;
- snapshots profundamente imutáveis/versionados por porta;
- reimpressão exclusivamente pelo snapshot histórico;
- lote parcial com `ready` e `blocked` separados;
- autorização, emissor, relógio e fábrica de IDs fornecidos por contexto/dependências server-side;
- rejeição runtime de `native-engine` nas projeções internas.

A implementação inclui somente repositório de snapshots em memória/local de teste. A #306 não cria PDF, endpoint, persistência remota, runtime físico nem exposição de lote de alta escala. O hardening/materialização agregada pertence à #316.

## Reconciliação e Auditoria

A equivalência anual produz `match`, `expected-difference`, `mismatch` ou `not-comparable` sem tolerância concorrente e sem mudar `imported-source`. Promoção continua exclusivamente em `planImportReconciliation` + `executeImportChangePlan`; o Audit Workspace não oferece método de promoção.

## Interface HeroUI

Apresenta fluxo, comandos e resultados. Não calcula nota, recuperação, elegibilidade ou decisão de Conselho. O Operational Workspace usa o shell existente e o único bridge autorizado. Audit Workspace UI/HTTP será uma frente separada (#314) e continuará local/preview.

## Estado do motor

```text
célula
  ↓
arredondamento
  ↓
composição 30/30/40 e 45%/55%
  ↓
recuperação paralela
  ↓
resultado trimestral + percentual
  ↓
recuperação final + total pós-REC
  ↓
resultado anual + elegibilidade básica
  ↓
equivalência fonte × motor
```

O Conselho permanece humano. A equivalência preserva os dois lados e somente classifica a comparação.

## Estado da persistência e consulta

```text
concluído localmente:
  portas independentes
  migrations 0001–0003
  contexto acadêmico
  leitura/escrita completa
  planejamento idempotente
  executor transacional
  runtime local/preview
  runner idempotente
  capability/autorização opaca
  quatro read models operacionais + pesquisa
  Operational Workspace + bridge/UI local-preview
  Audit Workspace + D1 read-source + composição interna
  Desempenho provider-independent
  Boletins provider-independent

posteriormente, somente com autorização explícita:
  recurso D1 remoto/preview persistente
  binding remoto
  migrations remotas
  ativação acadêmica em produção
  Audit Workspace UI/HTTP local-preview (#314)
  fonte física de Desempenho (#315)
  hardening/snapshots locais de Boletins (#316)
  hardening F5 (#317)
```

## Regras de dependência

- domínio não importa UI, Cloudflare ou Microsoft Graph;
- contratos não dependem de interface ou persistência;
- interface consome contratos/read models, nunca tabelas D1;
- aplicação consome domínio e portas, nunca SQL;
- adaptador D1 não altera o significado dos contratos;
- toda escrita necessária à integridade aparece explicitamente no plano e na unidade de trabalho;
- Desempenho, Conselho e Boletins não mantêm motores próprios;
- Microsoft Graph/SharePoint não é acessado diretamente pelo navegador para dados acadêmicos;
- produção permanece fail-closed até issue e autorização específicas;
- nenhuma frente pode criar segundo bridge para o Operational Workspace.

## Coordenação

A #273 não é orquestrador paralelo. O processo continua:

```text
uma issue → uma branch → um PR → verify → handoff
onda → integração → main → deploy → próxima onda
```

A onda seguinte é #314–#317, com integração #318. Hard stops impedem recursos remotos, dados reais, mudança de autoridade, migrations não autorizadas e decisões humanas não documentadas.

## Publicação

O único caminho de produção é:

```text
main → Deploy Cloudflare Pages → admin.escolaieda.com
```

Agentes de tarefa não publicam diretamente. O integrador acompanha deploy e smokes; código acadêmico que não tenha autorização própria para produção permanece fail-closed.