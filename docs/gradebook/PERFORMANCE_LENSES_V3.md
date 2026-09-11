# Quatro lentes e investigação — #644 / PR #645

## Base e limites de autoridade

A #643 foi integrada em `8866b2c897bb62528970c64740cd2509c5d28602` e publicada pelo deploy 257, run `34511487276`, com sucesso reconfirmado na #642. Este documento descreve o bloco seguinte, #644/#645; seu SHA integrado e deploy efetivos devem ser consultados no checkpoint dessas issues. Presença de código/documentação não comprova publicação ou aceite acadêmico.

A fonte funcional é `PAINEL DESEMPENHO`, sobretudo §§7–16 e 20–22. Do documento geral antigo do Banco permanece apenas Conselho. Desempenho continua `calculated-preview`: não emite nem homologa resultados oficiais e não altera regras, notas, decisões ou elegibilidade. #347 mantém o aceite por consumidor/escopo; #634 continua aberta.

## O que cada lente entrega

- **Resultado:** matriz calculada já existente, com cobertura, notas regulares/REC/N-C, situação e resultado calculado separados das referências de origem e da decisão humana.
- **Quantitativo:** soma considerada pelo núcleo, incluindo substituição pela paralela somente quando aplicável. A paralela não é somada uma segunda vez. Máximos vêm dos resultados do núcleo.
- **Qualitativo:** pontuação real das atividades qualitativas e seus máximos. O banco atual não fornece conceitos comportamentais; nenhum conceito, personalidade ou conversão artificial é criado. Máximo desconhecido impede percentual, não apaga o lançamento.
- **Avaliações:** aluno × instrumentos do componente selecionado explicitamente. T1/T2/T3 mostram seus instrumentos; Visão geral mantém os três trimestres identificados e pode ter até 39 colunas. Descrições reais são preservadas; instrumentos não são reunidos por nome.

Nas lentes de composição, o modo Recuperação mantém a população e a aplicabilidade por componente resolvidas pelo núcleo, mas apresenta a **composição das notas regulares**. REC não possui uma decomposição inventada em avaliações/qualitativo. A interface explica isso; Resultado continua mostrando REC/N-C. Paralela registrada mas não aplicável fica identificada como não aplicada; seu valor registrado é preservado separadamente, fora dos grupos estatísticos.

## Gráfico, estatísticas e investigação

Um gráfico por vez, conforme a lente. Categorias: no limite ou acima, abaixo da referência, leitura incompleta, N/C e sem máximo conhecido. Desde a #672, clicar na barra azul ou vermelha substitui temporariamente as barras, dentro do próprio card, por uma visão nominal completa das duas faixas daquele componente; voltar restaura o gráfico e a matriz principal nunca é filtrada por esse clique. Indicadores e os três pontos cromáticos do panorama continuam podendo recortar a matriz, com identificação separada. “Ver mais” mostra população considerada, leituras com percentual, média e mediana proporcionais.

O panorama V5 também recebe do servidor uma classificação descritiva limitada aos dez maiores somatórios do recorte. Só entram estudantes elegíveis com valor numérico em todos os componentes exibidos; a ordem é total decrescente, depois número e ID. Uma soma que contenha total parcial continua marcada com `*`. Esse ranking não é resultado final, aprovação, elegibilidade ou nova autoridade acadêmica e não é recalculado no React.

Quantitativo, Qualitativo e Avaliações usam somente leituras completas com máximo conhecido na classificação e na média/mediana. Na lente Resultado e na matriz-base, uma soma numérica parcial já exibida é classificada pelo mesmo limite proporcional oficial de 60% — 18, 18 e 24 nos trimestres — sem alterar seu estado de cobertura; assim ela participa dos grupos e recebe a cor correspondente, enquanto a matriz troca a palavra “Parcial” por `*`. **Zero real participa; ausência continua sem classificação e nunca vira zero.** Percentuais acima de 100% não são limitados silenciosamente. A classificação proporcional usa o limite anual configurado e o máximo do recorte definido pelo núcleo; descreve aquela leitura, não decide aprovação de uma avaliação, recuperação ou resultado final. Estatística de composição não substitui o resultado calculado.

Os Selects HeroUI de Desempenho usam popovers não modais para que um único clique em outro filtro feche o anterior e abra o novo. O gráfico reserva espaço vertical próprio para os rótulos das barras, inclusive quando uma delas atinge 100% da escala.

Cobertura de Quantitativo/Qualitativo consulta os slots resolvidos pelo núcleo. “Leitura completa” é completude daquela dimensão, não uma declaração de fechamento institucional. Situações não elegíveis podem ser exibidas, mas ficam fora dos grupos. Em Recuperação, componentes não aplicáveis também ficam fora deles. Não há inferência por nome, nota bruta ou quantidade de linhas da interface.

## Contrato e caminho de execução

`shared/gradebook-contracts/performance/performance-analysis-v3.ts` acrescenta o transporte V3, operação `analysis`, no POST `/api/gradebook/performance`. O contrato reaproveita o escopo e a matriz V2, acrescidos da lente e, exclusivamente para Avaliações, do ID da oferta. Respostas V1 e V2 não mudam. Catálogo de turmas e detalhes permanecem V2.

Hook existente → cliente V3 → handler já autenticado → `createPerformanceAnalysisV3` → `readRelationalPerformanceV2` → fatos/projeções do núcleo. A resposta inclui a matriz-base V2 e os valores/grupos compactos da lente **no mesmo snapshot**. O cliente não busca uma matriz paralela nem faz uma chamada por aluno/componente. Trocar lente carrega o recorte selecionado; abrir detalhes pede somente o detalhe V2 correspondente.

O loader V2 foi exposto internamente com um coletor de projeções; elas não são serializadas integralmente. Descrição de instrumento é lida apenas para a oferta explicitamente selecionada, usando parâmetro SQL. Não há reconstrução de streams/versions nem segunda fórmula acadêmica.

## Consistência, tamanho e segurança

Uma transação PostgreSQL `REPEATABLE READ, READ ONLY` por análise; até seis instruções incluindo SET, sem contar BEGIN/COMMIT. Mesmos limites de base: 150 alunos, 40 ofertas, 1.000 pares por matriz; Avaliações tem até 39 instrumentos anuais por oferta. Excesso gera erro explícito antes da consulta de fatos, não truncamento de turma. Uma turma sem alunos não produz colunas de avaliação a partir de fatos de alunos inexistentes.

Contrato estrito valida ano, turma, período, modo, lente, oferta, chaves, ordenação dos alunos, alinhamento de colunas/valores, unicidade dos grupos e seus denominadores. Resposta de outra seleção, extra, incoerente ou falsamente oficial não é apresentada. No-store, origem, autorização administrativa e gate produtivo existentes foram preservados. Falha SQL é opaca e nunca vira turma vazia bem-sucedida.

Navegador mantém apenas a seleção atual em memória. Trocas cancelam/descartam respostas anteriores, fecham detalhes e removem resultados antigos; perda de autorização limpa o ano compartilhado e os dados. Não existe armazenamento acadêmico persistente, nova dependência, cache/serviço paralelo ou telemetria com dados privados. `readAt` continua sendo horário da transação, não versão persistida da importação ou garantia de tempo real.

A coluna Situação lê exclusivamente `gradebook.vinculo.situacao`, preenchido pelo contrato `persist-relacao`; o payload `persist-notas` docente não transporta nome ou situação. A interface apenas apresenta esses códigos em chips cromáticos, sem transformar cadastro em resultado. Ao abrir o detalhe de uma célula, T1/T2/T3 permanecem cronológicos no contrato e o drawer é ancorado visualmente no trimestre selecionado na matriz.

## Verificação e aceite

Os testes focados desta entrega foram executados em Node 22 no container, com PGlite, baseline SQL completa, facade PostgreSQL e dados exclusivamente sintéticos: **71 testes** (47 SQL/HTTP, 19 cliente/React/shell e cinco limites). Preservam os casos V2 e acrescentam 27 casos ao conjunto anterior. Typecheck e lint dos caminhos alterados passaram. A validação completa para integração é `npm run verify` na CI normal do head final, com resultado/contagens/SHA registrados na PR.

O teste de limites usa 100 alunos × 10 ofertas, três trimestres e todos os 39 instrumentos anuais. As quatro lentes preservam a matriz-base completa e ficam abaixo de 500 KB gzip e 2 MB sem compressão nesse cenário sintético. 1.010 pares são recusados sem leitura de fatos. Isso é gate de integridade/tamanho, **não benchmark p95 de Hyperdrive nem SLA de renderização**.

## Medição autenticada publicada — #668

Após o deploy 269, um cenário sanitizado 2026/T1/Regular/Resultado com 32 linhas e 12 componentes recebeu três aquecimentos e 20 amostras sequenciais. Dashboard observou p95 de 441,3 ms e payload Brotli máximo de 6.569 B; detalhe, p95 de 193,5 ms e 1.284 B. A matriz ficou utilizável em 675,7 ms. Todas as respostas foram HTTP 200, `ready` e `no-store`. As metas da #634 passaram nesse cenário; os números não constituem SLA universal. Ver [medição completa](PERFORMANCE_MEASUREMENTS_668.md).

Testes React exercitam os Tabs reais HeroUI, troca de lentes, seleção de oferta, clique no gráfico, Ver mais, Limpar, navegação às Centrais, reabertura do aluno, no-store, dados forjados, perda de autorização e respostas atrasadas. O fixture jsdom fornece a API de animações ausente e a restaura após cada teste; não substitui a implementação dos Tabs. Não houve inspeção visual nem smoke autenticado novo nesta entrega. A limitação de navegador relatada na #642 permanece um gate separado, sem contorno de política nem uso de screenshots antigos como prova do novo head.

## Evolução contratada na #649 e o que continua na #634

A #649/PR #650 contratou a normalização proporcional e a comparação descritiva entre trimestres de 2026 para Resultado, Quantitativo e Qualitativo; Avaliações permanece deliberadamente fora. Ver [TERM_COMPARISON_2026_V4.md](TERM_COMPARISON_2026_V4.md). Sinais de tendência/queda, limiares configuráveis e comparação entre anos foram retirados, não inferidos. Configurações visuais/de abertura, refinamento dos indicadores, validação conjunta de responsividade/teclado e performance representativa continuam na #634. Conselho, Boletins e Relatórios foram reancorados; configuração docente é concluída pela #660. Restore e piloto integral permanecem nas respectivas fases.

Referências: [matriz V2](RELATIONAL_PERFORMANCE_V2.md), [mapa dos consumidores](CONSUMER_MAP.md), [estado](PROJECT_STATE.yaml), [decisões](DECISIONS.md).
