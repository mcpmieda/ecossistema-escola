# Banco de Notas — ponto de entrada

## Estado recuperado em 10/09/2026

A #613 encerrou a reconstrução simplificada e homologou a **persistência** PostgreSQL/Supabase via Hyperdrive `PROD_DB`. Importador externo V9, serviços internos V10/V11 e Auditoria de diagnósticos atuais estão integrados. São **19 tabelas centrais + `importacao_diagnostico` = 20 tabelas**, não o antigo schema de 29 tabelas.

Os demais painéis têm código existente, mas ainda dependem de fontes e contratos da geração anterior. A adaptação e a homologação integral não estão concluídas. Não confundir nome `d1-*` com provedor físico, nem código integrado com consumidor oficialmente aceito.

## Leitura e execução

1. [`COMECE_AQUI.md`](COMECE_AQUI.md): tarefa atual e dependências.
2. [`PROJECT_STATE.yaml`](PROJECT_STATE.yaml): baseline auditada versus trabalho na branch.
3. [`DECISIONS.md`](DECISIONS.md): decisões anteriores preservadas e substituições expressas.
4. [`ARCHITECTURE.md`](ARCHITECTURE.md) e [`CONSUMER_MAP.md`](CONSUMER_MAP.md): cadeias reais e lacunas por consumidor.
5. [`CONTRACTS.md`](CONTRACTS.md), [`ROADMAP.md`](ROADMAP.md), [`ISSUE_MAP.md`](ISSUE_MAP.md) e [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).

## Programa final

| Fase | Issue | Entrega |
| --- | --- | --- |
| FINAL-1 | #633 | documentação, baseline reproduzível, leituras relacionais compartilhadas e migração dos consumidores |
| FINAL-2 | #634 | Desempenho conforme seu documento funcional |
| FINAL-3 | #635 | Conselho de Classe, decisões humanas, durabilidade e fechamento |
| FINAL-4 | #406 | piloto integral, recuperação e retirada seletiva do legado |

#347 registra aceite acadêmico por consumidor/escopo. #596 encerra a operação institucional; #220 é observabilidade global planejada. A PR #636 é a primeira entrega **parcial** da #633, não fecha toda a fase.

## Fontes funcionais

`PAINEL DESEMPENHO` governa a experiência de Desempenho. Do documento antigo `APENAS CONSELHO`, usar somente as partes de Conselho; não reativar seu planejamento de persistência, importação, diagnósticos ou painéis antigos. Conflitos reais com o modelo simplificado exigem contrato explícito, não inferência.

F1 = **7/7** e demais fechamentos antigos permanecem evidências do contexto em que foram feitos; não demonstram compatibilidade automática dos consumidores atuais. O [planejamento anterior](history/pre-final-1/README.md) foi preservado integralmente. Documentos de ondas, D1, backfill e cutover antigos são históricos quando tratam de relações removidas.

## Invariantes

Uma regra acadêmica, um núcleo; fatos e referências de fonte separados dos derivados; nenhum resultado fictício; Conselho humano; histórico acadêmico preservado; diagnóstico corrigido removido na próxima leitura correspondente; auth/capabilities server-side; `no-store`; nenhuma base acadêmica persistente no browser; nenhum dado privado em Git/CI.

Processo: issue → branch → PR → `npm run verify` → CI → integração/publicação autorizada → evidência sanitizada. Nenhum merge, migration, alteração de infraestrutura ou ativação de autoridade está autorizado por este documento.
