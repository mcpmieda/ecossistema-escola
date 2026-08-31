# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — qual issue pode ser executada agora.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.

## Estado atual

Cinco ondas foram integradas:

- #193/PR #207: esquema `SourceContractV1`;
- #194/PR #208: contratos das entidades acadêmicas V1;
- #195/PR #209: importador separado em módulos;
- #196/PR #212: contratos de lançamentos e resultados acadêmicos V1;
- #198/PR #213: fixtures sintéticas e protocolo controlado de validação real;
- #197/PR #216: contratos de lote, reconciliação e Auditoria V1;
- #201/PR #217: interpretação semântica nativa das células;
- #199/PR #225: manifesto SHA-256 e proveniência visível por arquivo;
- #218/PR #224: arredondamento acadêmico nativo V1;
- #219/PR #223: portas de persistência e transação independentes do fornecedor;
- #226/PR #231: composição trimestral nativa V1;
- #227/PR #233: schema e migrations D1 V1 locais;
- #228/PR #232: planejador idempotente de reimportação e versionamento.

O código vigente da quinta onda está no commit `781a2a25640366f1807de7d98cf0157f5c3cfea1`; o deploy Cloudflare Pages `33436989871` foi concluído com sucesso.

A sexta onda está pronta para três agentes independentes:

- [#234 — recuperação paralela nativa V1](https://github.com/mcpmieda/ecossistema-escola/issues/234);
- [#235 — catálogo de streams por fonte lógica e adaptador D1 local de leitura](https://github.com/mcpmieda/ecossistema-escola/issues/235);
- [#236 — executor transacional do plano de reimportação](https://github.com/mcpmieda/ecossistema-escola/issues/236).

A integração da sexta onda fica reservada à [#237](https://github.com/mcpmieda/ecossistema-escola/issues/237).

## Decisão de armazenamento

A issue #200 aprovou **Cloudflare D1** como armazenamento físico principal da base acadêmica. O domínio continua independente do fornecedor por meio das portas da #219.

A quinta onda integrou duas migrations locais, 19 tabelas, histórico append-only, chaves estrangeiras por ano, controle otimista, proveniência e índices. Isso ainda **não** significa que exista um banco D1 de produção: nenhum banco, binding, migration remota ou adaptador de escrita foi criado.

Regras relacionadas:

- acesso ao D1 somente pelo backend autorizado;
- navegador não é a base institucional;
- nome do arquivo é metadado, não identidade permanente;
- mesmo hash não duplica conteúdo;
- alterações acadêmicas geram versões apenas do que mudou;
- valores anteriores permanecem no histórico;
- valores ausentes de uma nova versão exigem revisão, não deleção silenciosa;
- plano gratuito pode ser usado no desenvolvimento/piloto com medição de consumo.

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema preserva a origem dos dados, implementa o motor nativo junto com o núcleo e publica progressivamente cada entrega independente no site oficial.

## Em produção

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global integrada ao módulo;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- SHA-256 calculado no navegador antes do reconhecimento;
- manifesto por arquivo com nome, tipo, tamanho, modificação, versões e instante de leitura;
- progresso separado entre preparação/hash e reconhecimento;
- hash abreviado com acesso ao valor completo;
- falha e diagnóstico isolados por arquivo;
- processamento somente em memória, sem upload nem persistência acadêmica;
- importador organizado em `src/features/gradebook/import/**`.

O operador confirmou o happy path da interface com dois arquivos XLSB: ambos foram reconhecidos, receberam SHA-256 e exibiram manifesto e leitura acadêmica. O smoke completo ainda precisa observar a etapa transitória de hash, expandir o valor completo e provocar uma falha isolada controlada.

## Núcleo já integrado

- contratos de fonte, entidades, resultados, importação, reconciliação e Auditoria;
- semântica nativa de células;
- arredondamento acadêmico V1;
- composição trimestral do perfil 2026 com 30/30/40, blocos 45%/55%, cobertura e achados;
- portas versionadas para entidades, arquivos/lotes, registros acadêmicos e Auditoria;
- schema D1 local com migrations 0001–0002, 19 tabelas e histórico append-only;
- planejamento de reimportação que separa igual, novo, alterado, ausente e bloqueado;
- paginação, concorrência otimista e unidade de trabalho atômica para promoção futura.

Ainda não existem banco/binding D1 operacional, adaptador de escrita, recuperação paralela/final, executor persistente, área operacional de Auditoria ou demais módulos.

## Lacuna de integração rastreada

O planejador da #228 precisa listar os registros acadêmicos associados a uma fonte lógica para detectar o que desapareceu da nova planilha. As migrations 0001–0002 não guardam essa associação em uma relação própria.

A #235 adicionará uma migration 0003 e o adaptador local de leitura correspondente. Não se deve substituir essa relação por varredura de JSON ou pelo nome do arquivo.

## Validação da fonte

A suíte pública sintética cobre D1, D2, D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos, hash e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define como conferir o corpus real fora do Git.

A execução controlada desse procedimento ainda precisa ser registrada antes do fechamento definitivo da F1. Isso não bloqueia a sexta onda.

## Saúde e limites

A #220 registra a futura área global `Centro de Administração → Configurações → Saúde e limites`. Ela permanece planejada até existirem bindings D1, uso real e backend autorizado de métricas. O painel não pertence exclusivamente ao Banco de Notas.

## Fontes de referência revisadas

- `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado.docx`;
- `PAINEL DESEMPENHO.docx`;
- `BANCO DE NOTAS 2026.xlsb`;
- planilhas reais de professores de 2026 usadas em validação controlada.

Esses arquivos não devem ser adicionados ao repositório público quando contiverem dados reais. As decisões e os contratos derivados ficam registrados neste diretório.

## Leitura obrigatória do agente

1. `AGENTS.md`;
2. [`COMECE_AQUI.md`](COMECE_AQUI.md);
3. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml);
4. [`DECISIONS.md`](DECISIONS.md);
5. a issue atribuída;
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRACTS.md`](CONTRACTS.md), [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md), [`D1_SCHEMA.md`](D1_SCHEMA.md) e [`TEST_MATRIX.md`](TEST_MATRIX.md) conforme o escopo;
7. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md).

A issue deve ser executada diretamente. App Factory, Factory Runs, orquestradores e agentes auxiliares só podem ser usados quando a própria issue autorizar expressamente.

## Regra de publicação

Uma entrega independente e utilizável não espera o restante do sistema. Depois de testes, revisão e merge na `main`, o workflow oficial publica no Cloudflare Pages. Funcionalidade incompleta só pode ser integrada quando não quebra a aplicação e permanece inacessível até cumprir os critérios de aceite.

## Regra de segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, pull requests ou commits. Arquivos reais servem apenas para validação controlada fora do repositório; resultados publicados devem ser agregados ou anonimizados.
