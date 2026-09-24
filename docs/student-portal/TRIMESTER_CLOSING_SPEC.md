# Fechamento do trimestre — especificação para implementação futura

Acompanhamento: issue #1132.

Status: **implementada no PR da issue #1132, desligada por padrão**. Todas as decisões de produto foram fechadas com o dono em 2026-09-23. Existe um único portão antes de ligar em produção: a escola aprovar o catálogo de frases (D6). A migração `0020` foi aplicada em produção em 23/09/2026 (versão `20260923193137`, ver `POSTFLIGHT_0020.md`); o recurso segue desligado até a escola ligar a política.

## Objetivo

Ao fim de cada trimestre, o aluno encontra em cada disciplina uma leitura curta da própria situação. A leitura diz o que mais pesou, o que merece reconhecimento e uma única ação. Tudo é feito por código determinístico, sem IA. A ideia é ser complexo por dentro e simples por fora: o motor avalia muitos sinais e mostra no máximo quatro peças.

## Evidência de produção que orienta o desenho (T1/2026, consultas agregadas)

- Cerca de 5% dos pares aluno×disciplina ficaram abaixo do mínimo (216 de 4.117). A maioria das leituras será positiva.
- As avaliações (slots 1 e 2: "1ª AVALIAÇÃO" e "SIMULADO") têm média de 69%, e 72% delas ficam acima de 60%. As qualitativas têm média de 87%, e 92% ficam acima de 60%. É nas avaliações que está a diferença entre os alunos.
- Há 2.137 lançamentos em branco observados fora da paralela, e 245 dos cerca de 347 alunos têm pelo menos um. Pela regra do sistema, branco é "não fez" (D1).
- Os rótulos das atividades são digitados pelos professores e vêm abreviados ("PRT", "II ATIV", "PARTI"). Não servem para o texto.
- A prova paralela tem regra de elegibilidade oficial (BN-DEC-035) e aparece para o aluno somente quando ele é elegível ou já tem nota (#848).

## Decisões tomadas (sem necessidade de consulta)

1. **Arquitetura.** O motor fica no domínio do Banco de Notas e roda no servidor. Ele devolve **somente códigos** (situação, fator principal, fator positivo, ação), nunca texto nem números. O React apenas traduz os códigos usando um catálogo de frases versionado.
2. **Quatro peças no máximo:** conclusão, o que mais pesou, o que reconhecer e uma única ação. Não há lista de recomendações.
3. **Não repetir números** que já aparecem na página (nota do trimestre, parciais, máximos). Não mostrar percentuais nem valores.
4. **Sem evolução ou comparação entre trimestres na v1.** Isso inclui gráficos, "subiu X%" e histórico.
5. **Classificar pelo tipo interno**: slots 1–2 são avaliações, o slot 3 é a paralela e os slots 11+ são qualitativas. Nunca pelo rótulo digitado, e o nome de uma atividade nunca aparece no texto.
6. **Sinais relativos ao próprio aluno.** Por exemplo, o contraste entre avaliações e qualitativas **dentro do aluno**. Nada de limiares absolutos que valham para quase todos (as qualitativas ficam em ~90% para todo mundo). Os limiares são calibrados com a distribuição real antes de publicar.
7. **Variantes de frase distribuídas entre os alunos (decisão do dono, 2026-09-23).** Cada mensagem tem várias versões com o mesmo significado. Alunos da mesma turma na mesma situação não leem o mesmo texto.
   - **Aleatória entre alunos, estável para cada aluno.** A variante é escolhida por hash de (`studentUid`, disciplina, trimestre, código da mensagem). Entre alunos, funciona como sorteio. Para o mesmo aluno, a frase não muda ao recarregar a página, em outro dispositivo ou em outra sessão.
     - Não usar número de chamada nem posição na turma: eles mudam quando alguém entra ou sai.
     - Não sortear a cada acesso.
   - **Mesmo significado e mesmo peso.** As variantes de um código devem ter o mesmo tom e a mesma intensidade. Nenhuma pode soar mais dura ou mais elogiosa que as outras. Todas passam pela aprovação da escola (D6).
   - **Quantidade.** São no mínimo 3 variantes por código de mensagem. As mensagens mais frequentes ("fechou bem" e as linhas de reconhecimento) precisam de mais variedade.
   - **Sem repetição na tela do aluno.** Quando o mesmo código aparece em mais de uma disciplina do mesmo aluno, as variantes são distribuídas para não repetir o texto, enquanto houver alternativas. A escolha continua determinística.
   - **Suporte.** A resposta carrega o código da mensagem e o índice da variante, sem texto. Assim a coordenação consegue identificar exatamente o que o aluno leu.
   - **Testes.** Os testes verificam a estabilidade (mesma entrada, mesma variante), a distribuição aproximadamente uniforme numa turma sintética e a ausência de repetição dentro da tela de um aluno.
8. **Parciais ocultas podem ser usadas.** Se a escola mostra só o total, o fechamento continua completo, porque é calculado no servidor a partir dos registros acadêmicos, e não do que está desenhado na tela. Isso segue a decisão do dono.
9. **Nenhum texto pode permitir deduzir uma nota que não está exibida.** Proibido: "faltaram X pontos", "menos de 40%", "sua última avaliação foi a pior".
10. **Prova paralela (revisado pelo dono, 2026-09-23).** Não existe ação "faça a prova paralela": o fechamento só aparece com as notas do trimestre fechadas, quando não há mais oportunidade. A paralela entra apenas como reconhecimento ("você fez a prova paralela"). Uma paralela deixada em branco não gera mensagem. Todas as ações apontam para o próximo trimestre ou para a recuperação.
11. **Alunos assistidos não têm fechamento**, pelo mesmo motivo de não terem resultado global.
12. **Dados insuficientes.** Nesse caso não há fechamento, em vez de "aguarde". Exemplo: faltam as duas avaliações no trimestre.
13. **Correções de nota.** O fechamento é recalculado a cada leitura, sem guardar cópia (ver R5).
14. **Endereçamento.** O texto fala com o aluno em segunda pessoa ("você"). Sem "relatório gerado automaticamente". O tom nunca culpa o aluno e é adequado para 11–15 anos e para os pais.
15. **Fim do ano.** No 3º trimestre não existem "próximas avaliações". O fechamento do T3 aponta para a recuperação ou para o resultado final e é coerente com o status "Em recuperação" (decisão de 2026-09-23: não existe "Aguardando Conselho").
16. **Testes.** Os testes cobrem de forma exaustiva as combinações de sinais e as frases de referência aprovadas. Mesmos dados geram sempre a mesma saída.

## Decisões do dono (fechadas em 2026-09-23)

| # | Decisão | Escolha do dono |
|---|---|---|
| D1 | Nota em branco lançada pelo professor | **É sempre "não fez"**, pela regra já existente no código (`observed && value === null` → `notDone`). Entra como sinal: "atividade não realizada". |
| D2 | Quando o fechamento aparece | **Na data oficial de fim do trimestre** (`calendar.t1EndsAt`/`t2EndsAt`/`t3EndsAt`), mesmo que as notas do trimestre ainda não tenham sido liberadas. |
| D3 | Quais dados o motor usa | **Todos os registros acadêmicos existentes**, inclusive revisões ainda não aprovadas e parciais ocultas. |
| D4 | Resumo geral no Boletim | **Entra na v1.** Exemplo: "Você fechou bem em 10 de 12 disciplinas. Português e História pedem sua atenção." |
| D5 | Disciplinas que "fecharam bem" | **Uma linha de reconhecimento.** O fechamento completo (quatro peças) fica só onde há algo a dizer. |
| D6 | Aprovação das frases | **A escola aprova o catálogo antes da produção.** |
| D7 | Comparação com a turma | **Nunca.** |
| D8 | Controle | **Chave nas políticas do Portal do Aluno no painel admin**, com os mesmos escopos das demais políticas (escola/turma/aluno). |
| D9 | Alunos `special` | **Não recebem o fechamento** (nem o resumo). Os assistidos também não. |
| D10 | Nome na tela | Rótulo **"Fechamento do Nº trimestre"**, com a conclusão do motor como título em destaque. |
| D11 | Trimestres anteriores | **Um fechamento por trimestre, dentro da aba do trimestre.** O resumo geral do Boletim mostra o trimestre encerrado mais recente. |
| D12 | Prévia no admin | **Sim, na ficha do aluno.** A coordenação vê exatamente o fechamento, com as mesmas mensagens e variantes que o aluno recebe, para atender dúvidas e revisar antes de ligar a chave numa turma. |
| D13 | Aviso ao aluno | **Só um destaque no portal**: selo "Novo" no Boletim e na disciplina até o aluno abrir. Sem notificação fora do portal. |
| D14 | Faixas da conclusão | **Três níveis.** (1) Abaixo do mínimo: `conclusion.attention`. (2) Logo acima do mínimo **ou** com algum ponto fraco: `conclusion.good-with-point`. (3) Claramente acima e sem ponto fraco: só a linha de reconhecimento (`line.good`). Quem passou raspando não lê "fechou bem". |
| D15 | Lançamento no meio do ano | **Retroativo.** Ao ligar a chave, todos os trimestres já encerrados ganham fechamento, cada um na sua aba (D11), e o resumo do Boletim mostra o mais recente. |
| D16 | Termos de conclusão ou acompanhamento | **Nova política "Usar termos de conclusão"** (`termClosingConclusive`, padrão ligado), escolhida pela escola no painel. **Ligada:** "Fechamento do Nº trimestre" para os trimestres encerrados, frases no passado (o comportamento de D2 a D15). **Desligada:** "Acompanhamento do Nº trimestre" só para o trimestre **em andamento**, frases no presente e ações para frente ("Procure fazer todas as próximas atividades"). Resolve a mistura de passado e futuro no mesmo texto. |
| D17 | Posição no Boletim | O resumo fica **abaixo da lista de notas**, como o fechamento da disciplina fica abaixo do detalhamento. |

## Regras derivadas das decisões (obrigatórias)

- **R1: nunca revelar nota não exibida (consequência de D2 e D3).** O motor pode ler notas não aprovadas ou ainda não liberadas, então nenhum texto pode permitir deduzir valor, faixa ou posição de uma nota que o aluno não vê.
  - Nada de números, percentuais, "faltaram", "abaixo de X" ou ordenação entre avaliações.
  - Só são permitidas categorias amplas: "as avaliações pedem atenção", "atividades não realizadas pesaram".
  - Isso deve ser garantido **por tipo**: os códigos do motor não carregam valores, e um teste falha se o catálogo contiver dígitos ou marcadores de quantidade.
- **R2: data chegou antes da liberação (conflito entre D2 e D11, resolvido pelo agente).** Se a data de fim passou e o trimestre ainda não foi liberado, a aba desse trimestre aparece na disciplina **contendo só o fechamento**, sem nota nem parciais. Quando as notas forem liberadas, elas aparecem acima do fechamento na mesma aba.
- **R3: data não configurada.** Se `tNEndsAt` estiver nulo, não há fechamento desse trimestre. Com `accessEnabled` desligado, nada aparece.
- **R4: "não fez" (D1) é tratado com cuidado de tom.** O texto diz "houve atividades não realizadas neste trimestre" e a ação aponta para as próximas atividades. O texto não conta quantas e não cita qual (R1 e decisão 5). Vale para todos os casos, inclusive faltas justificadas (dono, 2026-09-23): quando o registro chega como "não fez", em geral o aluno teve outra oportunidade, a critério do professor.
- **R5: correções.** Como o motor usa todos os registros (D3), o fechamento acompanha a revisão mais recente assim que ela existe. Isso é esperado.
- **R7: prévia no admin (D12).** A prévia usa o mesmo motor e o mesmo sorteio de variantes do aluno, nunca uma cópia separada. Ela exige a mesma permissão de leitura da ficha e fica registrada na auditoria, como as demais leituras de dados do aluno.
- **R8: selo "Novo" (D13).** O estado "já visto" fica no navegador do aluno (armazenamento local, chave por trimestre e disciplina), sem nova tabela nem dado pessoal no servidor. Em outro dispositivo, o selo pode reaparecer uma vez, o que é aceitável.
- **R9: recuperações.** As abas REC não têm fechamento próprio. A situação de recuperação entra no fechamento do trimestre e no status "Em recuperação".
- **R10: faixa intermediária (D14).** A largura da faixa "logo acima do mínimo" é calibrada com a distribuição real, como os demais limiares. Um aluno nessa faixa sempre recebe um "o que mais pesou": o componente com pior desempenho relativo dentro do próprio aluno (em geral as avaliações). Nenhuma frase diz "perto do mínimo" ou equivalente, por causa de R1.
- **R11: retroativo (D15).** O texto de um trimestre antigo é o mesmo que ele teria na época. "Próximas avaliações" e "próximo trimestre" continuam se referindo ao trimestre seguinte àquele fechamento. No dia do lançamento, o selo "Novo" (D13) aparece em todos os fechamentos existentes.
- **R6: chave (D8).** Novo campo de política `showTermClosing` (booleano), com herança escola → turma → aluno igual às demais. **O padrão é desligado.** A escola liga depois de aprovar o catálogo (D6), o que permite piloto por turma.
- **R12: acompanhamento (D16).** O trimestre em andamento é aquele cuja data de fim ainda não chegou e cujo início chegou (ou cujo trimestre anterior terminou). A leitura usa só o que já foi lançado (valores e máximos das atividades com nota) com os mesmos limiares, e exige ao menos uma avaliação com nota. Nunca há "prova paralela" como ação. No acompanhamento não há leitura de recuperação.
- **R13: auditoria da prévia (R7, como implementado).** A prévia do admin é uma leitura V2 somente leitura, como as demais leituras da ficha do aluno, que hoje não gravam evento de auditoria. Ela segue o mesmo padrão.

## Etapas de implementação sugeridas

1. **Protótipo visual no preview** (rápido): usar o cenário "Como na produção" e casos fixos para validar formato, tamanho e tom.
2. **Especificação fina + catálogo de frases**: lista de sinais com limiares calibrados com dados reais, regras de prioridade e frases submetidas à escola (D6).
3. **Motor no servidor** (grande): detectar sinais na edição aprovada, priorizar, emitir códigos, mudar o contrato do Self e escrever testes combinatórios.
4. **Tela real + publicação**: regra de exibição (D2, R2, R3), chave `showTermClosing` no admin (D8, R6), prévia na ficha do aluno (D12, R7), selo "Novo" (D13, R8), resumo no Boletim (D4), PR próprio, revisão e deploy. Ligar em produção só após a aprovação do catálogo (D6).
