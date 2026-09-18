# Limpeza de histórico granular e resíduos — #863 / BN-DEC-039

## Objetivo

Depois da BN-DEC-038/#862, a planilha mais recente é o estado atual autoritativo de notas e instrumentos. Esta entrega remove o material acumulado que existia apenas para reconstruir valores anteriores de nota/máximo e impede que volte a crescer.

## O que é removido

- todas as linhas de `gradebook.nota_historico`;
- todas as linhas de `gradebook.instrumento_historico`;
- instrumentos qualitativos sem máximo, sem descrição e sem qualquer linha em `gradebook.nota`;
- tratamentos de Auditoria cuja chave já não existe na fotografia corrente;
- linhas de `gradebook.importacao` que, após a limpeza, não são referenciadas por `fechamento_historico` nem `vinculo_historico`.

## O que não é removido

- notas numéricas atuais;
- linhas `nota(NULL)` pertencentes a instrumento atual/observado, pois representam “Não fez”;
- fechamentos AM/U e REC;
- `fechamento_historico`, porque ainda registra mudança de fonte oficial/importada;
- `vinculo_historico`, necessário à trajetória cadastral quando existir;
- Conselho, sessões, votos e decisões;
- snapshots de boletins;
- diagnósticos atuais da Auditoria.

## Prevenção de novo lixo

O importador já não grava `nota_historico` nem `instrumento_historico`. A #863 reforça isso em três camadas:

1. o serviço de importação não cria `importacao` apenas para alteração granular de nota/instrumento;
2. o buffer PostgreSQL rejeita tentativa de INSERT nesses históricos;
3. `gradebook_app` perde `INSERT` e `UPDATE` nas duas relações. `SELECT` e `DELETE` permanecem somente para compatibilidade de reset/restore enquanto as tabelas físicas continuam no schema.

Uma importação continua podendo criar linha em `importacao` quando existe histórico retido que realmente exige referência, como mudança de fechamento oficial ou vínculo.

## Migration

`0012_current_state_cleanup_v1.sql` executa sob o lock global já usado pelos writers do Banco. Antes/depois ela confere quantidade total de notas atuais, quantidade de notas numéricas, soma numérica, fechamentos, boletins e conjunto mínimo do Conselho. Qualquer mudança nesses fatos aborta a transação.

A migration também exige, ao final:

- zero `nota_historico`;
- zero `instrumento_historico`;
- zero instrumento qualitativo completamente vazio e sem observação;
- zero tratamento de Auditoria órfão;
- zero `importacao` sem referência retida.

## Produção antes da limpeza

No preflight posterior à publicação da #862:

- `instrumento_historico`: 2.708 linhas;
- `nota_historico`: 80.779 linhas;
- `nota` com valor NULL: 28.870 — preservadas por padrão porque podem ser “Não fez”;
- instrumentos qualitativos totalmente vazios e sem notas: 19;
- `importacao`: 138;
- tratamentos de Auditoria órfãos: 0.

Os números finais devem ser registrados na issue após a aplicação produtiva.
