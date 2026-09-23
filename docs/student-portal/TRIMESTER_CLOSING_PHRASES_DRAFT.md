# Fechamento do trimestre — rascunho do catálogo de frases

Status: **RASCUNHO para revisão do dono e aprovação da escola (D6)**. Não usar em produção antes da aprovação. A especificação está em `TRIMESTER_CLOSING_SPEC.md`.

## Regras que todas as frases seguem

- Falam com o aluno em "você", com tom adequado para 11–15 anos e para os pais lerem junto.
- **Nunca culpam o aluno.** Descrevem a situação e apontam um caminho.
- **Sem números, percentuais, quantidades ou nomes de atividades (R1).** Os únicos marcadores permitidos são `{disciplina}` e, no resumo geral, `{lista}` e `{trimestre}`.
- As variantes de um mesmo código têm **o mesmo significado e o mesmo peso**. A escolha segue a regra 7 da especificação: sorteio estável por aluno, sem repetir texto na tela dele.
- Em frases corridas, o nome da disciplina aparece só com a primeira letra maiúscula ("Português", "Ed. Física"), mesmo quando vem em caixa alta do Banco de Notas.

## 1. Conclusão (título do fechamento)

Aparece em destaque, abaixo do rótulo "Fechamento do Nº trimestre" (D10).

**`conclusion.good-with-point`**: foi bem, mas há um ponto a cuidar.
1. Seu trimestre foi bom, mas há um ponto para cuidar.
2. Você foi bem neste trimestre, e ainda dá para ajustar um detalhe.
3. Bom trimestre! Só um ponto merece sua atenção.

**`conclusion.attention`**: a disciplina pede atenção.
1. Esta disciplina pede sua atenção.
2. Neste trimestre, esta disciplina precisa de mais cuidado.
3. Vale dar uma atenção especial a esta disciplina.

**`conclusion.recovery`** (só no 3º trimestre, quando a situação oficial da disciplina for recuperação).
1. Nesta disciplina, o próximo passo é a recuperação.
2. Você vai fazer a recuperação nesta disciplina.
3. Esta disciplina segue para a recuperação.

**`conclusion.year-good`** (só no 3º trimestre, sem recuperação na disciplina).
1. Você fechou bem o último trimestre desta disciplina.
2. Bom fechamento de ano nesta disciplina.
3. Você terminou bem o ano nesta disciplina.

> Sem "aprovado": no 3º trimestre o resultado final depende do fechamento oficial e, em alguns casos, do Conselho.

## 2. O que mais pesou

Só uma frase, escolhida pela prioridade do motor.

**`weight.assessments`**: as avaliações puxaram o resultado para baixo.
1. As avaliações foram o principal ponto de preocupação.
2. O que mais pesou neste trimestre foram as avaliações.
3. As avaliações foram a parte mais difícil deste trimestre.

**`weight.not-done`**: houve atividades não realizadas (R4: sem dizer quantas nem quais).
1. Algumas atividades ficaram sem ser feitas, e isso pesou.
2. Houve atividades não realizadas neste trimestre, e elas fizeram falta.
3. Atividades que ficaram para trás pesaram no seu resultado.

**`weight.activities`**: as atividades do dia a dia ficaram abaixo do esperado (raro; as qualitativas costumam ir bem).
1. As atividades do dia a dia foram um desafio para você.
2. As atividades ao longo do trimestre foram o principal ponto de atenção.
3. O que mais pesou foram as atividades do dia a dia.

## 3. O que reconhecer

Só uma frase. Aparece só se houver um ponto positivo real.

**`strength.activities`**: foi bem nas atividades.
1. Suas atividades ao longo do trimestre ajudaram seu resultado.
2. Você foi bem nas atividades do dia a dia.
3. As atividades do trimestre foram um ponto forte seu.

**`strength.assessments`**: foi bem nas avaliações.
1. Você foi bem nas avaliações.
2. As avaliações foram um ponto forte seu neste trimestre.
3. Seu desempenho nas avaliações ajudou bastante.

**`strength.all-done`**: não deixou nenhuma atividade sem fazer.
1. Você fez todas as atividades do trimestre.
2. Nenhuma atividade ficou para trás, e isso conta muito.
3. Você manteve todas as atividades em dia.

**`strength.parallel-done`**: fez a prova paralela. É reconhecimento de algo que já aconteceu, nunca um convite.
Uma paralela elegível e deixada em branco não vira mensagem: ela não conta como "atividade não realizada", porque é avaliação, e não gera ação.
1. Você fez a prova paralela e aproveitou a chance de recuperar.
2. Você também fez a prova paralela deste trimestre.
3. Você não deixou passar a prova paralela.

## 4. Próximo passo (uma única ação)

O fechamento só aparece quando o trimestre já terminou e as notas estão fechadas. Por isso toda ação aponta para o **próximo** trimestre (ou para a recuperação, no 3º), nunca para algo do trimestre encerrado. Não existe ação "faça a prova paralela" (decisão do dono, 2026-09-23).

**`action.catch-up`**: houve atividades não realizadas.
1. Agora: procure fazer todas as próximas atividades.
2. Agora: não deixe nenhuma atividade para trás no próximo trimestre.
3. Agora: mantenha todas as atividades em dia daqui para frente.

**`action.assessments`**: as avaliações são o ponto principal.
1. Agora: prepare-se com antecedência para as próximas avaliações.
2. Agora: dedique um tempo extra às próximas avaliações.
3. Agora: foque nas próximas avaliações desta disciplina.

**`action.keep`**: está bem e só precisa manter.
1. Agora: continue nesse ritmo.
2. Agora: mantenha o que está dando certo.
3. Agora: siga do mesmo jeito no próximo trimestre.

**`action.recovery`** (3º trimestre).
1. Agora: prepare-se para a recuperação desta disciplina.
2. Agora: use este tempo para se preparar para a recuperação.
3. Agora: foque na recuperação. É a sua chance nesta disciplina.

## 5. Linha de reconhecimento (disciplinas que fecharam bem, D5)

**`line.good`**: fechou bem, sem nada a apontar. Precisa de mais variedade, porque é a mensagem mais frequente.
1. Você fechou bem este trimestre.
2. Bom trimestre nesta disciplina. Continue assim.
3. Tudo em ordem neste trimestre.
4. Você foi bem neste trimestre.
5. Belo trimestre nesta disciplina.
6. Trimestre bem fechado. Siga assim.

## 6. Resumo geral no Boletim (D4)

Os marcadores `{lista}` e `{trimestre}` são preenchidos pelo sistema. `{lista}` usa "e" antes do último nome. Não há contagem de disciplinas no texto, para evitar números (R1).

**`summary.all-good`**: todas as disciplinas fecharam bem.
1. Você fechou bem o {trimestre} em todas as disciplinas.
2. Todas as suas disciplinas fecharam bem no {trimestre}.
3. Ótimo {trimestre}: todas as disciplinas fecharam bem.

**`summary.few-attention`**: uma ou duas disciplinas pedem atenção.
1. Você fechou bem o {trimestre} na maior parte das disciplinas. {lista} pede(m) sua atenção.
2. Bom {trimestre} na maioria das disciplinas. Vale cuidar de {lista}.
3. A maior parte das suas disciplinas fechou bem no {trimestre}. {lista} merece(m) mais atenção.

**`summary.many-attention`**: três ou mais disciplinas pedem atenção.
1. Algumas disciplinas pedem sua atenção neste {trimestre}: {lista}.
2. Neste {trimestre}, vale dar atenção especial a {lista}.
3. {lista} precisam de mais cuidado depois deste {trimestre}.

> A concordância singular/plural ("pede"/"pedem") é resolvida pelo sistema, não por texto fixo.

## Pontos para confirmar com a escola junto com as frases

1. **"Recuperação" no 3º trimestre.** Confirmar se "Você vai fazer a recuperação nesta disciplina" está alinhado com a forma como a escola comunica isso às famílias.

Resolvidos pelo dono em 2026-09-23:
- **Prova paralela:** não existe ação para fazê-la. O aluno só vê o fechamento com as notas já fechadas, quando não há mais oportunidade.
- **`weight.not-done` vale para todos os casos**, inclusive faltas justificadas. Quando o registro chega como "não fez", em geral o aluno teve oportunidade de fazer em outro momento, a critério do professor.
