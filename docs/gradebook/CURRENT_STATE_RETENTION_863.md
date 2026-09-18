# Retenção de estado atual — #863 / BN-DEC-039

## Objetivo

Depois da BN-DEC-038/#862, a planilha mais recente é a fotografia autoritativa do estado atual. Esta entrega remove o acúmulo anterior que deixou de ter consumidor operacional.

## O que é removido

- todas as linhas antigas de `nota_historico`;
- todas as linhas antigas de `instrumento_historico`;
- instrumentos qualitativos sem máximo, sem descrição e sem qualquer linha de nota;
- tratamentos de Auditoria sem diagnóstico corrente correspondente;
- linhas de `importacao` que, depois da limpeza, não são referenciadas por `fechamento_historico` nem `vinculo_historico`.

## O que é preservado

- `nota` atual, inclusive NULL que representa “Não fez” em instrumento ativo;
- notas numéricas e sua soma;
- instrumentos ativos;
- `fechamento` e `fechamento_historico`;
- `vinculo` e `vinculo_historico`;
- AM/U, REC, PARA, Conselho;
- snapshots de boletins;
- diagnósticos atuais da Auditoria;
- tratamentos humanos de diagnósticos que continuam atuais.

As relações físicas `nota_historico` e `instrumento_historico` permanecem no schema por compatibilidade de replay/restore, porém devem ficar vazias.

## Bloqueio de regressão

Há três barreiras para impedir que o histórico granular volte:

1. o importador V9, desde #862, não gera mais INSERT nessas relações;
2. o buffer V11 rejeita explicitamente qualquer tentativa de `INSERT INTO gradebook.nota_historico`;
3. `gradebook_app` perde INSERT/UPDATE/DELETE nas duas tabelas, inclusive no script de provisionamento/recovery.

O proprietário/migration continua capaz de administrar o schema; isso não concede escrita ao runtime do Banco.

## Migration 0012

`0012_current_state_retention_v1.sql` é transacional e idempotente. Ela limpa os históricos, remove placeholders sem qualquer observação, elimina tratamentos órfãos, apaga recibos de importação sem referência útil restante e revoga escrita do backend nas duas relações históricas.

A migration falha no postflight se algum histórico granular permanecer, se existir placeholder qualitativo totalmente vazio, se houver tratamento órfão ou se `gradebook_app` ainda possuir privilégio de escrita nessas tabelas.

## Backup e recuperação

Os nomes das duas tabelas continuam no formato lógico antigo de backup para compatibilidade de restauração. Após esta decisão, backups novos devem normalmente carregar arrays vazios para ambas. Restaurar um artefato histórico antigo continua tecnicamente possível em ambiente descartável; aplicar a migration corrente após a restauração normaliza o banco para a política de estado atual.

Nenhum consumidor de produção deve depender do conteúdo dessas duas tabelas.

## Evidência produtiva prévia

Antes da limpeza, a produção possuía 80.779 linhas em `nota_historico`, 2.708 em `instrumento_historico`, 19 instrumentos qualitativos totalmente vazios e 138 recibos de importação. Desses recibos, 79 ficariam sem qualquer referência útil após remover os dois históricos. Havia 28.870 notas NULL atuais; elas não são alvo de limpeza em massa porque muitas representam “Não fez” em instrumento ativo.

O preflight/pós-flight final deve revalidar essas quantidades e comprovar que notas numéricas, fechamentos, Conselho e boletins permanecem idênticos.
