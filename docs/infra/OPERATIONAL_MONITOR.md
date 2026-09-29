# Monitoramento automático do Ecossistema

Fonte de verdade: [#1211](https://github.com/mcpmieda/ecossistema-escola/issues/1211). O monitoramento estende o **Cloudflare read-only operator** existente. Não altera serviços, políticas, dados acadêmicos ou credenciais.

## Onde o responsável consulta

1. Abra [Actions → Cloudflare read-only operator](https://github.com/mcpmieda/ecossistema-escola/actions/workflows/cloudflare-on-demand.yml).
2. Abra a execução mais recente que contenha o job **Monitoramento automático — saúde, evidências e lacunas**. Execuções de PR ou comandos `/cloudflare` antigos têm outro propósito.
3. Na página **Summary / Resumo**, leia estado, horário em Brasília, áreas verificadas, problemas e lacunas. Verde no GitHub significa que o workflow terminou sem alertas detectados; não significa homologação integral do produto.
4. Para aprofundar, desça até **Artifacts** e baixe o relatório. `report.md` é legível; `report.json` contém os agregados técnicos sanitizados.
5. A [issue #1211](https://github.com/mcpmieda/ecossistema-escola/issues/1211) mantém um comentário do `github-actions[bot]` com o estado atual e link da execução. Novos comentários registram apenas mudanças nos alertas e recuperações.

Não é necessário pedir a um agente nem enviar comandos para receber atualizações. É preciso conferir o horário da evidência: schedules do GitHub podem atrasar, ser omitidos sob carga e ser desabilitados por inatividade do repositório público. O workflow não promete observação contínua ou alerta instantâneo. Referência: [GitHub schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Frequência e janelas

| Execução        | Frequência                                                                    | Evidência                                                                       |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Periódica       | Minutos 07, 22, 37 e 52 de cada hora UTC                                      | Último quarto de hora completo, com pelo menos dois minutos para ingestão       |
| Diário          | 03:07 UTC / 00:07 Brasília                                                    | Telemetria do dia anterior, 00:00–00:00 Brasília                                |
| Após publicação | Conclusão bem-sucedida de `Deploy Cloudflare Pages` na main deste repositório | Sondas atuais e última janela completa; próximas rodadas capturam uso posterior |
| Manual          | `Run workflow`, branch main, operação `monitor` ou `daily`, pelo responsável  | Mesmo contrato do agendamento; `issue_number` não é necessário nesses modos     |

Os intervalos indicam as janelas solicitadas. A Cloudflare não documenta a inclusão dos instantes de fronteira; as contagens são eventos observados, sem garantia de deduplicação nesses limites. A execução fixa o relógio no começo para todas as etapas. O relatório conserva hora UTC e Brasília. Execuções repetidas da mesma janela não devem ser somadas. O horário diário assume America/Sao_Paulo em UTC−03; rever se a regra civil de fuso mudar.

O diário consulta diretamente os logs armazenados do dia anterior; não soma as rodadas periódicas. Sondas, configuração e estado de publicação são fotografias do momento da coleta, e Workers Analytics permanece na janela própria de 60 minutos. Não interpretar esses snapshots como resumo de 24 horas. O agendamento diário não substitui a rodada periódica coincidente.

O diário inclui **24 intervalos horários**, com autenticação por etapa/resultado e execuções do Worker por outcome. O Markdown mostra a distribuição; o JSON preserva as categorias e lacunas de cada hora. São eventos observados, não pessoas ou sessões distintas. A coleta horária faz no máximo 49 consultas somente leitura, com concorrência máxima de três; permissão negada interrompe as consultas ainda não iniciadas.

O pós-deploy usa chamada reutilizável direta (`workflow_call`) pelo job `monitor-after-deploy` do workflow oficial, dependente do sucesso de `deploy`. Não consome eventos `workflow_run`, código ou artefatos de forks. A execução pós-deploy aparece dentro da própria execução de publicação em Actions; os agendamentos aparecem no operador. Um alerta nessa verificação deixa a execução oficial com falha **após** publicar: não há rollback automático; conferir o job `deploy` e o relatório antes de interpretar o resultado global.

Após deploy, uma janela pode conter a versão anterior. O SHA do coletor e o SHA do workflow que disparou a leitura são registrados separadamente dos horários de publicação observados na Cloudflare. Esses SHAs não são prova da versão ativa no provedor. Sem eventos posteriores à publicação, não há validação do uso real da nova versão.

## Cobertura implementada

| Área               | Leitura e resultado                                                                         | Limite                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Portal             | `/healthz`, `/`, `/access`, `/api/student/status`, até cinco assets JS/CSS atuais           | Sem login, câmera ou dados de alunos; status público não comprova sessão autenticada             |
| Administração      | Documento público e `/api/health`                                                           | Não comprova operações autenticadas nem Banco de Notas                                           |
| Site institucional | Documento público                                                                           | Não audita conteúdo ou jornada inteira                                                           |
| Segurança HTTP     | Presença de CSP, HSTS e nosniff como booleanos                                              | Não certifica a correção completa da política; ausência não é automaticamente regressão          |
| Publicação         | Presença/modificação do Worker e estado/data do Pages                                       | Não baixa código, configuração privada nem secrets                                               |
| Workers Analytics  | Requisições, erros, máximo de CPU p50/p99 entre buckets, janela 60 min                      | Dataset adaptativo; percentis não são percentil global; janelas sobrepostas não somáveis         |
| Hyperdrive Portal  | Cache desabilitado e limite de origem esperado 8                                            | Não consulta host, usuário, senha ou origem no relatório; não comprova capacidade/carga          |
| Uso real           | Consultas agregadas de `auth-result-v1`, `live-close-v1`, `operation-v1` e outcomes nativos | Dependente de Workers Observability, campos e permissões existentes; logs armazenados/amostrados |
| Edge Pages         | Lacuna explícita                                                                            | Nome do projeto Pages não comprova seletor de logs do serviço; não inventar cobertura            |
| Sonar              | Quality Gate público da main                                                                | Não substitui gates do head de um PR                                                             |
| Entra              | Última execução agendada do workflow de auditoria existente                                 | Não consulta sign-ins; atraso maior que 28h aparece como lacuna                                  |
| Publicação GitHub  | Última execução por push na main do workflow oficial                                        | Metadados do workflow, não prova de publicação sozinhos                                          |

Banco/Supabase profundo (sessões/contas, motivos persistidos, locks, transações, migrations, outbox), diagnósticos acadêmicos do Banco de Notas, métricas adicionais de Hyperdrive/WAF/Turnstile e experiência autenticada **não têm cobertura integral nesta entrega**. Não há credencial de banco de diagnóstico disponibilizada a este workflow. Não adicionar credencial, reutilizar credencial de aplicação ou ampliar permissões sem a autorização aplicável. A #1211 permanece como inventário de ampliação, sem declarar os 44 itens já cobertos.

Os motivos/outcomes de autenticação consultados são operacionais e agregados; não equivalem ao histograma da auditoria persistida. Requisições, eventos, logins, sessões e contas distintas são medidas diferentes. Nunca chamar sessões válidas de alunos online. Dados insuficientes não aprovam ausência de duplicidade por invocação. Rótulos visuais, QR/câmera e uso autenticado continuam exigindo validação apropriada.

## Alertas e interpretação

- `ok` / `accessible`: verificação específica acessível e conforme seu contrato.
- `observed`: eventos disponíveis, sem certificar a saúde integral.
- `inconclusive`: sem atividade, campos ausentes ou resposta insuficiente.
- `partial`: fonte observada com amostragem, truncamento, descartes ou outra lacuna.
- `permission-required`: 401/403; sem contorno ou expansão de credencial.
- `credential-missing`: segredo/identificador necessário ausente.
- `unavailable`: transporte/provedor/etapa indisponível.

Alertas determinísticos: sonda fora do contrato esperado, recurso ausente, publicação falha, erros agregados do Worker, outcomes de exceção/indisponibilidade, divergência da configuração esperada do Hyperdrive e Sonar reprovado. Um sinal de erro pede investigação; não identifica automaticamente causa, aluno afetado ou regressão. Recusas de login e cancelamentos de conexão não são automaticamente indisponibilidade.

O comentário atual é atualizado em cada rodada periódica. Alertas iguais são deduplicados por conjunto; mudanças geram um novo registro com link para evidências. Recuperação exige evidência suficiente da fonte que gerou o alerta: timeout, falta de tráfego ou permissão negada preservam o alerta anterior como não esclarecido. Lacunas permanecem visíveis e não são convertidas em zeros. Falha de uma fonte não impede as demais; falha de publicação do comentário mantém o relatório nos artefatos e falha o job. O job também termina com falha quando existem alertas, depois de salvar os relatórios.

## Retenção e privacidade

- `monitor-detalhado-*`: 14 dias, artefatos `report.md` e `report.json`.
- `monitor-diario-*`: 90 dias, mesmos formatos, com janela diária de telemetria.
- Um comentário atual e registros concisos de incidentes/recuperações na issue. Esses comentários não expiram com artefatos.
- O GitHub elimina os artefatos ao expirar `retention-days`, sujeito ao limite do repositório. Isso não altera retenção global, logs/runs, CI, deploys, auditoria de origem ou dados acadêmicos.

O repositório é público: considerar **todos os logs, resumos, comentários e artefatos públicos**. Não registrar nomes, IDs individuais, notas, IPs, cookies, tokens, mensagens arbitrárias, URLs de requisições de alunos, corpos ou logs crus. As respostas dos provedores são processadas em memória e restringidas a campos/enums permitidos antes de gravar. Nenhum dado de telemetria é versionado em commits.

## Orientação aos agentes

Antes de solicitar acesso local ao responsável, consulte o último relatório e sua janela. Não confunda resultado do coletor com aceitação funcional, nem sucesso do workflow com cobertura completa. Informe precisamente a fonte ausente e a evidência ainda necessária.

- Workflow: `.github/workflows/cloudflare-on-demand.yml`, job `monitor`.
- Orquestração limitada e relatório: `scripts/operational-monitor-v1.ts`.
- Sondas fixas: `scripts/operational-probes-v1.ts`.
- Consultas agregadas Cloudflare: `scripts/operational-telemetry-v1.ts`.
- Atualização do comentário/alertas: `scripts/operational-monitor-publish-v1.ts`.
- Operador compartilhado: `scripts/cloudflare-operator-v1.ts`.
- Testes: `tests/operational-*.test.ts` e `tests/cloudflare-operator-v1.test.ts`.

Para ampliar: registrar o escopo na #1211 ou issue própria, usar coletores/contratos existentes, operações fixas e consultas limitadas, testar sanitização e indisponibilidade e atualizar a tabela de cobertura. Revalidar as permissões existentes antes de solicitar outra credencial. Não aceitar URL, SQL, resource ID ou payload livre do usuário/issue. Não automatizar reparo, carga artificial, ativação de contas ou exclusão de dados.

O job privilegiado só executa agendamento, publicação oficial da main ou comando manual do responsável na main. Faz checkout confiável da main, não executa código/artefatos do evento upstream e não entrega secrets a PRs. Tokens Cloudflare ficam somente nas etapas de coleta; renderização e publicação no GitHub não recebem esses tokens. O monitor reutiliza exclusivamente as duas credenciais Cloudflare já existentes e `github.token` temporário.
