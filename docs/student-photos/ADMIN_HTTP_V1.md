# Fronteira HTTP administrativa de fotos — #1119

Complementa a composição #1126, integrada à main. O handler e o cliente são
implementados e verificáveis isoladamente; **não estão montados em rotas
produtivas** enquanto faltarem codec no pacote oficial, configuração/permissões
Graph, adoção do acervo e os gates da integração. Não fornecer serviços falsos
para ligar a UI.

## Uso de imagem — decisão vigente

Em **23/09/2026, 16:20:49 UTC**, o responsável confirmou que o uso das imagens
já está autorizado na matrícula. A pendência institucional de consentimento
está resolvida, conforme o Avanço 41 da #1119. Não exigir novo termo, comprovante,
checkbox por fotografia, allowlist ou bloqueio adicional de consentimento para
este uso interno no Ecossistema e no Portal. Esta decisão substitui referências
anteriores a uma autorização de imagem ainda pendente no plano e na documentação.

A confirmação foi fornecida pelo responsável; não é uma alegação de auditoria
documental realizada pelo agente. Documentos de matrícula e imagens reais não
pertencem ao repositório público. A aprovação da prévia confirma o arquivo a
salvar e não é uma nova coleta de consentimento. Autenticação, autorização de
edição, acesso do próprio aluno, accessEnabled e integridade permanecem intactos.

A ordem desta entrega é incorporar a main atualizada, verificar, integrar a
#1127 e encerrar. Não iniciar nova branch nem implementar a etapa seguinte nessa
mesma execução. A indisponibilidade atual do recurso completo decorre das
conexões técnicas ainda não montadas, não de autorização de imagem pendente.

## Contrato

POST `/api/student-photos/admin/preview` ou `/api/student-photos/admin/save`,
`Content-Type: application/json` e `X-Student-Photo-Request: 1`. Sem query string,
redirecionamento Graph, CORS permissivo ou ação GET. O corpo tem versão 1,
referência acadêmica/conta única no contrato existente de identidade, comando
e duas variantes limitadas codificadas em base64. A referência usa um ano
explícito; nomes e contexto de autoridade fornecido pelo cliente são rejeitados.

Principal até 128 KiB, avatar até 64 KiB, corpo JSON até 288 KiB. Base64 é apenas
a representação de transporte, não o formato de armazenamento. Na entrada ADM,
o limite de leitura é aplicado aos bytes reais com ou sem Content-Length;
divergência do comprimento, corpo comprimido, UTF-8 inválido e JSON inválido são
rejeitados. Prazo absoluto de leitura: 10 segundos, sem renovação por chunk.
Cancelar a leitura não espera um cancel() travado. Não se afirma que isso mede
ou limita a CPU síncrona do codec. Strings internas/runtime não podem ser
apagadas com a mesma garantia que os arrays descartáveis sob controle do código.

### Respostas compactadas do servidor

Fetch descompacta o corpo de respostas HTTP, mas pode conservar Content-Encoding
e Content-Length referentes à representação comprimida. O cliente copia os
headers apenas para a leitura local e, nesse caso, descarta esses dois valores:
o leitor continua impondo o MESMO teto aos bytes efetivamente descompactados.
Não muda os headers enviados pelo servidor nem aceita uploads comprimidos.
Não usar essa adaptação de resposta em requisições de entrada ou transportes
HTTP que entreguem bytes ainda comprimidos.

O caso foi reproduzido com fetch nativo/servidor loopback no container: 70 bytes
comprimidos no cabeçalho e 681 bytes de corpo decodificado. Há regressões reais
com gzip/Brotli locais e uma resposta decodificada infinita/excessiva, sem
consulta externa ou imagens de pessoas. Referência normativa:
https://fetch.spec.whatwg.org/#http-network-fetch (tratamento de content codings).

## Autorização e confirmação

O handler usa `verifiedPagesContextV1`: sessão selada válida, cookie único,
capacidade `platform.settings.write`, identidade do operador no servidor.
Verifica origem oficial, ambiente, Host, cabeçalhos de encaminhamento, Fetch
Metadata e cabeçalho da aplicação antes de consumir o corpo. Não altera a
política de cookies ou cria um segredo/CSRF token novo. Origem exata e requisição
JSON com cabeçalho não simples formam a barreira CSRF; não habilitar CORS nela.

`resolveSubject` é obrigatório: deve autorizar o alvo e resolver a referência
acadêmica/conta para `studentUid`. Existência de UUID não concede permissão.
O manifesto da prévia nunca determina o operador nem o aluno da operação.
Cada rechecagem reconfirma o mesmo ator/tenant e a mesma resolução; reutilização
de número acadêmico, troca de conta ou perda de permissão interrompem a ação.
`createService` deve instalar esse verificador no callback authorize do serviço
real. Ele não substitui a guarda transacional da #1126.

Prévia não grava nada. Retorna apenas as imagens finais verificadas, manifesto
e identificador técnico de rastreio. Hash/tamanho/dimensões são conferidos no
transporte; decodificação de pixels continua sendo responsabilidade do codec.
O cliente exige a qualidade escolhida e a correspondência da origem com os
bytes congelados da requisição, além da integridade da imagem final. Não aceita
revisão confirmada que não corresponda à operação solicitada.
Arrays intermediários e de retorno do handler são limpos depois da serialização
ou em falhas. O chamador do cliente recebe a propriedade das imagens de prévia
e deve descartar os arrays/URLs ao trocar aluno/cancelar; não há montagem da UI
nesta entrega nem promessa de limpeza de rascunhos ainda não integrados.

Save devolve `committed` ou `pending` sem paths/ETags/credenciais do SharePoint.
Perda de permissão depois de um commit não transforma um resultado confirmado
em falso erro; a composição interrompe a limpeza e devolve cleanupPending.
Erros inesperados são sanitizados. Todas as respostas são privadas/no-store.
O cliente não repete mutações automaticamente, não consulta por foco nem faz
polling. Após resposta ambígua, a UI deve manter os MESMOS bytes, manifesto e
requestId para confirmação explícita, não fabricar uma operação concorrente.

## Evidências e ativação

Testes da fronteira usam sessões seladas reais e resolvedor/serviço sintéticos:
autorização antes do corpo, expiração durante leitura, troca de identidade/ator,
origem/ambiente/CSRF, limites reais, limpeza, erros sanitizados e envelopes.
Testes do leitor cobrem stream infinito, timeout, cancelamento travado e tamanho
falso. Testes do cliente cobrem origem/qualidade/saída, confirmação/pending,
compressão de respostas, falhas sem retry e cancelamento. Não comprovam acesso
ao tenant ou ao acervo. Execução/SHAs/resultados são registrados na issue/PR;
teste escrito não é alegação de teste aprovado.

Esta entrega não aplica migrations, provisiona recursos, concede permissões,
monta o lápis ou publica imagens reais. A autorização de imagem já foi confirmada
pelo responsável e não é uma pendência. Não altera shell/workspace/phase-3,
Portal aluno, notas, login ou CSP. O fluxo produtivo completo permanece pendente
por implementação técnica e é registrado na issue #1119.
