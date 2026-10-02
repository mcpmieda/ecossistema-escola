# Eficiência de segurança e entrega — #1223

## Escopo

A auditoria confirmou reconexões de segurança a cada 45 segundos, uma consulta redundante de sessão nas leituras em snapshot e limpeza da outbox condicionada à existência de eventos novos. O Banco de Notas já grava eventos na mesma transação; a espera pelo cron era de entrega, não de criação do evento.

## Implementação

- Conexões novas negociam renovação autenticada a cada 45 segundos pela rota de sessão existente. Cada renovação verifica cookie, conta, política e vínculo no PostgreSQL. A sessão e a conexão são vinculadas no servidor. O RPC ocorre após encerrar a transação e localiza o socket pela tag da conexão. Resultados anteriores a uma invalidação não restauram autorização. Servidores antigos conservam a rotação anterior.
- Leituras em transação read-only/repeatable-read reaproveitam a primeira linha de sessão dentro da mesma transação: uma consulta de sessão a menos. Escritas mantêm a ordem de locks e a releitura posterior ao lock.
- A manutenção existente remove até 100 eventos entregues há mais de sete dias por execução, mesmo sem eventos novos. Eventos pendentes não são removidos.
- O dispatcher processa até quatro lotes (50 por padrão) com orçamento de 20 segundos para entrega. Ordena segurança primeiro, aplica timeout de RPC e libera itens não tentados. A confirmação continua protegida pelo token da reserva. O encerramento SQL pode ultrapassar o orçamento; RPC com timeout pode concluir remotamente, com a recuperação existente de entregas repetidas.
- Importação, Conselho, reset anual, nomes de avaliações, boletins e tratamentos/diagnósticos notificam o binding privado após a conclusão da gravação. O contexto exige a capability real do Banco, tenant e validade temporal. Falha no aviso não converte gravação confirmada em erro. O cron permanece como recuperação, inclusive quando a gravação termina mas a reconstrução da resposta falha.

## Limites e invariantes

A presença mantém janela de 60 segundos. Incerteza de rede preserva a decisão de login estável; somente revogação confirmada ou expiração da sessão encerra acesso. Pings automáticos não consultam PostgreSQL. Atualização acadêmica manual e proteção de rascunhos permanecem.

Não há novo serviço, migration ou mudança de regra acadêmica/cache de selos. Para 600 conexões contínuas, a projeção de 48 mil verificações por hora continua: reduzimos uma consulta em cada verificação e evitamos a recriação de sockets saudáveis. Não representa medição de tráfego nem garantia de custo zero ou latência instantânea. Workers Paid inclui consultas Hyperdrive sem franquia diária do Free; a fatura não foi consultada.

Referências oficiais: [Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Validação

Regressões pontuais cobrem autorização, concorrência de invalidação, compatibilidade, limite de entrega, limpeza e ordenação pós-commit. Gates completos e PostgreSQL nativo devem passar no head final antes da integração. A issue/PR registra SHA, resultados e publicação. CI não comprova homologação de uso real nem benchmark de 600 alunos; a validação real posterior usa o monitoramento existente, sem carga artificial ou exposição de dados reais.
