# Prontidão e limites de evidência

## Estado desta entrega

#702 entrega schemas/DTOs/ports/fixtures/docs; não entrega runtime/auth funcional nem altera site. Testes/CI/SHA/PR e merge efetivo registrados no handoff da issue. G-V PARCIAL; G-C aguarda #703; G-B não executado. Nada dessa fila inicia automaticamente.

## Inventário auditado em12/09/2026

Main ad38a7847eb49462818dca554e225155a57f49b4, PR700; CI34697626920 e deploy34697784338 anteriores verdes. Cloudflare conta40cef24b2a2a1df8ab3d974dcafb2c03, Pages ecossistema-escola/admin.escolaieda.com ativo, deployment4156bca7-89d7-4bcc-b585-1c5af2bbc782. Worker Portal/PORTAL_SERVICE/PORTAL_DB/Turnstile ausentes. PROD_DB no-cache476b417597c84b4c994bd36f1a65cb70, gradebook_app; outro Hyperdrive cacheligado/postgres não é recurso Portal.

Supabase knzzyqgafdkwzjmdrfea, Free, sa-east-1, PG17.6; schema Portal/role Portal ausentes. gradebook30 tabelas/247 colunas/221 constraints/66 índices/52 FKs; DB44.305.555 bytes/max_connections60/17 observadas (amostra, não budget). Ledger15 registros até year_reset_acl_v1. Segurança advisor vazio, performance25 FKs sem cobertura: não é prova completa nem autorização para ajustar BN genericamente. Nenhuma PII incluída. Massa2026/6A privada só na etapa autorizada.

DNS NS GoDaddy ns43/ns44.domaincontrol.com; alunoNXDOMAIN; nenhuma zonaCF visível. Billing/subscriptions negados403/10000: plano Cloudflare/consumo INACESSÍVEL, não inferir a partir de usage_model. SSO browser autenticado ainda não provado; app/grupo/capability foram lidos via CLI/código. Local Windows/Git/Node/npm/gh/az/Wrangler/SupabaseCLI disponíveis; npmci instalado somente ao executar702. ServidorPG descartável/capabilities de CHAT ONLINE A REVALIDAR pelo executor. Auditoria completa e fontes em #701.

## Gates

G-C exige C+B integrados, contratosHTTP/RPC/BN+fixtures, mapaestados/calendário/ACL/locks/produtores e ownership; testes positivos/negativos/limite e DAG sem ciclos. Libera autoria paralela, não população ou divulgação. #702 sozinha não passa G-C.

G-B exige #704…#715: schema/ACL/driverPG real; Worker/PORTAL_DB sem cache/RPCprivado/TLS/preview; guardaReset antes contas; auth/KDF/revogação/concorrência; publicação/jobs/retention/carga/recovery; verify no SHA final e smoke 6A privado. Falta de prova fica PARCIAL/BLOQUEADO localizada. G-P/telas/câmera/print/abertura geral são posteriores, sem issuesP2 aqui. Backupgerenciado/RPO/RTO não bloqueiamP1.

## Sequência e rollback

ContratosC/B→D schema e R preparação→replay PG sintético→DDL aditivo/role/Hyperdrive/Worker inerte→binding compatível→DNS real→guard G publicado→S perfis/hooks→serviçosA/P/N/L/U→M→H harness→I composição/release Worker antes do consumidor/smoke. R confirma plano/limites reais antes de provisionar; novo custo precisa autorização pontual, sem travar autoria independente. Nunca reduzir KDF para caber em cota. Não compartilhar segredos/schemas de produção com preview.

Rollback #702: reverter somente contratos/docs se ainda sem consumidores; depois consumidores existirem, preservar versões compatíveis e corrigir aditivamente. Não reverter segurança/guard ativo, apagar dados ou retomar D1. Rollback runtime futuro preserva schema aditivo/chaves/estado de revogação; restore antigo deve recusar sessões antes da reabertura. Nenhum reset real, dumpPII, nova assinatura/NS/Entra ou publicação de credenciais nesta entrega.

Bloqueios humanos localizados: login quando exigido; prova de billing; preenchimento de datas/nascimento reais; coordenação privada6A. GoDaddy CNAME autorizado só quando #705 criar/associar destino real, seguido do encerramento de automação. KDF/TTL/SQL/locks/RPC são responsabilidade técnica do executor.
