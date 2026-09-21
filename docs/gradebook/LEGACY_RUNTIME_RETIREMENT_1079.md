# Retirada autorizada do runtime legado (#1079)

## Contrato

BN-DEC-041 substitui o bloqueio documentado em `LEGACY_RUNTIME_970.md` depois
da autorizacao explicita do responsavel. A baseline anterior e
`main@58d5f399b288663eb083a0b4c4aae11bc48e4385` (PR #1078).

| Superficie | Retirada em todos os ambientes | Preservada |
| --- | --- | --- |
| Centrais | Workspace V1 | Workspace V2 |
| Desempenho | Performance V1 | V2-V6, capacidades aditivas |
| Boletins | Transporte V1 | V2, snapshots e PDF compartilhado |
| Relatorios | Transporte V1 | V2 |
| Conselho | Transportes V1/V2 | V3 |
| Persistencia admin | Execucao de migrations D1 local/preview | Status PostgreSQL autenticado |

Requisicao retirada valida e autorizada retorna HTTP 410 com o DTO `unavailable`
da propria versao e headers anti-cache. Auth, capability, origem, metodo,
limite de corpo e validacao continuam antes da resposta. 401/403/400 nao viram
410. Nenhum binding ou runtime de banco e acessado nesse caminho.

PostgreSQL e o unico provider suportado, inclusive local/preview. Configuracao
ausente ou `d1` falha fechada nos caminhos atuais; nao existe fallback. O campo
legado de ambiente e apenas entrada rejeitada/sombreada, nunca acesso fisico.

## Persistencia

As dez fatias B-15 ja retiraram todas as chamadas de banco `prepare`/`exec` dos
fluxos atuais. Esta entrega retira da fachada e do lazy adapter o protocolo
`prepare/bind/exec/batch`, o tradutor SQL e a inferencia de JSON por contexto SQL.
`query`, `executeNative`, JSON explicito, contagem de linhas/CAS, isolamento,
transacao fisica, normalizacao de saida e `lastFailure` permanecem.

O runtime D1, migrations D1 e fixtures exclusivamente legadas estao em
`Aprendizados/RUNTIME-D1-RETIRADO-1079`. Testes mistos de ondas historicas leem
essa memoria como texto e preservam suas assercoes atuais. Nao se arquivam
contratos ou calculos apenas por terem sufixo V1. V9/V10/V11 permanecem atuais.

## Aceite e limites

- Testes HTTP: versoes retiradas sem I/O, auth/origem/validacao e versoes atuais.
- Testes nativos: SQL literal, JSON explicito, contagem/CAS, rollback, mesma
  conexao fisica, diagnostico sanitizado e provider lazy sem fallback D1.
- Fronteira estatica: nenhum import ativo para D1 ou para o arquivo historico;
  nenhuma facade publica o protocolo retirado. Teste de mutacao do bloqueio.
- Lint/typecheck, suite completa, gates PostgreSQL/Portal/Sonar no head final,
  merge commit e deploy oficial conforme BN-DEC-023.

Esta entrega nao executa migrations, reset, importacao ou qualquer escrita de
dados produtivos; nao muda ACL/RLS, schema, formulas ou autoridade academica.
CI nao substitui smoke autenticado. SHA, resultados, publicacao e limitacoes
efetivamente verificadas sao registrados na #1079, sem antecipar conclusao.
