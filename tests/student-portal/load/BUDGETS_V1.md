# Orçamentos propostos antes da carga #714

Ambiente: dados inteiramente sintéticos em PostgreSQL local descartável; papel student_portal_app, múltiplas conexões; módulos empacotados e executados em workerd. Nenhuma carga no ADM/BN produtivo. Medições locais não são latência de rede remota nem CPU faturada Cloudflare.

- Pool: 1 conexão por invocação, concorrência ensaiada 1/2/5; limite de origem existente 5, papel 10. Nenhum aumento.
- Timeouts: conexão5s, statement5s, lock1.5s, idle-TX10s; falha fechada e sem detalhe de driver.
- KDF: scrypt N32768,r8,p3,len32; no máximo2 transações de itens novos e1 derivação por birth-batch/request; nenhuma redução de custo. CPU configurada1000ms; reservar pelo menos300ms para restante da invocação. Memória Worker128MiB; workspace32MiB e maxmem64MiB por KDF sequencial. Perfil JS não prova pico nativo.
- Payload público8KiB; admin64KiB; página100; QRbatch100; birthbatch100 entradas com retomada por recibos; resposta admin até256KiB, self até256KiB no harness; nenhuma credencial em logs.
- SQL: meta inicial <=40 consultas por auth/self individual, <=20 QRbatch100, <=65 por birthbatch parcial (1 derivação), <=15 cleanup por execução. Resultados instrumentados <=1500 linhas por invocação ordinária; fontes acadêmicas e publicação com limites explícitos próprios, nunca implicitamente tratados como página100.
- Latência local: self p95<=750ms/p99<=1500ms; auth com1KDF p95<=1500ms/p99<=2500ms; batch1KDF p95<=2000ms/p99<=3000ms. Ensaiar fila/lock e concorrência5 separadamente, registrar taxa de sucesso e falhas; não excluir timeouts dos percentis como se fossem sucesso.
- Siteverify5s máximo, sem manter transação/lock enquanto aguarda rede; hostname/action fixos; token de uso único; falha do provedor=>unavailable. Serviço real com chave pública de teste não equivale a validação positiva do widget produtivo.
- Cleanup: até100 linhas/família por passagem; índice/lock SKIP LOCKED; repetição idempotente. Cron posterior5min; prazo de ocultação de IP e auditoria aplicado na leitura mesmo com cron atrasado. IP bruto expira90dias; metadados12meses. Limpeza física atrasada gera attention, backlog persistente/intervenção requer acelerar passagens dentro do mesmo limite, sem ampliar plano.
- Jobs: claim de um job por chamada; limitar a passagem por orçamento de execução, lease60s, attempts5; evitar executar20 materializações pesadas na mesma invocação sem medida; composição deve limitar por orçamento observado. Atraso>5min attention; failed>=5 intervention; cancelado attempts0 não é falha operacional.

Valores são gates definidos antes de executar carga. Se violados, corrigir o módulo ou registrar bloqueio real, jamais reclassificar retrospectivamente PASS alterando só a meta.

Medição remota de duas derivações violou a reserva de CPU: p99 825,156ms. O teto foi reduzido para uma derivação por chamada; o limite1000ms e a reserva300ms foram preservados. Até2 itens sem KDF continuam permitidos pelo tetoSQL.
