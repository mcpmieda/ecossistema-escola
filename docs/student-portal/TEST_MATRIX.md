# Matriz de requisitos e provas

## Disposição final da Parte 2 — #759/#760

| Grupo | Estado final | Evidência e limite |
| --- | --- | --- |
| Entra ADM → API privada → Worker/Hyperdrive/PostgreSQL | APROVADO | Operações administrativas reais do piloto, suíte integrada e CI; negativas automatizadas permanecem delimitadas aos ambientes declarados |
| Redefinição, QR, PIN, criação de senha, entrada, saída e reentrada | APROVADO | Fluxo produtivo repetido pelo responsável após o deploy final |
| Expiração e indisponibilidade | APROVADO | 401 expira para a entrada; 403/503/rede não simulam logout; 20 recargas ADM sem regressão |
| Revogação e fechamento do piloto | APROVADO | acesso habilitado=0, sessões válidas=0, períodos publicados/pendentes=0, população=false |
| Regressões BN/Portal e concorrência PostgreSQL | APROVADO | 2072 testes, 3 skips históricos, 21 workerd, 87 composições PostgreSQL e CI verde |
| Câmera física, impressão física, Narrador e matriz ampla de dispositivos | ADIADO | dispensa/adiamento explícito; nenhum PASS inferido de DOM, PDF ou viewport |
| Widget produtivo adversarial: expiração/replay/indisponibilidade | ADIADO | caminho positivo incluído no login real; negativas automatizadas não viram interação produtiva legítima |
| Backup gerenciado/RPO/RTO | FORA DA GARANTIA | recovery técnico descartável existe; não há promessa de restore gerenciado |

G-B é aceito com essas limitações. G-P aprova a release técnica fechada por política, sem abrir a escola. Uma futura abertura deve executar apenas as provas dependentes do novo escopo e da configuração institucional então autorizada.

## Publicação e autoUpdate — #1112

`admin/import-auto-update.postgres.ts` prova em PostgreSQL nativo: primeira publicação explícita; revisão nova vira `update-pending` com autoUpdate desligado; ligar autoUpdate serve a revisão mais nova imediatamente; desligar congela a última revisão; update manual só é aceito quando a pendência existe; retirada explícita não é ressuscitada por importação. `publication/publication-v1.test.ts` aplica a mesma restrição ao caminho legado de compatibilidade e mantém concorrência/retirada sobre uma revisão realmente pendente. `ui/publication/student-publication-v1.test.ts` prova que a UI não oferece atualização manual com autoUpdate ligado nem republicação sem revisão nova e usa os rótulos `Publicar notas` / `Atualizar notas publicadas`.

## Contenção de autenticação — #782

`runtime/migrations.postgres.ts` acrescenta sobreposição real: login pausado após lock de conta permite login/sessão/Self/logout de outra conta; snapshot de reconciliação não serializa login; job de publicação pausado permite transação de outra conta. `load/paused-query-v1.ts` apenas pausa depois da query real, sem substituir SQL/resultados. Testes existentes preservam ativação única, falhas concorrentes sem perda de contador, reset/bloqueio/rotação, revogação, leases/CAS/publicação e barreiras de reset/timeout. `persistence/postgres-persistence-v1.test.ts` recusa promoção de lock e escrita de vínculo/revisão compartilhada. PGlite verifica a guarda; somente PostgreSQL nativo prova contenção. Gates/ambiente/SHA/limites efetivos na #782, sem presumir ausência universal de indisponibilidade.

## Recuperação de conexão — #786

`runtime/database-v1.test.ts` prova que uma falha transitória antes da validação do papel abre um cliente novo e executa a operação exatamente uma vez. Falha dentro da operação nunca é repetida; papel inesperado fecha a conexão e falha sem nova tentativa. A recuperação continua limitada a duas aberturas, preserva `max: 1`, timeouts, TLS do binding, papel restrito e erro sanitizado. Ela não reproduz autenticação, derivação de senha, transação ou escrita. A contenção produtiva do Hyperdrive e a capacidade do PostgreSQL exigem evidência remota separada.

## Retomada de teclado e zoom #758

Base publicada `83e4b346d47d7a5c6b97a7e512e2ccb5e2ceb035` (PR #776, deploy34800038404). A aba pública aberta manualmente pelo responsável permite inspeção e interação; a falha `ERR_BLOCKED_BY_CLIENT` foi reproduzida ao abrir nova aba pela automação, não ao ler a aba existente. Nenhuma proteção foi alterada. No login público, zoom200% confirmado pelo responsável e pela mudança DPR1,25→2,5/largura1142→571; controles legíveis, sem overflow externo. Esse resultado não presume zoom das notas autenticadas nem leitura assistiva efetiva.

O teste de teclado encontrou perda de foco no atalho de conteúdo: navegação por fragmento dispara `popstate`, revalida a sessão e remonta o shell. A correção focará o `main` sem navegar no histórico, preservando as guardas de retorno/expiração. `ui-quality/skip-link.test.tsx` reproduziu a falha em sessão anônima e autenticada; verifica foco, identidade do conteúdo, histórico inalterado e ausência de consulta redundante. Evidências finais de verify/CI/browser/publicação e limites ficam no handoff da #758; o requisito não é encerrado por esta anotação.

## Candidata de qualidade #758

Base publicada `dda837fddeb32d9eefd2b523975fd36fbd71e6dc` (PR #775); branch `test/pa-quality-758`. A execução final, SHA, CI e publicação são registrados no handoff da [#758](https://github.com/mcpmieda/ecossistema-escola/issues/758). Esta matriz descreve cobertura; não antecipa resultado dos gates nem o aceite real da #759.

| Risco / prova executável | Ambiente e limite |
| --- | --- |
| `e2e/quality.postgres.ts`: duas sessões cookie reais, ID/ano indevidos, mutação administrativa forjada e escopo de cursor | Pages/Worker/PostgreSQL descartável, identidade administrativa sintética; não é Entra |
| Mesmo arquivo: regeneração de QR e revogação sobrevivem ao reinício compatível, segunda conta continua válida | Reutiliza harness #757; não é restauração de backup gerenciado |
| Mesmo arquivo: 12 leituras HTTP sequenciais, todos os status contados, no-store, bytes e p95/p99 | Teto existente 256 KiB, p95 750 ms, p99 1500 ms; amostra local não é SLA produtivo |
| `ui-quality/committed-qr.test.ts`: preparação até renderização concluir ou falhar, sem repetir rotação confirmada | Regressão do anúncio prematuro de cartão indisponível |
| `ui-quality/qr-handoff.test.tsx`: diálogo acessível, sem QR bruto, URL revogada, descarte tardio e expiração | DOM sintético e renderer controlado; PNG/PDF reais continuam em `qr-print` |
| `ui-quality/contrast.test.ts`: tokens reais de ação/risco, normal e hover, razão mínima 4,5:1 | Tokens restritos às superfícies Portal e diálogos; conferir também CSS computado no browser |
| `ui-quality/session-entry.test.tsx`: espera neutra sem cabeçalho/perfil/notas; sessão 401/503 não consulta perfil; página somente após sessão e perfil válidos | Regressão do cabeçalho transitório antes do login; respostas adiadas, sem temporizadores artificiais |
| `frontend-security/browser-boundary.test.ts`: build Vite real com import dinâmico e reexport, rejeitando servidor/Worker/Functions/PostgreSQL nos dois frontends e módulos ADM no aluno | Barreira no grafo de dependências; contrato público e apresentação ADM continuam permitidos na superfície correta |
| Suítes existentes `runtime`, `smoke`, `frontend-foundation`, `admin` e `frontend-integration` | Reutilizam provas de auth/Host/Origin/CSRF, cache, publicação, orçamento SQL, KDF/NAT, recovery e isolamento; nenhum skip é PASS |
| `npm run verify`: regressões do BN, auth/Entra, importação, boletins/reimpressão, Conselho, relatórios e reset | Fixtures sintéticas; não repete mutações acadêmicas produtivas nem constitui aceite institucional |

O comando nativo `test:student-portal-postgres` inclui a nova configuração e2e, portanto os workflows oficiais de PR e deploy executam esses quatro cenários. Não há novo workflow, contrato, dependência ou redução de budget/KDF.

QA de navegador da mesma candidata, antes da retomada: QR regenerado com preparação e diálogo, cópia somente PNG com clipboard restaurado, calendário civil editado pelo teclado e persistido após recarga, senha existente por colagem, login/saída, resize por teclado e tabela com scroll local a 320 px. Reduzir viewport a 640 px comprova reflow, **não comprova zoom nativo de 200%**. Árvore acessível não comprova uso de leitor de tela físico. Essas distinções permanecem no handoff; câmera/dispositivo, impressão física, Entra/widget e piloto legítimos continuam na #759.

## Rastreio da Parte 2 — integração #757

Autoria #743–#756 concluída, testada e publicada; os handoffs das filhas contêm resultados e limites. A baseline #756 tem 1990 PASS + 3 skips históricos/21 workerd e CI PostgreSQL 55 + 2 + 1 + 16 PASS. #757 valida composição candidata; #758 amplia a qualidade integrada e #759 conserva o aceite real abaixo. Registrar teste, SHA, ambiente, resultado, limitação e owner; nenhum resultado anterior presume PASS do novo head.

| Requisito / risco | Autoria | Prova integrada |
| --- | --- | --- |
| Build separado, assets/deep-link, CSP/câmera por origem e preview sem produção | #744 | #757/#758 |
| Header/Perfil/Avatar, skeleton,320px/desktop/zoom | #748 | visual/acessibilidade #758 |
| QR/câmera/imagem local, PIN4/senha6 3+3/paste/risco | #749 | #758 sintético; dispositivo e Turnstile real #759 |
| Classificação oficial/zero/máximo ausente/limite do mínimo | #745/#747/#750 | #758; sem cálculo na UI |
| Períodos/partials ocultos fora payload, REC/N-C/R-R/ASSISTIDO/resultados | #750/#752 | rede/SQL/browser #757–#759 |
| Catálogo/último acesso/contexto/resumo sem N+1 | #746/#753/#756 | PG real/contrato/query-budget #746/#758 |
| AD-03 autosave completo, clear explícito/CAS/retomada por item | #754 | #758/#759, senha/QR preservados |
| AD-04 calendário/herança/data única/seis datas/efeito imediato | #751/#752 | limites de fuso/data e jobs #758/#759 |
| Bloqueio/reset/regeneração/reprint/cookie/revogação | #749/#753/#756 | #758 sintético; legítimos #759 |
| QR-only/QR+nome/QR+nome+turma, cópia imagem, PDF/cancelamento | #755 | decode/render #755; impressão física #759 |
| Entra/API real/binding privado, IDOR/CSRF/Origin/Host/no-store | #757 | #758 sintético; Entra legítimo #759 |
| Audit IP90d/metadados12m e saúde sem dado inventado | #756 | #758; detalhes reais delimitados #759 |
| Opção A links-preview/close distinta do reset, isolamento2025/2026 | #751/#757 | #758 sintético; preview real somente leitura #759 |
| Regressão BN importação/boletins/Conselho/relatórios/autoridade | #747/#757 | #758/#759 sem reset real |
| Carga/KDF/queries/bundle/recovery/rollback sem reativação | #758 | #759 quando pertinente, sem backup gerenciado alegado |
| Dados/calendário legítimos, encerramento de piloto, G-B/G-P | #759 | #760 somente após aceite e abertura deliberada |

PA-DEC-009 encerra a checklist após o aceite real da #759. Resultados sintéticos continuam identificados como tais; itens físicos e o ensaio adversarial produtivo do widget permanecem adiados, sem transformar skip em PASS.

## Checklist de aceite encerrada pela #759 — PA-DEC-006/009

- [x] Sessão Entra real no ADM → API Portal → binding privado → PostgreSQL no fluxo autorizado; negativas preservadas nas suítes integradas.
- [ ] Widget Turnstile produtivo adversarial completo. Login positivo real aprovado; token expirado/reutilizado e indisponibilidade produtivos ficaram adiados.
- [x] Telas: QR → PIN → criação de senha → login → leitura autorizada → saída e reentrada.
- [x] Sessão, expiração, logout, bloqueio/desbloqueio, revogação, regeneração de QR e resets cobertos pelo aceite real mais massa sintética.
- [x] Visibilidade por período, publicação/atualização/retirada e isolamento de terceiros cobertos pelas provas integradas; nenhum período ficou publicado.
- [x] Regressões de importação, boletins e prévia de reset aprovadas sem reset acadêmico real.
- [x] Piloto encerrado: acesso, sessões, períodos e população fechados. Massa/projeções de teste retidas para rastreabilidade, inacessíveis; configuração institucional continua requisito de qualquer abertura futura.
- [ ] Câmera física, impressão física, Narrador e matriz ampla de dispositivos adiados expressamente.

Os itens não marcados são limitações conhecidas, não falhas ocultas nem PASS. O responsável aceitou o produto com esses adiamentos e autorizou encerrar a fila. Nenhuma mutação deve ser repetida em aluno real apenas para completar contagem.

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
