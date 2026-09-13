# Configurações administrativas — #751

Módulo de composição `StudentSettingsV1`, para a integração #757. Nenhuma rota,
menu, contrato compartilhado ou configuração produtiva foi alterada nesta entrega.

## Integração

Recebe um `PortalAdminClientV1` estável, `scope` oficial de 2026 e `canWrite`
derivado das capacidades atuais do ADM. A seleção escola/turma/aluno e seus nomes
pertencem ao catálogo e ao shell da #757; `scopeLabel` e `describeScope` permitem
exibir esses nomes sem inventar dados. `onCommitted` permite atualizar outros
consumidores após confirmação do servidor. Trocar a identidade autenticada deve
desmontar a área protegida, como os demais módulos do ADM. Capacidade visual não
substitui autorização no servidor.

A chave de escopo desmonta dados, rascunhos, revisões e prévias antes da primeira
pintura do novo escopo. Consultas usam o controlador compartilhado de última
requisição; respostas antigas e abortadas não substituem o escopo atual. Não há
persistência de política, token ou rascunho no navegador.

## Comportamento

- Os sete campos mostram a origem recebida. Escola define os padrões; turma e
  aluno podem definir um valor ou restaurar apenas a herança daquele campo.
  `false` e `[]` são valores explícitos, nunca ausência de override.
- Calendário e risco são objetos atômicos validados pelos schemas existentes.
  Os oito marcos e as divulgações mantêm datas nulas. Horário civil usa
  `America/Sao_Paulo`, com segundos e conversão para UTC independente do fuso
  do computador. O fim é exclusivo e o início inclusivo.
- Trocar divulgação única/por período limpa as datas do modo anterior. A data
  do resultado final permanece separada. A revisão destaca mudanças/remoções
  de datas passadas e informa invalidação de agendamentos obsoletos; o servidor
  continua responsável por elegibilidade, calendário e efeitos da política.
- Toda gravação passa por revisão concreta do campo, valor, escopo e efeito
  imediato. A versão exibida é capturada ao abrir a revisão; um conflito não
  promove silenciosamente essa versão. Recarregar descarta os rascunhos.
- Repetir após resposta incerta reapresenta os mesmos bytes preparados, chave
  de idempotência e versão. `Retry-After` impede repetição antecipada. Conflitos
  exigem recarga e nova revisão. 401/403 de gravação retiram os campos protegidos.
  A lógica é compatível com a repetição de efeitos do React StrictMode.
- Encerramento aparece somente no escopo escola com escrita. Consulta prévia
  atual, contagem, versão, validade, frase exata e aceite precedem `links-close`.
  O token fica em referência privada, nunca no DOM. Prévia vazia não oferece
  fechamento; expirada exige nova consulta. Uma repetição de resultado incerto
  mantém o comando original mesmo após a validade da prévia: o backend consulta
  o recibo de idempotência antes da prévia. Não há reset acadêmico nem remoção
  do histórico. Configurações e encerramento não despacham simultaneamente.

## Validação

28 testes sintéticos de conversão e validação, herança, objetos atômicos,
modo de divulgação, cancelamento, conflito, perda de resposta, idempotência,
limitação de repetição, troca de escopo, expiração de autorização, leitura
restrita, StrictMode, contagem, validade e encerramento. O cliente tipado e os
schemas reais são usados; nenhum serviço produtivo recebe essas operações.

QA em build Vite compilado isolado, com CSP do ADM e fixture inventada:
1280×850 e 390×740, modal longo com rolagem interna, navegação por teclado
(cancelar e retorno do foco), valor desligado tornando-se override próprio,
troca de modo, escola/turma/aluno, prévia de 12 vínculos seguida de zero após
encerramento simulado, resposta perdida/repetição, conflito/recarga, somente
leitura e indisponibilidade. Console sem erros/avisos. Token ausente do DOM.
A entrada de datas foi validada nos testes de interface; o `fill` do controlador
do navegador não preencheu o input nativo `datetime-local`, portanto não constitui
prova manual de digitação nesse navegador.

Browser Act permanece bloqueado pelo Controle de Aplicativos do Windows,
diagnosticado em #744 e reconfirmado em #748. Foi usado o navegador integrado
já disponível via CUA, sem instalar nem contornar a política do dispositivo.

## Pendências de integração e homologação

- #757 deve montar o componente com catálogo/capacidades reais e manter limpeza
  da área protegida ao trocar sessão/identidade. Os oito documentos centrais
  permanecem sob responsabilidade da integração; este arquivo é o handoff local.
- Em 320×740 com barra clássica do Windows, `src/styles.css` ainda impõe
  `min-width: 320px` a html/body: cliente de 305px e documento de 320px.
  O módulo mede 288px e se reorganiza; o ajuste global é da #757 e a
  revalidação integrada da #758. Em 390px, cliente e documento medem 375px.
- #758/#759 devem validar o ADM integrado, dispositivos e acessibilidade,
  incluindo digitação no controle nativo de data. Não foi realizado teste
  autenticado com configurações, calendário ou vínculos institucionais.
- Nenhuma data foi escolhida para a escola e nenhum vínculo real foi encerrado.
