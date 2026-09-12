# Mapa de issues — programa final

Referências: #182, `PROJECT_STATE.yaml`, `COMECE_AQUI.md` e `CONSUMER_MAP.md`.

| Papel                      | Issue          | Situação de execução                                                                               |
| -------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| Programa                   | #182           | acompanhamento das quatro fases                                                                    |
| FINAL-1                    | #633           | concluída, publicada e aceita visualmente                                                          |
| FINAL-2                    | #634           | concluída após #672/#673 e aceitação manual do responsável                                         |
| Fonte/ano/desktop          | #646           | concluída pela PR #647; seleção anual posteriormente substituída pela #649                         |
| Comparação trimestral      | #649           | concluída pela PR #650; contexto anual depois ampliado pela #676, sem comparação entre anos         |
| Boletins relacionais V2    | #654 / PR #655 | integrado/publicado no deploy 263; migration/postflight e smoke somente leitura verdes             |
| Relatórios relacionais V2  | #656 / PR #657 | integrado/publicado no deploy 264; CI e smoke autenticado somente leitura verdes                   |
| Auditoria relacional atual | #658 / PR #659 | integrada/publicada no deploy 265; smoke autenticado somente leitura verde                         |
| Configuração docente       | #660 / PR #661 | integrada/publicada no deploy 266; CI e smoke autenticado somente leitura verdes                   |
| Recuperação/contenção      | #662 / PR #663 | integrado/publicado no deploy 267; restore lógico, jornadas e disputa PostgreSQL local comprovados |
| Retirada Audit V1          | #664 / PR #665 | integrada/publicada no deploy 268; núcleo usado por Relatórios V1 preservado                       |
| Frontends não montados     | #666 / PR #667 | integrado/publicado no deploy 269; endpoints e serviços de compatibilidade preservados             |
| Métricas de Desempenho     | #668 / PR #669 | p95, payload e matriz utilizável autenticados passaram e foram documentados                          |
| Trilha humana da Auditoria | #674 / PR #675 | concluída, migrada, publicada e validada                                                            |
| Multi-ano e R/R            | #676 / PR #678 | concluída; ano global isolado e R/R terminal                                                        |
| Refinos de Desempenho      | #677 / PRs #681–#683 | concluídos e validados em desktop/mobile                                                       |
| Emissão terminal R/R       | #684 / PR #685 | concluída; individual, lote, snapshot, PDF e relatórios                                             |
| FINAL-3                    | #635           | concluída: Conselho V3, visual, contenção e ciclo anual humano                                      |
| FINAL-4                    | #406 / PR #686 | concluída: piloto integral e matriz sanitizada                                                      |
| Aceite acadêmico           | #347           | concluído; `imported-source` oficial e motor nativo descritivo                                      |
| Entrega institucional      | #596           | consolidação final; backup gerenciado explicitamente adiado                                         |
| Observabilidade global     | #220           | planejada; não é banco paralelo nem gate por existência                                            |

## Trilhas preservadas, não reexecutadas

- #613: reconstrução/cutover simplificado concluídos; seus comentários finais prevalecem sobre o estado inicial do corpo.
- #625/#627/#629: diagnóstico humano, correção de indisponíveis e retenção apenas de problemas atuais.
- #631/#632: arquivamento seletivo dos importadores exclusivos.
- #592/#594/#595 e coordenação #593: história da migração física anterior.
- #185/#192: filas substituídas por #633/#406/#596; seu encerramento administrativo não declara o produto integral concluído.

As dependências são de entregas aceitas, não apenas da existência de branches. A matriz de cada issue deve separar realizado, pendente, bloqueado e não aplicável.

## Branches reservadas

As branches das fases finais são históricas. Nova manutenção deve partir da `main` factual e usar issue/branch/PR próprios.

Branches históricas não devem ser mergeadas só por estarem abertas/existirem. Toda execução parte da `main` factual validada e registra seu próprio checkpoint na issue/PR.

## Contratos e evidência

Mudança em `shared/` exige issue `[BN][CONTRATO]` própria. Os conflitos de Conselho estão registrados na #635; pendências de consumidores em #633. Dados reais não entram em issues/PRs/CI. Fechamento por substituição sempre indica onde a obrigação continua.
