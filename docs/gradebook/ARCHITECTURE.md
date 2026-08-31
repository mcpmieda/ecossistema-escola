# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. Não é outro aplicativo e não deve crescer como um único componente/página. O shell global permanece em `src/platform`; as funções do Banco evoluem por módulos, contratos e rotas próprias.

## Fluxo de dados

```text
Planilhas dos professores
          ↓
Importação + manifesto + evidência de origem
          ↓
Normalização e reconciliação
          ↓
Portas do domínio
          ↓
Cloudflare D1 por adaptador autorizado
          ↓
Motor nativo versionado
          ↓
Resultados oficiais + Auditoria
          ↓
Read models por experiência
          ↓
Centrais / Desempenho / Conselho / Boletins / Relatórios
```

O valor importado e o valor calculado pelo motor nunca se sobrescrevem silenciosamente. A origem conserva arquivo, hash, versão, guia, célula, fórmula, valor em cache, classificação semântica, lote, usuário e data.

O nome do arquivo é metadado, não identidade permanente. O SHA-256 identifica conteúdo exatamente igual; a identidade lógica da fonte considera ano, professor, contexto acadêmico e confirmações registradas. Valores inalterados não criam novas versões acadêmicas; valores alterados preservam a versão anterior.

## Limites dos módulos

### Plataforma

Responsável pelo shell, autenticação Entra, capabilities, navegação, pesquisa global e publicação. Não contém regras de nota.

Saúde, quotas e consumo de infraestrutura pertencem ao Centro de Administração, não ao Banco. A área global planejada em #220 recebe métricas dos módulos sem armazenar payload acadêmico.

### Importação

Responsável por arquivos, leitura binária, mapeamento, classificação de células, manifesto, diagnósticos e criação de comandos/registros de entrada. Não decide resultado acadêmico final.

O fluxo aprovado é:

```text
arquivo
  ↓
metadados + SHA-256
  ↓
leitura/reconhecimento
  ↓
manifesto + diagnósticos + evidências
  ↓
revisão/promoção posterior
```

Falha em um arquivo não cancela os demais. Nenhum byte é persistido ou enviado sem uma etapa explicitamente aprovada.

### Contratos

Vocabulário e formatos compartilhados. Alteração incompatível exige issue específica, versão e plano de migração/adaptação.

Contratos congelados atualmente:

- fonte/células;
- entidades acadêmicas;
- lançamentos e resultados;
- manifesto, lote, diagnóstico, reconciliação e Auditoria.

### Domínio e motor

Responsável por regras de nota, recuperação, arredondamento, resultado anual, situações e precedências. Deve ser TypeScript puro, determinístico e independente de React/HeroUI, browser, banco físico e APIs externas.

`interpretSourceCell` é a primeira função nativa integrada. Achados locais do domínio são convertidos pela camada de aplicação em ocorrências persistidas de Auditoria, que acrescentam ID, lote, contexto, tempo e estado.

### Persistência

Cloudflare D1 é o armazenamento físico aprovado pela BN-DEC-016. O domínio conhece portas/interfaces, não o fornecedor físico.

Separação obrigatória:

```text
gradebook-domain/ports
          ↓
server/gradebook/application
          ↓
server/gradebook/persistence/d1
          ↓
D1
```

Regras:

- nenhuma entidade/regra importa `D1Database`, SQL ou Wrangler;
- acesso ao banco ocorre somente pelo backend autorizado;
- consultas exigem ano/contexto e paginação/limite explícito;
- escritas acadêmicas preservam versões; não há exclusão genérica de histórico;
- promoção de lote é transacional;
- concorrência deve impedir sobrescrita perdida;
- migrations, índices, bindings e recuperação são versionados em issues próprias;
- desenvolvimento/piloto pode usar o plano gratuito, mas consumo deve ser medido antes da operação institucional plena.

### Reconciliação e Auditoria

Compara fonte, registros e motor; produz ocorrências explícitas. Erro crítico não pode ser mascarado por sucesso geral.

- diagnósticos de arquivo podem existir antes do manifesto completo;
- reconciliação preserva os dois valores, diferença, tolerância e regra;
- ocorrência preserva origem, gravidade e histórico de resolução;
- nenhum estado de UI substitui o contrato oficial.

### Read models

Modelos compactos e específicos para cada experiência. Evitam N+1 e impedem que a interface carregue o ano inteiro ou reconstrua regras acadêmicas.

### Interface HeroUI

Responsável apenas por fluxo, comandos, consulta e apresentação. HeroUI React v3 é obrigatório na experiência do Banco. A interface não calcula nota oficial, elegibilidade ou recuperação.

## Estrutura-alvo

A migração será incremental; não mover tudo em um único PR.

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
    ├── commands/
    ├── events/
    └── read-models/

server/
└── gradebook/
    ├── application/
    ├── persistence/
    │   └── d1/
    ├── queries/
    └── http/

migrations/
└── gradebook/

tests/
└── gradebook/
    ├── source/
    ├── import/
    ├── engine/
    ├── contracts/
    ├── persistence/
    ├── reconciliation/
    └── integration/
```

Os caminhos físicos do adaptador/migrations serão confirmados pela issue específica de D1. A árvore acima declara responsabilidades, não autoriza criação antecipada de infraestrutura.

## Regras de dependência

- `src/gradebook-domain/**` não importa `react`, `@heroui/*`, DOM, Cloudflare ou Microsoft Graph.
- `shared/gradebook-contracts/**` não depende da interface nem da persistência.
- `src/features/gradebook/**` consome contratos/read models; não acessa planilhas ou tabelas diretamente.
- `server/gradebook/**` aplica autorização e orquestra domínio, persistência e consultas.
- somente o adaptador concreto de persistência conhece D1/SQL.
- Desempenho, Conselho e Boletins não importam código uns dos outros para obter regras; todos dependem do núcleo.
- Microsoft Graph/SharePoint nunca é acessado diretamente pelo navegador para dados acadêmicos.
- tokens administrativos da Cloudflare nunca são enviados ao frontend.

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

Somente rotas utilizáveis devem aparecer no menu. Entidades são abertas por pesquisa, matrizes e relações contextuais, não precisam ocupar permanentemente a sidebar.

A futura área de infraestrutura será uma rota do Centro de Administração, não uma subrota exclusiva do Banco:

```text
#/configuracoes/saude-e-limites
```

## Contratos e compatibilidade

Mudança compatível adiciona campos opcionais ou novos estados sem alterar o significado existente. Mudança incompatível cria nova versão ou adaptador temporário. Mudança pedagógica nunca é “adaptada” silenciosamente: deve ser tratada como decisão oficial.

## Paralelismo seguro

- Uma issue declara caminhos de escrita exclusivos.
- Contratos congelados permitem que UI use fixtures sintéticas enquanto backend/motor são implementados.
- Arquivos centrais (`App.tsx`, navegação, contratos compartilhados, estado global) são coordenados pelo integrador.
- Não manter branches de fase por meses. PRs pequenos entram continuamente na `main`.
- Recurso incompleto pode existir atrás de rota/feature flag, mas não deve aparecer como disponível.
- Adaptador D1, motor e importador podem avançar em paralelo somente depois de portas/contratos estáveis.

## Publicação

O único caminho de produção é `main` → workflow `Deploy Cloudflare Pages` → `admin.escolaieda.com`. Agentes de tarefa não alteram o workflow nem publicam diretamente. A issue só muda para `Publicada` depois da verificação do integrador.
