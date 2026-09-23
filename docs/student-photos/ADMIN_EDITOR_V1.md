# Editor administrativo — entrega local da #1119

## Escopo entregue por este pacote

Editor reutilizável `StudentPhotoEditorV1`, principal 3×4 COM fundo e avatar 1×1 com prévia circular. Controles oficiais HeroUI para zoom/posição, escolha de largura máxima (900 ou 600 px) e qualidade WebP (92%, 86% ou 80%). O tamanho efetivo aparece sob cada prévia; nunca amplia o enquadramento da fonte. Avatar limitado a 320×320; principal a 900×1200 e 128 KiB, avatar a 64 KiB.

O botão **Usar enquadramentos** devolve um rascunho local; NÃO significa gravar no SharePoint. Não foi montado nas fichas produtivas antes da implementação do publicador. Nenhuma rota de upload, gravação, exclusão ou aprovação é introduzida por este pacote. As bolinhas existentes ainda não foram substituídas em massa.

A fonte é limitada a 12 MiB, 8192 px por dimensão e 24 milhões de pixels. Cabeçalhos JPEG/PNG/WebP são inspecionados antes do decodificador real do navegador. EXIF é orientado uma única vez pelo navegador; o canvas gera novos pixels WebP, com validação de formato/dimensões e rejeição de EXIF/XMP remanescentes. Transparência de entrada é composta sobre branco; não existe remoção de fundo nem variante transparente. Arquivos animados PNG/WebP são recusados. Cabeçalhos não substituem o decodificador e não autorizam uploads no servidor.

Qualidade não é reduzida silenciosamente. Excesso de bytes exige nova escolha explícita do operador; não há sucessivas tentativas ocultas de compressão. Cancelar/trocar aluno descarta resultados tardios, bitmap e URL temporária. Rascunhos ficam em memória; nenhum fetch, armazenamento persistente, modelo/IA ou serviço externo participa da edição.

## Integração posterior nas fichas

Importar o editor sob demanda, somente ao clicar no lápis de uma ficha autorizada. Passar `ownerKey=studentUid` e descartar o editor ao trocar de aluno/perder autorização. O chamador recebe `PhotoDraftV1` por `onPrepared`; o rascunho precisa ser conferido e reencodificado pelo publicador servidor, com revisão esperada, recibo idempotente, aprovação de imagem e autorização administrativa fresca. Não enviar `ownerKey` como prova de acesso.

`StudentPhotoAvatarV1` recebe a identidade e uma foto explicitamente ligada à mesma identidade. Sem foto, falha ou divergência de dono: círculo com cor derivada de chave estável, sem iniciais. Aceita somente blob temporário ou caminho de API da própria origem; não inicia descoberta de fotos por linha. A integração deverá carregar metadados em lote e imagens visíveis sob demanda, para não transformar uma tabela em centenas de buscas ao Graph.

## Leitura binária administrativa

`server/student-photos/sharepoint-download-v1.ts` é exclusivo do backend administrativo. Recebe localizador de biblioteca resolvido no servidor, nunca URL fornecida pelo navegador. Usa o cliente Graph existente para metadados e token, verifica drive/item, tipo e tamanho, e obtém a URL pré-autenticada. Os bytes são baixados com novos headers sem Authorization, cookies ou referrer, redirects manuais e no máximo dois saltos, sempre HTTPS e host SharePoint exato configurado. Destinos CDN não reconhecidos falham fechados; não ampliar a lista automaticamente.

Limite de 2 MiB para a leitura do acervo, prazo total de 20 segundos e controle dos bytes realmente recebidos. ETag esperada é conferida antes e depois do download; alteração simultânea produz conflito. Esse helper não confere permissões adicionais ao app, não expõe localizadores no Portal e não altera o cliente Graph compartilhado. NÃO montar rota administrativa sem autorização/escopo e resolução do localizador antes de chamá-lo.

Referências técnicas consultadas em 23/09/2026: Microsoft Graph `driveitem-get-content` (URL temporária dispensa bearer), Cloudflare Workers Request (follow pode encaminhar headers), MDN createImageBitmap/toBlob, especificação RIFF WebP do Google e componentes Modal/Slider/Avatar do HeroUI v3. Não existe alegação de incidente ocorrido.

## Testes e limites

Testes sintéticos de geometria, cabeçalhos, WebP real com encoder nativo injetado, descarte/concorrência do rascunho, componentes reais HeroUI e transporte Graph. O encoder nativo dos testes não existe no worker; tampouco simular canvas prova renderização num navegador físico. Registrar na PR os resultados efetivamente executados, não apenas a existência dos arquivos.

Permanecem para o publicador: validar/reencodificar imagens no servidor de produção; confirmar permissões Graph efetivas; gravar as duas variantes com consistência/limpeza e CAS; exclusão/remover; auditoria e recibos; integração das fichas/bolinhas; migration e ativação controlada. Não usar `sharp` de desenvolvimento como implementação de produção presumida. A branch visual phase-3, shell/workspace, CSP, credenciais, acervo e banco produtivos continuam intocados. A #1119 permanece aberta.
