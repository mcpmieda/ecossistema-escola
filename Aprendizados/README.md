# Aprendizados

Esta pasta preserva conhecimento técnico adquirido durante a construção do Ecossistema Escolar. Ela existe para que decisões, soluções e limitações que deram trabalho possam ser reutilizadas mesmo quando a tecnologia principal mudar.

## D1 — Banco de Notas

- [`D1-BANCO-DE-NOTAS.md`](D1-BANCO-DE-NOTAS.md) — arquitetura, schema, versionamento, CAS, durabilidade e operação.
- [`D1-IMPORTACAO-V8.md`](D1-IMPORTACAO-V8.md) — evolução do importador até o transporte V8 por valores, staging e atomicidade.
- [`D1-DESEMPENHO-E-DIAGNOSTICO.md`](D1-DESEMPENHO-E-DIAGNOSTICO.md) — limites observados, metodologia de diagnóstico, medições e critérios para reutilizar D1.

## Regra de segurança

Este diretório é público. Ele registra arquitetura, contratos, métricas agregadas e técnicas. Não devem ser adicionados nomes, notas, arquivos, payloads ou qualquer dado real de estudante.

## Contexto

Cloudflare D1 foi escolhido originalmente como armazenamento físico principal do Banco de Notas pela BN-DEC-016 / issue #200. A implementação produziu uma base importante de conhecimento sobre persistência versionada, reimportação idempotente, snapshots, CAS, transações e recuperação.

Em setembro de 2026, benchmarks controlados mostraram que o caminho PostgreSQL via Hyperdrive é mais adequado à carga de importação atual. Isso não invalida o trabalho feito no D1: os padrões de domínio, contratos, versionamento, auditoria e vários mecanismos operacionais continuam reutilizáveis em qualquer backend.
