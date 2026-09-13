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
