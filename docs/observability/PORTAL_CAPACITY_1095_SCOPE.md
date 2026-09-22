# Precisão dos contadores — complemento da #1095

Revisão direta antes da publicação: `pg_stat_activity` contém processos, não apenas conexões normais. A leitura de capacidade filtra também `backend_type='client backend'` para não contar workers paralelos ou de manutenção como vagas usadas pela conta. O filtro de `usename=current_user` continua em todos os bancos, como o limite do papel.

Se `track_activities` estiver desabilitado, ou uma conexão da conta não tiver estado visível, a medição falha de forma sanitizada. Não converte informação não medida em zero de atividade ou espera. O indicador de visibilidade existe apenas na consulta, não acrescenta campo ao contrato.

Fontes primárias conferidas:
- https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW
- https://www.postgresql.org/docs/17/sql-createrole.html (CONNECTION LIMIT: conexões normais; workers de fundo não entram no limite)

Regressões: contrato e SQL verificam o filtro de backend e a rejeição de visibilidade falsa, ausente ou nula; testes PostgreSQL continuam conectando diretamente com papel limitado e exercitando bloqueio real. Não foi criada carga paralela produtiva para validar o filtro. Nenhuma alteração de dados, permissões ou configuração de tracking em produção.
