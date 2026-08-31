# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. Não é outro aplicativo e não cresce como um único componente/página. O shell global permanece em `src/platform`; as funções do Banco evoluem por módulos, contratos, portas e rotas próprias.

## Fluxo de dados

```text
Planilhas dos professores
          ↓
Leitura local + SHA-256 + manifesto
          ↓
Reconhecimento e evidência de origem
          ↓
Planejamento de reconciliação/idempotência
          ↓
Revisão humana dos itens pendentes
          ↓
Executor de promoção contra portas transacionais
          ↓
Adaptador D1 autorizado
          ↓
Modelo acadêmico versionado no D1
          ↓
Motor nativo versionado
          ↓
Resultados oficiais + Auditoria
          ↓
Read models por experiência
          ↓
Centrais / Desempenho / Conselho / Boletins / Relatórios
```

O valor importado e o valor calculado pelo motor nunca se sobrescrevem silenciosamente. A origem conserva arquivo, hash, versão, guia, célula, fórmula, cache, classificação, lote, usuário e data.

Planejamento, revisão e execução são etapas diferentes. O planejador não grava; o executor não decide automaticamente itens ambíguos ou ausentes; a persistência não cria regras acadêmicas.

## Decisão de armazenamento

Cloudflare D1 é o armazenamento físico aprovado para a base acadêmica.

Essa decisão não acopla o domínio ao fornecedor:

```text
Domínio/aplicação
       ↓
Portas V1 de persistência e transação
       ↓
Adaptador D1
       ↓
Schema/migrations D1
       ↓
D1
```

O domínio não importa `D1Database`, SQL, Wrangler ou bindings. O acesso real ao banco ocorre somente pelo backend autorizado do Centro. Banco, bindings, migrations remotas e recursos de produção exigem issues próprias.

## Identidade e atualização da fonte

O sistema separa:

- **nome do arquivo:** metadado observado;
- **SHA-256:** identidade exata dos bytes;
- **fonte lógica:** continuidade confirmada de professor/ano/contexto;
- **versão acadêmica:** alteração real de entidade, lançamento ou resultado.

Consequências:

- mesmo hash com outro nome não duplica conteúdo;
- hash diferente não prova sozinho que exista outra fonte lógica;
- contexto ambíguo exige confirmação;
- reimportação idêntica não cria versões acadêmicas;
- somente valores novos/alterados geram nova versão;
- valores desaparecidos da nova fonte não são apagados silenciosamente;
- histórico anterior permanece imutável/auditável.

Para detectar itens que desapareceram, é necessário saber quais streams acadêmicos pertencem à mesma fonte lógica. Essa associação deve ser relacional e indexada; não pode ser inferida por nome de arquivo nem por varredura de JSON.

## Limites dos módulos

### Plataforma

Responsável pelo shell, autenticação Entra, capabilities, navegação, pesquisa global, Saúde e limites e publicação. Não contém regras de nota.

### Importação

Responsável por arquivos, leitura binária, SHA-256, manifesto, mapeamento, classificação de células, diagnósticos e criação de registros de entrada. O arquivo permanece local nesta etapa. O importador não decide resultado acadêmico final e não grava diretamente no D1.

### Contratos

Vocabulário e formatos compartilhados. Alteração incompatível exige issue específica, versão e plano de migração/adaptação.

### Domínio e motor

Responsável por semântica de célula, composição de nota, recuperação, arredondamento, resultado anual, situações e precedências. É TypeScript puro, determinístico e independente de React/HeroUI, browser, banco físico e APIs externas.

### Aplicação

Orquestra casos de uso contra contratos e portas. Aqui ficam planejamento de reimportação, reconciliação, promoção de lote e montagem de comandos. Não conhece componentes HeroUI nem executa SQL diretamente.

O planejador produz um `ImportChangePlanV1` com itens `unchanged`, `new`, `changed`, `missing-from-new-source` e `blocked`. O executor da #236 aplicará somente itens aprovados e versionáveis dentro da porta transacional.

### Persistência

Responsável por transações, histórico, idempotência e consulta. O domínio conhece portas/interfaces, não o fornecedor físico.

Portas V1 integradas:

- entidades acadêmicas;
- arquivos/fontes/lotes;
- lançamentos e resultados;
- ocorrências e reconciliações;
- unidade de trabalho;
- promoção atômica de lote;
- paginação e concorrência otimista.

### Schema D1

As migrations 0001–0002 estão integradas e testadas localmente. Elas modelam ano/configuração, entidades, fontes, lotes, registros acadêmicos, reconciliação e Auditoria com histórico append-only, FKs por ano e índices.

Nenhuma migration foi aplicada em banco remoto. O schema físico não substitui contratos e não é consumido diretamente pela interface.

### Adaptador D1

Implementação externa das portas. Pode importar tipos Cloudflare e executar SQL, mas não expõe D1 ao domínio.

A #235 implementará o primeiro adaptador local de leitura e adicionará a migration 0003 para a associação fonte lógica ↔ streams acadêmicos. Operações de escrita e a transação física completa serão liberadas depois da integração entre #235 e #236.

### Reconciliação e Auditoria

Compara fonte, versões persistidas e motor; produz ocorrências explícitas. Erro crítico não pode ser mascarado por sucesso geral. Resoluções mantêm ator, data, justificativa e estado anterior.

O planejador da #228 é somente leitura e não executa deleção. Itens ausentes permanecem pendentes de decisão.

### Read models

Modelos compactos e específicos para cada experiência. Evitam N+1 e impedem que a interface carregue o ano inteiro ou reconstrua regras acadêmicas.

### Interface HeroUI

Responsável por fluxo, comandos, consulta e apresentação. HeroUI React v3 é obrigatório. A interface não calcula nota oficial, elegibilidade ou recuperação.

### Saúde e limites

Área global futura do Centro de Administração, registrada na #220. Receberá métricas de Cloudflare/D1 e consumo por módulo por meio de backend autorizado. Tokens e dados acadêmicos não chegam ao navegador. O Banco poderá fornecer estimativa de impacto de importação, mas não manterá um painel de infraestrutura isolado.

## Estrutura-alvo

A migração é incremental; não mover tudo em um único PR.

```text
src/
├── platform/
│   ├── auth/
│   ├── navigation/
│   ├── search/
│   └── shell/
├── features/
│   └── gradebook/
│       ├── import/
│       ├── audit/
│       ├── students/
│       ├── classes/
│       ├── teachers/
│       ├── subjects/
│       ├── performance/
│       ├── council/
│       ├── bulletins/
│       ├── reports/
│       └── settings/
└── gradebook-domain/
    ├── source/
    ├── entities/
    ├── rules/
    ├── calculations/
    │   ├── term/
    │   └── parallel-recovery/
    ├── reconciliation/
    ├── validation/
    └── ports/
        └── persistence/

shared/
└── gradebook-contracts/
    ├── source/
    ├── entities/
    ├── results/
    ├── imports/
    ├── audit/
    └── read-models/

server/
└── gradebook/
    ├── application/
    │   └── import/
    │       └── execution/
    ├── persistence/
    │   └── d1/
    │       ├── schema/
    │       ├── read/
    │       └── write/
    ├── queries/
    └── http/

migrations/
└── gradebook/

tests/
└── gradebook/
    ├── source/
    ├── import/
    ├── engine/
    ├── persistence/
    ├── reconciliation/
    └── integration/
```

## Regras de dependência

- `src/gradebook-domain/**` não importa React, HeroUI, DOM, Cloudflare ou Microsoft Graph.
- `shared/gradebook-contracts/**` não depende de interface ou persistência.
- `src/features/gradebook/**` consome contratos/read models; não acessa D1/tabelas diretamente.
- `server/gradebook/application/**` consome domínio e portas; não importa UI nem SQL.
- `server/gradebook/persistence/d1/**` implementa portas e pode importar tipos Cloudflare, mas não exporta esses tipos para o domínio.
- `server/gradebook/http/**` aplica autenticação/capabilities antes de acessar dados acadêmicos.
- Desempenho, Conselho e Boletins não importam código entre si para obter regras; todos dependem do núcleo.
- Microsoft Graph/SharePoint nunca é acessado diretamente pelo navegador para dados acadêmicos.
- Nome de arquivo nunca é chave técnica única de fonte.
- O adaptador não pode preencher lacunas relacionais por varredura de JSON quando uma relação explícita é necessária.

## Estado implementado

### Importação

- até 50 arquivos sequenciais;
- XLSB/XLSX/XLS;
- leitura local em memória;
- SHA-256 via Web Crypto;
- manifesto e diagnóstico por arquivo;
- progresso `preparing` → `recognizing`;
- proveniência exibida em HeroUI;
- nenhum upload ou persistência ainda.

### Motor

- interpretação semântica de célula V1;
- arredondamento acadêmico V1;
- composição trimestral V1 com 30/30/40 e 45%/55%;
- recuperação paralela será implementada em #234.

### Persistência

- decisão D1 aprovada;
- portas V1 integradas;
- migrations 0001–0002 e testes locais integrados;
- banco, bindings, adaptador de escrita e migration remota ainda não existem;
- catálogo relacional por fonte lógica será adicionado em #235.

### Reconciliação

- contratos V1 integrados;
- planejamento idempotente implementado em #228;
- execução abstrata transacional será implementada em #236;
- promoção/transação física no D1 ainda não existe.

## Rotas-alvo

```text
#/banco-de-notas/importacao
#/banco-de-notas/auditoria
#/banco-de-notas/desempenho
#/banco-de-notas/conselho
#/banco-de-notas/boletins
#/banco-de-notas/relatorios
#/banco-de-notas/configuracoes

#/banco-de-notas/alunos/:id
#/banco-de-notas/turmas/:id
#/banco-de-notas/professores/:id
#/banco-de-notas/componentes/:id
#/banco-de-notas/importacoes/:loteId
```

Somente rotas utilizáveis aparecem no menu. Entidades são abertas por pesquisa, matrizes e relações contextuais.

## Contratos e compatibilidade

Mudança compatível adiciona campos opcionais ou novos estados sem alterar o significado existente. Mudança incompatível cria nova versão ou adaptador temporário. Mudança pedagógica nunca é adaptada silenciosamente: exige decisão oficial.

Schema e adaptador D1 devem seguir os contratos/portas congelados. Caso uma incompatibilidade real seja descoberta, ela exige issue de contrato ou migration aditiva explícita; não deve ser escondida em SQL, JSON ou interface.

A integração da quinta onda identificou uma lacuna física real entre o planejador e o schema: ausência do catálogo fonte lógica ↔ stream. A #235 é a correção controlada dessa lacuna e demonstra como pequenas diferenças entre fases devem ser adaptadas antes da junção final.

## Paralelismo seguro

- Uma issue declara caminhos de escrita exclusivos.
- Contratos congelados permitem que UI use fixtures enquanto backend/motor avançam.
- Regra de recuperação, leitura D1 e executor transacional podem avançar em paralelo porque ocupam camadas diferentes.
- Arquivos centrais, navegação, contratos compartilhados e estado global são coordenados pelo integrador.
- Não manter branches de fase por meses. PRs pequenos entram continuamente na `main`.
- Recurso incompleto pode existir atrás de rota/feature flag, mas não aparece como disponível.

## Publicação

O único caminho de produção é `main` → workflow `Deploy Cloudflare Pages` → `admin.escolaieda.com`. Agentes de tarefa não alteram o workflow nem publicam diretamente. A issue só muda para `Publicada` depois da verificação aplicável pelo integrador. Quando a verificação exigir autenticação e seleção de arquivo real, o gate manual é registrado em vez de ser presumido como concluído.
