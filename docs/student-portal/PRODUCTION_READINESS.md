# Prontidão e limites de evidência

## Estado em13/09/2026 — #715 publicada, aceite parcial

#702–#714 e contratos complementares #732/#735 estão integrados. Composição #715 publicada na main `6071d725bbc4a0d1ed89e63e9f11e49852464df8`, PR738/head20450e2163e237ab2bd3f86b43675c7966f0d5d5. Verify1694 PASS+3 skips históricos/18workerd PASS; CI34736731069 e34736731070 PASS, incluindo PostgreSQL17.6 com55 provas nativas+2 smokes compostos. Deploy oficial34737943189 SUCCESS. A tentativa34737296460 foi cancelada após mais de15min em fila, sem runner/steps; uma nova execução oficial publicou o mesmo SHA, sem bypass.

## Recursos existentes

Worker student-portal-production, CPU1000ms, plano Workers Paid já existente; nenhum plano novo. Entrada Pages student-portal-edge em aluno.escolaieda.com; GoDaddy CNAME para student-portal-edge.pages.dev, NS preservados. ADM permanece em admin.escolaieda.com. PORTAL_SELF alcança somente PortalSelfEntrypoint; PORTAL_SERVICE do ADM, somente PortalAdminEntrypoint. Sem dados/bindings/secrets em preview. Workers.dev e preview URLs desativados.

Supabase knzzyqgafdkwzjmdrfea, PG17.6 Free; migrations Portal0001–0007 aplicadas, sem reaplicação. PORTAL_DB Hyperdrive46ac2fcb25ad4ad5b5662d536ccd968a sem cache, limite origem5, TLS require, papel student_portal_app. Papel limita10 conexões, statement5s/lock1,5s/idle transaction10s, sem DDL nem escrita acadêmica. PROD_DB ADM476b417597c84b4c994bd36f1a65cb70 preservado.

QR_HMAC_KEYS/PASSWORD_PEPPER são mapas versionados existentes; versão1/base64 de32bytes verificada sem expor valores. TURNSTILE_SECRET_KEY própria. Sitekey pública0x4AAAAAAExp0Fw2x5lR3luX, host aluno. Nenhuma rotação nesta fase. Cursor usa filho HMAC separado da chave QR atual; rotação invalida cursores, não sessões por si só. Nunca reutiliza SESSION_SECRET.

Preflight remoto:0 contas,0 nascimentos,0 acessos habilitados,0 jobs. Inicialização explícita única dos7 defaults em13/09 pelo papel restrito, transação/locks, sem perfis e calendário nulo. Tentativa SET ROLE pelo conector recusada sem commit; conexão TLS direta autenticada como papel existente concluiu INSERT7. Não existe fallback que recria defaults em requisições.

## Provas e lacunas

G-C PASS. H:1691 testes+3 skips históricos,18workerd,55PostgreSQL; concorrência/ACL/locks/KDF/recovery/retention exercitados. [Medições](../../tests/student-portal/load/MEASUREMENTS_V1.md) distinguem CPU real do Worker, memória V8 e limites da amostra.2KDF falhou margem;1KDF p99281,857ms em20 amostras. Limite criptográfico não reduzido. Worker/token temporários removidos.

I publicado: HTTP self/admin, RPC e cron usam serviços reais; limiter antes da conexão, sem double count; IP no mesmo commit; métricas estritas sem PII/URL/SQL. Teste integrado local comprova sessão ADM assinada→adapter→RPC→Hyperdrive local→papel restrito→nascimento/QR/ativação/cookie/self/logout. Identidade sintética assinada não é login Entra real.

**G-B PARCIAL**: ainda faltam POST do Portal com sessão Entra real→RPC→Hyperdrive e piloto privado6A. SSO real do ADM foi confirmado separadamente; não equivale à prova autenticada da nova API. Calendário institucional e lista privada de contas/ações não podem ser inventados. Nenhuma distribuição de QR/senha, alteração de notas, reset real ou abertura geral. Turnstile Siteverify com chaves públicas de teste passou em H; widget produtivo positivo/replay continua pendente. Backup gerenciado/RPO/RTO foi adiado; recovery técnico sintético existe e não é restore gerenciado.

## Evidências remotas da composição

Worker versão363d8e50-99c5-469d-98d5-a3a9373ecc5c, startup52ms; Pages aluno3ce8c238-c0f0-4056-9296-c201020f83fd e ADM45a82807-1c6c-41fa-980c-98558bd68fac, ambos no SHA6071d725. Configuração remota confirmou bindings nomeados corretos, previews sem serviços, Hyperdrive cache desativado/limite5/papel restrito, CPU1000 e logs de invocação/traces desativados.

Dez smokes HTTP PASS, todos no-store: health200; rota administrativa pública404; sessão/self ausentes401; QR sintético forjado401; schema inválido400; corpo8193bytes413; Origin estrangeira403; hostname Pages de prévia403; POST ADM anônimo401. Não foram enviadas credenciais de alunos reais.

Cron observado em2026-09-13T04:36:43Z: cleanup ok,4728ms/8 queries/1 row; publication ok,3960ms/12 queries/9 rows; ambos sem lock/statement timeout. São métricas sanitizadas de uma execução, não percentis de carga nem prova de publicação de boletins reais. A captura temporária foi encerrada.

SSO Entra real e navegação ADM na release publicada PASS. Prévia de reset2026 carregou contagens agregadas e confirmação permaneceu desabilitada; nenhum reset executado. Abas próprias fechadas. Isso comprova a prévia e o SSO, não substitui prova funcional privada de importação/boletins/Portal. Pós-verificação SQL:0 contas,7 defaults,0 acessos habilitados; população continua false e calendário nulo.

Próximas provas dependentes: responsável coordena privadamente contas/ações6A e datas institucionais; executor realiza roteiro delimitado sem notas/reset/distribuição de credenciais. Nascimento não confirmado de teste não permite ativação; não inventar confirmação produtiva. Widget positivo/replay exige interação legítima e a API Portal autenticada ainda requer prova dedicada. Interface P2 permanece fora de escopo.

## Operação e rollback

PORTAL_SERVING_ENABLED é manutenção externa; não equivale a acesso escolar ou população. Ausente/diferente de true fecha negócio/mutações/materialização; health e diagnóstico ADM autorizado permanecem. Fechar antes de qualquer restore. Preservar chaves/revogações/schema/guarda reset; nunca reativar D1. [Recovery](../../tests/student-portal/recovery/RECOVERY_V1.md) delimita quarentena/reconciliação antes de reabrir.

Cron publicado1/min, até5 reconciliações,1 job e100 expurgos por família; não popula contas. Volume inicial de prova limitado a5 contas por rodada. Backlog>5min/lease falho/expurgo atrasado aparece no health; aumentar capacidade exige medição. Não é promessa de vazão escolar irrestrita. Rate limits regionais600/min e30/sujeito/min, namespaces100715/200715 verificados livres na conta; contador PG por conta continua autoritativo e NAT não é identidade.

Release oficial: serviço Worker→Pages aluno→Pages ADM; verificar head esperado e smoke, sem bypass de checks. Rollback de código preserva schema e dados; gate fecha antes de recovery de dados. Não declarar aceite global com base somente no deploy.
