# Prontidão e limites de evidência

## Estado em13/09/2026 — #715 candidata

#702–#714 e contratos complementares #732/#735 estão integrados. Baseline `5699a8ac69687920c6319a325444159ac1334669`, PR737, CI34735341167/34735341164 e deploy34735666281 verdes. Smoke aluno health200/admin público404/ADM health200. Isso não prova os novos entrypoints desta branch; SHA final, CI, publicação e smoke de #715 serão registrados na issue.

## Recursos existentes

Worker student-portal-production, CPU1000ms, plano Workers Paid já existente; nenhum plano novo. Entrada Pages student-portal-edge em aluno.escolaieda.com; GoDaddy CNAME para student-portal-edge.pages.dev, NS preservados. ADM permanece em admin.escolaieda.com. PORTAL_SELF alcança somente PortalSelfEntrypoint; PORTAL_SERVICE do ADM, somente PortalAdminEntrypoint. Sem dados/bindings/secrets em preview. Workers.dev e preview URLs desativados.

Supabase knzzyqgafdkwzjmdrfea, PG17.6 Free; migrations Portal0001–0007 aplicadas, sem reaplicação. PORTAL_DB Hyperdrive46ac2fcb25ad4ad5b5662d536ccd968a sem cache, limite origem5, TLS require, papel student_portal_app. Papel limita10 conexões, statement5s/lock1,5s/idle transaction10s, sem DDL nem escrita acadêmica. PROD_DB ADM476b417597c84b4c994bd36f1a65cb70 preservado.

QR_HMAC_KEYS/PASSWORD_PEPPER são mapas versionados existentes; versão1/base64 de32bytes verificada sem expor valores. TURNSTILE_SECRET_KEY própria. Sitekey pública0x4AAAAAAExp0Fw2x5lR3luX, host aluno. Nenhuma rotação nesta fase. Cursor usa filho HMAC separado da chave QR atual; rotação invalida cursores, não sessões por si só. Nunca reutiliza SESSION_SECRET.

Preflight remoto:0 contas,0 nascimentos,0 acessos habilitados,0 jobs. Inicialização explícita única dos7 defaults em13/09 pelo papel restrito, transação/locks, sem perfis e calendário nulo. Tentativa SET ROLE pelo conector recusada sem commit; conexão TLS direta autenticada como papel existente concluiu INSERT7. Não existe fallback que recria defaults em requisições.

## Provas e lacunas

G-C PASS. H:1691 testes+3 skips históricos,18workerd,55PostgreSQL; concorrência/ACL/locks/KDF/recovery/retention exercitados. [Medições](../../tests/student-portal/load/MEASUREMENTS_V1.md) distinguem CPU real do Worker, memória V8 e limites da amostra.2KDF falhou margem;1KDF p99281,857ms em20 amostras. Limite criptográfico não reduzido. Worker/token temporários removidos.

I candidato: HTTP self/admin, RPC e cron usam serviços reais; limiter antes da conexão, sem double count; IP no mesmo commit; métricas estritas sem PII/URL/SQL. Teste integrado local comprova sessão ADM assinada→adapter→RPC→Hyperdrive local→papel restrito→nascimento/QR/ativação/cookie/self/logout. Identidade sintética assinada não é login Entra real.

**G-B PARCIAL** até verify/CI final, publicação, SSO real→RPC→Hyperdrive, cron remoto, negativas/isolamento e piloto privado6A. Calendário institucional e lista privada de contas/ações não podem ser inventados. Nenhuma distribuição de QR/senha, alteração de notas, reset real ou abertura geral. Turnstile Siteverify com chaves públicas de teste passou em H; widget produtivo positivo/replay continua pendente. Backup gerenciado/RPO/RTO foi adiado; recovery técnico sintético existe e não é restore gerenciado.

## Operação e rollback

PORTAL_SERVING_ENABLED é manutenção externa; não equivale a acesso escolar ou população. Ausente/diferente de true fecha negócio/mutações/materialização; health e diagnóstico ADM autorizado permanecem. Fechar antes de qualquer restore. Preservar chaves/revogações/schema/guarda reset; nunca reativar D1. [Recovery](../../tests/student-portal/recovery/RECOVERY_V1.md) delimita quarentena/reconciliação antes de reabrir.

Cron proposto1/min, até5 reconciliações,1 job e100 expurgos por família; não popula contas. Volume inicial de prova limitado a5 contas por rodada. Backlog>5min/lease falho/expurgo atrasado aparece no health; aumentar capacidade exige medição. Não é promessa de vazão escolar irrestrita. Rate limits regionais600/min e30/sujeito/min, namespaces100715/200715 verificados livres na conta; contador PG por conta continua autoritativo e NAT não é identidade.

Release oficial: serviço Worker→Pages aluno→Pages ADM; verificar head esperado e smoke, sem bypass de checks. Rollback de código preserva schema e dados; gate fecha antes de recovery de dados. Não declarar aceite global com base somente no deploy.
