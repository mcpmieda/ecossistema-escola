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
Revisão e promoção autorizada
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

## Decisão de armazenamento

Cloudflare D1 é o armazenamento físico aprovado para a base acadêmica.

Essa decisão não acopla o domínio ao fornecedor:

```text
Domínio/aplicação
       ↓
Portas V1 de persistência e transação
       ↓
Adaptador D1 futuro
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

### Adaptador D1

Implementação física futura das portas. Deve usar schema/migrations versionados, índices, constraints e autorização no servidor. Não muda o significado dos contratos para acomodar tabelas.

### Reconciliação e Auditoria

Compara fonte, versões persistidas e motor; produz ocorrências explícitas. Erro crítico não pode ser mascarado por sucesso geral. Resoluções mantêm ator, data, justificativa e estado anterior.

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
    ├── persistence/
    │   └── d1/
    │       ├── schema/
    │       └── adapters/
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
- `server/gradebook/application/**` consome domínio e portas; não importa UI.
- `server/gradebook/persistence/d1/**` implementa portas e pode importar tipos Cloudflare, mas não exporta esses tipos para o domínio.
- `server/gradebook/http/**` aplica autenticação/capabilities antes de acessar dados acadêmicos.
- Desempenho, Conselho e Boletins não importam código entre si para obter regras; todos dependem do núcleo.
- Microsoft Graph/SharePoint nunca é acessado diretamente pelo navegador para dados acadêmicos.
- Nome de arquivo nunca é chave técnica única de fonte.

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
- composição trimestral será implementada em #226.

### Persistência

- decisão D1 aprovada;
- portas V1 integradas;
- schema/migrations serão desenhados em #227;
- adaptador/bindings ainda não existem.

### Reconciliação

- contratos V1 integrados;
- planejamento idempotente será implementado em #228;
- promoção/transação física ainda não existe.

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

Schema e adaptador D1 devem seguir os contratos/portas congelados. Caso uma incompatibilidade real seja descoberta, ela exige issue de contrato; não deve ser corrigida escondendo o conflito em SQL ou na interface.

## Paralelismo seguro

- Uma issue declara caminhos de escrita exclusivos.
- Contratos congelados permitem que UI use fixtures enquanto backend/motor avançam.
- Domínio, schema D1 e planejamento de reimportação podem avançar em paralelo porque ocupam camadas diferentes.
- Arquivos centrais, navegação, contratos compartilhados e estado global são coordenados pelo integrador.
- Não manter branches de fase por meses. PRs pequenos entram continuamente na `main`.
- Recurso incompleto pode existir atrás de rota/feature flag, mas não aparece como disponível.

## Publicação

O único caminho de produção é `main` → workflow `Deploy Cloudflare Pages` → `admin.escolaieda.com`. Agentes de tarefa não alteram o workflow nem publicam diretamente. A issue só muda para `Publicada` depois da verificação aplicável pelo integrador. Quando a verificação exigir autenticação e seleção de arquivo real, o gate manual é registrado em vez de ser presumido como concluído.
