# Visão geral orientada ao acompanhamento — #831

## Escopo e limites

Implementação autorizada em 17/09/2026. Substitui somente a Visão geral de Desempenho; Notas, Turmas, Alunos, Componentes, Professores, PDFs, motor, importação, notas oficiais e regras de publicação permanecem. As métricas são evidências descritivas das notas, não diagnóstico cognitivo, psicológico, disciplinar, de presença, entrega ou evasão.

A extensão `includeLearning: true` da consulta analytics V6 é opt-in. Clientes antigos recebem a forma estrita anterior sem o campo `learning`; o novo cliente exige a evidência solicitada. A opção não é repassada à consulta V2. O servidor usa as mesmas projeções no snapshot read-only/repeatable-read: nenhuma consulta adicional, temporizador, persistência, alteração de schema ou N+1. Identidades e escopo são validados; a resposta continua dentro do limite de transporte de 2 MB e 1.000 combinações aluno/componente.

## Organização da tela

- Quatro indicadores clicáveis: Desempenho médio, Evolução trimestral, Alunos em evolução e Atenção recorrente.
- Trajetória reaproveitada, com explicação simples; quantitativo e qualitativo apresentados em barras comparáveis.
- Participação avaliada, situação nas notas em relação à referência da escola e componentes com variação.
- Uma lista compacta de acompanhamento, alternável entre atenção, evoluções, quedas e todos. Os cards e segmentos filtram essa lista; nomes abrem o detalhe existente. A prioridade combina repetição de dificuldade e variação das notas, sem rotular personalidade.
- Até cinco atividades que merecem revisão, preservando descrições livres, com acesso às notas do componente. Resumo da melhora após recuperação paralela.
- REC e qualidade dos dados permanecem em acordeões recolhidos, não como centro do dashboard.

As animações são de entrada (140 ms e pequenos atrasos), não contam números nem reiniciam com `readAt`. O estado está ligado a ano/turma/período, preservado durante a revalidação desse mesmo recorte. Layout por largura útil, listas com rolagem interna, foco e controles nativos HeroUI v3; `prefers-reduced-motion` elimina movimento. Não há nova biblioteca de gráficos.

## Regras de cálculo

**Desempenho e trajetória:** média dos percentuais completos do resultado calculado pelo núcleo já existente. Não alterar a ponderação oficial 45% quantitativo/55% qualitativo nem os máximos de 30/30/40 pontos. Contagem de alunos com resultado acompanha o indicador. A média pode esconder diferenças individuais, por isso a situação por referência e o detalhamento continuam visíveis.

**Evolução:** média de `percentual atual - percentual anterior` nas mesmas combinações aluno/componente completas nos dois trimestres consecutivos. T1 e anual não recebem variação inventada. Por aluno, a média das diferenças identifica aumento/queda; não se infere ordem temporal dos slots das atividades ou da data de importação. Comparações não controlam diferenças de dificuldade entre provas e não comprovam ganho de conhecimento.

**Atenção recorrente:** no mesmo componente, resultado completo abaixo da referência em dois trimestres consecutivos OU ao menos duas notas abaixo entre pelo menos três instrumentos regulares com valor e máximo conhecidos no período. Participação reconhecida e prova paralela não entram na segunda regra. São contagens de instrumentos no período, não das supostas últimas três atividades. Base insuficiente não vira zero nem dificuldade. O percentual de referência é o recebido do contexto escolar, sem novo corte fixo.

**Quantitativo × qualitativo:** quantitativo usa a soma das duas avaliações originais, antes da substituição por paralela, dividida pelo máximo quantitativo existente. Qualitativo mantém atividades e participação. Comparam-se apenas componentes completos nos dois grupos, com média por aluno e depois entre alunos. A diferença é qualitativo menos quantitativo, em pontos percentuais. A recuperação permanece separada para não mascarar o desempenho original das duas avaliações.

**Participação:** reconhecida exclusivamente nos slots qualitativos pela descrição inteira normalizada (acentos, caixa, pontuação simples e espaços), com aliases controlados `participação`, `participacoes`, `particip.`, `participac.`, `partic.`, `partc.`, `part.`. Números de 1 a 20, ordinais e romanos I–XX são aceitos antes ou depois: `1ª PARTICIPAÇÃO`, `PARTICIPAÇÃO 2`, `PART 1`, `PART II`, entre outros. Texto composto/ambíguo, como `participação + trabalho`, não é classificado automaticamente. Nenhum outro tipo de atividade é deduzido pelo nome. Oferta/trimestre/slot continuam sendo a identidade; não fundir registros nem modificar descrições.

Cada parte de participação conserva seu máximo: somar pontos e máximos dos registros numéricos válidos por aluno/componente, depois média entre componentes do aluno e média entre alunos. Dividir participação em duas notas não cria dois alunos nem peso adicional por registro. Zero é nota; ausência não é zero; máximo desconhecido não recebe denominador inventado. Um resumo parcial usa apenas notas disponíveis e informa essa limitação. Evolução da participação requer os mesmos componentes com todas as participações reconhecidas completas nos dois períodos.

Participação pertence ao qualitativo e não é somada novamente à nota oficial. Pode apoiar a avaliação formativa com critérios claros e devolutiva docente. Envolvimento, interação/respeito, argumentação e compromisso com a rotina são referências para critérios da escola, não quatro pontuações derivadas de uma nota única. Timidez, fala frequente ou silêncio não são classificados pelo sistema.

**Situação nas notas:** três grupos exclusivos: todos os componentes completos na referência; pelo menos um componente completo abaixo; demais alunos ainda sem conclusão. Não usar conceitos de domínio/BNCC sem evidências por habilidade. O grupo abaixo pode também possuir notas pendentes, mostradas no detalhe.

**Atividades para revisar:** instrumentos qualitativos não reconhecidos como participação, com máximo conhecido, pelo menos três notas válidas e ao menos uma abaixo da referência. Ordenação por proporção abaixo e, em empate, média. Não presumir que descrições iguais são a mesma atividade; mostrar componente e trimestre.

**Recuperação paralela:** contar aumentos efetivos já resolvidos pelo núcleo, isto é, quantitativo considerado maior que o original. Ganho relativo ao máximo quantitativo, preservando ganho em pontos e critérios existentes no detalhe. Não somar REC à nota nem tratar aceite de publicação como aprendizagem.

## Coerência da comparação na perspectiva Alunos — #835

A extensão Alunos foi integrada pela #833/PR #834. A correção #835 substitui, somente no bloco **Quantitativo × qualitativo** dessa perspectiva, as médias legadas independentes pelos mesmos valores intermediários que já alimentam a Visão geral. O construtor `buildPerformanceLearningV1` não recalcula regras acadêmicas: expõe o quantitativo original, qualitativo, diferença e número de componentes comuns de cada aluno. A nota final e o efeito da recuperação permanecem no núcleo e nos resumos anteriores, sem mudanças.

Transporte: `includeStudentDimensions: true` requer `includeLearning: true`. O serviço retira os dois flags antes de chamar V2. Somente quem solicita a nova extensão recebe `learning.students[].dimensions`; clientes já abertos usando apenas `includeLearning` continuam recebendo exatamente os campos anteriores. O cliente novo exige a presença da extensão solicitada. Os construtores puros usados nas fixtures produzem a evidência completa por padrão; a fronteira HTTP sempre passa explicitamente os flags negociados.

O contrato valida valores finitos, zero, percentuais acima de 100%, relação `gapPP = qualitativo - quantitativo`, identidade do aluno e contagem coerente dos componentes. Na ausência de base comum, os três valores são `null` e a contagem é zero. A UI mostra ausência, não faz fallback para os summaries incompatíveis e informa a base comum e o uso das duas avaliações antes da paralela. O delta usa valores não arredondados; o arredondamento de exibição é o já existente.

Exemplo estritamente sintético de regressão: um componente tem 40% nas avaliações originais, 80% após paralela e 80% no qualitativo; outro só tem quantitativo completo e outro só qualitativo completo. O bloco comparativo deve mostrar **40% / 80% / +40 p.p.**, baseado somente no primeiro componente, sem remover a melhora da nota final. O cenário sem nenhum componente comum deve mostrar ausência nos dois lados, mesmo quando cada grupo isolado tem notas.

Cobertura adicional: cálculo e UI HeroUI reais, recuperação paralela, bases diferentes/incompletas, zero, acima de 100%, anual 30/30/40, compatibilidade opt-in, rejeição de evidências inconsistentes e serviço SQL com seis consultas read-only/repeatable-read. Os testes existentes do snapshot de 1.000 pares/2 MB continuam cobrindo a evidência ampliada. Resultados do SHA final, revisão, merge e deploy ficam na issue/PR. Não há alteração de schema, SQL produtivo, ACL, dependência, workflow ou outras perspectivas.

A validação manual no navegador permanece com o usuário por orientação expressa; não bloqueia a conclusão interna e não será alegada como realizada pelo agente.

## Validação e evidências

Testes sintéticos cobrem aliases e rejeições, partes com máximos distintos, peso entre alunos, zero/ausências/máximo desconhecido, comparação de componentes, recorrência, separação da paralela, compatibilidade opt-in, isolamento de identidades e limite de 1.000 pares/2 MB. A interface real é montada com HeroUI nos testes de interação: filtro por card, busca, aluno/componente/atividade, qualidade recolhida, tooltip e preservação de foco/DOM na revalidação.

Browser plugin não disponível. A tentativa com Playwright/Chromium em `https://admin.escolaieda.com/#/banco-de-notas?area=performance`, 1440×900, falhou antes da renderização com `net::ERR_BLOCKED_BY_ADMINISTRATOR`; não houve contorno. Clone local falhou por resolução DNS. Não é alegado verify local completo nem homologação visual autenticada. Os resultados efetivos de CI, revisão, merge e deploy do SHA final serão registrados na issue/PR; testes de CSS/JSDOM não comprovam geometria nem console de produção.
