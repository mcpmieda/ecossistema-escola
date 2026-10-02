# Evidências de recursos da #714

Execução em 13/09/2026 UTC, árvore H baseada em main `659ebbc640463e34e5274545c70018a83468568f`. O SHA final validado fica no handoff da issue. Nenhum dado ou carga acadêmica produtiva foi usado.

## CPU e memória na Cloudflare

Worker temporário `student-portal-cpu-proof-714`, sem DB ou chaves produtivas, protegido por token efêmero e limite CPU de 1.000ms. Vinte chamadas sequenciais após duas de aquecimento em cada configuração. A consulta GraphQL foi limitada ao script e à janela de cada medição; retornou 20 invocações e zero erros em ambas. Worker e token foram removidos após coleta.

| KDFs por chamada | CPU p50 | CPU p95 | CPU p99 | Memória V8 p99 | Resultado contra reserva de 300ms |
|---|---:|---:|---:|---:|---|
| 2 | 639,928ms | 761,304ms | 825,156ms | 5.820.480 bytes | Reprovado; lote reduzido |
| 1 | 218,974ms | 263,943ms | 281,857ms | 6.867.737 bytes | Dentro do orçamento |

Janelas UTC: duas derivações `03:02:10.080`–`03:02:23.845`; uma derivação `03:06:14.184`–`03:06:19.521`. Versões efêmeras `c656cbb1-be6a-49bf-8166-efa107f84615` e `f6b673ed-adfb-4e7a-8e35-4edf0a4837df` antes da exclusão. Scrypt permanece N32768/r8/p3/len32 com pepper HMAC; nenhum parâmetro de segurança foi reduzido.

Unidades verificadas pela introspecção do schema: `cpuTimeP50/P95/P99` em microssegundos; `memoryUsageBytesP99` em bytes de memória do isolate V8. A tabela converte CPU para ms. Memória V8 por invocação **não é pico de alocação nativa**: o workspace scrypt estimado em 32MiB e seu teto nativo `maxmem=64MiB` são limites adicionais considerados contra 128MiB por isolate. O KDF síncrono é executado sequencialmente. Não alegar que uma leitura de heap mede todo o workspace OpenSSL ou prova pressão arbitrária de concorrência.

Tempo total externo de uma derivação p50/p95/p99: 257/305/323ms. Esse tempo inclui rede e não substitui CPU faturada. As medidas são uma amostra pequena, não uma garantia de latência futura em todas as regiões.

Fontes: [consulta de métricas](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/), [métricas de Workers](https://developers.cloudflare.com/workers/observability/metrics-and-analytics/).

## Harness local e regressões

`harness-scenarios-v1.ts` executa os módulos reais empacotados com Wrangler em workerd/Miniflare e PostgreSQL nativo, usando a factory com verificação de `student_portal_app`. A medição de consultas inclui essa verificação; não inclui frames de protocolo BEGIN/COMMIT. Captura somente contagens, bytes e tempos. Testa concorrência1/2/5, nascimento/QR/ativação/login/cookies, sessão, ausência de publicação, NAT compartilhado, contador de falhas PG, claims extras, origem indevida e sessão revogada. Host sintético é reconstruído dentro do Worker porque o proxy Node do Miniflare o substitui por loopback; Host hostil é testado separadamente na suíte foundation.workerd.

`birth-budget-v1.test.ts` mede teto de chamadas/SQL e retomada de100 contas sintéticas, usando crypto de teste para contagem. Ele não mede CPU do KDF; a prova acima e o harness real cobrem esse custo. Clear/no-op também ficam limitados a duas transações novas por chamada. Uma chamada com KDF usa no máximo uma derivação; resultados anteriores vêm dos recibos sem repetir a mutação.

`turnstile-provider-proof.ts` é uma prova remota explícita, fora da dependência automática de CI: as chaves públicas de teste do provedor aceitaram o dummy positivo, recusaram o fixture de token gasto e foram recusadas pelo verificador real de hostname/action produtivos. Isso não equivale a um token positivo de widget produtivo/SSO real; essa prova de composição permanece #715. Timeout, transporte, hostname e action negativos também têm regressão determinística.

## Amostra local Windows / PostgreSQL18.6 / workerd

| Cenário | n | p50/p95/p99 ms | Máx. consultas | Máx. linhas retornadas | Máx. bytes |
|---|---:|---|---:|---:|---:|
| birth-batch | 5 | 277/327/327 | 30 | 24 | 584 |
| self-1 | 4 | 82/86/86 | 23 | 21 | 639 |
| login-1 | 4 | 274/278/278 | 17 | 14 | 154 |
| self-2 | 8 | 100/137/137 | 23 | 21 | 639 |
| login-2 | 8 | 291/531/531 | 17 | 14 | 154 |
| self-5 | 20 | 219/281/288 | 23 | 21 | 639 |
| login-5 | 20 | 798/1265/1287 | 17 | 14 | 154 |

Todas as amostras acima concluíram dentro dos gates locais. Cenários negativos adicionais esperam401/400/403/429/503 e são verificados separadamente, sem serem descartados como sucessos. PostgreSQL17.6/Linux será registrado pelo CI no handoff final; os números desta tabela são locais. Publicação/despublicação e lock timeout usam casos específicos do mesmo harness, não esta amostra de ausência de publicação.

## Preservação do diagnóstico do gate — #1230

Correção test-only motivada pela [#1230](https://github.com/mcpmieda/ecossistema-escola/issues/1230), separada do Adendo H/#1229. Na baseline `9f95387a4588653a2631288f929d94b4350bb5d6`, o assert de p95 interrompia a formação/retorno do relatório e a exportação posterior em `migrations.postgres.ts` não era executada. A regressão percorreu o cenário com respostas sintéticas válidas nos contratos reais, forçou login-5 p95=1601ms contra 1500ms e falhou por ausência da exportação (zero chamadas ao console). Isso reproduz a perda do relatório, **não mede o desempenho do runtime**.

`harness-diagnostics-v1.ts` é um helper exclusivamente dos testes: retém até 128 amostras técnicas, sem limitar pedidos, população ou rodadas. O cenário completo existente produz 92 chamadas medidas por `call`: setup/ativação, nascimento, self/login1/2/5 e negativos. O pedido CSRF e o burst direto de até61 pedidos continuam com suas verificações originais, fora das amostras de tempo. O sucesso continua retornando a mesma tabela; a saída de diagnóstico agora é um envelope versionado. Não há consumidor do marcador antigo além do caller substituído.

O relatório de budgets é formado integralmente antes dos mesmos asserts, na mesma ordem, com percentil nearest-rank (`ceil(q*n)-1`). Os limites não mudam: self750/1500ms e40 consultas; login1500/2500ms e40 consultas; nascimento2000/3000ms e65 consultas;1500 linhas e256KiB por resposta. Concorrência1/2/5, quatro rodadas, cinco contas, timeouts, autenticação, sessões, bloqueios e verificações acadêmicas/de segurança permanecem iguais.

A exportação ocorre em `finally`, após a tentativa de fechamento, antes de propagar a falha original. O marcador dos logs é `PORTAL_SYNTHETIC_HARNESS_DIAGNOSTIC`; `PORTAL_TEST_METRICS_PATH`, quando definido, recebe o mesmo envelope JSON. Arquivo e console são destinos independentes. Falha do arquivo gera apenas um aviso técnico fixo, sem caminho/erro; falha do console/callback não substitui erro do cenário. Se o fechamento falhar, ele é propagado somente quando não há erro original, e a exportação ainda é tentada. A factory continua responsável pelo fechamento durante falha de criação.

Interpretação dos campos:

- `outcome` descreve o resultado do cenário/fechamento; `phase` aponta criação, execução, validação ou fechamento. `checks` descreve **apenas a validação final dos budgets**: `not-reached`, `failed` ou `passed`; não substitui o resultado dos outros testes do gate.
- `scenariosComplete` indica se todos os passos anteriores aos budgets terminaram. `coverage` explicita amostras completas/parciais, iniciadas/finalizadas/em voo, retenção/omissão e falhas da coleta. Não extrapolar cobertura parcial para o cenário completo; resumos usam somente corpos totalmente lidos. Amostras incompletas guardam apenas tempo disponível, status/headers disponíveis e `bodyComplete:false`.
- `ms` preserva o intervalo externo original, até consumir o corpo, incluindo despacho/role/aplicação/fechamento/proxy. Em falha de despacho/leitura, é apenas o intervalo disponível até a falha. Não é CPU.
- `internalMs` vem do header **já existente** `x-harness-ms`: intervalo parcial da aplicação, depois do role check e antes de fechar a conexão. Não representa CPU ou KDF puro e não permite atribuir sua diferença para `ms` a uma fase específica. A limitação dos timers de workerd também permanece. `lockTimeouts` conta timeouts, não duração de espera ou ausência de contenção.
- Headers ausentes, vazios, inválidos ou negativos são `null`; zero válido continua zero. `missingQueries`/`missingRows` explicitam ausência nos resumos. Nenhum valor ausente é interpretado como custo zero.
- `environment` é um snapshot técnico no momento da exportação (Node/plataforma/arquitetura, CPUs disponíveis/modelo e memória total/livre). Pode ser `null` sem perder as amostras. Não mede quotas efetivas, CPU/KDF, pressão durante os pedidos, heap do isolate ou pico nativo. Não captura hostname, usuário, env completo ou destinos. Leituras de headers são escalares após o intervalo medido; não há polling, SQL extra, profiler nem logs por pedido. O custo adicional não foi calibrado como benchmark.

O envelope usa vocabulário técnico fechado e contagens/tempos/status. Nunca inclui QR, senhas/PIN, cookies, tokens, corpos, nomes, IDs individuais, parâmetros SQL, string de conexão ou mensagens de exceção. A regressão verifica a saída efetivamente gravada, falha dos dois destinos, erro original por identidade, falhas parciais/criação/fechamento/headers, limites de amostras, percentis, carga e budgets. Execução determinística com mock comprova essas propriedades; somente o gate real workerd/PostgreSQL pode fornecer novas medições.

As três tentativas nativas anteriores do [37025626173](https://github.com/mcpmieda/ecossistema-escola/actions/runs/37025626173) reprovaram login-5 p95=1562/2731/2117ms. Sem amostras preservadas, sua causa continua indeterminada. A próxima execução oficial do novo SHA é justificada pela coleta antes ausente; se reprovar, analisar o envelope e registrar causa demonstrada ou lacuna antes de executar novamente. Resultado/SHA/logs serão registrados nos checkpoints #1230 e #1225, sem alterar os resultados históricos acima.

Estados separados: corrigir a perda do diagnóstico não resolve automaticamente a lentidão nem aprova CI, integração ou publicação. #1229 permanece preservada, S0 é o leitor produtivo e S1/D1 continuam rejeitados; nenhuma redução do tempo de importação é alegada. A causa real de `applied` em sourceFileIndex:6 permanece indeterminada e testes sintéticos não encerram essa investigação. Nenhuma carga ou alteração produtiva é necessária para esta correção.
