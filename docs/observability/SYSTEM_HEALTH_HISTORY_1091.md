# Histórico operacional — #1091 / #969

## Escopo

Amostras privadas de configuração e manutenção/filas do Portal. Não equivale a monitor de login, renderização, experiência real, disponibilidade percentual ou diagnóstico causal de fornecedor. A conta produtiva escolhida pelo responsável não é usada por este coletor e não aparece no código, testes, logs ou evidências públicas.

O Portal estudantil permanece com atualização manual (#1090). O histórico não instala polling, WebSocket ou telemetria no navegador do aluno e não faz uma gravação por acesso. Nenhum e-mail ou notificação externa é enviado. O operador precisa consultar Saúde do Sistema para ler os avisos.

## Coleta e armazenamento

O cron existente de um minuto passa o scheduledTime para `portalHistoryScheduledV1`. Só os disparos alinhados a cinco minutos fazem trabalho adicional. A janela definitiva e observed_at vêm do PostgreSQL, não do navegador. Advisory lock transacional não bloqueante e PK da janela impedem duplicação mesmo com concorrência/reexecução. Uma janela não coletada permanece lacuna; não há preenchimento retroativo.

Tabela privada: `system_health.portal_sample_v1`, migration `migrations/observability/0001_portal_health_history_v1.sql`. Campos escalares e enumerados, sem JSON livre, nomes, identificadores de pessoas, notas, IP, URLs, credenciais, erros brutos ou vínculos acadêmicos. Os ledgers já aplicados de Gradebook e Student Portal não são reescritos. O papel backend existente só recebe leitura, exclusão e inserção das novas colunas operacionais; não pode fornecer timestamps nem fazer UPDATE. API roles e gradebook_app não recebem acesso. RLS habilitada como defesa adicional. Nenhuma função SECURITY DEFINER ou nova credencial.

Orçamento lógico: no máximo 288 amostras por dia, 8.640 janelas em 30 dias (a janela parcial pode acrescentar uma linha). Não é promessa de cobrança zero nem prova de limite de plano. Reutiliza banco, conexão e cron existentes, sem novo serviço ou plano. A medição de readDurationMs cobre a leitura de manutenção, não um login nem toda a conexão.

## Retenção

Retenção exata de 720 horas. A consulta exclui `observed_at <= transaction_timestamp() - interval '720 hours'`, mesmo se a exclusão atrasar. Limpeza em transação separada, limitada a 500 linhas por disparo elegível; repetições são idempotentes. Continua com PORTAL_SERVING_ENABLED=false, desde que o Worker, cron e banco estejam disponíveis. Não altera a retenção dos registros de segurança ou dados acadêmicos. A exclusão física depende da execução da manutenção; indisponibilidade prolongada pode atrasá-la, sem tornar registros expirados consultáveis. Uma falha na coleta posterior não desfaz a limpeza confirmada.

## Leitura e avisos

Rota separada: POST `/api/platform/system-health/history`, JSON exato `{ "before": null }` ou cursor de janela UTC. Usa a mesma autenticação, origem, cookie e duas capabilities da Saúde do Sistema. RPC nomeado `PortalAdminEntrypoint.monitoringHistory`; ausente no self/default. Resposta fechada, no-store, 48 pontos por página e cursor exclusivo; limite de resposta 32 KiB no cliente e prazos de leitura. Banco usa transação read-only, statement_timeout 1.500 ms e lock_timeout 250 ms.

O snapshot V1 existente permanece exatamente compatível durante a implantação backend-first. Backend anterior/migration ausente retorna estado não configurado; erro de leitura não vira zero/Normal. A UI só consulta histórico ao abrir ou por ação explícita, sem nova consulta periódica. Troca de identidade/desmontagem/ocultação por navegação cancela leituras; 401/403 limpa e bloqueia retentativas. O relógio local só expira a confirmação; não faz rede. Confirmação da leitura expira em dois minutos e a última coleta em dez minutos. Estados históricos continuam datados, nunca usados como prova atual depois disso.

Recuperação só é indicada entre duas janelas consecutivas, passando de Atenção/Crítico para Normal. Entre lacunas, mostrar intervalo sem confirmação; não inventar duração de incidente ou disponibilidade contínua.

## Implantação e rollback

1. Confirmar verify, PostgreSQL nativo, runtime e Sonar do head final, e revisão do diff.
2. Conferir projeto/catálogo/papel backend e ausência de colisão de schema somente por metadados.
3. Aplicar a migration operacional aditiva pelo canal autorizado e conferir catálogo/ACL/RLS; não semear amostras artificiais em produção.
4. Integrar com merge commit e SHA esperado; publicar pelo workflow oficial, preservando proveniência.
5. Verificar uma coleta real e uma página administrativa autorizada, sem registrar dados de estudante. Registrar evidências separadas de código/CI e produção.

Rollback de código preserva a tabela; não apagar dados em rollback automático. Retenção deve permanecer ativa ou ser restabelecida por procedimento autorizado. Até a migration e publicação terem evidência, esta documentação não declara a função implantada.

Fontes de implementação: PostgreSQL 17, Row Security Policies e Date/Time Functions; Cloudflare Workers Scheduled Handler. Cadência/retentativas não constituem SLA.

Pendências fora deste lote: agregação de autenticação/RUM, adaptadores de fornecedores, teste funcional protegido com a conta aprovada, baseline e homologação. Não fechar #969 por esta entrega.
