# Decisões oficiais do Banco de Notas

Este arquivo é cronológico e normativo para o projeto. Em caso de divergência, prevalece a primeira decisão oficial. Uma decisão posterior só altera outra quando declara expressamente `Substitui BN-DEC-XXX`.

## BN-DEC-001 — Construção integrada e técnica

**Data:** 2026-08-31  
**Status:** vigente

O novo Banco de Notas será construído no repositório `ecossistema-escola`, integrado ao Centro de Administração, com processo técnico e sem governança burocrática desnecessária.

## BN-DEC-002 — HeroUI e shell único

**Data:** 2026-08-31  
**Status:** vigente

HeroUI React v3 é o sistema visual transversal. O Banco usa o mesmo shell, sidebar, topbar, pesquisa, perfil, autenticação e permissões do Centro. Não criar aplicativo, autenticação ou shell paralelo.

## BN-DEC-003 — Experiência funcional para usuários leigos

**Data:** 2026-08-31  
**Status:** vigente

A interface deve parecer um sistema de trabalho pronto para uso, não um painel técnico de configuração. Configurações ficam em segundo plano, com defaults válidos. A navegação é orientada a tarefas, linguagem escolar e aprofundamento progressivo.

## BN-DEC-004 — Fontes iniciais restritas

**Data:** 2026-08-31  
**Status:** vigente

A fonte operacional inicial são as planilhas atuais dos professores. O arquivo `BANCO DE NOTAS 2026.xlsb` é referência funcional para o comportamento global. Outras fontes, incluindo SMECEL e sincronizações automáticas, ficam fora do escopo inicial.

## BN-DEC-005 — Importação direta, sem planilha técnica intermediária

**Data:** 2026-08-31  
**Status:** vigente

O usuário importa os arquivos reais existentes em XLSB/XLSX/XLS. Não exigir conversão para planilha técnica padronizada. Uma camada de adaptadores internos pode existir; uma nova planilha padrão só será considerada se uma fonte futura demonstrar necessidade concreta.

## BN-DEC-006 — Preservação integral da fonte

**Data:** 2026-08-31  
**Status:** vigente

A importação nunca altera o arquivo original. Todos os registros encontrados são preservados, inclusive posições históricas, transferidos e movimentos `FOI PARA` / `ESTAVA NO`. Filtros futuros determinam a população vigente sem apagar histórico.

## BN-DEC-007 — Motor nativo construído junto com o Banco

**Data:** 2026-08-31  
**Status:** vigente

Toda referência documental a “motor nativo futuro” deve ser interpretada como motor obrigatório nas fases iniciais da construção. Ele será implementado em funções puras, versionadas e testáveis. Durante a migração, os valores importados e os calculados pelo motor permanecem separáveis e comparáveis. A mudança de autoridade oficial para o motor exige aceite explícito; não ocorre silenciosamente.

## BN-DEC-008 — Uma regra acadêmica, um único núcleo

**Data:** 2026-08-31  
**Status:** vigente

Importação, Desempenho, Conselho, Boletins, pesquisa e relatórios não mantêm motores próprios. Todos consomem contratos e resultados do domínio acadêmico central.

## BN-DEC-009 — Arquitetura modular, não uma página gigante

**Data:** 2026-08-31  
**Status:** vigente

O Banco será dividido em módulos com rotas e limites claros: Importação, domínio/motor, Auditoria, centrais de entidades, Desempenho, Conselho, Boletins/Relatórios e Configurações. As responsabilidades ocultas do Excel viram serviços e contratos, não telas que imitam guias.

## BN-DEC-010 — Desempenho como projeção analítica

**Data:** 2026-08-31  
**Status:** vigente

Desempenho é uma área read-only sobre dados e resultados oficiais do Banco. A matriz da turma é o centro da experiência; detalhes aparecem por interação. Desempenho não possui cadastro, armazenamento ou cálculo acadêmico paralelo.

## BN-DEC-011 — Desenvolvimento paralelo por issues e contratos

**Data:** 2026-08-31  
**Status:** vigente

As fases serão issues-pai. Entregas pequenas serão issues executáveis por diferentes agentes, com caminhos permitidos, contratos, dependências, critérios de aceite e testes. O repositório permanece único; branches são curtas; integração ocorre continuamente na `main`.

## BN-DEC-012 — Memória oficial no repositório

**Data:** 2026-08-31  
**Status:** vigente

Conversas não são memória oficial. Qualquer agente deve compreender e continuar o projeto lendo `AGENTS.md`, `docs/gradebook/`, a issue atribuída e seus contratos. O integrador mantém `PROJECT_STATE.yaml` após merges.

## BN-DEC-013 — Publicação progressiva no site oficial

**Data:** 2026-08-31  
**Status:** vigente

Toda entrega independente, utilizável e não bloqueada por outra fase deve ser integrada à `main`, publicada pelo workflow oficial e verificada em `admin.escolaieda.com`. Código incompleto só pode chegar à `main` quando não quebra a aplicação e permanece inacessível até estar pronto.

## BN-DEC-014 — Segurança do repositório público

**Data:** 2026-08-31  
**Status:** vigente

Nenhum dado real de estudante pode ser versionado ou exposto em issues, PRs, fixtures, logs ou screenshots. Testes no repositório usam dados sintéticos ou anonimizados; validações com arquivos reais ocorrem de forma controlada fora do Git.

## BN-DEC-015 — Precedência da primeira divergência

**Data:** 2026-08-31  
**Status:** vigente

Quando instruções entrarem em conflito, a mais antiga permanece oficial. Qualquer substituição deve citar a decisão anterior, explicar o impacto e ser confirmada explicitamente pelo responsável.