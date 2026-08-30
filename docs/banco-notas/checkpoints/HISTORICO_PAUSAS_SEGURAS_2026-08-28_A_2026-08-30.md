# Banco de Notas — histórico consolidado das pausas seguras

Período: 28/08/2026 a 30/08/2026

Origem local preservada: `PAUSA_SEGURA_BANCO_NOTAS_2026-08-28.md`

Política: este consolidado remove credenciais e identificadores pessoais desnecessários; o arquivo local integral continua sendo evidência de trabalho, mas não deve ser enviado ao Git sem revisão.

## Como interpretar

Cada linha registra o estado conhecido no momento da pausa. Ela não substitui revalidação live. Estados posteriormente superados permanecem aqui para explicar decisões, erros e retomadas.

| Data/hora   | Marco                                | Estado seguro e retomada                                                                                               |
| ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 28/08       | Acompanhamento V1 em branch          | Worktree isolado; produção intacta; testes locais verdes; aguardar GitHub/rebase.                                      |
| 28/08       | Falha de rede/GitHub                 | Nenhum processo em execução; nenhum push/deploy; retomar somente após rede e credencial funcionarem.                   |
| 28/08       | Acompanhamento CI verde              | Branch publicada e CI aprovado; produção ainda intacta; manter PR em Draft até integração da fundação.                 |
| 28/08       | Fundação + Acompanhamento integrados | Regressão final aprovada; próximo módulo somente em nova branch.                                                       |
| 28/08 15:05 | Turmas e Alunos V1                   | Implementação local preservada; browser QA e publicação ainda pendentes.                                               |
| 28/08       | Turmas e Alunos QA                   | QA desktop/mobile concluída; publicar PR sem deploy de produção.                                                       |
| 28/08       | Turmas e Alunos CI                   | CI verde; aguardar integração controlada.                                                                              |
| 28/08       | Turmas e Alunos final                | Integração concluída; produção/D1 remoto não modificados pela feature.                                                 |
| 28/08       | Professores V1 em implementação      | Diff local ainda não validado; produção e integrações externas intactas.                                               |
| 28/08       | Professores validado localmente      | Testes e QA verdes; branch ainda separada.                                                                             |
| 28/08 18:51 | Professores bloqueado em navegação   | Gate detectou destino incorreto; não integrar até corrigir e repetir QA.                                               |
| 28/08 19:18 | Professores integrado                | Correção comprovada; CI/review concluídos.                                                                             |
| 28/08 19:42 | Pesquisa Global V1                   | Trabalho em branch, sem serviço remoto de produto.                                                                     |
| 28/08 20:49 | Pesquisa Global final                | QA e CI aprovados; destino canônico corrigido antes da integração.                                                     |
| 28/08 23:11 | Operational Readiness — Fase A       | Inventário e matriz em construção; sem escrita remota.                                                                 |
| 28/08 23:34 | Central de Pendências V1             | Implementação local preservada; faltavam QA/gates/publicação.                                                          |
| 28/08 23:59 | Operational Readiness — Fases B/C    | Integrações consolidadas; add-in ainda sem go-live.                                                                    |
| 29/08 07:08 | Operational Readiness concluído      | Superfícies administrativas prontas; sync intencionalmente desligado; próxima decisão humana era iniciar go-live.      |
| 29/08 08:47 | GO-LIVE End-to-End iniciado          | Implementação local preservada; nenhuma produção alterada durante pausa.                                               |
| 30/08 09:37 | GO-LIVE em curso                     | Release integrada; Cloudflare e D1 revalidados; continuar pelos gates, não pelos SHAs anotados.                        |
| 30/08 11:03 | RC.5 read-only ativo                 | Smokes somente leitura aprovados; inventário M365 ainda dependia de sessão administrativa.                             |
| 30/08 11:16 | Smoke admin e blocker do piloto      | Falta de alvo humano/dado canônico impedia primeira execução; nenhuma nota escrita.                                    |
| 30/08 11:40 | Piloto humano definido               | Conta piloto autorizada; dado acadêmico canônico ainda ausente.                                                        |
| 30/08 12:29 | Fonte resolvida                      | Fonte 2026 e pacote mínimo preparados; aplicação D1 ainda protegida.                                                   |
| 30/08 12:38 | Piloto provisionado                  | Modelo/mappings/baselines criados com rollback; flags 0/0; add-in dirigido a uma única conta.                          |
| 30/08       | Manifesto pronto para sideload       | Botão de carga ainda não acionado; sync/commit desligados.                                                             |
| 30/08       | Distribuição propagada               | Add-in abriu no Excel Online; NAA falhou antes de contexto; zero writes.                                               |
| 30/08       | Causa de consentimento identificada  | App correto, mas grant ainda ausente; aguardar consentimento oficial.                                                  |
| 30/08       | Admin consent pendente               | Portal aberto na permissão exata; nenhuma aprovação automatizada.                                                      |
| 30/08       | Confirmação pronta                   | Diálogo de consentimento visível; aguardando ação humana.                                                              |
| 30/08       | Consentimento concluído              | Grant do escopo próprio comprovado; voltar ao piloto.                                                                  |
| 30/08       | Timeout NAA preparado                | `ssoSilent` pendente isolado; correção local verde, ainda não publicada.                                               |
| 30/08       | Hotfix publicado, pipeline corrigido | Deploy sem IDs públicos detectado e restaurado; D1 intacto; workflow endurecido.                                       |
| 30/08       | Popup direto publicado               | Bundle final correto; aguardava clique humano real; flags e contagens preservadas.                                     |
| 30/08       | Redirect taskpane corrigido          | PATCH inicial 403 não alterou nada; Global Admin confirmado; redirect mínimo aplicado.                                 |
| 30/08       | URLs canônicas adicionadas           | Redirects finais de taskpane/auth incluídos após observar 308 do Pages; zero writes.                                   |
| 30/08       | Hotfix canônico publicado            | PR #149, CI/deploy/recovery verdes; NAA ainda deveria ser retestado.                                                   |
| 30/08       | Reanálise de estratégia              | Reteste central e sideload falharam igualmente; interrompidos tiros no escuro; recomendar alternativa.                 |
| 30/08       | Pivot para Upload Manual V1          | Direção decidiu terminar a primeira versão por upload `.xlsx`; add-in deixa de ser blocker; sync/commit continuam OFF. |

## Invariantes mantidas em todas as pausas

- nenhum token, senha, código de dispositivo ou segredo foi persistido no Git;
- nenhuma MFA foi contornada;
- nenhuma planilha original de professor foi alterada pela automação;
- nenhuma nota acadêmica nova foi escrita durante o go-live;
- nenhum rollout foi ampliado além da coorte autorizada;
- as flags de sync e commit permaneceram desligadas;
- falhas parciais foram lidas de volta antes de qualquer repetição;
- cada retomada exigiu revalidação de GitHub, Cloudflare, D1 e Microsoft quando aplicável.

## Checkpoint sucessor

O estado vigente após a decisão de pivot está em `PAUSA_SEGURA_ATUAL_2026-08-30.md`.
