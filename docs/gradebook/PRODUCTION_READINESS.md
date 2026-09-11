# Readiness — produto relacional e entrega institucional

## Evidência aceita, integração e publicação

#613 homologou persistência/idempotência; #629, retenção de diagnósticos atuais; #632, arquivo dos importadores exclusivos. A #636 foi integrada em `4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`, com deploy oficial 254 / `34468184541` aprovado. Inclui baseline de schema, lote de projeção e proteção transacional da Auditoria. Não houve smoke autenticado pós-deploy nesta sessão.

A PR #640, contrato #639, acrescentou contexto/pesquisa/Centrais V2 e foi integrada em `6683d1377f2dd090c1346f693a4af4c2e188d7ae`, deploy 255 / `34477526551` aprovado. PGlite e HTTP com identidade sintética não são benchmark Hyperdrive, contenção PostgreSQL multi-sessão, restore de dados reais ou aceite visual. Nenhuma dessas entregas prova automaticamente Desempenho, emissão/reimpressão, votação ou autoridade por consumidor.

As PRs #643/#645 integraram matriz relacional e quatro lentes; a #647 integrou fonte, ano global, detalhe e desktop em `002b97a6b647c28e1eca75745425732858eae665`. A #649/#650 fixa 2026, remove criação/seleção de anos e acrescenta comparação trimestral sem ativar autoridade ou alterar schema/dados. A #666 retira apenas frontends antigos sem montagem; as superfícies relacionais continuam sendo o caminho ativo. A #668 registra payload/latência/matriz utilizável autenticados e verdes no cenário documentado. Validação visual conjunta continua separada e foi adiada para uma única sessão com o responsável.

A PR #653 integrou o Conselho V3 em `4f32dd5150641d0a24c2e2c241768f953202ce56`; migration/postflight, CI 594, deploy 262 / `34565744488` e smoke autenticado somente leitura foram aprovados. A #654/PR #655 integrou Boletins V2 em `1512d5b37c42931b1df81bbfe6483d1ad5340130`; backup lógico, preflight, migration/postflight `0005`, CI, deploy 263 / `34572772095` e smoke autenticado somente leitura foram aprovados. A #656/PR #657 integrou Relatórios V2 em `3d762d7412fe0a5760680566ae6739f4d10c1172`; CI, deploy 264 / `34577894561` e smoke autenticado somente leitura foram aprovados. A #658/PR #659 integrou Auditoria atual V2 em `380b016d0c1ec5917323fe3fad35398b4fbd1a6a`; CI, deploy 265 / `34580485339` e smoke autenticado somente leitura foram aprovados. A #660/PR #661 foi integrada em `92e9f97a23e110cb77011570e1edaef97389cb3d`, deploy 266 / `34585674112` e smoke autenticado somente leitura verdes. A #662/PR #663 foi integrada em `89cb382d588364560ac250a4a1f0e0d65a079573`, deploy 267 / `34600229510`, com restore/contenção local e smoke somente leitura verdes. A #664/PR #665 foi integrada em `dc8005e7911b1dbfda914345a8c194987b6ebc22`, deploy 268 / `34602595928`, retirando somente entrypoints Audit V1 comprovadamente sem consumidor. A #666 retira os demais frontends antigos sem montagem e preserva a compatibilidade server-side.

## Gates finais

| Gate             | Responsável                      | Evidência                                                                                                       |
| ---------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Schema/runtime   | #633; blocos #639/#640/#660/#662 | replay/drift e fontes relacionais; restore lógico/contenção local comprovados, operação externa ainda pendente  |
| Desempenho       | #634/#668                        | comparação trimestral e metas técnicas do cenário autenticado verdes; validação visual conjunta restante        |
| Conselho         | #635                             | lacunas contratuais, decisão humana, voto/fechamento e durabilidade                                             |
| Boletins         | #633/#654                        | contrato V2 integrado/publicado; migration/postflight, CI e smoke somente leitura verdes                        |
| Relatórios       | #633/#656/#657                   | contrato V2 integrado/publicado; CI e smoke autenticado somente leitura verdes                                  |
| Auditoria atual  | #633/#658/#664                   | somente diagnóstico corrente 2026; UI/endpoint Audit V1 retirados; núcleo usado por Relatórios V1 preservado    |
| Frontends ativos | #633/#666                        | somente superfícies relacionais montadas; endpoints legados externos e renderizador PDF reutilizado preservados |
| Produto integral | #406                             | jornadas, restart/falhas, segurança, histórico e recuperação                                                    |
| Aceite acadêmico | #347                             | consumidor/escopo, versão/vigência, divergências e emissões                                                     |
| Entrega          | #596                             | operação, responsáveis, recuperação e aceite final                                                              |
| Dependências     | #637/#641                        | lock corrigido e audits zerados no run 551; CI final, merge/deploy no checkpoint da issue                       |

## Recuperação não pode ser presumida

Uma migration existente não comprova restore. `0001` reconstrói e compara a baseline observada antes do Conselho: 20 tabelas, 127 colunas, 123 constraints, 38 índices, 4 funções e 3 triggers. `0003`/`0004` acrescentam o Conselho V3 e levam o catálogo a 28 tabelas, 214 colunas, 188 constraints, 58 índices, 48 FKs e 12 sequências, sem mudar as 4 funções/3 triggers. O postflight de `0005` levou a produção a 29 tabelas, 227 colunas, 203 constraints, 62 índices, 51 FKs e 12 sequências. O postflight autorizado de `0006` levou o catálogo a 30 tabelas, 246 colunas, 218 constraints, 66 índices, 52 FKs e 13 sequências. A `0007`, autorizada pela #676, levou a 30/247/221/66/52 e manteve 13 sequências, 4 funções, 3 triggers e todas as contagens acadêmicas; os 4.463 fechamentos anteriores receberam somente o default zero da nova máscara. O responsável decidiu adiar backup gerenciado, portanto esta aplicação não amplia a evidência de recuperação externa/RPO/RTO. NOT NULL é comparado por `attnotnull`; sua representação adicional em `pg_constraint` no PostgreSQL 18 é excluída para comparar com PostgreSQL 17, sem excluir a regra.

Grants backend são separados da baseline; testes usam roles sintéticas. A #662 restaurou localmente 120.879 linhas em 28 relações, 12 sequences/identities, catálogo pós-`0005`, FKs e ACLs locais; também serviu catálogo, comparação T2×T1, Auditoria, Conselho e histórico vazio de Boletins. O tempo local de 7.385 ms não é SLA. Restore gerenciado, ACLs/identidade/configurações externas, timezone operacional, recursos, política RPO/RTO e operação real continuam gates #406/#596. Não executar DDL de streams/versions. D1 histórico não contém as novas escritas; sua exclusão ou uso como rollback exige plano próprio. Ver [#662](RELATIONAL_RECOVERY_REHEARSAL_662.md).

## Autorização, isolamento e atomicidade

Verificar auth/capability, origem, limites, no-store, isolamento e respostas obsoletas por consumidor. Não inferir flags ON/OFF da documentação. O wrapper pode preparar conexão antes da autorização interna; o serviço não é a fronteira de acesso por si só.

O lote acadêmico de Boletins materializa contexto, alunos, ofertas, projeções e instrumentos em uma transação read-only/repeatable-read; snapshots são incluídos separadamente por CAS append-only. O serviço cadastral da #640 usa a mesma classe de isolamento para cada resposta completa. Paginação entre requisições diferentes não promete snapshot global de um catálogo que pode mudar.

A Auditoria integrada #636 usa **substituição transacional**: locks por fonte/conteúdo + DELETE/INSERT na mesma conexão; rollback e conjunto vazio enviado pelo browser. Notas não fazem limpeza paralela. Falha de atualização gera aviso; resolvidos não são acumulados. V1 não tem sequência entre abas: vale a última confirmada no servidor, sem inferência cronológica de arquivos atrasados. A #662 comprovou espera no advisory lock, último commit completo e rollback em conexões PostgreSQL distintas. Clientes antigos precisam recarregar para enviar também conjuntos vazios.

O mesmo ensaio mostrou que uma corrida `SERIALIZABLE` do Conselho pode abortar o perdedor com SQLSTATE `40001` antes do CAS. O serviço repete uma vez apenas a transação abortada; a segunda fotografia devolve `version-conflict`. Um vencedor, um conflito e repetição idempotente foram observados. Diretor/desempate permanecem fora do sistema.

A inspeção de ACL anterior encontrou anon/authenticated sem USAGE/privilégios de tabela. O postflight de `0005` confirmou somente `SELECT, INSERT` para `gradebook_app` em `boletim_snapshot`, sem `UPDATE/DELETE` e sem grants a `PUBLIC`, `anon` ou `authenticated`. Após autorização da BN-DEC-027, o postflight de `0006` confirmou a mesma ACL mínima em `importacao_diagnostico_tratamento` e uso/leitura, sem atualização, da nova sequence. RLS não foi habilitada; a proteção permanece por schema privado e revogações explícitas. O Advisor de segurança terminou sem alertas.

## Validação da interface

Fluxo #640/#660: abrir Centrais no contexto 2026, pesquisar, abrir aluno/turma/professor/componente, navegar pelos vínculos/ofertas na ordem da configuração e carregar páginas. Testes de cliente/React/jsdom usam somente respostas sintéticas e verificam cancelamento, limpeza de escopo, ordenação após paginação e perda de sessão. A #660 também prova que o write docente V1 é recusado antes do runtime legado. Validação visual conjunta, teclado completo, mobile e piloto permanecem explícitos antes do aceite institucional; build/deploy verde não os substitui.

A #668 mediu o Desempenho publicado via browser autenticado, com massa de teste autorizada e sem escrita. Em 2026/T1/Regular/Resultado, 20 amostras aquecidas do dashboard observaram p95 de 441,3 ms e máximo Brotli de 6.569 B; o detalhe teve p95 de 193,5 ms e 1.284 B; a matriz ficou utilizável em 675,7 ms. Todas as respostas foram 200/`ready`/`no-store`. As quatro metas da #634 passaram nesse cenário, mas a evidência não é SLA universal nem substitui validação visual/acessibilidade manual. Ver [detalhes](PERFORMANCE_MEASUREMENTS_668.md).

## Dependências e limites

A triagem #637/#638 encontrou seis entradas em duas cadeias dev, sem alertas no audit sem dev. A #641 corrige sharp somente sob Miniflare e retira office-addin-manifest/adm-zip sem chamadores encontrados, sem alterar as demais versões ou o motor acadêmico. O lock exato foi auditado no run 551: zero alertas completo/sem dev, instalação limpa, verify, smoke nativo e compilação das Functions aprovados. O [relatório](SECURITY_REMEDIATION_637.md) registra bytes, fontes, escopo e limites; CI final e deploy da correção ficam na #637. Sem `npm audit fix --force` ou workflow temporário no head final. Zero alertas não é prova de risco zero.

Escrita parcial, perda de histórico, divergência material, autoridade ambígua, schema inesperado, recuperação insuficiente ou dado exposto interrompem o escopo afetado. Não editar fonte silenciosamente nem converter ausência em zero.

V1 `prepared-for-manual-authorization` e V2 `production-infrastructure-smoke-validated-awaiting-private-pilot` estão no [histórico](history/pre-final-1/PRODUCTION_READINESS.md), não descrevem a configuração atual. **BN-DEC-023 autoriza integrar/publicar trabalhos concluídos sem nova confirmação individual, mas não dispensa validação nem autoriza mudança de autoridade acadêmica.** Ver [Centrais V2](RELATIONAL_CENTERS_V2.md) e [baseline/Auditoria](CURRENT_SCHEMA_AND_DIAGNOSTICS.md).
