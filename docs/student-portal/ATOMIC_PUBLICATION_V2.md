# Publicação atômica por escopo — #803

## Decisão vigente

Em 15/09/2026, o responsável autorizou substituir a disponibilização por fila individual para priorizar rapidez e confiabilidade. Esta decisão substitui as restrições técnicas anteriores que exigiam materialização por conta, sem alterar notas, autoridade acadêmica, autenticação, calendário ou autorização de períodos. A especificação anterior permanece histórica onde conflitar com este desenho.

A preparação da fonte e a autorização de leitura são operações separadas. Uma publicação confirmada passa a ser observável na primeira consulta autorizada iniciada após seu commit, sem executar cron ou criar jobs por aluno. Isso não promete ausência de falhas de infraestrutura nem atualização instantânea de uma página que ainda não fez nova consulta.

## Fluxo

1. No commit de uma revisão acadêmica de 2026, o PostgreSQL prepara uma edição imutável dos insumos individuais. A preparação usa referências acadêmicas, não contas de login. Um constraint trigger diferido vê as alterações finais da transação e confirma fonte/revisão juntas. Rollback preserva ambas. Insumos inalterados não são copiados novamente.
2. Publicar/atualizar/retirar grava uma linha por escola, turma ou aluno e período. Um controle de versão exclusivo da publicação serializa somente essas decisões curtas. Não há advisory lock anual, bloqueio de contas ou criação de jobs no comando. Decisão, auditoria e recibo idempotente são atômicos; resposta perdida pode ser confirmada com os mesmos bytes/chave.
3. A consulta Self valida sessão, revogação, vínculo e políticas vigentes. Busca somente as edições autorizadas daquele aluno. A projeção reutiliza o motor TypeScript existente; SQL não calcula notas ou cria outra regra acadêmica. O DTO não recebe os insumos privados nem dados de outros alunos.

Entre decisões sobrepostas, prevalece a de maior versão confirmada, inclusive retirada explícita. Uma nova publicação de turma/escola substitui decisões individuais anteriores abrangidas, como já fazia a publicação em lote. Autorizações individuais positivas estão vinculadas à turma observada; uma troca de turma não reutiliza a edição anterior. Um novo aluno sem dados na edição congelada requer nova publicação/atualização para receber fatos posteriores.

Atualização automática OFF conserva a edição aprovada. ON avança somente períodos já liberados. O último avanço automático é fixado na persistência para que desligar a opção não faça as notas retrocederem. Permissões e calendário continuam filtrando cada resposta; data futura pode adiar a exibição. Sem data específica de divulgação, a decisão manual continua válida dentro do período permitido.

## Transição e segurança

As migrations 0008 e 0009 são aditivas. A instalação prepara a fonte, mas deixa `publication_control_v2.enabled=false`. A variável `PORTAL_PUBLICATION_MODE=scoped-v2` apenas declara um runtime compatível; a ativação no banco é separada.

Sequência obrigatória: validar o head final com verify e PostgreSQL nativo; aplicar ambas as migrations; publicar o runtime compatível pelo workflow oficial; verificar o deploy; chamar `student_portal.activate_scoped_publication_v2()` com o papel administrativo do banco; conferir o estado e a compatibilidade das publicações anteriores.

A ativação não abre períodos novos. Preserva a projeção legada exata já publicada e pode adotar somente pendências antigas cuja fonte e versões ainda sejam válidas. Uma pendência de edição indisponível impede a ativação, em vez de substituí-la pelas notas atuais. Após a ativação, o cron não reconcilia/materializa por conta. A retenção de sessões/recibos/auditoria continua operando.

A migration 0009 recusa INSERT/UPDATE de publicações e projeções legadas, e INSERT de jobs legados, após a ativação. DELETE de projeções continua permitido para encerramento/troca de vínculo. As leituras legadas são somente a base histórica de transição.

**Rollback:** depois da ativação, não desligar o modo nem publicar um runtime anterior que ignore decisões V2: isso poderia ignorar uma retirada recente. Preferir correção compatível mantendo a autoridade V2. Um retorno estrutural exige primeiro fechar o serviço e migrar explicitamente todas as decisões/revogações; restaurar uma versão antiga por si só não é seguro. As migrations não são removidas para reverter código.

Schema privado, grants mínimos e ausência de acesso anon/authenticated permanecem. PORTAL_DB deve continuar sem cache de consultas; no-store continua nos dados HTTP. Não guardar snapshots de notas no navegador. Retenção das edições aprovadas deve preservar as referências necessárias; esta entrega não faz exclusão automática de fontes históricas.

## Validação e limites

`tests/student-portal/admin/atomic-publication-v2.postgres.ts` usa cluster PostgreSQL descartável, massa inventada e papel restrito. Cobre fonte/commit/rollback/deduplicação, versões congeladas, atualização automática ON/OFF, retirada, escopos sobrepostos, troca de turma, isolamento, recibo, compatibilidade legada e composição HTTP com sessão opaca real sintética. Inclui publicação de 400 referências, dez componentes e 156.000 lançamentos, registrando separadamente preparação, decisão e leitura.

Resultados, SHA, CI, aplicação das migrations, ativação e deploy efetivos ficam no handoff da #803/PR #804; este documento não antecipa aprovação. Tempos sintéticos não são SLA da produção. A preparação ainda tem custo de banco e deve ser medida no volume real; a economia central é retirar esse trabalho do clique em Publicar.

O frontend da estabilização #802 reconsulta abas estudantis visíveis a cada 30 segundos e ao recuperar foco, sem sobrepor solicitações. Essa cadência é distinta da liberação no servidor. Não há canal WebSocket/Broadcast novo nesta entrega. Testes DOM e HTTP sintéticos não comprovam navegação visual autenticada no ambiente produtivo.

## Fontes primárias consultadas

- PostgreSQL 17 — snapshots consistentes por instrução e controle de concorrência: https://www.postgresql.org/docs/17/transaction-iso.html
- PostgreSQL 17 — constraint triggers diferidos no fim da transação: https://www.postgresql.org/docs/17/sql-createtrigger.html
- Microsoft — CQRS simples pode manter leitura/escrita no mesmo banco; mensageria não é requisito: https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
- AWS — atomicidade entre persistência e trabalho derivado: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
- Cloudflare — escritas não invalidam automaticamente o cache de consultas Hyperdrive: https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
