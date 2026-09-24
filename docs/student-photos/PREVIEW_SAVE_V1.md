# Prévia final e salvamento — #1119

> O protocolo de prévia e revisão continua; as referências ao transporte SharePoint abaixo são históricas. O adaptador vigente é o Supabase Storage privado descrito em [FINAL_INTEGRATION_V1.md](FINAL_INTEGRATION_V1.md).

Esta composição conecta o codec ao protocolo de gravação e à autorização das
transferências. Ainda não monta rotas ou lápis, aplica migrations, adota fotos
reais, configura Graph ou autoriza publicação no Portal. A entrega depende do
transporte da PR #1125; não integrar esta branch antes dos gates daquela PR.

## O arquivo visto e o arquivo salvo

O editor prepara duas imagens WebP com fundo e enquadramento independente. Elas
são as entradas originais deste protocolo, não a fotografia JPEG/PNG anterior
aos enquadramentos. Qualidade do processamento final é explícita: 92, 86 ou 80.

`PhotoEditServiceV1.preview` resolve a autorização administrativa, exige família
inicializada e executa o codec real. Devolve os WebP finais e um manifesto com
origem/saída (hash, dimensões e tamanho), qualidade, operador, pessoa, pedido e
revisão esperada. A prévia não reserva, grava, envia ou publica arquivo algum.
O chamador deve exibir esses arquivos finais antes da confirmação do usuário.

`save` recebe novamente as mesmas entradas originais e o manifesto confirmado.
Recalcula os arquivos com o mesmo codec/qualidade, exige correspondência exata
com os hashes/dimensões/tamanhos aprovados e só então permite reservar/enviar.
Não processar a saída da prévia como uma nova entrada: isso acumularia perdas.
Modificar fonte, qualidade, pessoa, operador, pedido ou revisão exige nova
prévia. Uma saída diferente é conflito antes de qualquer reserva ou upload.

O manifesto não é assinatura, credencial, autorização de acesso ou consentimento
do responsável. A identidade/operador da chamada devem vir da sessão e resolução
administrativa existente, nunca do manifesto como fonte de autoridade. Ele
protege a consistência da confirmação; não prova que uma pessoa viu a imagem.
A autorização de uso no Portal continua uma decisão/registro separado.

Nenhum serviço de rascunhos, secret, bucket ou cache persistente foi criado.
As duas entradas são copiadas antes do primeiro await, para que uma troca da
imagem no chamador não altere a segunda variante enquanto a primeira processa.
As cópias e saídas intermediárias são limpas em sucesso, erro, rejeição e retry.
Os arrays originais do chamador e as prévias retornadas não são apagados pelo
serviço. Quem recebe a prévia deve descartá-la ao cancelar/trocar aluno/concluir.
Limpeza explícita dos arrays não é promessa de apagar cópias internas do runtime,
histórico de rede ou fotografias já vistas.

## Guardas de transferência

`PhotoWriteGuardV1` lê família/recibo em transação curta, somente leitura, com
papel privado existente. Exige autorização administrativa externa em cada
estágio; não concede acesso só porque um UUID existe.

- Upload: operador/pessoa/pedido exatos, reserva vigente, fase preparada, revisão
  esperada e variante/hash/tamanho/dimensões iguais ao plano persistido.
- Exclusão: fase confirmada, reserva/revisão vigentes, arquivo exatamente na
  limpeza pendente, ETag/metadados corretos e ausência na família em uso.
- Após confirmação de limpeza ou conclusão da operação, o recibo antigo não
  autoriza nova exclusão. Um upload posterior ao commit também é rejeitado.

A composição concreta cria repositório e guarda sobre o mesmo banco e instala
o callback obrigatório no transporte SharePoint. O transporte revalida também
cada repetição de POST/DELETE por throttling; não usa uma permissão anterior à
espera. Nenhuma transação permanece aberta durante chamadas ao SharePoint.

Há um intervalo inevitável entre conferir o banco e chamar o serviço externo.
A proteção combina reserva durável, arquivos novos por operação, versão ETag e
checagens antes dos estágios; não promete transação distribuída atômica. Não
expirar/desbloquear reservas por tempo enquanto uploads podem continuar. O
fluxo de reconciliação de operações abandonadas permanece uma etapa própria.

## Acervo e ativação

`assertInitialized` falha quando não há família inicializada; ausência de linha
não significa ausência de foto. Adoção do legado ou ausência comprovada precisa
inicializar a família pelo fluxo autorizado antes de conectar o editor. Esta
entrega não migra nem ignora as 270 referências existentes de profile_photo.

Antes da rota produtiva, ainda são necessários: limites de corpo/tempo antes
de carregar os bytes; sessão/capacidade/CSRF/origem; configuração real da
biblioteca e prova das permissões; módulo WASM no build oficial com proveniência;
adoção/reconciliação; publicador da cópia privada com autorização institucional;
montagem do editor/fichas e avatares. Remoção não expurga a lixeira nem contorna
retenção. Nada disso é ativado pela presença desta composição no Git.

## Evidência e limites dos testes

- `edit-service-v1.test.ts`: codec/armazenamento sintéticos isolam a orquestração,
  conflitos, autorização, entradas imutáveis, limpeza de buffers e retry.
- `photo-edit-guard-1119.postgres.ts`: banco descartável, repositório e guardas
  reais, papel restrito/read-only, alvo vigente vs aposentado e transações sem
  rede. O codec e armazenamento dessa suíte continuam sintéticos.
- `codec-proof/edit-proof.ts` dentro do harness Workerd: codec real compilado da
  fonte fixada com serviço/coordenador reais; confirma igualdade prévia/saída,
  rejeição da prévia alterada e retry sem uploads repetidos. Diário/armazenamento
  em memória somente nesse teste. O verificador externo decodifica os resultados
  com Sharp, sem usar Sharp no Worker; nenhuma rede externa durante as imagens.

Uma prova não é apresentada como outra: os testes não confirmam permissões do
tenant, uso manual, autorização dos responsáveis ou desempenho sob carga real.
Execuções efetivas, SHA, revisão independente, merge e deploy ficam na issue/PR.
