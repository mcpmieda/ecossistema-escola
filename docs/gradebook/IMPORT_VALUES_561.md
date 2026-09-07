# Importação por valores atuais — #561

Data: 2026-09-07. Continuação de #537/#557/#559. Esta entrega foi autorizada expressamente pelo responsável para integração e publicação antes do teste autenticado no site.

## Decisão contratual prospectiva

Para o protocolo novo V8, a planilha continua sendo a fonte documental de entrada, mas o Banco de Notas recebe somente um **snapshot tipado dos valores atuais** dos campos acadêmicos úteis. A fórmula do Excel não é transportada nem persistida como parte do valor novo.

Nos **campos de notas/resultados**:

- valor exatamente `0` = vazio/ausente;
- valor exatamente `0,1` = zero acadêmico explícito (`official-zero`, valor semântico 0);
- valor numérico diferente desses marcadores = valor atual, sem arredondamento novo;
- vazio = ausente;
- fórmula/erro sem valor salvo utilizável = `insufficient-data`, nunca zero inventado;
- texto inválido continua inválido, não é convertido silenciosamente em número.

Essa regra é prospectiva e exclusiva do V8. Os protocolos V4–V7 continuam aceitos para compatibilidade e o histórico já gravado não é reescrito nem apagado. Quando o mesmo arquivo físico já conhecido é reavaliado pela política V8, mudanças semânticas são promovidas por **nova versão** com CAS e histórico preservado.

Valores `0/1` que não são notas — especialmente flags de aplicabilidade da recuperação, posições, índices e configurações — **não** usam a regra `0 = vazio` e permanecem com seu significado próprio.

## Fluxo publicado

1. O navegador lê XLS/XLSX/XLSB localmente e calcula o manifesto/hash como antes.
2. O reconhecedor identifica professor, ano, turmas, alunos, disciplinas, avaliações, resultados e recuperação.
3. O V8 captura somente o valor salvo das células acadêmicas relevantes. Fórmulas podem ser observadas localmente apenas para detectar ausência de valor calculado, mas o texto da fórmula é descartado antes do HTTP.
4. Cada arquivo é compactado e enviado separadamente. A fila de 1/18/50 continua sequencial, preserva itens confirmados e pausa em confirmação incerta sem replay automático.
5. O servidor resolve identidades/catálogo, materializa os registros oficiais e reconcilia com o D1. Um zero antigo que agora é vazio gera, quando necessário, uma **nova versão ausente**; a versão antiga permanece intacta.
6. Se o conjunto de parâmetros do commit couber no limite interno, o caminho direto é mantido. Se ficar grande, somente os **parâmetros temporários** são colocados nas tabelas de staging já existentes, em chamadas pequenas e limitadas.
7. A promoção acadêmica permanece em **um único `db.batch()` atômico**, contendo as mutações oficiais e os guards `changes()`/CAS. Se qualquer mutação/guard falhar, a promoção inteira é revertida. O staging temporário não é estado acadêmico e é removido na própria promoção ou na limpeza da sessão.

Não foi criado serviço, banco, assinatura, migration, schema ou dependência adicional.

## Proteções

- autenticação/autorização e Origin continuam server-side;
- V8 exige `valuePolicy=current-values-zero-empty-v1` e rejeita envelopes desconhecidos;
- corpo V8 é limitado e fórmulas/objetos arbitrários não são aceitos como célula;
- nenhuma repetição automática após resposta perdida de um commit potencial;
- `snapshot-unavailable` não vira 0 nem vazio silencioso;
- D1 continua sendo a persistência física; `imported-source` permanece a autoridade nesta etapa;
- hashes, nomes/notas reais, payloads privados e credenciais não entram no Git/CI.

## Evidência sintética do SHA antes do handoff final

No CI da PR #562, `npm run verify` concluiu lint, typecheck, testes e build. A execução verde registrou **208 arquivos de teste / 1.465 testes aprovados**.

Cobertura nova inclui:

- snapshot sem texto de fórmula;
- `0 = ausente`, `0,1 = zero explícito` e preservação das flags REC 0/1;
- fórmula sem cache/erro não inventa nota;
- reavaliação de um hash antigo sob a nova política sem apagar versões anteriores;
- fila sequencial para 1, 18 e 50 arquivos, pausa/retomada, sessão expirada e confirmação perdida;
- transporte D1 com parâmetros grandes, Unicode/quotes/newlines, CAS stale, constraint failure, ausência de chunk e confirmação perdida;
- piloto sintético de **468 componentes + 5.399 registros + 5.399 associações**, ainda com uma única promoção acadêmica atômica.

A instrumentação temporária usada para obter uma cópia pública do código foi removida do diff final.

## Evidência privada dos 18 arquivos

Em execução isolada, sem enviar dados reais ao Git/CI, os 18 XLSB existentes foram exercitados com a política de valores. O arquivo que anteriormente expôs o limite RPC também percorreu o caminho novo. A execução privada confirmou importação e reimportação no ambiente reproduzido e chamadas de transporte limitadas; isso **não substitui** o aceite autenticado no D1/site de produção.

Medições anteriores da própria investigação mostraram que a representação compacta das 18 planilhas cai de aproximadamente **9,63 MB para 1,26 MB** ao eliminar fórmulas do transporte e aplicar a nova semântica de zero. Esses números são de representação de importação, não tamanho faturado nem tráfego medido no Cloudflare.

## Aceite pendente

Após merge, CI final e publicação oficial confirmada, o responsável deve testar no site. O aceite produtivo deve observar primeiro o arquivo que antes falhava e depois o lote de 18. `applied` e `no-changes` são confirmações válidas. Qualquer `confirmation-required`, `unavailable` ou `[gradebook-import-server-failure]` continua sendo evidência a investigar; não se considera sucesso produtivo apenas porque o CI/local estão verdes.
