# Fronteira HTTP administrativa de fotos — #1119

Complementa a composição #1126. O handler e o cliente são implementados e
verificáveis isoladamente; **não estão montados em rotas produtivas** enquanto
faltarem codec no pacote oficial, configuração/permissões Graph, adoção do
acervo e os gates da integração. Não fornecer serviços falsos para ligar a UI.

## Contrato

POST `/api/student-photos/admin/preview` ou `/api/student-photos/admin/save`,
`Content-Type: application/json` e `X-Student-Photo-Request: 1`. Sem query string,
redirecionamento Graph, CORS permissivo ou ação GET. O corpo tem versão 1,
referência acadêmica/conta única no contrato existente de identidade, comando
e duas variantes limitadas codificadas em base64. A referência usa um ano
explícito; nomes e contexto de autoridade fornecido pelo cliente são rejeitados.

Principal até 128 KiB, avatar até 64 KiB, corpo JSON até 288 KiB. Base64 é apenas
a representação de transporte, não o formato de armazenamento. O limite de
leitura é aplicado aos bytes reais com ou sem Content-Length; divergência do
comprimento, corpo comprimido, UTF-8 inválido e JSON inválido são rejeitados.
Prazo absoluto de leitura: 10 segundos, sem renovação a cada chunk. Cancelar a
leitura não fica esperando um cancel() travado. Não se afirma que isso mede ou
limita a CPU síncrona do codec. Strings internas/runtime não podem ser apagadas
com a mesma garantia que os arrays descartáveis sob controle da aplicação.

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
Arrays intermediários e de retorno são limpos depois da serialização ou em
falhas. Cliente descarta prévias e URLs temporárias ao trocar aluno/cancelar.

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
falso. Testes do cliente cobrem prévia verificada, protocolo de save/pending,
falhas sem retry e cancelamento. Não comprovam acesso ao tenant ou ao acervo.

Esta entrega não aplica migrations, provisiona recursos, concede permissões,
monta o lápis, publica imagens reais ou presume autorização de responsáveis.
Não altera shell/workspace/phase-3, Portal aluno, notas, login ou CSP. O fluxo
produtivo completo permanece pendente e é registrado na issue #1119.
