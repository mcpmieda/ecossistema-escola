# Publicação administrativa — #752

`StudentPublicationV1` recebe cliente tipado estável, escopo de 2026,
capacidade de escrita e rótulo do catálogo. Os callbacks opcionais
`onOpenSettings` e `onOpenHealth` pertencem à composição #757.
A navegação, o catálogo e a autenticação não são recriados neste módulo.
Troca de escopo ou capacidade desmonta os dados e a decisão anterior antes
da pintura; a integração também deve desmontar a área ao trocar identidade.

## Decisão e leitura

Os seis cartões apresentam exatamente os estados/revisões do servidor:
Sem dados, Dados disponíveis, Publicado e Atualização pendente. Uma consulta
incompleta, duplicada, com versões CAS divergentes ou política de outro escopo
falha; não é convertida em seis cartões Sem dados. Não há notas, fórmulas,
dados de terceiros, acesso direto ao banco nem armazenamento no navegador.

Publicar, publicar atualização e retirar usam período, escopo, versão CAS
e revisão de fonte capturados na revisão. A confirmação não promove o alvo
caso ele mude no servidor. Conflito exige recarga e nova decisão. Repetição
de resposta incerta conserva os bytes preparados, chave e revisão; não há
repetição automática de mutação. Retry-After é respeitado tanto para a
repetição quanto para recarga após erro.

Nos escopos agregados também existe Publicar no escopo, pois a consulta pode
conter somente parte dos alunos publicada. Essa ação usa o comando publish
existente e explicita que abrange vínculos elegíveis ainda não publicados.
Publicar atualização usa publish-update, cujas precondições continuam sendo
validadas pelo backend; uma recusa não vira outro comando automaticamente.
Nenhuma publicação é oferecida para um período Sem dados.

A retirada exige revisão própria e explica a remoção imediata do período e
possível retirada do resultado final da projeção, preservando o histórico
acadêmico e os demais períodos. Não há reset nem encerramento de vínculos.

## Aceite não é conclusão de processamento

O retorno committed é apresentado como decisão aceita. Depois dele, o
controlador consulta publicação e configurações em paralelo por no máximo
sete rodadas, a primeira imediata e as seguintes a cada dez segundos.
O contador mede **consultas de acompanhamento**, nunca alunos ou porcentagem
de publicação. Não há promessa de vazão nem estado de fila inventado.
O botão Parar acompanhamento cancela a espera/leitura local, sem alegar
cancelamento do comando já aceito. Erro de consulta interrompe o acompanhamento;
respostas antigas e consultas abortadas não podem alterar o novo contexto.

Na conta individual, publishedRevision igual ao alvo aprovado comprova a
revisão publicada na consulta daquele aluno. Na turma/escola, esse mesmo campo
pode representar apenas alguns perfis: a tela diz revisão informada na
consulta agregada, sem afirmar materialização de todos. mixed é mostrado
como múltiplas revisões, nunca tomado como alvo de publicação. Retirada é
confirmada pela ausência de revisão na consulta correspondente.

Se nenhuma prova chegar no limite, a tela informa que não distingue espera,
alteração de configuração ou falha da fila com esse contrato. Consulta manual
e saúde operacional permitem continuar a investigação. Não há encerramento
silencioso, progresso fictício ou extensão unilateral do contrato.

## Configuração efetiva

A política é consultada pelo cliente compartilhado e apenas exibida. AutoUpdate
OFF mantém revisão anterior; ON afeta somente já publicado. Datas nulas ficam
Não definida; divulgação única respeita sua lista de períodos, divulgação por
período usa suas seis datas, e finalDisclosureAt fica separado. Datas são
apresentadas no fuso de São Paulo. Publicação não é inferida de permissão,
calendário, notas ou do toggle de resultado; materialização/acesso continuam
sujeitos ao backend e aos overrides individuais. A edição fica com #751.

## Validação e handoff

24 testes sintéticos: seis estados, no-data, CAS/fonte entre consulta e
confirmação, retirada, idempotência/Retry-After, repetição dupla, resposta
tardia, mudança de escopo/capacidade, StrictMode, consultas limitadas,
cancelamento e agregado sem falsa contagem. Cliente HTTP e schemas reais
com respostas inventadas; nenhum comando é enviado à produção.

QA compilado com CSP exata do ADM no navegador integrado CUA: desktop1280×850
e celular390×740, modais de publicação/atualização/retirada, cancelamento pelo
teclado com retorno do foco, revisão nova após conflito/recarga, perda de
resposta/repetição, turma versus aluno e retirada sintética. A espera terminou
sem alegar sucesso no limite real de acompanhamento; cancelamento, leitura
restrita, AutoUpdate ON e indisponibilidade também foram conferidos. O modal
em320px permanece legível; fora dele, o mínimo global do ADM produz
documento320/client305, com módulo288px. Em390px, documento
e cliente375px com barra clássica. Sem erro/aviso de console.

Browser Act segue bloqueado pelo Controle de Aplicativos do Windows, já
diagnosticado em #744/#748. CUA é a alternativa disponível, sem contornar a
política do dispositivo. O mínimo global320px do ADM e reflow nessa largura
foram encaminhados à #757 pela #751, com revalidação #758; este módulo não
altera CSS global. Testes de integração autenticada, fila/cron reais e piloto
permanecem #757–#759. Nenhuma data institucional, publicação, nota ou
configuração real foi modificada.

A montagem e os oito documentos centrais ficam com #757. Este README e o
handoff da issue registram o delta sem disputar arquivos do integrador.
