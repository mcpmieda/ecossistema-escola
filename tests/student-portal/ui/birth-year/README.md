# Dados de acesso — #754

Componente `StudentBirthYearsV1`, em `src/features/student-portal-admin/birth-year/`.
Entrega L de #742, identidade CHAT ONLINE preservada, execução direta CODEX sequencial.
Base: `7273b789ec1496b0dd3c14e4d0fa9a741e74935c` (#753/PR771).
Somente os dois diretórios birth-year/** desta issue. Nenhum backend, contrato,
SQL, migration, permissão, dado acadêmico ou configuração produtiva alterados.

## Composição — #757

Props: `client` V1 e `reader` V2 estáveis, `scope` oficial, `identityKey` obrigatório,
`canWrite` obrigatório, `scopeLabel` opcional. Em escola, fornecer `catalog` de
#753 para selecionar uma turma (inclusive vazia, pesquisa/paginação integral).
Em turma, exibe suas contas; em conta, monta o slot individual. Não recebe o ano
global do BN: toda consulta/mutação é explicitamente 2026.

Callbacks estáveis opcionais: `onAuthorizationLost(error)` para tratar sessão/
capability no shell e `onChanged()` para invalidar leituras dependentes. O callback
individual ocorre após o recibo E a leitura fresca coerente; no lote, após todos
os itens terem resultado terminal. Não desmontar o módulo em cada render nem
recriar clientes/callbacks durante digitação. Troca de operador atualiza identityKey;
troca de escopo/identidade/capability recria o contexto antes de exibir dados antigos.

Seleções/rascunhos são somente da página atual, até 100 contas. Próxima/anterior
mantêm os dois cursores opacos separadamente. Ao deixar rascunhos ou uma retomada,
a navegação interna exige descarte explícito, sem afirmar desfazer commits.
Trocar a turma/identidade ou desmontar aborta leituras/chamadas e cancela timers;
uma escrita já aceita pelo servidor pode concluir. Retomada não é persistida em
storage nem atravessa logout/escopo; retornar exige nova consulta/revisão.

## Leitura, versões e concorrência

Duas consultas limitadas por página: accounts-read V2 e birth-years V1, em paralelo.
Associar por accountId, nunca posição/nome. Aceitar somente IDs únicos, conjunto
igual, paginação coerente e accountVersion idêntica. Se houve alteração entre
as duas leituras, exigir recarga; nenhum CAS é reconstruído por inferência.
As duas consultas ordenam por conta e usam seus próprios cursores de operação.
Não carregar a escola inteira, inferir nomes de nascimento ou fazer N+1 na lista.
Após uma gravação individual, reler somente essa conta nas duas operações,
checando também a turma original, conta vigente e versão do recibo.

Três versões distintas, sem intercâmbio:

- birth-write.expectedVersion = account.version;
- birth-write.item.expectedVersion = birth.version;
- birth-batch.expectedVersion = birth-years.scopeVersion, revisão acadêmica+vínculos;
  cada item usa sua birth.version. O scopeVersion da lista de contas não serve aqui.

O recibo individual devolve versão agregada da conta; o lote devolve versão do
campo por item. Depois de commit individual, somente uma consulta fresca coerente
libera outro autosave. Se outro operador mudou o ano/conta após o recibo, conflito
impede adotar silenciosamente o novo CAS. Rascunho digitado durante request continua
visível; resposta antiga atualiza sua base somente quando reconhecida, sem trocar
a digitação nova. A fila de gravação individual é serial, inclusive entre linhas.

## Edição e procedência

Autosave após 600ms de pausa ou Enter, somente quatro dígitos ASCII em 1900…2026.
Sem trim/coerção: parcial, zero, espaço, faixa inválida e vazio não persistem.
Vazio não é clear. Limpar individual/lote tem AlertDialog próprio, conta/turma,
seleção/contagem e efeito explícitos. Confirmar procedência tem outro diálogo,
mostra o ano específico e exige declaração de conferência em fonte legítima.

Qualquer correção começa como unconfirmed-test, sem herdar a confirmação de um
valor anterior. Ano de teste não é promovido por cópia/autosave/validade numérica.
Confirmar explicitamente a procedência após conferência legítima prepara confirmed
para aquele valor. Ao alterar novamente o ano, a procedência volta a não confirmada.
No modo lote, edição e conferência preparam rascunhos, sem gravação até revisão do
lote. Cada linha conserva seu próprio ano/procedência; não há preencher todos com
um ano presumido. O modo não troca enquanto houver rascunhos sem salvar/restaurar.

Correção/clear usa o serviço existente: preserva senha cotidiana, QR, conta,
história, sessões e notas; invalida os desafios dependentes do PIN. Sem novas
credenciais, PIN padrão, escrita na Relação ou confirmação fictícia em produção.

## Retomada limitada

Um prepareCommand captura bytes/CAS/idempotência uma única vez. Resposta incerta
individual mantém a operação e bloqueia novas intenções até resolver/reconsultar.
Se commit já foi confirmado e somente a consulta falha, retry repete a consulta,
nunca a escrita.409 exige recarga/revisão;401/403 removem linhas/rascunhos/retomadas.

birth-batch repete o corpo inteiro original: o backend conserva resultados
terminais e limita a 1 KDF/2 novos itens por invocação. O cliente valida identidade,
conjunto/duplicatas, operationId e monotonicidade dos resultados terminais antes
de atualizar progresso. Não interpreta unavailable como falha definitiva ou sucesso.
Progresso mostra commits/conflitos/recusas reais; nenhuma porcentagem estimada.

Uma chamada ativa por vez; após progresso aguarda 1s, sem progresso 2s/4s, no máximo
3 rodadas estagnadas. Respeita Retry-After; uma janela automática é limitada a
100 chamadas/120s, depois pausa para retomada explícita da mesma operação.
Pausar interrompe chamadas futuras e deixa a atual concluir; não cancela commits.
Janela conservadora de recibo:23h desde o início local, menor que TTL24h do servidor.
Depois disso exige consultar/revisar, sem reaproveitar automaticamente a intenção.
Conflitos/recusas por item são terminais, preservados na retomada; o operador revisa
o resultado antes de uma nova operação. Valores/IDs ficam apenas em memória privada
da tela, nunca URL, storage, clipboard, telemetria ou logs.

## Evidência e limites

Testes focados cobrem validação/debounce, três versões distintas, join por ID,
105 contas/duas páginas, resposta perdida, consulta perdida após commit, digitação
nova, operador concorrente, procedência explícita, clear confirmado, lote100,
orçamento/estagnação/Retry-After/pausa/TTL, resultados terminais,401, readonly,
troca de identidade/capability, limpeza/StrictMode e navegação com descarte.
Mocks de transporte provam a UI/controladores; não são PostgreSQL/Entra reais.
Serviço/KDF/ACL e preservação de credenciais têm suítes existentes de backend;
integração completa pertence a #758/#759. Registrar SHA/verify/CI/deploy na issue.

QA do módulo usa build Vite compilado com CSP do ADM e dados inteiramente inventados.
Conferidos1280×850,390×740 e320×700,100 linhas/últimas5 de105 e catálogo106 com
última turma vazia. Ano parcial não escreve; ano completo/confirmar procedência/
clear sintéticos, cancelamento por Escape e retorno ao botão de origem passaram.
Lote de2 valores usou2 chamadas/1 intenção; resposta perdida repetiu2/1; falha só
na consulta depois do commit manteve1 escrita. Conflito/recarga,401 com remoção de
nomes/campos, readonly e pausa por3 chamadas estagnadas/retomada/manual4/1 passaram.
Console sem erros/avisos. Tabela760px rola dentro da área móvel sem perda de ações.
Helper, aba própria e viewport encerrados após a revisão. Nenhuma conta real usada.
Browser Act está bloqueado pela política do Windows; usar CUA disponível sem
contornar a política. A revisão móvel corrigiu rolagem horizontal do contêiner
da Table e foco de retorno dos diálogos. Evidência final e limpeza ficam no handoff.
O mínimo global320px do ADM segue com #757/#758, sem ampliar esta allowlist.
Sem piloto autenticado, declaração de dados legítimos ou liberação de acesso aqui.
Rollback compatível de código preserva schema, dados, chaves e revogações.
