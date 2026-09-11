# Banco de Notas — ponto de entrada

## Estado integrado e entrega corrente

A #613 encerrou a reconstrução e homologou a persistência PostgreSQL/Supabase via Hyperdrive `PROD_DB`: 19 tabelas centrais + `importacao_diagnostico` = 20. Importador externo V9, serviços internos V10/V11 e retenção de diagnósticos atuais estão homologados. Não reabrir streams/versions, backfill ou importadores arquivados.

A #636 integrou planejamento reconciliado, leituras em lote, baseline de schema reproduzível e Auditoria transacional (deploy 254). A #640 integrou contexto, pesquisa e quatro Centrais somente leitura V2 (deploy 255). A #641 corrigiu as dependências sinalizadas e registrou a autorização contínua (deploy 256). Deploy não equivale a aceite funcional integral.

**#642 / PR #643:** primeira matriz calculada de Desempenho sobre o schema atual, com T1/T2/T3/Visão geral, Recuperação, situação, detalhes e ano compartilhado com Centrais. Integrada em `8866b2c897bb62528970c64740cd2509c5d28602` e publicada pelo deploy 257 / `34511487276`, reconfirmado com sucesso. A consulta é identificada como **em validação**; não é emissão oficial nem aceite global da #347. [Contrato, evidências e limites](RELATIONAL_PERFORMANCE_V2.md).

**#644 / PR #645:** quatro lentes sobre o mesmo snapshot relacional, com gráfico que investiga a matriz e estatísticas descritivas. Qualitativo preserva a pontuação existente, sem inventar conceitos; Avaliações exige componente explícito; comparabilidade entre períodos continua pendente. [Contrato e limites da entrega](PERFORMANCE_LENSES_V3.md). SHA integrado e deploy efetivos ficam no checkpoint #644/#645; não deduzi-los da presença deste documento.

**#646 / PR #647:** corrige placeholders qualitativos sem evidência, adota siglas observadas na fonte, conclui a composição desktop/detalhe e estende um único ano global a todas as áreas acadêmicas, com mapeamento estrito para contratos legados. Comparabilidade e configuração sem decisão permanecem fechadas; validação visual final foi adiada. [Contrato e limites da entrega](FINAL2_SOURCE_DESKTOP_646.md).

## Leitura e execução

1. [COMECE_AQUI.md](COMECE_AQUI.md): tarefa e dependências.
2. [PROJECT_STATE.yaml](PROJECT_STATE.yaml): baseline e entrega corrente.
3. [DECISIONS.md](DECISIONS.md): decisões anteriores e substituições expressas.
4. [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md), [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md), [RELATIONAL_PERFORMANCE_V2.md](RELATIONAL_PERFORMANCE_V2.md), [PERFORMANCE_LENSES_V3.md](PERFORMANCE_LENSES_V3.md) e [FINAL2_SOURCE_DESKTOP_646.md](FINAL2_SOURCE_DESKTOP_646.md): caminhos e limites.
5. [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md), [ISSUE_MAP.md](ISSUE_MAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Programa final

| Fase | Issue | Entrega restante |
| --- | --- | --- |
| FINAL-1 | #633 | consumidores relacionais, manutenção, fontes e durabilidade restantes |
| FINAL-2 | #634 | #646 consolida fonte/ano/desktop; decisões de comparabilidade/configuração e validação visual restantes |
| FINAL-3 | #635 | Conselho humano, histórico, durabilidade e fechamento |
| FINAL-4 | #406 | piloto integral, recuperação e retirada seletiva do legado |

#347 registra aceite acadêmico por consumidor/escopo; #596 encerra a operação institucional; #220 é observabilidade transversal. #637 foi a remediação de dependências, com [evidências próprias](SECURITY_REMEDIATION_637.md). Nenhuma entrega parcial encerra FINAL-1/2 automaticamente.

## Fontes funcionais e invariantes

`PAINEL DESEMPENHO` governa sua experiência. Do documento antigo `APENAS CONSELHO`, somente Conselho permanece funcionalmente vigente. F1 = **7/7** e outros fechamentos antigos valem no seu contexto, não como prova automática da compatibilidade atual. [Planejamento anterior preservado](history/pre-final-1/README.md).

Uma regra, um núcleo; fatos/referências separados dos derivados; nenhum resultado fictício; Conselho humano; históricos preservados; diagnósticos resolvidos removidos na leitura correspondente; auth/capabilities no backend; no-store; sem dados acadêmicos persistentes no browser ou dados privados em Git/CI. Nome `d1-*` não demonstra provider físico: conferir composição e SQL.

Fluxo: issue/contrato → commit na branch → revisão → `npm run verify`/CI do head final → integração/deploy oficial → evidência sanitizada. **BN-DEC-023 dispensa nova confirmação por PR concluída**, não os gates nem autorizações próprias para dados/schema, infraestrutura ou autoridade acadêmica.
