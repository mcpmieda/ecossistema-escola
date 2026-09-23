# Transporte administrativo SharePoint — #1119

`server/student-photos/sharepoint-write-v1.ts` implementa as portas `upload` e `remove` do protocolo #1123. Não monta rota, não habilita fotos, não aplica migrations e não comprova permissões da aplicação em produção. As funções continuam exigindo composição autorizada com o codec e o repositório de recibos.

## Fronteiras obrigatórias

A biblioteca/pasta é configuração resolvida no servidor, nunca parâmetro do navegador. O callback `authorize` é obrigatório e deve verificar operador atual, pessoa, reserva/recibo, fingerprint/metadados e pertinência exata do arquivo à limpeza autorizada. Uma permissão Graph ou o conhecimento de um ID não autorizam trocar/remover fotos. Não conectar com callback vazio: a fixture permissiva é somente teste sintético.

O cliente Graph e a identidade técnica existentes são reutilizados, sem novas credenciais. Token opcional serve à composição interna/teste, não é campo de requisição. O Portal do Aluno não importa esse transporte, não recebe Graph nem consulta SharePoint.

## Criar e confirmar

1. Conferir contexto, solicitação, variante, orçamento e metadados; copiar os bytes antes de aguardar operações, sem modificar o buffer do chamador.
2. Autorizar, conferir hash/geometria e acesso à pasta. A inspeção de cabeçalho é uma defesa adicional, não substitui a decodificação/reencodificação obrigatória anterior.
3. Usar nome determinístico `<studentUid>_<requestId>_<portrait|avatar>.webp`. Se já existe, conferir pasta/drive/ID/ETag/tamanho e baixar pelo helper privado para comparar SHA-256. Mesmos bytes permitem recuperação; tamanho igual sozinho não permite.
4. Se ausente, criar upload session com `item.@microsoft.graph.conflictBehavior=fail`, nome exato e `deferCommit=false`. Nunca usar replace/rename. O formato documentado permite enviar o arquivo inteiro em uma única faixa final; os limites de 128/64 KiB não são fragmentos intermediários de 320 KiB.
5. Enviar bytes à URL pré-autenticada, somente HTTPS no host exato do tenant configurado, sem bearer/cookies/referrer e sem seguir redirects. Conferir expiração antes. Revalidar autorização antes da sessão, do PUT e da entrega do resultado.
6. Confirmar pelo caminho e pelos bytes realmente armazenados, não pelo ID retornado pelo PUT. Em erro ambíguo, uma leitura de reconciliação pode recuperar o resultado; não repetir POST/PUT automaticamente nem apagar a versão anterior. 401/403/423/429 não são convites para tentar outra credencial ou ignorar bloqueios.

O protocolo mantém a reserva durável enquanto o resultado não for determinado. Uma sessão interrompida não é registro de foto ativa; pode expirar segundo a retenção do provedor. Esta entrega não libera reservas abandonadas nem limpa uploads incompletos por tempo. Esse fluxo exige reconciliação explícita da iniciativa, sem corrida com um upload ainda em andamento.

## Remover sem afetar outra versão

A exclusão recebe somente o localizador retirado e autorizado do recibo. Confere drive/pasta, tipo de arquivo, ID, tamanho e ETag forte. Tags wildcard, listas, fracas ou com controles são rejeitadas antes de I/O. Envia DELETE por ID com If-Match exato, sem Prefer de bypass. Uma edição/movimentação remota bloqueia a exclusão; não se tenta novamente sem a condição.

`deleted` significa resposta HTTP 204 da exclusão condicional do Graph, que **move o arquivo para a lixeira**. Não significa apagamento definitivo ou retirada de backups. `already-absent` registra ausência no escopo autorizado, não prova permanentDelete. Falha de acesso à pasta não vira ausência do arquivo. Se a resposta de DELETE se perde, a operação permanece ambígua; o retry autorizado posterior pode registrar ausência separadamente.

Não usar permanentDelete ou contornar retenção/locks dentro deste adaptador. A revogação da família/cópia do Portal ocorre no protocolo antes da limpeza externa. A UI futura deve falar em remover a foto, nunca prometer destruição definitiva de todos os registros.

## Evidências e limites

Os testes exercitam o transporte real de aplicação sobre um Graph HTTP em memória, usando o cliente de política e o downloader reais. Cobrem criação, recuperação, corrida, bytes divergentes, redirecionamento indevido, TTL, limites, ETag, autoridade revogada e exclusões ambíguas. Os bytes são massa sintética de cabeçalho para testar transporte; NÃO são prova de decoder. A prova real de pixels/Workerd é a #1124, separada.

O ambiente desta sessão não resolve DNS do GitHub e não tem checkout/dependências. Foi feita somente checagem local de sintaxe TS com Node; a CI é a fonte da execução integral. Resultados/SHAs ficam na issue/PR, sem alegação antecipada de sucesso.

Antes da ativação: comprovar biblioteca/pasta e permissões da credencial técnica, compor o callback com os recibos e a autorização existentes, compor o codec e a prévia final, adotar o acervo legado sem sobrescrita automática e homologar com foto autorizada fora do Git. Nenhuma foto real é usada nos testes, logs, issues ou screenshots.

## Fontes primárias conferidas em 23/09/2026

- https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0 — conflito, faixa final completa, URL pré-autenticada, ausência de bearer no PUT, expiração e confirmação.
- https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0 — If-Match, 204 e envio para lixeira.

Esses contratos documentados não constituem prova de credenciais/permissões produtivas nem garantia de exclusão definitiva.
