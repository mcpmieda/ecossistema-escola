# Prontidão e limites de evidência

## Qualidade integrada #758 — candidata

A entrega anterior #757 foi integrada em `dda837fddeb32d9eefd2b523975fd36fbd71e6dc`, PR #775, deploy oficial `34793329758` SUCCESS. Mãe #742 em 15/18 ao iniciar #758. O [handoff #757](https://github.com/mcpmieda/ecossistema-escola/issues/757) registra 2014 PASS + 3 skips históricos, 21 workerd e 77 provas PostgreSQL em CI, além dos limites de latência da execução local anterior. Os checkpoints abaixo preservam seu contexto histórico.

#758 acrescenta isolamento HTTP composto, persistência de revogação após reinício e regressões de artefatos/contraste. Os dois defeitos visuais têm ownership nominal registrado na issue: anúncio de preparação do QR e tokens de ação/risco restritos ao Portal. O trabalho herdado na branch foi preservado; resultado final exige verify, PostgreSQL, revisão, CI no head e deploy oficial, com SHA e métricas no handoff da [#758](https://github.com/mcpmieda/ecossistema-escola/issues/758).

Carga exclusivamente em PostgreSQL descartável loopback, sem aumentar CPU/plano nem enfraquecer scrypt. As medições remotas da #714 continuam datadas em `tests/student-portal/load/MEASUREMENTS_V1.md`; não são nova medição faturada da P2. Reinício compatível não equivale a restore gerenciado; rollback conserva schema, chaves, dados e revogações, pelo publicador oficial.

**G-B PARCIAL e G-P pendente.** Não há alteração de nascimento/calendário legítimos, população, acesso escolar ou autoridade imported-source. Zoom nativo, leitor de tela, câmera/impressão física e aceite produtivo não são deduzidos de viewport, DOM, mocks ou CI. Provas reais da #759 e abertura deliberada da #760 continuam obrigatórias. Nenhuma entrega é declarada publicada pela simples presença deste registro na branch.

## Baseline publicada #756 e candidata #757

Main `270ab8a442e833cd089d4d139bacbef55c7c52a0`, PR #774, deploy oficial `34788638736` SUCCESS. Pages aluno `6b4502b5-b9a9-4e52-9f56-137aa0ef563b` e ADM `dc3faec0-1ec2-4771-b509-2657e1ba4f2b` verificados no mesmo SHA, com 12 smokes HTTP aprovados. Verify anterior: 1990 PASS + 3 skips históricos/21 workerd; CI PostgreSQL 17.6: 55 + 2 + 1 + 16 PASS. Fila 14/18 concluídas; #757 monta o produto candidato e registra seu próprio head, CI e publicação no handoff.

A inspeção SQL produtiva abaixo é a observação datada da #742, não uma nova consulta. A integração usa PostgreSQL 18.6 descartável local e 17.6 em CI; massa, nascimento confirmado, credenciais e calendário de teste existem somente nesse ambiente inventado. Selo sintético não comprova Entra; proxy local não comprova cookie HTTPS/dispositivo; teste de PNG/PDF não comprova impressão física. G-B continua PARCIAL até #759, e abertura deliberada pertence à #760. Nenhum deploy altera automaticamente os sete campos de configuração, população ou permissões acadêmicas.

## Checkpoint histórico de preparação P2 — #743, 13/09/2026

Main `9066c04d01b8d62bf59e1de0b51c6ce4c567c668`, PR741 integrada, workflow oficial34749391273 SUCCESS; Pages aluno e ADM consultados na API no mesmo SHA. IDs de publicação: aluno e8a68afa-47d9-46f8-a8fc-40b1be911330; ADM46356cc2-986b-4b53-9eea-5fd4bb6d08ae. P1 #701/#715 encerrada; nenhum frontend P2 nesta entrega documental. Os checkpoints abaixo preservam suas datas, não substituem este estado.

Auditoria autenticada somente leitura para #742: projeto Supabase ACTIVE_HEALTHY, PG17.6, schema gradebook30 tabelas/student_portal20. Roles backend sem superuser/createdb/createrole/bypassrls; zero grants de tabelas a PUBLIC/anon/authenticated nessa consulta. Portal sem vínculos órfãos, três contas/nascimentos unconfirmed-test, zero sessões/acessos habilitados/revisões publicadas, population=false. Calendário escolar contém objeto com oito marcos nulos; calendários provisórios só nos perfis do piloto. Nenhum dado pessoal foi selecionado para evidência pública.

Cloudflare: PORTAL_DB cache desativado, role student_portal_app, limite de origem5; Worker cpu1000ms e serving=true (não é liberação escolar). PORTAL_SELF/PORTAL_SERVICE continuam nos entrypoints separados; preview sem service binding observado. Widget managed no host aluno, sem prova produtiva positiva nesta auditoria. Secrets inspecionados apenas por nome; logs de invocação/traces desativados, logs técnicos amostrados habilitados. Não alegar observabilidade toda desativada.

Capacidade/codecs/licenças serão verificados em #744; assinatura/uso/cotas atuais antes da carga #758. Acesso HeroUI Pro não comprovado; base HeroUI3.2.4 MIT disponível. Browser/Entra/widget/dispositivo/impressora são provas específicas da #759, sem retomar diagnóstico antigo nesta preparação. Backup gerenciado/RPO/RTO continua adiado.

PA-DEC-007 autoriza execução direta sequencial com identidades dos títulos preservadas. G-C P1 aprovado; deltas#745/#746 são locais a seus consumidores. G-B PARCIAL; qualidade#758 e checklist#759 antes de G-P/operação#760. Datas/nascimento legítimos/distribuição/abertura não são inferidos de deploy. #743 ainda registra trabalho documental candidato: verify/CI/merge/deploy desta entrega ficam no handoff, não são presumidos pelo SHA de baseline.

## Encerramento técnico P1 — PA-DEC-006

O responsável aceitou adiar as provas finais de navegador para o encerramento da Parte2 e pediu concluir a fila atual. #715 e #701 encerram o escopo técnico já implementado/publicado e a coordenação, preservando G-B PARCIAL. As pendências anteriores abaixo são checkpoints históricos; a lista vigente de aceite futuro está em TEST_MATRIX. Não existe liberação escolar ou PASS implícito pelo fechamento de uma issue.

Baseline publicada antes deste encerramento: PR740/mainc4f8897505e3f5c236227c9bf56f48751df90c05, deploy34745755388 SUCCESS, verify1694PASS+3skips históricos/18workerd e CI55PostgreSQL+2smokes PASS. Dez smokes HTTP pós-publicação PASS. Esta entrega modifica apenas documentação, sem repetir DDL, população, rotação ou mutações de teste.

Estado preservado do piloto:3contas, nascimento2000 não confirmado e calendários provisórios nos3 perfis;0acessos/sessões/períodos publicados,populaçãofalse. A passagem para P2 deve preservar essas restrições até o aceite institucional.

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

## Piloto privado em13/09/2026 — atualização posterior à PR739

O responsável autorizou selecionar uma amostra da6A e testar as ações; forneceu calendários e autorizou2000 temporário e datas complementares de teste. Foram criados somente3 perfis por adapter existente/papel restrito, com locks e revisões, sem habilitar população global. [Handoff sanitizado](https://github.com/mcpmieda/ecossistema-escola/issues/715#issuecomment-5651945258).

Nos3 perfis passaram leitura oficial/revisão obsoleta, nascimento2000 unconfirmed-test, emissão/reimpressão/regeneraçãoQR, bloqueio/desbloqueio/CAS, revogação vazia como no-op, override/herança, leitura dos6 períodos, publicação/materialização/atualizaçãoT1, espera deT2 até14/09 e retirada das publicações. QR válido na rota produtiva solicitou PIN;2000 não confirmado foi recusado401 sem cookie. Não é prova de login positivo. Escritas administrativas utilizaram os serviços diretamente por operador técnico autenticado no PostgreSQL; não representam sessão Entra ou prova da API privada por RPC.

Disputa de lock55P03 no terceiro perfil interrompeu o primeiro roteiro; fechamento verificado antes da repetição. Retry limitado no harness sem mudar limites produtivos concluiu o caso. O resultado é de amostra funcional, não medição de carga. Dados acadêmicos não foram escritos. Nenhum QR/senha foi distribuído ou registrado nas evidências.

Calendário apenas nos3 perfis:matrícula02/02,início23/02,fins inclusivos15/05,31/08,15/12,recuperação16–22/12; boletins26/05 e14/09,conselho final23/12. Fins convertidos para meia-noite seguinte. Horários08h,divulgaçãoT3 em16/12,recuperações/resultado em24/12 e limite do ano31/12 são complementos provisórios de teste. O contrato usa fimT1 como começoT2, sem marco separado para o intervalo16–17/05. Não tratar esses complementos como calendário institucional aprovado.

Estado após o piloto:3 contas,3 nascimentos2000/unconfirmed-test,0 acessos habilitados,0 sessões,0 períodos publicados,populaçãofalse. Calendário escolar continua nulo; overrides de calendário e anos de teste permanecem nos3 perfis para continuidade. Esta observação substitui as contagens0 contas dos checkpoints históricos acima.

G-B continua PARCIAL: API Portal com sessão Entra real, widget produtivo positivo/replay e ativação/login reais não foram comprovados. Nascimento fictício não será promovido a confirmado. Fluxos positivos de senha/sessão e destrutivos continuam delimitados à massa sintética; nenhuma execução de reset acadêmico. A autorização de amostra/datas já foi atendida, não é mais bloqueio genérico.

## Operação e rollback

PORTAL_SERVING_ENABLED é manutenção externa; não equivale a acesso escolar ou população. Ausente/diferente de true fecha negócio/mutações/materialização; health e diagnóstico ADM autorizado permanecem. Fechar antes de qualquer restore. Preservar chaves/revogações/schema/guarda reset; nunca reativar D1. [Recovery](../../tests/student-portal/recovery/RECOVERY_V1.md) delimita quarentena/reconciliação antes de reabrir.

Cron publicado1/min, até5 reconciliações,1 job e100 expurgos por família; não popula contas. Volume inicial de prova limitado a5 contas por rodada. Backlog>5min/lease falho/expurgo atrasado aparece no health; aumentar capacidade exige medição. Não é promessa de vazão escolar irrestrita. Rate limits regionais600/min e30/sujeito/min, namespaces100715/200715 verificados livres na conta; contador PG por conta continua autoritativo e NAT não é identidade.

Release oficial: serviço Worker→Pages aluno→Pages ADM; verificar head esperado e smoke, sem bypass de checks. Rollback de código preserva schema e dados; gate fecha antes de recovery de dados. Não declarar aceite global com base somente no deploy.
