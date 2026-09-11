# Readiness — produto relacional e entrega institucional

## Evidência aceita, integração e publicação

#613 homologou persistência/idempotência; #629, retenção de diagnósticos atuais; #632, arquivo dos importadores exclusivos. A #636 foi integrada em `4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`, com deploy oficial 254 / `34468184541` aprovado. Inclui baseline de schema, lote de projeção e proteção transacional da Auditoria. Não houve smoke autenticado pós-deploy nesta sessão.

A PR #640, contrato #639, acrescentou contexto/pesquisa/Centrais V2 e foi integrada em `6683d1377f2dd090c1346f693a4af4c2e188d7ae`, deploy 255 / `34477526551` aprovado. PGlite e HTTP com identidade sintética não são benchmark Hyperdrive, contenção PostgreSQL multi-sessão, restore de dados reais ou aceite visual. Nenhuma dessas entregas prova automaticamente Desempenho, emissão/reimpressão, votação ou autoridade por consumidor.

As PRs #643/#645 integraram matriz relacional e quatro lentes; a #647 integrou fonte, ano global, detalhe e desktop em `002b97a6b647c28e1eca75745425732858eae665`. A #649/#650 fixa 2026, remove criação/seleção de anos e acrescenta comparação trimestral sem ativar autoridade ou alterar schema/dados. Validação visual/autenticada continua separada e foi adiada para uma única sessão com o responsável.

A PR #653 integrou o Conselho V3 em `4f32dd5150641d0a24c2e2c241768f953202ce56`; migration/postflight, CI 594, deploy 262 / `34565744488` e smoke autenticado somente leitura foram aprovados. A #654/PR #655 integrou Boletins V2 em `1512d5b37c42931b1df81bbfe6483d1ad5340130`; backup lógico, preflight, migration/postflight `0005`, CI, deploy 263 / `34572772095` e smoke autenticado somente leitura foram aprovados. A #656 executa Relatórios V2 sem schema/DML; seu head ainda depende de verificação final, CI, revisão, integração, publicação e smoke.

## Gates finais

| Gate             | Responsável                     | Evidência                                                                                                        |
| ---------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Schema/runtime   | #633; bloco #639/#640 integrado | replay/drift e fontes relacionais por endpoint; Centrais de consulta não incluem resultados/escritas             |
| Desempenho       | #634                            | comparação trimestral contratada na #649; validação visual conjunta, refinamentos de UI e medição restantes      |
| Conselho         | #635                            | lacunas contratuais, decisão humana, voto/fechamento e durabilidade                                              |
| Boletins         | #633/#654                       | contrato V2 integrado/publicado; migration/postflight, CI e smoke somente leitura verdes                          |
| Relatórios       | #633/#656                       | contrato V2 somente leitura no head; integração, publicação e smoke ainda não são fatos da `main`                  |
| Produto integral | #406                            | jornadas, restart/falhas, segurança, histórico e recuperação                                                     |
| Aceite acadêmico | #347                            | consumidor/escopo, versão/vigência, divergências e emissões                                                      |
| Entrega          | #596                            | operação, responsáveis, recuperação e aceite final                                                               |
| Dependências     | #637/#641                       | lock corrigido e audits zerados no run 551; CI final, merge/deploy no checkpoint da issue                        |

## Recuperação não pode ser presumida

Uma migration existente não comprova restore. `0001` reconstrói e compara a baseline observada antes do Conselho: 20 tabelas, 127 colunas, 123 constraints, 38 índices, 4 funções e 3 triggers. `0003`/`0004` acrescentam o Conselho V3 e levam o catálogo a 28 tabelas, 214 colunas, 188 constraints, 58 índices, 48 FKs e 12 sequências, sem mudar as 4 funções/3 triggers. O postflight de `0005` levou a produção a 29 tabelas, 227 colunas, 203 constraints, 62 índices, 51 FKs e 12 sequências, preservando 4 funções/3 triggers e todas as contagens acadêmicas. A tabela de snapshots nasceu vazia. NOT NULL é comparado por `attnotnull`; sua representação adicional em `pg_constraint` no PostgreSQL 18 é excluída para comparar com PostgreSQL 17, sem excluir a regra.

Grants backend são separados da baseline; testes usam roles sintéticas. Restore de dados, identities, ACLs externas, timezone, recursos, RPO/RTO e operação real continuam gates #406/#596. Não executar DDL de streams/versions. D1 histórico não contém as novas escritas; sua exclusão ou uso como rollback exige plano próprio.

## Autorização, isolamento e atomicidade

Verificar auth/capability, origem, limites, no-store, isolamento e respostas obsoletas por consumidor. Não inferir flags ON/OFF da documentação. O wrapper pode preparar conexão antes da autorização interna; o serviço não é a fronteira de acesso por si só.

O lote acadêmico de Boletins materializa contexto, alunos, ofertas, projeções e instrumentos em uma transação read-only/repeatable-read; snapshots são incluídos separadamente por CAS append-only. O serviço cadastral da #640 usa a mesma classe de isolamento para cada resposta completa. Paginação entre requisições diferentes não promete snapshot global de um catálogo que pode mudar.

A Auditoria integrada #636 usa **substituição transacional**: locks por fonte/conteúdo + DELETE/INSERT na mesma conexão; rollback e conjunto vazio enviado pelo browser. Notas não fazem limpeza paralela. Falha de atualização gera aviso; resolvidos não são acumulados. V1 não tem sequência entre abas: vale a última confirmada no servidor, sem inferência cronológica de arquivos atrasados. PGlite serializa conexões; testes não provam disputa multi-sessão real. Clientes antigos precisam recarregar para enviar também conjuntos vazios.

A inspeção de ACL anterior encontrou anon/authenticated sem USAGE/privilégios de tabela. O postflight de `0005` confirmou somente `SELECT, INSERT` para `gradebook_app` em `boletim_snapshot`, sem `UPDATE/DELETE` e sem grants a `PUBLIC`, `anon` ou `authenticated`. RLS não foi habilitada; a proteção permanece por schema e revogações explícitas.

## Validação da interface

Fluxo #640: abrir Centrais, selecionar ano, pesquisar, abrir aluno/turma/professor/componente, navegar pelos vínculos/ofertas e carregar páginas. Testes de cliente/React/jsdom usam somente respostas sintéticas e verificam cancelamento, limpeza de escopo e perda de sessão. Validação visual em navegador, teclado completo, mobile e smoke autenticado real permanecem explícitos antes do aceite institucional; build/deploy verde não os substitui.

## Dependências e limites

A triagem #637/#638 encontrou seis entradas em duas cadeias dev, sem alertas no audit sem dev. A #641 corrige sharp somente sob Miniflare e retira office-addin-manifest/adm-zip sem chamadores encontrados, sem alterar as demais versões ou o motor acadêmico. O lock exato foi auditado no run 551: zero alertas completo/sem dev, instalação limpa, verify, smoke nativo e compilação das Functions aprovados. O [relatório](SECURITY_REMEDIATION_637.md) registra bytes, fontes, escopo e limites; CI final e deploy da correção ficam na #637. Sem `npm audit fix --force` ou workflow temporário no head final. Zero alertas não é prova de risco zero.

Escrita parcial, perda de histórico, divergência material, autoridade ambígua, schema inesperado, recuperação insuficiente ou dado exposto interrompem o escopo afetado. Não editar fonte silenciosamente nem converter ausência em zero.

V1 `prepared-for-manual-authorization` e V2 `production-infrastructure-smoke-validated-awaiting-private-pilot` estão no [histórico](history/pre-final-1/PRODUCTION_READINESS.md), não descrevem a configuração atual. **BN-DEC-023 autoriza integrar/publicar trabalhos concluídos sem nova confirmação individual, mas não dispensa validação nem autoriza mudança de autoridade acadêmica.** Ver [Centrais V2](RELATIONAL_CENTERS_V2.md) e [baseline/Auditoria](CURRENT_SCHEMA_AND_DIAGNOSTICS.md).
