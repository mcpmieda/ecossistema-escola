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
Planejamento idempotente
          ↓
Revisão humana dos pendentes
          ↓
Executor transacional
          ↓
Adaptador D1 autorizado
          ↓
Modelo acadêmico versionado
          ↓
Motor nativo versionado
          ↓
Resultados + Auditoria
          ↓
Read models
          ↓
Centrais / Desempenho / Conselho / Boletins
```

Planejamento, revisão e execução são etapas distintas. O planejador não grava; o executor não resolve ambiguidades; o adaptador não cria regras acadêmicas.

## Separação de autoridade

O valor importado e o calculado pelo motor permanecem separados. `authorityMode` seleciona a autoridade vigente sem apagar o outro lado. A autoridade continua `imported-source` até aceite explícito.

## Armazenamento

Cloudflare D1 é o armazenamento físico aprovado, mas o domínio permanece independente do fornecedor:

```text
Domínio/aplicação
       ↓
Portas V1
       ↓
Adaptador D1
       ↓
Migrations/schema
       ↓
D1
```

O domínio não importa `D1Database`, SQL, Wrangler ou bindings. Banco, bindings, migrations remotas e endpoints exigem issues próprias.

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

A migration 0003 materializa a relação entre fonte lógica e stream acadêmico. A #243 tornou sua escrita explícita também nas portas, no plano, na estimativa e no executor.

```text
arquivo/fonte confirmada
        +
registro acadêmico promovível
        ↓
associação versionada e ativa
```

Regras arquiteturais:

- a associação não é inferida por nome do arquivo;
- a associação não é descoberta por varredura de JSON;
- ela possui expectativa otimista própria;
- versão de fonte, registro e associação pertencem à mesma unidade de trabalho;
- conflito em qualquer etapa reverte a promoção inteira;
- ausência em uma nova planilha não gera desativação automática.

## Limites dos módulos

### Plataforma

Shell, autenticação Entra, capabilities, navegação, pesquisa global, Saúde e limites e publicação. Não contém regra de nota.

### Importação

Arquivos, leitura binária, hash, manifesto, mapeamento, classificação de células e diagnósticos. O arquivo permanece local na etapa atual e o importador não grava diretamente no D1.

### Contratos

Vocabulário compartilhado. Mudança incompatível exige issue de contrato, versão e adaptação explícita.

### Domínio e motor

Funções TypeScript puras e determinísticas para:

- semântica de célula;
- arredondamento;
- composição trimestral;
- recuperação paralela;
- resultado trimestral;
- recuperação final;
- resultado anual e elegibilidade V1.

Não acessa React, HeroUI, DOM, banco, rede ou relógio global.

### Aplicação

Orquestra planejamento, revisão e execução contra portas. Não executa SQL e não importa UI.

`planImportReconciliation` produz itens iguais, novos, alterados, ausentes ou bloqueados, mais versões planejadas de fonte, registro e associação.

`executeImportChangePlan` valida o plano e executa os appends aprovados na mesma unidade de trabalho.

### Persistência

Responsável por paginação, versionamento, compare-and-set, histórico e atomicidade. As portas públicas abrangem entidades, importações, registros acadêmicos, Auditoria e associações de fonte.

### Schema D1

Migrations locais 0001–0003, 21 tabelas, FKs por ano, índices, ponteiros de versão atual e histórico append-only. Não há cascades destrutivos.

### Adaptador D1

Leitura e escrita locais estão implementadas. A promoção física aplica fonte, registro e associação na mesma transação com compare-and-set, savepoints e rollback integral. O adaptador pode conhecer D1/SQL, mas não exporta esses tipos ao domínio.

A #261 conectará somente runtime local/preview, runner das migrations 0001–0003 e backend autorizado. Banco/binding/migration de produção continuam proibidos sem autorização explícita própria.

### Reconciliação e Auditoria

Compara fonte, versões persistidas e motor. Erro crítico não pode ser mascarado por sucesso geral. A #254 restaurou os cenários herdados de isolamento; a #263 acrescentará a equivalência anual explicável sem mudar `imported-source`.

### Read models

Consultas compactas e específicas por experiência. Evitam N+1 e impedem que componentes HeroUI reconstruam regras acadêmicas.

### Interface HeroUI

Apresenta fluxo, comandos e resultados. Não calcula nota, recuperação, elegibilidade ou decisão de Conselho.

### Saúde e limites

Área global futura do Centro, registrada na #220. Métricas chegam por backend autorizado; tokens e payload acadêmico não chegam ao navegador.

## Estado do motor

Implementado:

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
```

O resultado anual V1 acrescenta contagem de componentes não aprovados, elegibilidade básica e precedência somente de decisão formal explícita. A decisão humana do Conselho não é automatizada.

## Estado da persistência

```text
concluído:
  portas independentes
  migrations 0001–0003
  leitura D1 local
  escrita D1 local
  planejamento idempotente
  executor transacional abstrato
  contrato explícito da associação
  promoção física local com rollback integral

agora:
  #261 runtime D1 local/preview + runner autorizado
  #262 contexto acadêmico global/perfil 2026

posteriormente:
  autorização explícita de recurso remoto/produção
  ligação à interface
```

Não existe ainda banco D1 persistente ou de produção.

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
    ├── source/
    ├── rules/
    ├── calculations/
    │   ├── term/
    │   ├── parallel-recovery/
    │   ├── term-result/
    │   ├── final-recovery/
    │   ├── annual-result/
    │   └── annual-equivalence/
    └── ports/persistence/

shared/gradebook-contracts/
server/gradebook/
├── application/import/
├── persistence/d1/
│   ├── schema/
│   ├── read/
│   ├── write/
│   └── transaction/
├── queries/
└── http/

migrations/gradebook/
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
- Microsoft Graph/SharePoint não é acessado diretamente pelo navegador para dados acadêmicos.

## Paralelismo e correção de processo

Uma issue declara caminhos exclusivos. A integração da sétima onda identificou um PR que reunia #242 e #244. O conteúdo foi separado nos PRs #252 e #253 antes do merge, preservando rastreabilidade.

A integração registrou a #254 para restaurar regressões de isolamento removidas durante a evolução da #243. A cobertura foi restaurada sem defeito funcional; dívida de teste identificada não foi escondida nem confundida com falha comprovada.

## Publicação

O único caminho de produção é:

```text
main → Deploy Cloudflare Pages → admin.escolaieda.com
```

Agentes de tarefa não publicam diretamente. Entrega sem mudança visual ainda deve preservar build, testes e site.
