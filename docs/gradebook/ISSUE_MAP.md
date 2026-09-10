# Mapa de issues — programa final

Referências: #182, `PROJECT_STATE.yaml`, `COMECE_AQUI.md` e `CONSUMER_MAP.md`.

| Papel | Issue | Situação de execução |
| --- | --- | --- |
| Programa | #182 | acompanhamento das quatro fases |
| FINAL-1 | #633 | execução; PR #636 é entrega parcial |
| FINAL-2 | #634 | planejada; depende de base/contratos relacionais |
| FINAL-3 | #635 | planejada; depende de base e conciliação de Conselho |
| FINAL-4 | #406 | piloto integral após adaptações funcionais |
| Aceite acadêmico | #347 | gate por consumidor/escopo, sem ativação automática |
| Entrega institucional | #596 | após fases, piloto, aceite e recuperação |
| Observabilidade global | #220 | planejada; não é banco paralelo nem gate por existência |

## Trilhas preservadas, não reexecutadas

- #613: reconstrução/cutover simplificado concluídos; seus comentários finais prevalecem sobre o estado inicial do corpo.
- #625/#627/#629: diagnóstico humano, correção de indisponíveis e retenção apenas de problemas atuais.
- #631/#632: arquivamento seletivo dos importadores exclusivos.
- #592/#594/#595 e coordenação #593: história da migração física anterior.
- #185/#192: filas substituídas por #633/#406/#596; seu encerramento administrativo não declara o produto integral concluído.

As dependências são de entregas aceitas, não apenas da existência de branches. A matriz de cada issue deve separar realizado, pendente, bloqueado e não aplicável.

## Branches reservadas

`feat/bn-final-1-runtime-relacional`, `feat/bn-final-2-desempenho`, `feat/bn-final-3-conselho`, `test/bn-final-4-piloto-integral`.

Somente a primeira está em execução nesta entrega. Atualizar as seguintes com a `main` validada antes de trabalhar; branches históricas não devem ser mergeadas só por estarem abertas/existirem.

## Contratos e evidência

Mudança em `shared/` exige issue `[BN][CONTRATO]` própria. Os conflitos de Conselho estão registrados na #635; pendências de consumidores em #633. Dados reais não entram em issues/PRs/CI. Fechamento por substituição sempre indica onde a obrigação continua.
