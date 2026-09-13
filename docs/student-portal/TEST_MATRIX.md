# Matriz de requisitos e provas

## Aceite integrado obrigatório ao encerrar a Parte2 — PA-DEC-006

As issues técnicas P1 podem encerrar conforme a decisão do responsável. As provas abaixo continuam PENDENTES; devem entrar na futura fila P2 e bloquear a liberação aos alunos. A evidência deverá registrar versão publicada, ambiente, resultado e limitações, sem PII/credenciais.

- [ ] Sessão Entra real no ADM → API Portal → binding privado → PostgreSQL, com autorização e negativas.
- [ ] Widget Turnstile produtivo positivo, token expirado/reutilizado e indisponibilidade, com interação legítima.
- [ ] Telas: QR → PIN com nascimento confirmado → criação de senha → login → leitura autorizada → saída.
- [ ] Sessão persistente/curta, expiração, logout, bloqueio/desbloqueio, revogação, regeneração de QR e resets em massa sintética.
- [ ] Visibilidade por período, datas, publicação/atualização/retirada e ausência de dados de terceiros no navegador.
- [ ] Regressões funcionais de importação, boletins e prévia de reset, preservando dados acadêmicos e sem reset real.
- [ ] Encerrar o piloto: substituir/remover dados provisórios de teste e confirmar configuração institucional antes de liberar acesso.

Responsável técnico: integrador da Parte2; responsável institucional: confirma dados e calendário definitivos. Não repetir mutações em alunos reais para demonstrar ações destrutivas. G-B continua parcial; checklist vazia não é aprovação.

## Piloto privado parcial da6A

Em13/09/2026,3 perfis autorizados passaram pelas provas delimitadas no [handoff715](https://github.com/mcpmieda/ecossistema-escola/issues/715#issuecomment-5651945258) e em PRODUCTION_READINESS. Transporte de leitura/autenticação negativa público real; administração por serviços diretos no papel PostgreSQL restrito, sem atribuir identidade Entra ao operador técnico. PIN fictício não confirmado foi recusado; login positivo/widget/API privada autenticada continuam pendentes.55P03 inicial foi seguido de fechamento e repetição delimitada; não se declara ausência de contenção. Estado final0 acessos/sessões/publicações e3 perfis com nascimento de teste. Nenhuma escrita acadêmica.

## Release I publicada — evidência atual

PR738/main6071d725bbc4a0d1ed89e63e9f11e49852464df8, deploy34737943189 SUCCESS. Verify1694 PASS+3 skips históricos/18workerd PASS; CI PostgreSQL17.6:55 nativos+2 smokes compostos PASS. Dez smokes HTTP remotos PASS; cron cleanup/publication ok em2026-09-13T04:36:43Z. SSO ADM e prévia de reset sem execução PASS. Inventário e limites detalhados em [PRODUCTION_READINESS](PRODUCTION_READINESS.md).

O quadro seguinte registra as pendências anteriores à publicação: compatibilidade I, release/cron/preview e métricas remotas foram exercitados acima. Continuam pendentes API Portal autenticada por Entra real, widget produtivo positivo/replay, piloto privado6A e regressões funcionais privadas de importação/boletins. G-B permanece PARCIAL.

## EvidÃªncias acumuladas e gate I (13/09/2026)

Baseline H main5699a8ac69687920c6319a325444159ac1334669: verify1691PASS+3skips histÃ³ricos,18workerdPASS,55PostgreSQL18.6 local/17.6CI PASS; PR737,CI34735341167/34735341164,deploy34735666281. Nenhum skip Ã© aprovaÃ§Ã£o.

| Grupo | EvidÃªncia de implementaÃ§Ã£o | ValidaÃ§Ã£o integrada restante |
|---|---|---|
| P1-01 | Contratos #702/#703/#732/#735, schemas/CAS/unknown keys | Compatibilidade runtime I |
| P1-02 | Migrations0001â€“0007, ACL/locks/reset nativo | Hyperdrive via rotas compostas |
| P1-03 | DNS/TLS/billing/Worker/Pages privados #705 | Release I, cron remoto/preview |
| P1-04 | Lifecycle/polÃ­ticas/birth CAS/per-item #707â€“709 | Piloto privado; nenhuma data institucional inventada |
| P1-05 | Scrypt real/QR/revogaÃ§Ã£o/risco/sessÃ£o #711/#714 | Widget produtivo e fluxo real autorizado |
| P1-06 | Fonte oficial/revisÃµes/jobs/leases/auto/manual #710/#712/#714 | PerÃ­odo autorizado no piloto privado |
| P1-07 | Admin schemas/cursors/SSO adapter #713; IP #735 | Entra realâ†’Pagesâ†’RPCâ†’PG |
| P1-08 | IP/retention/NAT/carga/CPU/recovery #714 | ComposiÃ§Ã£o de mÃ©tricas/cron I |
| P1-09 | Smoke local real em smoke/composition.postgres.ts | SHA final/CI/deploy/SSO/6A e G-B |

O smoke local I utiliza seal verificado do ADM com identidade inteiramente sintÃ©tica, WorkerEntrypoint real, binding Hyperdrive local e student_portal_app: nascimento/QR/ativaÃ§Ã£o/cookie/me/logout e cron. NÃ£o chama isso de Entra real. boundaries-v1.test.ts usa mock sÃ³ para provar que requisiÃ§Ã£o negada nÃ£o abre conexÃ£o; nÃ£o sustenta aceite de banco. O registro abaixo Ã© a matriz original de requisitos da #702, cujos testes posteriores estÃ£o agora nos mÃ³dulos correspondentes.

Suite executÃ¡vel #702: tests/student-portal/contracts/contracts-v1.test.ts. Fixtures inventadas em shared/student-portal-contracts/fixtures-v1.ts; nÃ£o derivadas da massa real. O nome e resultado da execuÃ§Ã£o efetiva/commit/ambiente vÃ£o no handoff #702. A tabela distingue contrato testÃ¡vel aqui e prova de implementaÃ§Ã£o futura: nÃ£o sÃ£o equivalentes.

| Requisito / origem | Testes #702 | Prova posterior |
|---|---|---|
| vÃ­nculo/2026/sem nome AD-01/02 | identity and envelope: ano/ID/unknown keys/escopo | #703/#704/#707 FK/unique/movimentos reais |
| HTTP erro/paginaÃ§Ã£o cap. 8 | bounds pagination and public errors | #713 limites bytes/cursor/authz |
| PIN4/senha6/confirm cap. 4 AD-07 | authentication boundary | #711 KDF/locks/replay/cookies |
| QR mesma origem/rota/version cap. 4 | constrains QR origin | #711 HMAC/rotaÃ§Ã£o/reprint; nÃ£o provar assinatura pelo regex |
| calendÃ¡rio/risco AD-04â€¦07 | calendar, inheritance and birth | #708 resoluÃ§Ã£o efetiva/datas/efeito imediato; #714 carga |
| nascimento completo/CAS/clear/batch AD-03 | rejects incomplete; explicit clear/batch | #709/#711 corridaPIN/desafio/sessÃ£o |
| autoridadeBN/N-C/0/R-R/assistido cap. 5 | preserves zero/NC/absent/RR | #703/#710 fonte oficial/EXPLAIN/sem N+1 |
| admin completo/privacidade cap. 8/16 | parses all mutation operations; safe responses | #713/#715 Entraâ†’RPC/IDOR/CSRF/contexto falso |
| QR trÃªs modos cap. 4/17 | three print modes | #713 autorizaÃ§Ã£o/lote; PDF/cÃ¢mera fÃ­sica P2 |
| publicaÃ§Ã£o cap. 5 AD-05/06 | self strict/no-publication/partials absent | #712/#714 version/manual/auto-update/race/despublicaÃ§Ã£o |
| schema/ACL cap3 | tipos/ports, sem DDL nesta issue | #704/#705 PG real/replay/ACL+/âˆ’/rollback |
| reset opÃ§Ã£o A | comando links-close distinto de account-reset | #706/#707 multiconexÃ£o/resetÃ—create/import/close/deadlock |
| jobs/revisÃµes cap. 5/7 | ports versionados | #707/#712/#714 flushV11/crash/retry/lease |
| retenÃ§Ã£o90d/12m cap. 6/7 | DTO restrito/auditoria | #714 limpeza verificÃ¡vel/IP/telemetria sem secrets |
| recovery cap7 AD-backup | contrato sem fallbackD1 | #714 chaves/restauraÃ§Ã£oantiga/revogaÃ§Ãµes; gerenciado adiado |
| isolamento/nodepsUI cap. 18 | typecheck contratos semReact/runtime | #705/#715 driverWorker/TLS/preview/BNregression |

Cada cenÃ¡rio de seguranÃ§a exige positivo/negativo/limite e regressÃ£o de defeito. #704â€¦#715 atualizam seus testes e entregam delta documental ao integrador, sem disputar arquivo central. CI usa Node22; execuÃ§Ã£o local desta entrega Node24.16.0/Windows deve ser identificada. verify inclui lint/types/test/build; CI final no SHA esperado antes de merge. Teste omitido/skip nÃ£o vira evidÃªncia. Sem dados reais em outputs pÃºblicos. Nenhum G-B por mocks/PGlite: PostgreSQL descartÃ¡vel/mÃºltiplas conexÃµes/Worker/Hyperdrive/browser reais exigidos nas entregas designadas.
