# Banco de Notas — ponto de entrada

Este diretório é a memória oficial e suficiente para que uma pessoa ou inteligência artificial entenda o projeto, descubra onde o trabalho parou e continue sem depender de conversas anteriores.

## Acompanhamento imediato

- [Issue principal #182](../../issues/182) — visão geral para acompanhamento humano.
- [`ISSUE_MAP.md`](ISSUE_MAP.md) — fases, progresso, tarefas prontas e bloqueios.
- [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina e fila segura.

A primeira onda possui três issues independentes prontas para agentes: [#193](../../issues/193), [#194](../../issues/194) e [#195](../../issues/195).

## Objetivo

Construir um Banco de Notas funcional, modular, auditável e acessível a usuários leigos, integrado ao Centro de Administração e alimentado inicialmente pelas planilhas atuais dos professores. O sistema deve preservar a origem dos dados, implementar o motor nativo junto com o núcleo e publicar progressivamente cada entrega independente no site oficial.

## Estado atual

Em produção já existe:

- área `Banco de notas` no mesmo shell do Centro;
- interface HeroUI React v3;
- pesquisa global integrada ao módulo;
- importação local de até 50 arquivos por lote;
- leitura sequencial de XLSB, XLSX e XLS;
- reconhecimento de turmas, alunos, disciplinas, trimestres, quantitativo, qualitativo e recuperação;
- processamento somente em memória, sem persistência acadêmica.

O código do protótipo ainda está concentrado em `src/platform/notes-page.tsx` e `src/platform/notes-spreadsheet-recognizer.ts`. A primeira frente de construção deve separá-lo em importação, contratos, domínio e apresentação sem interromper o recurso publicado.

## Fontes de referência revisadas

- `Relatorio_Completo_Banco_de_Notas_v1.6_consolidado.docx`;
- `PAINEL DESEMPENHO.docx`;
- `BANCO DE NOTAS 2026.xlsb`;
- planilhas reais de professores de 2026 usadas em testes de reconhecimento.

Esses arquivos não devem ser adicionados ao repositório público quando contiverem dados reais. As decisões e os contratos derivados ficam registrados neste diretório.

## Leitura obrigatória

1. [`ISSUE_MAP.md`](ISSUE_MAP.md) — visão rápida para escolher uma tarefa;
2. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml) — estado legível por máquina e fila segura;
3. [`DECISIONS.md`](DECISIONS.md) — decisões oficiais em ordem cronológica;
4. [`ROADMAP.md`](ROADMAP.md) — fases, dependências e critérios de conclusão;
5. [`ARCHITECTURE.md`](ARCHITECTURE.md) — limites dos módulos e direção do código;
6. [`CONTRACTS.md`](CONTRACTS.md) — vocabulário e contratos compartilhados;
7. [`SOURCE_CONTRACT.md`](SOURCE_CONTRACT.md) — estrutura confirmada das planilhas;
8. [`TEST_MATRIX.md`](TEST_MATRIX.md) — testes mínimos por camada;
9. [`AGENT_PROTOCOL.md`](AGENT_PROTOCOL.md) — como assumir e entregar uma issue.

## Regra de acompanhamento

O acompanhamento humano usa a issue #182 e uma issue por fase. Cada fase informa em linguagem simples:

- o que já funciona;
- o que falta;
- dependências;
- progresso por tarefas;
- resultado visível no site;
- última publicação verificada.

As tarefas executáveis são issues pequenas, com caminhos permitidos, contratos consumidos, critérios de aceite e testes. O integrador mantém o mapa e o `PROJECT_STATE.yaml` após cada merge.

## Regra de publicação

Uma entrega independente e utilizável não espera o restante do sistema. Depois de testes, revisão e merge na `main`, o workflow oficial publica no Cloudflare Pages. Funcionalidade incompleta pode ser integrada apenas quando não quebra a aplicação e permanece inacessível por rota/feature flag até cumprir os critérios de aceite.

## Regra de segurança

O repositório é público. Nunca usar dados reais de estudantes em fixtures, screenshots, logs, issues, pull requests ou commits. Arquivos reais servem apenas para validação controlada fora do repositório; resultados publicados devem ser agregados ou anonimizados.
