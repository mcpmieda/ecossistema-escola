# Saúde do Sistema — operação e integração V1 (#969)

## Estado e finalidade

Referência: [#969](https://github.com/mcpmieda/ecossistema-escola/issues/969), comentário `5752250987`, que incorporou a #1014. A prioridade de implementar o monitoramento antes das demais correções foi solicitada pelo responsável em 21/09/2026. O pacote de origem usou o repositório `mcpmieda/ecossistema-escola`, baseline `d4d7a68e07ebf96556ecc70dacd0125c8b962b6c`.

Esta entrega fornece uma primeira leitura operacional do Portal dentro do Centro ADM. Não conclui toda a iniciativa OBS-00…OBS-13, não fecha #969 e não equivale a uma autorização de abertura para todos os alunos.

O escopo de integração está na filha [#1085](https://github.com/mcpmieda/ecossistema-escola/issues/1085). Os registros da #1085 e da #969 devem identificar o SHA validado, PR, resultado do CI/Sonar, merge commit, recibos dos workflows de publicação e smoke realizado. Este documento descreve o comportamento e o procedimento; não constitui evidência de que os gates ou a publicação já terminaram. Testes isolados do ZIP e publicações anteriores não validam a entrega atual.

## Acesso e arquitetura

- Rota administrativa existente: `#/operacao`, renomeada visualmente para **Saúde do Sistema**. Nenhum novo domínio.
- Página lazy: `src/platform/system-health-page-v1.tsx`, com HeroUI React v3 existente. A página anterior continua acessível como evidência administrativa quando as fontes necessárias estão disponíveis.
- A rota passa a ser nativa em `shared/platform-snapshot-v2.ts`, para que uma falha de listas/auditoria/registro SharePoint não impeça a leitura independente do Portal. A autenticação e o bootstrap nativo continuam necessários.
- Endpoint fechado: `POST /api/platform/system-health`, corpo `{}`. Consulta autenticada; não recebe URLs, aluno, turma, contexto de identidade, filtros livres ou SQL.
- Reutiliza sessão administrativa e exige `platform.health.read` e `platform.settings.read`. A autorização é verificada novamente em cada requisição, inclusive antes de devolver cache.
- Usa um método novo **somente no entrypoint nomeado `PortalAdminEntrypoint`**, chamado `monitoring`. Não é adicionado ao entrypoint público/default/self. A segurança desse RPC depende do binding privado e do contexto administrativo verificado pelo Centro, não somente de um objeto JSON com formato válido.
- Reutiliza `portalDatabaseV1` e `portalMaintenanceHealthV1`; não há novo cliente Supabase, segredo, tabela, migration, alteração de ACL/RLS ou escrita acadêmica.
- Não transporta tokens Cloudflare/Supabase para o navegador e não reutiliza tokens amplos de deploy como credencial de monitoramento.

## O que é medido

| Leitura | Significado exato | Não significa |
| --- | --- | --- |
| Entrada pública | HEAD fixo na raiz do Portal, HTTP 200 e Content-Type HTML | JavaScript executado, login funcionando ou percentual de uptime |
| Acesso do Portal | Flag atual de serviço habilitado e configuração de chaves reconhecida pelo validador existente | Credencial testada contra fornecedor ou login de aluno aprovado |
| Banco | Sucesso/falha de uma consulta técnica privada pelo Portal/Hyperdrive/PostgreSQL | Diagnóstico causal isolado de Cloudflare ou Supabase |
| Duração técnica | Duração observada da leitura de monitoramento, incluindo o caminho de conexão/fechamento | p95, p99 ou tempo de abertura da página pelo aluno |
| Publicações disponíveis | Itens vencidos e livres para processamento segundo o leitor canônico, limitados a 1.001 | Total irrestrito de todos os jobs, inclusive futuros ou ocupados |
| Avisos pendentes | Avisos live ainda não entregues, limitados a 1.001 | Número de alunos, telas ou sessões |
| Avisos em nova tentativa | Subconjunto dos pendentes com tentativas anteriores | Quantidade a somar aos pendentes |
| Conexões em espera | Consultas do usuário/aplicação do Portal esperando locks | Total de conexões ou utilização percentual do plano |
| Idade da consulta em espera | Tempo desde `query_start` da consulta atualmente bloqueada | Tempo exclusivo desde o início do bloqueio |
| Limpeza pendente | Sinal agregado de registros técnicos vencidos | Exposição de IP, evento individual ou comando de exclusão |

O leitor de manutenção existente define os estados de atraso/intervenção. A V1 não altera esses critérios nem cria um SLO. O mapeamento visual mantém publicações e avisos live separados para não atribuir a uma fila a falha observada na outra.

O campo novo `liveOutboxAvailable` informa a existência da tabela de avisos. Os catálogos antigos podem continuar retornando valores neutros ao consumidor anterior; no novo painel, ausência de estrutura é **Sem dados**, nunca fila saudável com zero.

As contagens atingindo o limite aparecem como **1.000+**. Esse é um limite de leitura, não capacidade do banco ou do plano contratado. Nenhuma porcentagem de capacidade é calculada.

## Ações do operador e confirmação de recuperação

Registre o horário da amostra e o sinal agregado na issue de acompanhamento. Uma amostra ausente, vencida ou uma atualização pausada não confirma recuperação; retome a leitura com sessão autorizada, aba visível e conexão disponível. O painel não executa correções, reprocessamentos ou exclusões.

| Sinal observado | Ação segura | Confirmação de recuperação |
| --- | --- | --- |
| Entrada pública sem confirmação ou resposta inesperada | Conferir a resposta da raiz oficial do Portal e a publicação vigente; consultar o operador Cloudflare somente leitura quando necessário. | Nova amostra HTTP 200 com HTML. Login e renderização continuam exigindo prova própria. |
| Portal desabilitado ou credenciais incompletas | Conferir a configuração vigente com o responsável; mudanças em credenciais ou habilitação seguem o fluxo autorizado. | Nova amostra com serviço habilitado e configuração reconhecida; isso não comprova login. |
| Leitura do banco ausente ou não concluída | Conferir binding privado, configuração e diagnóstico sanitizado do caminho Portal/Hyperdrive/PostgreSQL. Encaminhar a falha ao responsável sem atribuir causa a um fornecedor. | Nova leitura técnica concluída, com horário recente; conferir também as filas e os bloqueios. |
| Publicações atrasadas ou tentativas esgotadas | Conferir o executor e a manutenção existentes; investigar a operação pendente antes de qualquer reprocessamento autorizado. | Nova amostra sem atraso/intervenção segundo o leitor canônico e sem tentativas esgotadas. |
| Avisos pendentes, em nova tentativa ou estrutura ausente | Conferir o fluxo live e a estrutura esperada na versão publicada; não somar novas tentativas aos pendentes nem tratar ausência como zero. | Estrutura disponível e nova amostra sem backlog live segundo o leitor canônico. |
| Conexões em espera | Investigar as operações concorrentes pelo diagnóstico autorizado do banco; não cancelar sessões ou alterar limites a partir deste painel. | Nova amostra sem consultas em espera; se persistirem, registrar duração e contagem agregadas para investigação. |
| Registros técnicos vencidos | Conferir a manutenção agendada e seu resultado sanitizado; usar somente o procedimento de limpeza existente e autorizado. | Nova amostra sem registros vencidos, após execução da manutenção. |

## Atualização, custo e retenção

- Atualização normal a cada 60 segundos somente com a área aberta, visível e online.
- Atualização manual com intervalo mínimo de 5 segundos e uma requisição em voo por instância da página.
- Falhas transitórias aumentam o intervalo progressivamente, até 5 minutos.
- Ao ocultar/offline, a requisição é cancelada e o polling pausa. Ao desmontar/trocar identidade, os dados são removidos e respostas atrasadas são descartadas. Uma resposta 401/403 remove os dados e interrompe novas tentativas até rever o acesso.
- Cache do servidor: apenas um snapshot agregado e uma promessa em voo, TTL de 30 segundos por instância/ambiente. Não é um cache distribuído nem um limite global entre regiões ou processos. Não há garantia de uma única leitura para todos os administradores do mundo.
- Fontes independentes consultadas em paralelo. Falha de uma não apaga o resultado da outra no DTO.
- Datas reais da coleta são preservadas. Após 2 minutos, o painel deixa de confirmar normalidade. Relógio futuro incoerente também não produz estado verde.
- Leitura pública limitada a 3 segundos; RPC a 8 segundos; leitura completa do cliente a 12 segundos; corpo de entrada a 2 segundos e 64 bytes. Resposta JSON do cliente: no máximo 16 KiB, UTF-8 válido, contrato fechado.
- SQL de monitoramento usa transação **READ ONLY / REPEATABLE READ**, `statement_timeout=1500ms` e `lock_timeout=250ms`. O deadline de RPC limita a espera do agregador; não é uma afirmação de cancelamento remoto instantâneo. Os limites SQL controlam as consultas do outro lado.
- Nada é persistido em localStorage/sessionStorage, nova tabela ou histórico durável. As métricas sanitizadas já emitidas pelo caminho de banco seguem a infraestrutura existente.
- **Não há vigilância quando o painel está fechado, nem envio de alerta externo nesta versão.** Um monitor continuamente agendado é uma entrega separada, com destino de alertas e custo aprovados.

## Segurança

A entrada recusa origem/host diferentes, headers de reescrita, query string, fragmento, cookies de sessão duplicados, preview e qualquer corpo diferente de objeto vazio. O alvo HTTP é constante e não recebe cookies nem Authorization; redirects não são seguidos. Não há fan-out por aluno.

O RPC valida tenant, capability do contexto privado, instante de verificação e ambiente antes de abrir o banco. Ele continua diagnosticando configuração incompleta e serviço desabilitado; não requer chaves válidas para conseguir informar que elas estão ausentes.

DTOs com campos extras, contagens inválidas ou datas incoerentes são rejeitados. Mensagens brutas de fornecedor/banco não são devolvidas. Os testes usam somente identidades e dados sintéticos.

## Validação no repositório

As evidências finais devem corresponder ao head integrado e informar SHA, ambiente, comando e resultado. A matriz de validação inclui:

- `tests/observability/system-health-core-v1.test.ts`, `system-health-http-v1.test.ts` e `system-health-rpc-v1.test.ts`: contrato fechado, leitura limitada, cache, controlador e recusa de entradas inválidas.
- `tests/observability/system-health-production-http-v1.test.ts`: 6 testes com sessões realmente seladas pelo código de autenticação, identidades sintéticas, autorização antes do cache, expiração, isolamento e recusa de dados privados.
- `tests/observability/system-health-ui-v1.test.tsx`: 19 testes renderizados com HeroUI, hook de identidade e controlador reais; dados ausentes/parciais/expirados, relógio incoerente, negação, troca de identidade, resposta tardia, atualização manual, pausa e independência das evidências ADM. Inclui cabeçalhos acessíveis da tabela e atualização imediata do relógio ao receber uma nova coleta.
- `tests/student-portal/observability/maintenance-health-v1.test.ts` e `tests/platform-snapshot-resilience-v2.test.ts`: manutenção canônica e independência das fontes da plataforma.
- `tests/student-portal/smoke/monitoring-969.postgres.ts`: 15 testes com Workerd, binding nomeado e PostgreSQL local descartável; papel restrito, transação somente leitura, limites, estrutura ausente, falha de lock e recuperação, negação de contextos e inacessibilidade pelo entrypoint público. Executar com a configuração `tests/student-portal/smoke/vitest.smoke.config.ts` e os pré-requisitos PostgreSQL do repositório.
- `npm run verify`: lint, typecheck, suíte principal, builds do Centro e Portal e testes de runtime oficiais. Os testes PostgreSQL complementam esse comando.
- Smoke visual desktop/mobile com dados sintéticos e smoke administrativo autenticado após publicação. Testes DOM, CI e deploy não substituem essas provas.

Os resultados, falhas corrigidas e limitações efetivas ficam registrados na [#1085](https://github.com/mcpmieda/ecossistema-escola/issues/1085) e na [#969](https://github.com/mcpmieda/ecossistema-escola/issues/969), sem declarar aprovação por ausência de execução.

## Gate para integrar e publicar

1. Manter o escopo delimitado da #1085 vinculado à #969, sem afirmar que OBS está encerrado.
2. Conferir o diff da branch curta contra a `main` atual, preservando alterações recentes e compatibilidade com a configuração do repositório. Não forçar aplicação sobre arquivos divergentes.
3. Executar testes específicos de observabilidade, manutenção e resiliência da plataforma; depois `npm run verify` e os gates oficiais no head final.
4. Executar a UI real desktop/mobile, usando dados sintéticos. Conferir navegação, estados ausentes/expirados, ciclo de login/negação, suspensão da aba, troca de identidade e atualização manual.
5. Conferir RPC com binding nomeado real no Workerd e banco descartável. Confirmar que o entrypoint público não possui o novo método e que a consulta não escreve nem usa a conexão de Gradebook.
6. Revisar diff/segurança/Sonar. Não tratar ausência de revisão ou limite de bot como revisão aprovada.
7. Integrar por merge commit com SHA esperado e fluxo oficial. O backend Portal compatível deve ser publicado antes do consumidor administrativo.
8. Fazer smoke administrativo autenticado em produção e conferir as amostras. Não usar dados de estudante em screenshots ou evidências públicas.

## Pendências para monitoramento de abertura escolar

Esta entrega cobre partes de OBS-00/01/06/07/08/09/13. Permanecem separadas:

- agregação histórica de operações/erros/latência e recepção dos diagnósticos do navegador, com destino, retenção e ownership;
- métricas reais Cloudflare/Hyperdrive/Supabase, limites do plano e credenciais somente leitura apropriadas;
- teste funcional automático com conta sintética aprovada, cobrindo login e renderização das telas de notas/disciplinas/evolução;
- monitor agendado fora da sessão do administrador e canal de alerta externo com responsável;
- baseline real, thresholds/SLOs, orçamento de custo, teste controlado de carga e homologação de abertura;
- histórico/timeline de incidentes e correlação com deploy sem causalidade inventada;
- backup/restauração acadêmica: continuar na fonte canônica #970, sem confundir com evidência SharePoint.

O operador Cloudflare read-only descrito em `docs/infra/CLOUDFLARE_OPERATOR.md` pode fornecer inventário e provas sob demanda; não equivale a telemetria contínua. Não é necessário rotacionar ou criar credenciais apenas para integrar esta primeira versão.
