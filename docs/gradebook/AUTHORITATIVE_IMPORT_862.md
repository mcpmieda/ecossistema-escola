# Importação autoritativa do estado atual — #862 / BN-DEC-038

## Regra institucional

Cada nova importação de uma planilha de notas representa o **estado atual completo** daquela fonte. Para o mesmo professor, turma, componente, trimestre e slot, a fotografia mais recente substitui o estado anterior.

- máximo 6,0 → 3,0: o estado atual passa a 3,0;
- nota 4,0 → 7,0: o estado atual passa a 7,0;
- nota numérica → célula vazia em instrumento ativo: o estado atual passa a “Não fez”;
- instrumento qualitativo realmente apagado: definição e lançamentos atuais desse instrumento deixam de existir;
- informação que o navegador não conseguiu ler não é interpretada como apagamento.

AM/U, REC, PARA, Conselho e snapshots de boletim mantêm suas regras próprias. Esta decisão altera a semântica de **persistência da importação granular**, não a fórmula acadêmica.

## Vazio observado × indisponível

A distinção é obrigatória:

| Origem | Significado | Persistência |
| --- | --- | --- |
| célula de definição lida vazia, nome vazio e coluna sem lançamentos | instrumento foi retirado | slot é omitido no payload e removido do estado atual |
| célula de definição lida vazia, mas atividade ainda tem nome ou lançamento | definição atual sem máximo | máximo atual é limpo; Auditoria orienta correção |
| campo/célula não pôde ser lido | origem indisponível | estado anterior daquele campo é preservado; Auditoria aponta guia/célula/causa |
| célula de aluno vazia em instrumento ativo | aluno não fez | permanece estado atual “Não fez” |
| coluna apagada/inativa | não é avaliação atual | nenhum `nota(NULL)` é enviado nem persistido para ela |

Assim, linha NULL de um **instrumento ativo** não é tratada como lixo porque carrega a semântica “Não fez”. O lixo eliminado é a observação vazia de uma coluna que já não existe como instrumento atual.

## Transporte V9 compatível

Termos produzidos pelo navegador passam a incluir `definitionSnapshotVersion: 1`.

- `instrumentos` contém somente os slots presentes/ativos na fotografia atual;
- `unavailableMaximumSlots` informa máximos que não puderam ser lidos;
- `unavailableDescriptionSlots` informa nomes que não puderam ser lidos;
- ausência de um slot qualitativo da lista, sem marca de indisponibilidade, é exclusão autoritativa;
- requests antigos sem `definitionSnapshotVersion` continuam com a política conservadora anterior.

Não há nova versão HTTP nem quebra de clientes antigos.

## PostgreSQL

No snapshot autoritativo:

1. slots qualitativos retirados são excluídos do estado atual;
2. suas linhas atuais de nota são removidas antes do instrumento;
3. máximo/nome observados substituem integralmente os campos atuais, inclusive por NULL quando a planilha realmente os limpou;
4. campos marcados como indisponíveis preservam o último valor conhecido;
5. alterações de nota/instrumento não geram novos `nota_historico` ou `instrumento_historico`.

A limpeza acumulada dos históricos anteriores e de resíduos preexistentes pertence à #863.

## Auditoria

`importacao_diagnostico` continua sendo fotografia atual. Uma reimportação corrigida remove o diagnóstico resolvido.

A BN-DEC-027/#674 é retificada apenas quanto à durabilidade de tratamento humano: reconhecimento/anotação deixam de sobreviver ao diagnóstico. Durante a substituição da fotografia, tratamentos de chaves que não existem na nova observação são removidos na mesma transação. Não há alerta/tratamento órfão.

Para máximos qualitativos, a preparação agora gera orientação explícita:

- guia;
- célula do máximo;
- turma/componente/trimestre;
- causa (campo ausente, marcador, conteúdo não reconhecido ou máximo vazio em atividade ainda existente);
- ação recomendada.

Nesta entrega esses novos diagnósticos são orientação. A política futura poderá transformá-los em bloqueio de importação sem precisar redefinir a observação da fonte.

## Retirada da exceção #855

O manifesto específico por professor/turma criado na #855 foi uma proteção transitória para o estado já corrigido. Com o snapshot autoritativo ele deixa de ser necessário e é removido. A correção de dados feita pela #855 permanece válida, mas novas importações passam a obedecer exclusivamente a fotografia atual da planilha.

## Testes mínimos

- coluna qualitativa realmente apagada não entra no payload;
- slot indisponível é marcado e não confundido com exclusão;
- coluna ativa vazia continua gerando “Não fez”;
- servidor remove slot omitido da fotografia autoritativa;
- máximo/nome novos substituem o estado anterior;
- nenhuma nova linha é criada em `nota_historico`/`instrumento_historico`;
- Auditoria aponta definição ilegível e remove tratamento quando a chave é resolvida;
- requests V9 antigos permanecem interpretáveis.
