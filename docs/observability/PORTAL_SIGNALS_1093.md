# Entrada e carregamento — #1093 / #1091 / #969

## Escopo

Observações HTTP de challenge, login, ativação, sessão e leitura de dados. Somente operação fixa, classe do status e duração até 60 segundos entram na medição; corpo, cookie, QR, senha, IP, URL, nome e nota nunca são copiados. Resposta original preservada. 401/403 e demais 4xx são recusas, não indisponibilidade; 429 é limite; 5xx é falha. Uma consulta de sessão anônima pode legitimamente retornar 401. Challenge respondido não comprova login. HTTP 200 não prova conteúdo publicado nem renderização.

No navegador, falhas de módulo, renderização e leitura produzem apenas o contrato sanitizado existente. O cliente envia no máximo uma vez por categoria, três vezes por carregamento da página, sem cookies, referrer, fila offline, retry, coleta contínua ou identificação persistente. Reportar não recarrega notas. O receptor exige origem exata, limita bytes/tempo/frequência e descarta release/correlationId antes de agregar. Relatos de navegador são não confiáveis e não são prova de defeito no servidor. Falhas anteriores ao carregamento do pacote principal ou impossibilidade total de rede não podem ser reportadas por esse cliente.

## Custo e armazenamento

Reusa `PORTAL_LIVE` e a instância administrativa `admin:2026`, sem classe, binding, cron, serviço, secret ou plano novos. Métodos RPC internos não são expostos no endpoint HTTP/self. O fluxo de WebSockets existente é preservado; o Portal estudantil continua manual.

Um RPC best-effort é enviado por solicitação dos cinco tipos monitorados, fora do resultado da operação. O buffer armazena somente até quatro janelas de cinco minutos e combina contadores em memória. Checkpoint SQLite de uma linha, no máximo uma tentativa a cada 30 segundos com alterações; não existe uma escrita PostgreSQL por solicitação/aluno. Máximo por categoria de navegador: 60 relatos por janela; por operação/resultado de servidor: 1.000. O símbolo `+` indica saturação. Duração de 60.000 ms representa 60 segundos ou mais. Dados atrasados/futuros e campos livres são recusados.

O limite HTTP do navegador usa chave separada no binding de rate limit existente, sem consumir a chave de login. Não é promessa de custo zero: RPCs, processamento e armazenamento consomem as cotas existentes, com trabalho de persistência limitado. Não contratar ampliação sem autorização.

## Cobertura parcial — não usar como totalizador

Reinícios/hibernação antes do checkpoint podem perder observações recentes, inclusive repetidamente em baixo tráfego. Falha de RPC, saturação, interrupção do coletor ou intervalo superior ao buffer também podem causar perda. O DTO e a UI são explicitamente `coverage=partial`; nenhuma quantidade é apresentada como total de alunos/acessos, e não se calcula taxa de erro, uptime, percentil ou duração de incidente. Ausência de registros não significa Normal. A indicação de recusa/falha descreve somente respostas/relatos recebidos.

## Consolidação e retenção

O cron existente chama `portalSignalsScheduledV1` somente nas marcas de cinco minutos. Snapshot do buffer, limpeza e gravação PostgreSQL são independentes do painel e de PORTAL_SERVING_ENABLED. A falha do buffer não impede limpeza PostgreSQL; a limpeza em transação própria não é desfeita por falha de gravação posterior.

Tabela privada `system_health.portal_signal_v1`, arquivo de migração lógico `migrations/observability/0002_portal_signals_v1.sql`. Fonte/resultado são enums fechados, demais campos são horários, contagens, duração e saturação; sem JSON livre armazenado no PostgreSQL. O buffer SQLite contém somente o mesmo contrato fechado serializado. Retenção de 720 horas pelo início da janela; leitura exclui vencidos mesmo se manutenção atrasar, exclusão física em lotes de 500. Não altera auditoria de segurança ou dados acadêmicos.

Snapshots absolutos são gravados em um comando em lote, com chave (janela, fonte, resultado); repetições não somam novamente e contadores menores não substituem valores maiores. A hora do snapshot é conferida contra o banco. `recorded_at` é atribuído pelo banco e não pode ser fornecido/alterado pelo runtime. O papel existente recebe somente SELECT/DELETE, INSERT técnico e UPDATE dos contadores na tabela nova. RLS ativa; nenhum acesso novo a tabelas preexistentes nem permissões para API roles/Gradebook.

## Consulta administrativa

POST `/api/platform/system-health/signals`, JSON fechado `{before:null|janelaUTC}`. Reaproveita origem, cookie, autenticação e as duas capabilities da Saúde do Sistema. RPC exclusivo `PortalAdminEntrypoint.monitoringSignals`. Contratos anteriores permanecem iguais durante backend-first. Backend sem método/tabela informa não configurado.

Centro ADM → Saúde do Sistema → Entrada e carregamento → Ver ocorrências. Leitura sob demanda; 12 janelas por página, sem cortar as categorias da última janela. Cursor exclusivo. Nenhum polling novo. Fechar, desmontar ou perder a identidade cancela a leitura; 401/403 elimina dados e bloqueia novas tentativas daquele leitor. Relógio local indica consulta desatualizada sem rede. Janelas e resultados ficam sempre datados.

## Validação e implantação

CI deve executar testes de contrato/buffer, anti-PII, receptor, resposta original, erro de telemetria, cancelamento, frontend real, RPC/SQLite em workerd e PostgreSQL nativo descartável com RLS, grants mínimos, concorrência, monotonicidade, retenção e paginação. Usar gates do head final, revisão, migração aditiva e postflight antes de merge commit/publicação oficial. Registrar evidências na PR; arquivo não prova implantação.

A CLI Supabase não está instalada no ambiente desta execução; mantém-se o diretório/numeração lógica já existentes no repositório, com aplicação remota rastreada pelo canal MCP após gates. Não criar branch Supabase paga. Smoke autenticado administrativo e prova com a conta real são separados; não gerar sessão artificial, resetar senha ou inserir amostras falsas em produção. #969 permanece aberta para homologação, fornecedores e demais pendências reais.

Referências técnicas verificadas: Cloudflare Durable Objects, SQLite Storage API e Access Durable Objects Storage. SQL usa o contrato PostgreSQL existente e privilégios restritos; não altera o modelo de autenticação.
