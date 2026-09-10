# Banco de Notas — ponto de entrada

## Estado integrado e entrega corrente

A #613 encerrou a reconstrução e homologou a persistência PostgreSQL/Supabase via Hyperdrive `PROD_DB`: 19 tabelas centrais + `importacao_diagnostico` = 20. Importador externo V9, serviços internos V10/V11 e retenção de diagnósticos atuais estão homologados. Não reabrir streams/versions, backfill ou importadores arquivados.

A #636 integrou planejamento reconciliado, leituras em lote, baseline de schema reproduzível e Auditoria transacional (deploy 254). A #640 integrou contexto, pesquisa e quatro Centrais somente leitura V2 (deploy 255). A #641 corrigiu as dependências sinalizadas e registrou a autorização contínua (deploy 256, `cb6e3bf2309d4aa5716b600a3957046f133f850c`). Deploy não equivale a aceite funcional integral.

**#642 / PR #643:** primeira matriz calculada de Desempenho sobre o schema atual, com T1/T2/T3/Visão geral, Recuperação, situação, detalhes e ano compartilhado com Centrais. A consulta é identificada como **em validação**; não é emissão oficial nem aceite global da #347. [Contrato, evidências e limites](RELATIONAL_PERFORMANCE_V2.md). SHA integrado e deploy efetivos ficam no checkpoint #642/#643; não deduzi-los da presença deste documento.

## Leitura e execução

1. [COMECE_AQUI.md](COMECE_AQUI.md): tarefa e dependências.
2. [PROJECT_STATE.yaml](PROJECT_STATE.yaml): baseline e entrega corrente.
3. [DECISIONS.md](DECISIONS.md): decisões anteriores e substituições expressas.
4. [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md) e [RELATIONAL_PERFORMANCE_V2.md](RELATIONAL_PERFORMANCE_V2.md): caminhos e limites.
5. [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md), [ISSUE_MAP.md](ISSUE_MAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Programa final

| Fase | Issue | Entrega restante |
| --- | --- | --- |
| FINAL-1 | #633 | consumidores relacionais, manutenção, fontes e durabilidade restantes |
| FINAL-2 | #634 | Desempenho completo: lentes, comparabilidade, gráficos, configurações e validação |
| FINAL-3 | #635 | Conselho humano, histórico, durabilidade e fechamento |
| FINAL-4 | #406 | piloto integral, recuperação e retirada seletiva do legado |

#347 registra aceite acadêmico por consumidor/escopo; #596 encerra a operação institucional; #220 é observabilidade transversal. #637 foi a remediação de dependências, com [evidências próprias](SECURITY_REMEDIATION_637.md). Nenhuma entrega parcial encerra FINAL-1/2 automaticamente.

## Fontes funcionais e invariantes

`PAINEL DESEMPENHO` governa sua experiência. Do documento antigo `APENAS CONSELHO`, somente Conselho permanece funcionalmente vigente. F1 = **7/7** e outros fechamentos antigos valem no seu contexto, não como prova automática da compatibilidade atual. [Planejamento anterior preservado](history/pre-final-1/README.md).

Uma regra, um núcleo; fatos/referências separados dos derivados; nenhum resultado fictício; Conselho humano; históricos preservados; diagnósticos resolvidos removidos na leitura correspondente; auth/capabilities no backend; no-store; sem dados acadêmicos persistentes no browser ou dados privados em Git/CI. Nome `d1-*` não demonstra provider físico: conferir composição e SQL.

Fluxo: issue/contrato → commit na branch → revisão → `npm run verify`/CI do head final → integração/deploy oficial → evidência sanitizada. **BN-DEC-023 dispensa nova confirmação por PR concluída**, não os gates nem autorizações próprias para dados/schema, infraestrutura ou autoridade acadêmica.
