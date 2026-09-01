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
Contexto acadêmico 2026 explícito
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
Centrais / Desempenho / Conselho / Boletins
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

O `academic-year` possui uma implementação oficial. Repositórios e read models posteriores devem compô-la, não recriá-la.

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

A #261 integrou separação explícita:

```text
local      → binding injetado e permitido
preview    → binding injetado e permitido
production → bloqueada antes de inspecionar o binding
```

O runtime valida o shape do binding, compõe leitura/escrita/transação e utiliza o runner canônico das migrations 0001–0003. As rotas administrativas existentes exigem sessão e `gradebook.persistence.admin`, usam same-origin/método correto e `Cache-Control: no-store`.

Nenhum binding remoto ou banco foi criado. A presença do código não ativa persistência ou consulta acadêmica no site oficial.

## Identidade da fonte

O sistema separa:

- nome do arquivo: metadado observado;
- SHA-256: identidade exata dos bytes;
- fonte lógica: continuidade confirmada de professor/ano/contexto;
- versão acadêmica: mudança real de entidade, lançamento ou resultado.

Consequências:

- mesmo hash renomeado não duplica conteúdo;
- hash diferente não confirma sozinho nova fonte lógica;
- fonte ambígua exige confirmação;
- somente valores novos/alterados geram versão acadêmica;
- item desaparecido não é apagado nem desativado automaticamente;
- histórico anterior permanece auditável.

## Associação fonte lógica ↔ stream

```text
arquivo/fonte confirmada
        +
registro acadêmico promovível
        ↓
associação versionada e ativa
```

- não é inferida por nome do arquivo;
- não é descoberta por varredura de JSON;
- possui expectativa otimista própria;
- versão de fonte, registro e associação pertencem à mesma unidade de trabalho;
- conflito em qualquer etapa reverte a promoção inteira;
- ausência em uma nova planilha não gera desativação automática.

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

Orquestra contexto, planejamento, revisão, execução e read models contra portas. Não executa SQL e não importa UI.

### Persistência

Responsável por paginação, versionamento, compare-and-set, histórico e atomicidade. As portas públicas abrangem entidades, importações, registros acadêmicos, Auditoria e associações.

### Schema D1

Migrations locais 0001–0003, 21 tabelas, FKs por ano, índices, ponteiros de versão atual e histórico append-only. Não há cascades destrutivos.

### Adaptadores D1

Já implementados:

- leitura/escrita do contexto anual;
- leitura/escrita de manifestos/fontes;
- leitura/escrita de registros acadêmicos;
- leitura/escrita de associações;
- leitura/escrita das oito demais entidades acadêmicas;
- lotes e versões por fonte lógica;
- ocorrências de Auditoria e reconciliações;
- históricos paginados;
- promoção física local com CAS, savepoints e rollback;
- runtime local/preview e runner de migrations.

A #272 compôs exatamente um fornecedor por operação em uma única `PersistenceUnitOfWorkV1`. Nenhum módulo deve reimplementar operação já integrada.

### Reconciliação e Auditoria

Compara fonte, versões persistidas e motor. A equivalência anual da #263 produz `match`, `expected-difference`, `mismatch` ou `not-comparable` sem tolerância concorrente e sem mudar `imported-source`.

### Read models operacionais

A décima primeira onda integrou quatro consultas provider-independent — Aluno, Turma, Professor e Componente — e `createGradebookOperationalReadModelsV1`, a única fachada que as injeta com `PersistenceUnitOfWorkV1.entities`.

A décima segunda onda integrou a pesquisa acadêmica nessa mesma fachada:

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

`search` é criada por `createAcademicGlobalSearchReadModelV1` e consome diretamente o contrato V1 da #286. A fachada não executa segunda consulta, normalização, matching, autorização ou regra acadêmica.

A pesquisa:

- recebe ano, escopo, limite, cursor e ordem explícitos;
- lista somente os tipos solicitados por `AcademicEntityRepositoryV1`;
- não usa `get`, evitando N+1;
- percorre a paginação interna, ordena pelo comparador oficial e pagina externamente com cursor opaco;
- usa inclusão literal após normalização de caixa/diacríticos, sem fuzzy matching ou heurística de identidade;
- retorna somente `kind`, ID e `displayName`/`code`;
- falha fechada para vazio, ausência, escopo insuficiente, cursor inválido e dado incompatível.

`GradebookD1RuntimeV1.operationalReadModels()` expõe a fachada somente após validar a autorização opaca. Como o runtime falha em produção antes de inspecionar o binding, a pesquisa também fica indisponível em produção. A onda não criou endpoint nem UI.

### Interface HeroUI

Apresenta fluxo, comandos e resultados. Não calcula nota, recuperação, elegibilidade ou decisão de Conselho.

A próxima experiência operacional ainda depende do contrato #293 para ano, navegação, pesquisa e estados. A UI não pode importar tipos de `server/**` nem inventar transporte, rota ou autorização.

### Saúde e limites

Área global futura do Centro, registrada na #220. Métricas chegam por backend autorizado; tokens e payload acadêmico não chegam ao navegador.

## Próxima camada contratual

A décima terceira onda congela quatro contratos amplos, em caminhos disjuntos:

- #293 — experiência operacional F5;
- #294 — workspace de Auditoria e revisão F4;
- #295 — matriz/lentes de Desempenho F6;
- #296 — `BulletinModelV1` e emissão versionada F8.

A integração #297 valida a coexistência. UI, endpoints, implementação de Auditoria, read model de Desempenho e emissão/PDF só podem avançar depois dos respectivos contratos.

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
  contexto acadêmico 2026
  leitura/escrita completa
  planejamento idempotente
  executor transacional
  runtime local/preview
  runner idempotente
  capability e rotas administrativas protegidas
  quatro read models operacionais
  pesquisa acadêmica autorizada na fachada única

posteriormente, somente com autorização explícita:
  recurso D1 remoto/preview
  binding remoto
  migrations em ambiente
  endpoints acadêmicos
  ligação à interface
  produção
```

## Estrutura-alvo

```text
src/
├── platform/
├── features/gradebook/
│   ├── import/
│   ├── audit/
│   ├── students/
│   ├── classes/
│   ├── teachers/
│   ├── subjects/
│   ├── performance/
│   ├── council/
│   ├── bulletins/
│   ├── reports/
│   └── settings/
└── gradebook-domain/
    ├── context/
    ├── calculations/
    └── ports/persistence/

shared/gradebook-contracts/
server/gradebook/
├── application/
├── persistence/d1/
├── queries/
└── http/

tests/gradebook/
```

## Regras de dependência

- domínio não importa UI, Cloudflare ou Microsoft Graph;
- contratos não dependem de interface ou persistência;
- interface consome contratos/read models, nunca tabelas D1;
- aplicação consome domínio e portas, nunca SQL;
- adaptador D1 não altera o significado dos contratos;
- toda escrita necessária à integridade aparece no plano e na unidade de trabalho;
- Desempenho, Conselho e Boletins não mantêm motores próprios;
- Microsoft Graph/SharePoint não é acessado diretamente pelo navegador para dados acadêmicos;
- produção permanece fail-closed até issue e autorização específicas.

## Coordenação

A #273 não é orquestrador paralelo. O processo continua:

```text
uma issue → uma branch → um PR → verify → handoff
onda → integração → main → deploy → próxima onda
```

Hard stops impedem recursos remotos, dados reais, mudança de autoridade, migrations destrutivas e decisões humanas não documentadas.

## Publicação

O único caminho de produção é:

```text
main → Deploy Cloudflare Pages → admin.escolaieda.com
```

Agentes de tarefa não publicam diretamente. Entrega sem mudança visual ainda deve preservar build, testes e site.