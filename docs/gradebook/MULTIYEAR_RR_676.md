# Anos letivos materializados e marcador R/R — #676

## Fronteiras

- A Relação é o único bootstrap de um ano letivo.
- Notas exigem ano já materializado; não criam contexto e não mudam de ano.
- IDs de aluno são novos a cada ano, inclusive para nomes iguais.
- O ano global fica em memória e governa Centrais, Auditoria, Desempenho, Boletins, Relatórios e Conselho.
- Não existe comparação entre anos; a comparação trimestral mantém turma, aluno, componente, lente, modo e ano iguais.
- Dados das massas privadas são teste, não autoridade institucional nem aceite visual.

## R/R

O transporte V9 representa `R/R` como `['r']`. A persistência usa `fechamento.rec_rr_mask`, separada de `rec_nc_mask`, e o histórico usa estado `3`. As máscaras são disjuntas, um bit marcado exige REC numérica nula e estados marcadores existem somente nos campos REC 1–3.

O motor classifica o componente como `failed-repeat` sempre que qualquer fonte REC contém `RR`, mesmo que a nota normal já atingisse o mínimo. O resultado anual então é `REPROVADO`, `not-eligible` para Conselho. Esse estado tem precedência sobre componente em curso, recuperação pendente e `N/C`, ressalvadas as situações terminais de matrícula que continuam independentes da regra acadêmica.

## Segurança e publicação

Arquivos reais permanecem privados e inalterados. Evidência pública usa somente contagens agregadas. DDL deve ser revisado e reproduzido em PostgreSQL descartável antes da aplicação remota; após a aplicação, conferir constraints, ACL/drift, contagens acadêmicas e Advisor. Merge/deploy seguem BN-DEC-023.
