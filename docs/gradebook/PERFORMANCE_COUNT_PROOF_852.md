# Prova de contagens de Desempenho — #852

## Objetivo

Esta evidência prova as **contagens, denominadores, partições e valores agregados** que alimentam os indicadores e gráficos atuais de Desempenho. A baseline é `main@c0d17172aca6a12271805f356c394bc54dfc5534`, já contendo a BN-DEC-035.

A prova não cria nova regra acadêmica. Ela reconstrói os totais a partir das células, fatos e projeções do snapshot e compara esse oráculo independente com os agregados servidos e com os números renderizados pela interface.

## Superfícies cobertas

A prova cobre:

- Visão geral pedagógica: desempenho médio, evolução trimestral, alunos em evolução, atenção recorrente, trajetória T1/T2/T3, quantitativo × qualitativo, participação, situação nas notas, componentes, prioridades, atividades para revisar e recuperação paralela.
- Turmas, Componentes e Professores: aproveitamento, mediana, dispersão, contagens abaixo da referência, cobertura, histograma, trajetória, composição, REC/paralela e qualidade da leitura.
- Alunos: desempenho atual, evolução, atenção recorrente, participação, trajetória, dimensões, destaques, recorrência, REC e cobertura.
- Notas/dashboard V5: estudantes visíveis, abaixo do mínimo, completude, pendências, barras por componente, panorama da turma e ranking.
- Comparação V4: maior, igual, menor e indisponível.

## Oráculo independente

`performance-count-proof-852.test.ts` não usa os summaries V6/V5 como valor esperado.

Ele parte de:

1. matriz aluno × componente;
2. projeções por oferta;
3. fatos de instrumentos;
4. estados e valores de cada célula.

A partir disso, recalcula independentemente:

- população e leituras;
- completo, parcial, sem nota e indisponível;
- acima e abaixo da referência;
- alunos abaixo, todos no mínimo ou acima e pendentes;
- média, mediana, dispersão, mínimo, máximo e respectivos `n`;
- cobertura, zeros e ausências;
- histograma das seis faixas;
- trajetória e pares comparáveis;
- quantitativo, qualitativo e diferença pareada;
- REC aplicável/lançada/pendente, N/C, R/R e aplicação desconhecida;
- PARA aplicável, aplicada e ganho;
- referências de fonte;
- summaries por aluno, componente e professor.

A mesma prova confere as identidades de agregação do bloco pedagógico: participação global é a soma/contagem dos registros por aluno; quantidade de alunos com participação, alunos comparáveis, componentes de dimensão e melhorias por PARA são reconstruídos a partir das linhas individuais. A lista de atividades para revisar é refeita a partir dos instrumentos já provados.

## Partições que precisam fechar exatamente

As seguintes identidades são verificadas:

```text
completas + parciais + sem nota + indisponíveis = leituras
acima + abaixo = completas
todos-no-mínimo + abaixo-em-algum + pendentes = alunos
lançadas + ausentes = instrumentos esperados
soma das 6 faixas do histograma = leituras completas
aumentou + caiu + igual = pares comparáveis
```

No dashboard V5:

```text
classificados = todos-no-mínimo + abaixo-em-algum
elegíveis = classificados + pendentes

por coluna:
no-mínimo + abaixo + incompleta + N/C + sem escala = população considerada
```

O ranking é refeito a partir da soma numérica das células, com a mesma população contratada, mas sem reutilizar o ranking produzido pelo servidor.

## Cenários exercitados

A prova roda T1, T2, T3 e anual, além de um cenário misto que separa:

- zero real;
- ausência;
- PARA elegível sem lançamento;
- PARA numérica superior e efetivamente aplicada;
- nota acima de 100%;
- máximo desconhecido;
- parcial;
- período vazio.

As regressões existentes continuam cobrindo N/C, R/R, REC pendente, fonte oficial, limites estritos de PARA e 1.800 combinações da BN-DEC-035.

## Prova de apresentação

`performance-count-proof-852-ui.test.tsx` monta os componentes reais da interface e prova que:

- os quatro KPIs pedagógicos usam os denominadores do payload provado;
- os três grupos de situação são exibidos com as contagens exatas;
- trajetória expõe o `n` exato de cada trimestre;
- histograma reproduz cada uma das seis faixas;
- composição mostra o número exato de pares;
- REC, PARA e cobertura mostram as mesmas contagens;
- cada barra V5 anuncia exatamente os alunos acima/abaixo daquela coluna;
- o donut usa exatamente os três grupos do panorama;
- o ranking renderiza exatamente a quantidade de entradas servida;
- o resumo V4 é uma partição exata das células em maior/igual/menor/indisponível.

Assim, a prova separa duas responsabilidades: o teste Node demonstra que os agregados correspondem aos fatos; o teste UI demonstra que a apresentação não muda essas contagens.

## Conferência produtiva agregada e somente leitura

Foi feita uma leitura agregada no PostgreSQL de produção, sem nomes ou IDs de estudantes no repositório.

### População de Desempenho por turma

| Turma | Vínculos no recorte | Alunos na população analítica | Fora da população analítica |
| --- | ---: | ---: | ---: |
| 6A | 32 | 32 | 0 |
| 6B | 35 | 33 | 2 |
| 6C | 19 | 18 | 1 |
| 6D | 16 | 9 | 7 |
| 7A | 33 | 31 | 2 |
| 7B | 33 | 32 | 1 |
| 7C | 22 | 21 | 1 |
| 7D | 23 | 15 | 8 |
| 8A | 31 | 27 | 4 |
| 8B | 32 | 26 | 6 |
| 8C | 20 | 20 | 0 |
| 8D | 22 | 19 | 3 |
| 9A | 22 | 22 | 0 |
| 9B | 20 | 19 | 1 |
| 9C | 24 | 22 | 2 |

A população V6 contratada é `situacao IS NULL OR situacao = 7`. Cada turma possui 12 ofertas. O maior recorte atual é 6B, com **396 pares aluno × componente**, abaixo do limite de 1.000; nenhuma turma chega perto de truncamento silencioso.

### Estrutura observada

Foram observadas **180 ofertas × 3 trimestres = 540 oferta-trimestres**. AV1 e AV2 existem em todas as linhas verificadas e não há nota negativa.

A leitura também encontrou **16 oferta-trimestres com irregularidade estrutural qualitativa** — máximo qualitativo diferente do esperado e/ou máximo desconhecido. Isso não foi corrigido nem escondido: o motor e os indicadores já têm estados de máximo desconhecido, avisos e grupos sem escala para representar essas situações. Esta prova exige que tais linhas não sejam convertidas artificialmente em 100% de cobertura ou classificadas com denominador inventado.

## Limites desta evidência

- A prova é de contagem/agregação e ligação com a UI; não é avaliação pedagógica da validade de cada nota.
- Não altera fonte, importador, notas, schema, ACL, snapshots ou publicação.
- Não contém dados pessoais de estudantes.
- A inspeção visual humana continua separada dos testes de DOM.
- A conferência produtiva é agregada e somente leitura.

O resultado final de CI, PostgreSQL/isolamento, revisão, merge e deploy deve ser registrado na issue/PR; a simples presença deste documento não comprova que esses gates passaram.
