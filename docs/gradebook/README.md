# Banco de Notas — ponto de entrada

## Estado recuperado e integrado

A #613 encerrou a reconstrução e homologou a persistência PostgreSQL/Supabase via Hyperdrive `PROD_DB`: 19 tabelas centrais + `importacao_diagnostico` = 20, não streams/versions. Importador externo V9, serviços internos V10/V11 e retenção de diagnósticos atuais estão homologados.

A #636 foi integrada em `main@4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`; deploy 254 aprovado. Planejamento reconciliado, leituras em lote, baseline de schema reproduzível e Auditoria transacional fazem parte dessa base.

A **#639 / PR #640** acrescentou contexto, pesquisa e quatro Centrais somente leitura no transporte V2. Foi integrada em `6683d1377f2dd090c1346f693a4af4c2e188d7ae`, com deploy 255 / `34477526551` aprovado. Deploy não equivale a smoke autenticado ou aceite integral das telas. Desempenho, Conselho, Boletins, Relatórios e escritas cadastrais ainda precisam de adaptação. Nome `d1-*` não demonstra provider físico.

A **#637 / PR #641** corrige duas cadeias de dependências e registra a autorização contínua de integração/deploy. [Evidências e limites](SECURITY_REMEDIATION_637.md); checkpoint da publicação na própria issue, separado da baseline acima.

## Leitura e execução

1. [COMECE_AQUI.md](COMECE_AQUI.md): tarefa e dependências.
2. [PROJECT_STATE.yaml](PROJECT_STATE.yaml): baseline integrada e entrega corrente.
3. [DECISIONS.md](DECISIONS.md): decisões anteriores preservadas e substituições expressas.
4. [ARCHITECTURE.md](ARCHITECTURE.md), [CONSUMER_MAP.md](CONSUMER_MAP.md) e [RELATIONAL_CENTERS_V2.md](RELATIONAL_CENTERS_V2.md): caminhos e limites.
5. [CONTRACTS.md](CONTRACTS.md), [ROADMAP.md](ROADMAP.md), [ISSUE_MAP.md](ISSUE_MAP.md) e [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Programa final

| Fase | Issue | Entrega |
| --- | --- | --- |
| FINAL-1 | #633; bloco cadastral #639/#640 integrado | documentação, baseline, fontes e consumidores relacionais |
| FINAL-2 | #634 | Desempenho conforme documento funcional |
| FINAL-3 | #635 | Conselho humano, histórico, durabilidade e fechamento |
| FINAL-4 | #406 | piloto integral, recuperação e retirada seletiva do legado |

#347 registra aceite acadêmico por consumidor/escopo. #596 encerra a operação institucional, #220 é observabilidade transversal e #637 é remediação de dependências. Nenhuma entrega parcial encerra FINAL-1 automaticamente.

## Fontes funcionais e invariantes

`PAINEL DESEMPENHO` governa sua experiência. Do documento antigo `APENAS CONSELHO`, só Conselho permanece funcionalmente vigente; não reativar importação, persistência ou Auditoria antigas. Conflitos exigem contrato explícito.

F1 = **7/7** e outros fechamentos antigos são evidências do seu contexto, não prova automática da compatibilidade atual. O [planejamento anterior](history/pre-final-1/README.md) foi preservado; ondas, D1 e backfill antigos não voltam à fila executável.

Uma regra, um núcleo; fatos e referências separados dos derivados; nenhum resultado fictício; Conselho humano; histórico acadêmico preservado; diagnósticos resolvidos removidos na leitura correspondente; auth/capabilities server-side; no-store; nenhum armazenamento acadêmico persistente no browser; dados privados fora de Git/CI.

Fluxo: issue → branch → PR → revisão → `npm run verify`/CI no head final → integração e deploy oficial → evidência sanitizada. **BN-DEC-023 autoriza integração/publicação de entregas concluídas sem nova confirmação individual.** Não autoriza contornar gates, alterar infraestrutura, executar mudanças destrutivas de dados/schema ou ativar autoridade acadêmica silenciosamente.
