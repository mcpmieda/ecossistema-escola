# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — qual issue pode ser executada agora.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.

## Estado atual

Duas ondas foram integradas:

- #193/PR #207: esquema `SourceContractV1`;
- #194/PR #208: contratos das entidades acadêmicas V1;
- #195/PR #209: importador atual separado em módulos;
- #196/PR #212: contratos de lançamentos e resultados acadêmicos V1;
- #198/PR #213: fixtures sintéticas e protocolo controlado de validação real.

O commit funcional vigente é `32450ac431dde3ddad1dfcbee436710eb2cd6555`; o deploy Cloudflare Pages `33421282101` foi concluído com sucesso.

A terceira onda está pronta para dois agentes independentes:

- [#197 — contratos de lote, reconciliação e Auditoria](https://github.com/mcpmieda/ecossistema-escola/issues/197);
- [#201 — interpretação semântica nativa das células](https://github.com/mcpmieda/ecossistema-escola/issues/201).

A integração da terceira onda fica reservada à [#214](https://github.com/mcpmieda/ecossistema-escola/issues/214).

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema deve preservar a origem dos dados, implementar o motor nativo junto com o núcleo e publicar progressivamente cada entrega independente no site oficial.

## Em produção

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global integrada ao módulo;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- processamento somente em memória, sem persistência acadêmica;
- importador organizado em `src/features/gradebook/import/**`.

As entregas #196 e #198 são internas: estabilizam contratos e testes, mas não acrescentam uma nova tela.

## Validação da fonte

A suíte pública sintética cobre D1, D2, D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define como conferir o corpus real fora do Git.

A execução controlada desse procedimento ainda precisa ser registrada antes do fechamento definitivo da F1. Isso não bloqueia a terceira onda.

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
6. [`ARCHITECTURE.md`](ARCHITECTURE.md), [`CONTRACTS.md`](CONTRACTS.md), [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md) e [`TEST_MATRIX.md`](TEST_MATRIX.md) conforme o escopo;
7. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md).

A issue deve ser executada diretamente. App Factory, Factory Runs, orquestradores e agentes auxiliares só podem ser usados quando a própria issue autorizar expressamente.

## Regra de publicação

Uma entrega independente e utilizável não espera o restante do sistema. Depois de testes, revisão e merge na `main`, o workflow oficial publica no Cloudflare Pages. Funcionalidade incompleta só pode ser integrada quando não quebra a aplicação e permanece inacessível até cumprir os critérios de aceite.

## Regra de segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, pull requests ou commits. Arquivos reais servem apenas para validação controlada fora do repositório; resultados publicados devem ser agregados ou anonimizados.
