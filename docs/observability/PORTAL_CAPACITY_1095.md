# Banco de dados e conexões — #1095

Entrega incremental de OBS-04/05, sob #969/#1091. Caminho: Centro ADM → Saúde do Sistema → Banco de dados e conexões → Ver banco e conexões.

## Fontes e significado

Consulta PostgreSQL nativa no PORTAL_DB existente, pela fábrica que exige `student_portal_app`. Não é a Metrics API nem a Management API do Supabase e não exige token adicional.

- `pg_database_size(current_database())`: bytes físicos do banco corrente, incluindo todos os schemas. Exibidos em MB decimais (1.000.000 bytes). Não representa somente notas, espaço livre, volume total de disco, Storage, backups ou cota contratada.
- `pg_stat_activity`, filtrada por `usename=current_user`: conexões da conta do Portal em todos os bancos, para corresponder ao escopo do limite de papel. Inclui conexão desta medição e conexões ociosas do pool. Não representa alunos online ou requisições simultâneas.
- `state=active` e `wait_event_type=Lock`: subconjuntos do total; podem se sobrepor e não devem ser somados. Sem query text, PID, client address, nomes ou valores individuais no DTO.
- `pg_roles.rolconnlimit`: limite configurado da conta. -1 vira null/“Sem limite próprio”, não capacidade infinita; limite zero é preservado. Uma observação acima de um limite recentemente reduzido continua válida.
- `max_connections` e soma de `reserved_connections`/`superuser_reserved_connections`: configuração compartilhada do servidor. Não se calcula “vagas livres”, porcentagem do plano ou capacidade de atendimento subtraindo conexões do Portal. Há outros consumidores e camadas de pooling.

Documentação primária verificada na implementação:
- https://www.postgresql.org/docs/17/functions-admin.html#FUNCTIONS-ADMIN-DBSIZE
- https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW
- https://www.postgresql.org/docs/17/runtime-config-connection.html

## Segurança e custo

Endpoint POST `/api/platform/system-health/capacity` aceita somente `{}`. Mesma fronteira de origem oficial, cookie único, autenticação e capabilities `platform.health.read` + `platform.settings.read`, antes de body/RPC/cache. RPC `monitoringCapacity` somente no PortalAdminEntrypoint; self e default não o expõem. Contexto privado valida tenant, capability e idade antes de qualquer resposta, inclusive não configurado/cache.

Uma consulta de catálogos em transação READ ONLY, statement timeout de 1500ms e lock timeout de 250ms. Nenhum SELECT de tabela acadêmica/auditoria, mutação, novo grant, mudança de membership, DDL, secret, binding, serviço, cron ou workflow. O ciclo de conexão mantém os limites e a validação de papel existentes; o prazo HTTP de 3s limita a espera do consumidor, não equivale a cancelamento imediato de uma conexão já em abertura.

Cache em memória por binding/tenant de até 60s, deduplicação concorrente e sem reestampar a observação. Cache por isolate é otimização best-effort, não teto global de consultas. Falha/ausência não são guardadas como sucesso; tentativa manual posterior pode recuperar. Não existe cache persistente ou histórico deste novo tamanho do banco; os históricos de 30 dias já entregues continuam independentes e inalterados.

Navegador não consulta ao montar o painel fechado. Abrir/atualizar são ações explícitas. Sem polling, retry automático, eventos de foco/reconexão disparando rede, fila offline ou armazenamento local. Fechar/navegar/ocultar cancela a leitura e descarta respostas tardias; negar acesso remove números e bloqueia retry. Relógio local só expira a apresentação: após 2 minutos valores deixam de aparecer como medição utilizável. Data da última medição preservada. O resumo periódico básico do ADM preexistente não dispara esta consulta; atualização estudantil permanece manual.

Contrato fechado com estado ok/unconfigured/unavailable, fonte fixa, horário e sete métricas escalares. Números inválidos não viram zero. UI não atribui Normal/Crítico, plano, causalidade, alunos, disponibilidade ou percentis a esta leitura.

## Conferência do lote anterior

Imagens enviadas pelo responsável em 22/09/2026 01:40 UTC mostram histórico e abertura do painel de ocorrências. Isso confirma aquela apresentação, não prova todos os controles/roles nem login estudantil. O texto “Recepção e agregação: pendentes” estava desatualizado e foi corrigido para implementação disponível com cobertura parcial. Ausência de agregados continua sendo ausência de prova de recepção produtiva, não confirmação de normalidade. Nenhum evento falso é criado para preencher a tabela.

## Validação e publicação

Testes: contrato/anti-PII/números/idade; cache/singleflight/falhas; autoridade em cache e sem banco; rota/origem/cookie/capabilities/compatibilidade; HeroUI sob demanda, expiração, negativa, cancelamento e recuperação; PostgreSQL descartável com conexão direta de papel efêmero NOSUPERUSER/NOBYPASSRLS e CONNECT somente; espera real em advisory lock; gates de fábrica e RPC self/ADM no workerd real. A conta real aprovada não participa de testes/CI.

Não há migration produtiva neste lote. Registrar SHA, verify/runtime/Sonar e revisão no PR, seguido de merge commit/fluxo oficial e evidência de publicação. Container sem DNS para GitHub; não alegar execução local nem smoke visual produtivo. Browser plugin não disponível nesta sessão; a leitura das imagens do usuário e testes de componentes não substituem navegador autenticado/mobile real.

## Pendências que esta entrega não encerra

Métricas Cloudflare e Supabase de CPU/memória/tráfego, cota/plano, Metrics/Management API, baseline e limites operacionais reais continuam pendentes. Tokens Cloudflare são mantidos nos passos delimitados do operador GitHub Actions; não se copia credencial de deploy ao runtime. Nova credencial de leitura, provisionamento remoto ou ampliação de permissões exige autorização apropriada. A prova protegida com a conta real permanece separada, sem reset, sessão artificial ou bypass.
