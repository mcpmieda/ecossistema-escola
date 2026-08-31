# Arquitetura do Banco de Notas

## Princípio

O Banco de Notas é um produto modular dentro do Centro de Administração. Não é outro aplicativo e não deve crescer como um único componente/página. O shell global permanece em `src/platform`; as funções do Banco evoluem por módulos, contratos e rotas próprias.

## Fluxo de dados

```text
Planilhas dos professores
          ↓
Importação e evidência de origem
          ↓
Normalização e reconciliação
          ↓
Modelo acadêmico persistido
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

## Limites dos módulos

### Plataforma

Responsável pelo shell, autenticação Entra, capabilities, navegação, pesquisa global e publicação. Não contém regras de nota.

### Importação

Responsável por arquivos, leitura binária, mapeamento, classificação de células, manifesto, diagnósticos e criação de comandos/registros de entrada. Não decide resultado acadêmico final.

### Contratos

Vocabulário e formatos compartilhados. Alteração incompatível exige issue específica, versão e plano de migração/adaptação.

### Domínio e motor

Responsável por regras de nota, recuperação, arredondamento, resultado anual, situações e precedências. Deve ser TypeScript puro, determinístico e independente de React/HeroUI, browser, banco físico e APIs externas.

### Persistência

Responsável por transações, histórico, idempotência e consulta. O domínio conhece portas/interfaces, não o fornecedor físico. Provisionamento de armazenamento exige decisão explícita.

### Reconciliação e Auditoria

Compara fonte, registros e motor; produz ocorrências explícitas. Erro crítico não pode ser mascarado por sucesso geral.

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
    └── validation/

shared/
└── gradebook-contracts/
    ├── entities/
    ├── commands/
    ├── events/
    └── read-models/

server/
└── gradebook/
    ├── application/
    ├── persistence/
    ├── queries/
    └── http/

tests/
└── gradebook/
    ├── source/
    ├── engine/
    ├── contracts/
    ├── reconciliation/
    └── integration/
```

## Regras de dependência

- `src/gradebook-domain/**` não importa `react`, `@heroui/*`, DOM, Cloudflare ou Microsoft Graph.
- `shared/gradebook-contracts/**` não depende da interface nem da persistência.
- `src/features/gradebook/**` consome contratos/read models; não acessa planilhas ou tabelas diretamente.
- `server/gradebook/**` aplica autorização e orquestra domínio, persistência e consultas.
- Desempenho, Conselho e Boletins não importam código uns dos outros para obter regras; todos dependem do núcleo.
- Microsoft Graph/SharePoint nunca é acessado diretamente pelo navegador para dados acadêmicos.

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

## Contratos e compatibilidade

Mudança compatível adiciona campos opcionais ou novos estados sem alterar o significado existente. Mudança incompatível cria nova versão ou adaptador temporário. Mudança pedagógica nunca é “adaptada” silenciosamente: deve ser tratada como decisão oficial.

## Paralelismo seguro

- Uma issue declara caminhos de escrita exclusivos.
- Contratos congelados permitem que UI use fixtures sintéticas enquanto backend/motor são implementados.
- Arquivos centrais (`App.tsx`, navegação, contratos compartilhados, estado global) são coordenados pelo integrador.
- Não manter branches de fase por meses. PRs pequenos entram continuamente na `main`.
- Recurso incompleto pode existir atrás de rota/feature flag, mas não deve aparecer como disponível.

## Publicação

O único caminho de produção é `main` → workflow `Deploy Cloudflare Pages` → `admin.escolaieda.com`. Agentes de tarefa não alteram o workflow nem publicam diretamente. A issue só muda para `Publicada` depois da verificação do integrador.