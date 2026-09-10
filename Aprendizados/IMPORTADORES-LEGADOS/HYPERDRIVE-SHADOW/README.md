# Método legado Hyperdrive — shadow / benchmark / backfill

Este diretório preserva o caminho de transição usado antes do importador relacional atual assumir a escrita PostgreSQL.

## O que era este método

Ele não era o mesmo fluxo usado hoje. O desenho antigo mantinha a semântica V8/D1 e usava PostgreSQL/Hyperdrive como destino de verificação, benchmark, backfill ou shadow:

`payload V8 → serviço de importação D1 em modo de captura → writes capturados → tradução para itens PostgreSQL → shadow/rollback/benchmark`

Também existiam endpoints de:

- probe da conexão;
- verificação de adapters;
- benchmark PostgreSQL;
- backfill D1→PostgreSQL;
- shadow de fonte;
- benchmark shadow específico do V8.

## Aprendizados

1. **Hyperdrive provou a conectividade antes do cutover.** Probe e verificação sintética permitiram validar a infraestrutura separadamente da semântica acadêmica.
2. **Shadow foi uma boa etapa de migração.** Capturar o plano do importador antigo e aplicá-lo em PostgreSQL permitiu comparar sem tornar o novo banco autoridade cedo demais.
3. **Backfill e shadow são ferramentas de transição, não arquitetura permanente.** Depois que o PostgreSQL virou autoridade direta, mantê-los no runtime passou a criar um segundo caminho mental e operacional.
4. **O melhor resultado do benchmark foi simplificar.** O modelo atual grava fatos relacionais diretamente; não reproduz streams/versions do D1 dentro do PostgreSQL.
5. **Conectividade e modelo são decisões separadas.** Hyperdrive continua atual como conexão; o shadow V8 arquivado aqui é que se tornou legado.

## Conteúdo

`codigo/` replica os fontes dos endpoints e adapters removidos. `testes/` preserva as suítes históricas de adapters, benchmark, backfill e shadow.

O banco oficial atual continua usando `official-gradebook-database-v1.ts` + `postgres-database-v1.ts`; esses arquivos **não** são legado e não estão arquivados.

## Reuso

Este material é útil se no futuro for necessário comparar provedores, fazer nova migração, criar shadow sem escrita autoritativa ou reconstruir um backfill. Deve ser copiado para uma branch e adaptado; não deve ser importado diretamente da pasta `Aprendizados`.
