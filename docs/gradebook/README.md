# Banco de Notas — ponto de entrada

Este diretório é a memória oficial para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Comece por aqui

- [`COMECE_AQUI.md`](COMECE_AQUI.md) — qual issue pode ser executada agora.
- [Issue principal #182](https://github.com/mcpmieda/ecossistema-escola/issues/182) — acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso e dependências.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina.

## Estado atual

Três ondas foram integradas:

- #193/PR #207: esquema `SourceContractV1`;
- #194/PR #208: contratos das entidades acadêmicas V1;
- #195/PR #209: importador atual separado em módulos;
- #196/PR #212: contratos de lançamentos e resultados acadêmicos V1;
- #198/PR #213: fixtures sintéticas e protocolo controlado de validação real;
- #197/PR #216: contratos de lote, manifesto, reconciliação e Auditoria V1;
- #201/PR #217: interpretação semântica nativa das células.

O commit funcional vigente é `9476f84af7f99733c32f4a2503a50a4ef3c15c3f`; o deploy Cloudflare Pages `33424938206` foi concluído com sucesso.

A quarta onda está pronta para três agentes independentes:

- [#199 — SHA-256, manifesto e proveniência visível](https://github.com/mcpmieda/ecossistema-escola/issues/199);
- [#218 — arredondamento acadêmico nativo V1](https://github.com/mcpmieda/ecossistema-escola/issues/218);
- [#219 — portas de persistência e transação V1](https://github.com/mcpmieda/ecossistema-escola/issues/219).

A integração da quarta onda fica reservada à [#221](https://github.com/mcpmieda/ecossistema-escola/issues/221).

## Decisão de armazenamento

A [#200](https://github.com/mcpmieda/ecossistema-escola/issues/200) aprovou **Cloudflare D1** como armazenamento físico principal da base acadêmica.

Condições:

- acesso somente pelo backend autorizado;
- domínio independente do fornecedor por portas;
- nenhuma migration, binding ou banco de produção criado sem issue própria;
- plano gratuito permitido para desenvolvimento/piloto, com medição de consumo;
- nome do arquivo não é identidade permanente;
- reimportação idêntica não duplica e alterações preservam histórico versionado.

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

As entregas #197 e #201 são internas: estabilizam contratos e a primeira função do motor, mas não acrescentam uma nova tela. A próxima mudança visível prevista é #199, que mostrará manifesto/hash e etapas do arquivo no importador.

## Validação da fonte

A suíte pública sintética cobre D1, D2, D3, VG, trimestres, REC, estados especiais de célula, posições históricas, transferências, lotes de 1/20/50 arquivos e falha isolada. O procedimento `REAL_DATA_VALIDATION.md` define como conferir o corpus real fora do Git.

A execução controlada desse procedimento ainda precisa ser registrada antes do fechamento definitivo da F1. Isso não bloqueia a quarta onda.

## Saúde e limites

A [#220](https://github.com/mcpmieda/ecossistema-escola/issues/220) registra o planejamento de `Centro de Administração → Configurações → Saúde e limites`.

Essa área será global ao ecossistema, administrativa e alimentada por backend. Ela poderá mostrar D1, Workers, deploys, integrações e consumo por módulo sem expor tokens ou dados acadêmicos. Ainda não está pronta para implementação porque depende de D1/bindings e métricas reais.

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
