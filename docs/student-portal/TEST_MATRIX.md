# Matriz de requisitos e provas

Suite executável #702: tests/student-portal/contracts/contracts-v1.test.ts. Fixtures inventadas em shared/student-portal-contracts/fixtures-v1.ts; não derivadas da massa real. O nome e resultado da execução efetiva/commit/ambiente vão no handoff #702. A tabela distingue contrato testável aqui e prova de implementação futura: não são equivalentes.

| Requisito / origem | Testes #702 | Prova posterior |
|---|---|---|
| vínculo/2026/sem nome AD-01/02 | identity and envelope: ano/ID/unknown keys/escopo | #703/#704/#707 FK/unique/movimentos reais |
| HTTP erro/paginação cap. 8 | bounds pagination and public errors | #713 limites bytes/cursor/authz |
| PIN4/senha6/confirm cap. 4 AD-07 | authentication boundary | #711 KDF/locks/replay/cookies |
| QR mesma origem/rota/version cap. 4 | constrains QR origin | #711 HMAC/rotação/reprint; não provar assinatura pelo regex |
| calendário/risco AD-04…07 | calendar, inheritance and birth | #708 resolução efetiva/datas/efeito imediato; #714 carga |
| nascimento completo/CAS/clear/batch AD-03 | rejects incomplete; explicit clear/batch | #709/#711 corridaPIN/desafio/sessão |
| autoridadeBN/N-C/0/R-R/assistido cap. 5 | preserves zero/NC/absent/RR | #703/#710 fonte oficial/EXPLAIN/sem N+1 |
| admin completo/privacidade cap. 8/16 | parses all mutation operations; safe responses | #713/#715 Entra→RPC/IDOR/CSRF/contexto falso |
| QR três modos cap. 4/17 | three print modes | #713 autorização/lote; PDF/câmera física P2 |
| publicação cap. 5 AD-05/06 | self strict/no-publication/partials absent | #712/#714 version/manual/auto-update/race/despublicação |
| schema/ACL cap3 | tipos/ports, sem DDL nesta issue | #704/#705 PG real/replay/ACL+/−/rollback |
| reset opção A | comando links-close distinto de account-reset | #706/#707 multiconexão/reset×create/import/close/deadlock |
| jobs/revisões cap. 5/7 | ports versionados | #707/#712/#714 flushV11/crash/retry/lease |
| retenção90d/12m cap. 6/7 | DTO restrito/auditoria | #714 limpeza verificável/IP/telemetria sem secrets |
| recovery cap7 AD-backup | contrato sem fallbackD1 | #714 chaves/restauraçãoantiga/revogações; gerenciado adiado |
| isolamento/nodepsUI cap. 18 | typecheck contratos semReact/runtime | #705/#715 driverWorker/TLS/preview/BNregression |

Cada cenário de segurança exige positivo/negativo/limite e regressão de defeito. #704…#715 atualizam seus testes e entregam delta documental ao integrador, sem disputar arquivo central. CI usa Node22; execução local desta entrega Node24.16.0/Windows deve ser identificada. verify inclui lint/types/test/build; CI final no SHA esperado antes de merge. Teste omitido/skip não vira evidência. Sem dados reais em outputs públicos. Nenhum G-B por mocks/PGlite: PostgreSQL descartável/múltiplas conexões/Worker/Hyperdrive/browser reais exigidos nas entregas designadas.
