# Mapa de issues — programa final

Referências: #182, `PROJECT_STATE.yaml`, `COMECE_AQUI.md` e `CONSUMER_MAP.md`.

| Papel                      | Issue          | Situação de execução                                                                               |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| Programa                   | #182           | acompanhamento das quatro fases                                                                    |
| FINAL-1                    | #633           | consumidores relacionais até Auditoria/configuração docente concluídos; gates operacionais restam  |
| FINAL-2                    | #634           | PRs #645/#647 integradas; comparação trimestral e 2026 fixo na #649/#650; visual conjunto pendente |
| Fonte/ano/desktop          | #646           | concluída pela PR #647; seleção anual posteriormente substituída pela #649                         |
| 2026/comparação trimestral | #649           | concluída pela PR #650; visual conjunto permanece na #634                                          |
| Boletins relacionais V2    | #654 / PR #655 | integrado/publicado no deploy 263; migration/postflight e smoke somente leitura verdes             |
| Relatórios relacionais V2  | #656 / PR #657 | integrado/publicado no deploy 264; CI e smoke autenticado somente leitura verdes                   |
| Auditoria relacional atual | #658 / PR #659 | integrada/publicada no deploy 265; smoke autenticado somente leitura verde                         |
| Configuração docente       | #660 / PR #661 | integrada/publicada no deploy 266; CI e smoke autenticado somente leitura verdes                   |
| Recuperação/contenção      | #662           | restore lógico e disputa PostgreSQL local comprovados; integração em execução                      |
| FINAL-3                    | #635           | Conselho V3 integrado/publicado pela #648/#653; visual/piloto restantes                            |
| FINAL-4                    | #406           | piloto integral após adaptações funcionais                                                         |
| Aceite acadêmico           | #347           | gate por consumidor/escopo, sem ativação automática                                                |
| Entrega institucional      | #596           | após fases, piloto, aceite e recuperação                                                           |
| Observabilidade global     | #220           | planejada; não é banco paralelo nem gate por existência                                            |

## Trilhas preservadas, não reexecutadas

- #613: reconstrução/cutover simplificado concluídos; seus comentários finais prevalecem sobre o estado inicial do corpo.
- #625/#627/#629: diagnóstico humano, correção de indisponíveis e retenção apenas de problemas atuais.
- #631/#632: arquivamento seletivo dos importadores exclusivos.
- #592/#594/#595 e coordenação #593: história da migração física anterior.
- #185/#192: filas substituídas por #633/#406/#596; seu encerramento administrativo não declara o produto integral concluído.

As dependências são de entregas aceitas, não apenas da existência de branches. A matriz de cada issue deve separar realizado, pendente, bloqueado e não aplicável.

## Branches reservadas

Corrente: `test/bn-relational-recovery-contention-662`. Reservada para o piloto posterior: `test/bn-final-4-piloto-integral`.

Branches históricas não devem ser mergeadas só por estarem abertas/existirem. Toda execução parte da `main` factual validada e registra seu próprio checkpoint na issue/PR.

## Contratos e evidência

Mudança em `shared/` exige issue `[BN][CONTRATO]` própria. Os conflitos de Conselho estão registrados na #635; pendências de consumidores em #633. Dados reais não entram em issues/PRs/CI. Fechamento por substituição sempre indica onde a obrigação continua.
