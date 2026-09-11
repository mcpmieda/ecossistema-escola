# Medições autenticadas de Desempenho — #668 / PR #669

## Cenário

Medição executada em 11/09/2026 no site publicado após o deploy 269, por BrowserAct com sessão administrativa autenticada e massa de teste autorizada. O recorte foi 2026, T1, modo Regular e lente Resultado, em uma turma com 32 linhas e 12 componentes. Nenhum nome, ID, nota ou payload acadêmico foi registrado.

Dashboard e detalhe receberam três chamadas de aquecimento e 20 amostras sequenciais cada. O tempo observado no browser inclui o `fetch` autenticado e a rede até a resposta completa. Os tamanhos comprimido/descomprimido vieram de Resource Timing; a resposta usou Brotli. A matriz utilizável foi medida do clique na primeira turma de teste até os três widgets aparecerem sem estado ocupado ou alerta.

## Resultado

| Operação | Amostras | p50 | p95 | Máximo | Brotli máximo | Descomprimido máximo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dashboard | 20 | 303,6 ms | 441,3 ms | 559,5 ms | 6.569 B | 144.508 B |
| Detalhe do aluno | 20 | 176,2 ms | 193,5 ms | 204,0 ms | 1.284 B | 12.119 B |

Todas as 40 amostras retornaram HTTP 200, estado `ready` e `Cache-Control: no-store, no-cache, must-revalidate, private`. A matriz ficou utilizável em 675,7 ms, com três widgets e zero alerta.

## Comparação com as metas

- payload inicial até 500 KB compactados: passou, com máximo observado de 6.569 B;
- backend inicial p95 até 600 ms aquecido: passou de forma conservadora, pois os 441,3 ms observados incluem rede e leitura completa no browser;
- detalhe p95 até 400 ms: passou com 193,5 ms;
- matriz utilizável até 2 s: passou com 675,7 ms no cenário documentado.

É uma evidência pontual e reproduzível do cenário, não um SLA universal nem um benchmark isolado de Hyperdrive. Mudança de região, carga, turma, dispositivo ou conectividade pode produzir outros valores. A validação visual conjunta, acessibilidade manual completa e piloto integral permanecem separados.

Não houve DDL/DML, emissão, importação, decisão de Conselho, alteração de dado, schema, regra, autoridade, ano, binding, segredo ou infraestrutura.
