# Comece aqui — execução final

## Próxima tarefa segura

**#633 / FINAL-1**, branch `feat/bn-final-1-runtime-relacional`, PR #636. A issue autoriza execução e integração documental; não autoriza merge, publicação, DDL produtivo ou troca de autoridade.

Concluir/revisar a primeira entrega: documentos coerentes, mapa de consumidores e projeção em lote sobre o mesmo motor, com testes. Depois adaptar consumidores por contratos explícitos. Não declarar FINAL-1 encerrada por esse primeiro PR.

## Ordem das fases

| Ordem | Issue | Branch | Condição |
| --- | --- | --- | --- |
| 1 | #633 | `feat/bn-final-1-runtime-relacional` | em execução |
| 2 | #634 | `feat/bn-final-2-desempenho` | após fonte/contrato relacional compartilhado |
| 3 | #635 | `feat/bn-final-3-conselho` | após base relacional e contrato das lacunas de Conselho |
| 4 | #406 | `test/bn-final-4-piloto-integral` | após jornadas funcionais integradas |

Branches posteriores são reservas de trabalho e devem incorporar a `main` validada antes de execução. Não promover alterações parciais por merges cegos entre fases. #347 registra aceite por consumidor/escopo; #596 fecha a entrega.

## O que não refazer

A #613 concluiu a reconstrução e o cutover de persistência. Não reiniciar #592/#594/#595, não devolver PostgreSQL a shadow, não reativar V8 nem limpar a massa atual nesta tarefa. Os importadores arquivados ficam em `Aprendizados/IMPORTADORES-LEGADOS/`.

## O que falta de fato

O [mapa](CONSUMER_MAP.md) identifica as dependências antigas ainda ativas, seus contratos e os próximos blocos. Código com nome D1 pode estar conectado a PostgreSQL; o problema deve ser comprovado pela composição/SQL. Snapshot de Boletim, sessão de Conselho e contexto antigo não reaparecem por trocar o provider.

Antes de mudanças compartilhadas, abrir issue de contrato própria. Do documento antigo usar só Conselho; Desempenho segue seu documento específico.

## Gates

`npm run verify` no SHA final, CI, revisão e integração/publicação quando autorizadas. Sem dados reais públicos. Não afirmar restore por existir uma migration, nem afirmar todas as telas homologadas pela reimportação idêntica.

Os estados V1/V2 e a antiga onda 24 estão em [memória histórica](history/pre-final-1/README.md); não são a fila atual.
