# Roadmap do Banco de Notas

As fases F0–F9 descrevem a construção funcional. A implantação institucional é acompanhada por uma trilha operacional de **5 etapas**. Em 2026-09-08, o programa está na **Etapa 3/5**.

## Trilha operacional de implantação

| Etapa | Estado | Objetivo | Issues guia |
|---:|---|---|---|
| 1/5 | concluída | fundação técnica, contratos, domínio e importação | #183–#186 |
| 2/5 | concluída | superfícies institucionais, hardening, durabilidade e readiness controlada | #187–#192 / ondas históricas |
| 3/5 | **em andamento** | storage PostgreSQL + piloto integral com `imported-source` | #592 → #594 → #595 → #406 |
| 4/5 | bloqueada | autoridade `native-engine` progressiva por escopo | #347 |
| 5/5 | bloqueada | entrega institucional, operação e fechamento da implantação | #596 |

A numeração operacional não reabre fases funcionais já concluídas. Ela indica apenas quanto falta para a implantação institucional completa.

## Etapa 3/5 — sequência obrigatória

### #592 — adapters PostgreSQL + dual verification

- D1 continua storage oficial;
- PostgreSQL é shadow/target;
- preservar contratos provider-independent, streams/versions, CAS, idempotência, staging, snapshots, Conselho e Auditoria;
- comparar resultados sem dados reais públicos.

### #594 — backfill privado + paridade

- migrar D1 → PostgreSQL sem recalcular regras acadêmicas;
- verificar contagens, versões, relações e hashes técnicos sanitizados;
- D1 continua canônico enquanto houver divergência ou execução incompleta.

### #595 — cutover PostgreSQL + rollback D1

- PostgreSQL passa a leitura/escrita oficial somente após paridade;
- Hyperdrive precisa de consistência read-after-write apropriada;
- role de aplicação de menor privilégio e backup/restore são gates;
- D1 fica read-only como rollback por janela explicitamente definida.

### #406 — piloto integral final

- retomar somente após #595;
- validar o corpus privado integral no storage oficial;
- manter `authorityMode: imported-source`;
- concluir idempotência, CAS, histórico, Auditoria, reconciliação, Desempenho, Boletins, Relatórios, Conselho e recovery.

A Etapa 3/5 termina somente quando #595 e #406 estiverem verdes.

## Etapa 4/5 — #347

Ativar `native-engine` apenas por escopos aprovados conforme BN-DEC-019/020:
- vigência temporal explícita;
- versionamento e histórico reproduzíveis;
- rollback;
- divergências materiais reconciliadas;
- sem fallback automático para a planilha;
- Conselho/decisões humanas fora da autoridade automática.

## Etapa 5/5 — #596

Encerrar a implantação com:
- storage oficial estável;
- janela de rollback encerrada deliberadamente;
- D1 preservado/arquivado sem exclusão precipitada;
- observabilidade e Saúde e limites (#220) quando aplicável;
- backup/restore e runbook operacional;
- documentação canônica final;
- smoke final e backlog de implantação limpo.

## Estado das fases funcionais

- **F0 #183 — Fundação:** concluída.
- **F1 #184 — Fonte/importação:** concluída; V8 é o transporte vigente de valores.
- **F2 #185 — Persistência:** funcional; migração física para PostgreSQL em andamento.
- **F3 #186 — Motor nativo:** V1 comparativo concluído; autoridade futura pela #347.
- **F4 #187 — Auditoria:** concluída.
- **F5 #188 — Centrais operacionais:** concluída.
- **F6 #189 — Desempenho:** concluída funcionalmente.
- **F7 #190 — Conselho:** concluída e fechada.
- **F8 #191 — Boletins/Relatórios:** concluída e fechada.
- **F9 #192 — Implantação/segurança:** aberta até a Etapa 5/5.

## F4 — Reconciliação e Auditoria

O escopo autoritativo de fechamento da F4 permanece preservado, independentemente da troca do provider físico:

- chave técnica de lançamento e prevenção de duplicidade;
- versões de arquivos e valores;
- tratamento `FOI PARA` / `ESTAVA NO` sem dupla contagem;
- promoção/rejeição de lote;
- ocorrências estruturais, cadastrais, de nota, cálculo, origem e tempo;
- área funcional de Auditoria com gravidade, origem, ação e resolução;
- bloqueio de falso sucesso quando houver erro crítico.

A migração D1 → PostgreSQL deve manter essas sete garantias sem alterar semântica acadêmica ou taxonomia.

## F5 — Contexto e centrais operacionais

A F5 permanece concluída: contexto de ano, Professor, Turma, Componente, Estudante, atribuições e pesquisa global continuam consumindo portas/read models provider-independent. A migração de storage não cria centrais paralelas.

## Decisões de storage e autoridade

- BN-DEC-021 substitui BN-DEC-016 quanto ao armazenamento físico principal: PostgreSQL/Supabase via Hyperdrive é o alvo.
- D1 permanece canônico até #595 e depois rollback durante janela definida.
- A mudança de storage **não** altera autoridade acadêmica.
- `authorityMode: imported-source` permanece até a #347.

## Regras permanentes

- uma regra acadêmica existe em um único núcleo;
- uma issue → uma branch curta → um PR;
- `npm run verify` antes de declarar pronta;
- merge/deploy somente quando a issue autorizar;
- nenhuma credencial, payload acadêmico ou dado real no Git/CI;
- histórico/versionamento, CAS, idempotência e rollback não podem ser enfraquecidos para acelerar implantação.

## Regra de conclusão

Uma entrega só é considerada concluída quando os critérios aplicáveis estiverem verdes, a `main` estiver integrada, o workflow oficial tiver passado, o resultado tiver sido verificado quando visível e a issue/documentação canônica tiver sido atualizada pelo integrador.