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

1. o serviço de importação não cria `importacao` para mudanças de estado atual por si só; a linha só nasce quando um histórico retido, como fechamento ou vínculo, precisa referenciá-la;
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

## Triagem do Sonar — `DELETE` sem `WHERE`

O Sonar marca como BLOCKER as duas instruções das linhas 40–41:

```sql
DELETE FROM gradebook.nota_historico;
DELETE FROM gradebook.instrumento_historico;
```

**Veredito: falso positivo.** A regra existe para pegar `DELETE` sem filtro escrito por engano. Aqui o esvaziamento integral das duas tabelas é o objetivo da migration, e a intenção está protegida em quatro camadas independentes:

1. **Decisão normativa.** BN-DEC-039 determina que as duas relações deixam de ser parte operacional e que seus dados acumulados são apagados.
2. **Execução atômica e exclusiva.** Tudo roda entre `BEGIN` e `COMMIT`, sob `pg_advisory_xact_lock(613,0)`, que bloqueia todos os writers do Banco durante a limpeza.
3. **Pós-condições que abortam.** Antes e depois dos `DELETE`, a migration compara notas atuais, notas numéricas, soma numérica, fechamentos, boletins e Conselho. Qualquer diferença dispara `RAISE EXCEPTION` e desfaz a transação inteira. Os `DELETE` só podem atingir o histórico.
4. **Impossibilidade de reenchimento.** A migration revoga `INSERT` e `UPDATE` dessas tabelas para `gradebook_app`, e o buffer de importação (`relational-import-write-buffer-v11.ts`) lança `gradebook-import-granular-history-retired` diante de qualquer tentativa de gravação. As tabelas não voltam a acumular dados, então a limpeza não precisa ser repetida.

### O que não fazer

- **Não editar a migration.** Ela foi aplicada e verificada em produção na #863. Alterar o arquivo, mesmo só para acrescentar um filtro ou comentário, faz o repositório divergir do que o banco executou.
- **Não "corrigir" com filtro artificial.** Trocar por `WHERE true` ou equivalente apenas esconde a instrução do analisador e piora a leitura, sem mudar o comportamento.

### Ação pendente fora do repositório

Marcar as duas ocorrências como **False Positive** na interface do SonarCloud, citando esta seção. Isso fica registrado na trilha de auditoria do próprio Sonar e impede que o alerta volte a aparecer como pendência.

## Produção antes da limpeza

No preflight posterior à publicação da #862:

- `instrumento_historico`: 2.708 linhas;
- `nota_historico`: 80.779 linhas;
- `nota` com valor NULL: 28.870 — preservadas por padrão porque podem ser “Não fez”;
- instrumentos qualitativos totalmente vazios e sem notas: 19;
- `importacao`: 138;
- tratamentos de Auditoria órfãos: 0.

Os números finais devem ser registrados na issue após a aplicação produtiva.
