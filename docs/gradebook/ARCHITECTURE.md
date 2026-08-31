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
- **stream acadêmico:** chave estável de um lançamento ou resultado;
- **versão acadêmica:** alteração real do conteúdo desse stream.

Consequências:

- mesmo hash com outro nome não duplica conteúdo;
- hash diferente não prova sozinho que exista outra fonte lógica;
- contexto ambíguo exige confirmação;
- reimportação idêntica não cria versões acadêmicas;
- somente valores novos/alterados geram nova versão;
- valores desaparecidos da nova fonte não são apagados silenciosamente;
- histórico anterior permanece imutável/auditável.

Para detectar itens que desapareceram, é necessário saber quais streams acadêmicos pertencem à mesma fonte lógica. Essa associação é relacional, anual, indexada e versionada; não pode ser inferida por nome de arquivo nem por varredura de JSON.

## Limites dos módulos

### Plataforma

Responsável pelo shell, autenticação Entra, capabilities, navegação, pesquisa global, Saúde e limites e publicação. Não contém regras de nota.

### Importação

Responsável por arquivos, leitura binária, SHA-256, manifesto, mapeamento, classificação de células, diagnósticos e criação de registros de entrada. O arquivo permanece local nesta etapa. O importador não decide resultado acadêmico final e não grava diretamente no D1.

### Contratos

Vocabulário e formatos compartilhados. Alteração incompatível exige issue específica, versão e plano de migração/adaptação.

### Domínio e motor

Responsável por semântica de célula, composição de nota, recuperação, arredondamento, resultado anual, situações e precedências. É TypeScript puro, determinístico e independente de React/HeroUI, browser, banco físico e APIs externas.

Implementações atuais:

- interpretação semântica de células;
- arredondamento acadêmico;
- composição trimestral 30/30/40 e 45%/55%;
- recuperação paralela por quantitativo abaixo de 60% do próprio máximo.

A #242 consolidará paralela + composição + percentual. A #244 implementará recuperação final.

### Aplicação

Orquestra casos de uso contra contratos e portas. Aqui ficam planejamento de reimportação, reconciliação, promoção de lote e montagem de comandos. Não conhece componentes HeroUI nem executa SQL diretamente.

O planejador produz um `ImportChangePlanV1` com itens:

```text
unchanged
new
changed
missing-from-new-source
blocked
```

O executor:

- valida o plano antes de qualquer write;
- aplica somente versões de fonte e registros `new`/`changed` de arquivos prontos;
- não escreve itens inalterados, ausentes ou bloqueados;
- exige rollback integral para conflito ou falha;
- permanece independente do D1.

### Persistência

Responsável por transações, histórico, idempotência e consulta. O domínio conhece portas/interfaces, não o fornecedor físico.

Portas integradas:

- entidades acadêmicas;
- arquivos/fontes/lotes;
- lançamentos e resultados;
- ocorrências e reconciliações;
- unidade de trabalho;
- promoção atômica de lote;
- paginação e concorrência otimista.

A #243 adicionará a porta versionada da associação fonte lógica ↔ stream e a tornará parte explícita da unidade de trabalho, do plano e da estimativa.

### Schema D1

As migrations 0001–0003 estão integradas e testadas localmente. Elas modelam:

- ano/configuração;
- entidades acadêmicas;
- fontes lógicas, manifestos e lotes;
- registros acadêmicos versionados;
- reconciliação e Auditoria;
- associação versionada entre fonte lógica e stream acadêmico.

São 21 tabelas, com histórico append-only, FKs por ano e índices. Nenhuma migration foi aplicada em banco remoto. O schema físico não substitui contratos e não é consumido diretamente pela interface.

### Adaptador D1 de leitura

`server/gradebook/persistence/d1/read/d1-read-adapter-v1.ts` implementa localmente:

- busca de fonte por SHA-256;
- leitura da versão atual do manifesto;
- leitura do registro acadêmico atual;
- listagem dos streams ativos de uma fonte lógica.

O adaptador reconstrói contratos, confere colunas normalizadas e sanitiza falhas. Ele não usa nome de arquivo nem `json_extract` para descobrir associações.

### Adaptador D1 de escrita

Ainda não existe. A #245 está bloqueada até a #243 formalizar a escrita da associação.

Quando liberado, o adaptador deve:

- implementar compare-and-set para raízes e versões;
- gravar fonte, registro acadêmico e associação explicitamente;
- usar uma única transação por promoção;
- reverter tudo em conflito ou constraint;
- não provisionar produção silenciosamente.

### Reconciliação e Auditoria

Compara fonte, versões persistidas e motor; produz ocorrências explícitas. Erro crítico não pode ser mascarado por sucesso geral. Resoluções mantêm ator, data, justificativa e estado anterior.

O planejador é somente leitura. Itens ausentes permanecem pendentes de decisão. O executor aplica somente o conjunto previamente aprovado.

### Read models

Modelos compactos e específicos para cada experiência. Evitam N+1 e impedem que a interface carregue o ano inteiro ou reconstrua regras acadêmicas.

### Interface HeroUI

Responsável por fluxo, comandos, consulta e apresentação. HeroUI React v3 é obrigatório. A interface não calcula nota oficial, elegibilidade ou recuperação.

### Saúde e limites

Área global futura do Centro de Administração, registrada na #220. Receberá métricas de Cloudflare/D1 e consumo por módulo por meio de backend autorizado. Tokens e dados acadêmicos não chegam ao navegador. O Banco poderá fornecer estimativa de impacto de importação, mas não manterá painel de infraestrutura isolado.

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
    │   ├── parallel-recovery/
    │   ├── term-result/
    │   └── final-recovery/
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
    │       ├── write/
    │       └── transaction/
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
- O adaptador não pode preencher lacunas relacionais por varredura de JSON.
- Escrita que afeta integridade precisa aparecer no contrato, no plano, na estimativa e na unidade de trabalho.

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
- composição trimestral V1;
- recuperação paralela V1;
- resultado trimestral consolidado e recuperação final pendentes na onda 7.

### Persistência

- decisão D1 aprovada;
- portas V1 integradas;
- migrations 0001–0003 e testes locais integrados;
- adaptador local de leitura integrado;
- banco, bindings e adaptador de escrita ainda não existem;
- contrato de escrita da associação será formalizado em #243.

### Reconciliação

- contratos V1 integrados;
- planejamento idempotente implementado;
- executor abstrato transacional implementado;
- associação transacional explícita pendente em #243;
- promoção física D1 pendente em #245.

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

Schema e adaptador D1 devem seguir os contratos/portas. Caso uma incompatibilidade real seja descoberta, ela exige issue de contrato ou migration aditiva explícita; não deve ser escondida em SQL, JSON, efeito colateral ou interface.

A sexta onda detectou uma diferença entre a leitura física e a escrita abstrata da associação fonte lógica ↔ stream. A #243 é a adaptação controlada. Isso mantém as fases independentes sem permitir que diferenças pequenas se transformem em comportamento implícito na junção final.

## Paralelismo seguro

- Uma issue declara caminhos de escrita exclusivos.
- Contratos congelados permitem que UI use fixtures enquanto backend/motor avançam.
- Resultado trimestral, contrato transacional de associação e recuperação final podem avançar em paralelo porque ocupam áreas distintas.
- Arquivos centrais, navegação, contratos compartilhados e estado global são coordenados pelo integrador.
- Não manter branches de fase por meses; PRs pequenos entram continuamente na `main`.

## Publicação

O único caminho de produção é `main` → workflow `Deploy Cloudflare Pages` → `admin.escolaieda.com`. Agentes de tarefa não alteram o workflow nem publicam diretamente. A issue só muda para `Publicada` depois da verificação aplicável pelo integrador. Quando a verificação exigir autenticação e seleção de arquivo real, o gate manual é registrado em vez de ser presumido como concluído.
