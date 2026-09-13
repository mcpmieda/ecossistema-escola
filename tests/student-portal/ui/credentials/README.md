# QR e PDF no ADM — #755

Entrega M, identidade CODEX, execução direta e sequencial. Base integrada/publicada:
`8216d1feb0f2ffba125c4b47affb57d67e30105d` (#754). Esta entrega usa somente
`src/features/student-portal-admin/credentials/**`, esta suíte e `qr-print/**`.
Nenhum contrato, backend, SQL, DDL, package/lock, dado real ou permissão foi alterado.
SHA final, verify/CI e publicação ficam no handoff da issue/PR.

## Composição para #757

`StudentCredentialsV1` recebe clientes V1/V2 estáveis, `scope`, `identityKey` e
`canWrite` obrigatórios, `scopeLabel`, catálogo opcional no escopo escola e callback
`onAuthorizationLost`. Escola exige escolher uma turma do catálogo BN existente,
inclusive turmas vazias. Turma/ficha usam consulta V2 limitada a100, sem N+1.
`renderArtifact` é uma injeção local para testes; omitir na composição produtiva.

A ficha individual seleciona sua conta inicialmente. Turma permite selecionar
contas disponíveis da página atual; a próxima página limpa seleção/artefatos.
Não há seleção silenciosa de toda a escola ou lote acima de100. Cada ação captura
IDs, versão e formato em revisão antes do comando. Mudança de identidade, escopo,
capability ou página desmonta o contexto;401/403 removem nomes/controles e artefatos.
O integrador deve trocar `identityKey` após reautenticação e montar o módulo dentro
da autorização existente. O cliente não recebe contexto confiável/role do servidor.

Três comandos existentes, com efeitos diferentes:

- Emitir ou recuperar QR: `qr-issue` individual, CAS da conta, somente PNG.
- Reimprimir QR existente: `qr-reprint`, mesma credencial, CAS da conta, somente PNG.
- Preparar PDF: `qr-batch` até100 e uma turma; modo único escolhido antes da geração,
  padrão `qr-name-class`. Usa `accounts-read.scopeVersion`, inclusive PDF individual.
  O servidor fornece nome/turma oficiais apenas quando autorizados pelo modo.

`accountsScopeVersionV1` é compartilhada pela consulta V2 e pelo lote QR: revisão
acadêmica+vínculo+versões das contas. Não usar `birth-years.scopeVersion`, versão de
configuração ou posição da linha. A validação verifica IDs únicos, credenciais
distintas, modo, contagem e versão da resposta; reordena pela seleção capturada.

Emissão preserva QR já ativo; reprint não gira segredo nem revoga sessão. Conta com
credencial histórica revogada exige a ação apropriada na ficha; não existe fallback
automático para regenerar/resetar. #753 conserva a autoria dessas ações destrutivas.
Depois de reset/regeneração, o integrador pode abrir esta ficha e consultar novamente
para reimprimir; uma falha de arquivo nunca repete a rotação. Não manter resultado
QR em estado global ou reutilizar um CAS anterior à ação.

## Intenção, cancelamento e memória

`createQrOperationV1` mantém comando preparado e cartões/Blob somente em variáveis
privadas. Resposta perdida,503/429 ou resposta inválida repetem os mesmos bytes,
idempotencyKey e CAS mediante ação do operador. Retry-After desabilita repetição até
o prazo; janela de recibo conservadora23h.409 exige nova consulta/revisão.401/403
limpam o contexto e não oferecem retry da mutação.

Após resposta QR válida, nova tentativa por falha de renderização usa somente os
cartões já confirmados: não faz outra escrita. Progresso conta cartões realmente
renderizados; espera do servidor é indeterminada e100% de desenho não é arquivo
pronto antes da serialização. Cancelamento aborta requests, impede próximo cartão
e descarta resultados tardios, sem alegar rollback de emissão já aceita. A etapa
interna de serialização do pdf-lib é cooperativa; seu resultado também é descartado
se houver cancelamento. Não há geração/distribuição em segundo plano após sair.

Arquivos prontos expiram localmente em cinco minutos. Descartar, navegar, pagehide
ou desmontar limpam referências, timers e Blob URLs. Download usa nome neutro
`portal-qr.png`/`portal-cartoes.pdf`, revoga URL em30s ou imediatamente ao limpar.
Não existe storage/cache/telemetria, texto QR no DOM, link navegável de credencial,
envio externo, upload de dados reais ou distribuição automática aos alunos.

Copiar chama Clipboard API somente no clique, com PNG pronto e **um único item
image/png**. Sem text/plain, HTML, nome, turma ou instrução. Falha/indisponibilidade
oferece botão de download da mesma imagem, sem serviços externos. A implementação
não lê o clipboard do operador. O teste manual sintético restaurou/limpou seu
clipboard temporário após conferir o tipo e não registrou conteúdo anterior.

## Renderização e acessibilidade

Bibliotecas aprovadas em #744: qrcode1.5.4, pdf-lib1.17.1 e jsQR1.4.0. Importação do
renderizador é dinâmica; nenhuma dependência nova. A4, seis cartões por página,
margens24pt, gap12pt, QR108pt (38,1mm) com quatro módulos brancos, preto/branco e
correção M. Módulos são geometria vetorial PDF, sem URL/texto/annotação de QR.
PNG usa oito pixels por módulo e a mesma quiet zone; canvas é limpo após gerar Blob.

Nomes são completos, NFC e quebra medida de palavras/graphemes, inclusive palavras
sem espaços; nunca ellipsis. Helvetica PDF cobre português. Outros scripts usam
fontes locais do navegador rasterizadas a288dpi, sem transliteração, fonte remota
ou substituição de caracteres. Texto não suportado/sem espaço falha explicitamente
em vez de cortar o cartão. QR-only não desenha nome/turma/cabeçalho/rodapé; outros
modos desenham somente seus campos autorizados. Nenhum PIN/nascimento/senha/nota.

Table/ScrollShadow mantém rolagem local; seleção por rótulo e teclado. Radio.Content
envolve controle+rótulo para que círculo e texto sejam clicáveis. Label do grupo é
única, sem IDs duplicados nos itens. AlertDialog permite Escape, Cancelar recebe
foco inicial e devolve foco ao botão de origem. Cancelamento não exige confirmar
ação. Progresso por cartão não redesenha a tabela de100 linhas (memo com props
estáveis). A geração cede entre cartões com MessageChannel, evitando throttling
de setTimeout em aba de fundo. O mínimo global320px do ADM pertence a #757.

## Provas e limites

Suíte: três layouts reais100/17páginas,1/100/101/duplicatas/modo/campos estranhos,
mesmo QR/imagem maior, cancelamento, nomes longos/graphemes; mutação/retry/CAS/TTL,
render-only retry,401/403/409, recibo23h, clipboard/download/URLs, três modos UI,
revisão/Escape/foco,105 contas/duas páginas,readonly/troca de identidade/StrictMode.

QA browser compilado com CSP exata ADM:1280×850,390×740 e diálogo320×700; emissão/
reprint/PDF100, perda de resposta2 chamadas/1 intenção, falha local1 chamada,
429 com botão inicialmente desabilitado e retomada2/1,409 sem retry,401 sem nomes,
readonly, cancelamento sem arquivo tardio, catálogo/turma vazia/página final5.
Console final sem erros/avisos. Browser Act bloqueado pela política Windows;
CUA disponível usada sem contorno. Abas próprias/helpers encerrados e viewport
restaurado; downloads sintéticos conferidos e movidos para a pasta de QA local.

Seis PDFs reais foram gerados pelo navegador (1/100 em cada modo), renderizados
integralmente pelo Poppler a150dpi e inspecionados em54 páginas/nove pranchas,
com conferência em resolução original de Unicode e da última página com nome200/
turma80 caracteres. jsQR decodificou303 cartões PDF e1 PNG, inclusive a imagem
maior dos testes. Extração pypdf confirmou textos esperados, nomes completos,
nenhum token/URL em texto e zero anotações. Clipboard nativo retornou somente PNG;
download PNG idêntico ao arquivo decodificado. Download PDF pela UI:17 páginas,
100 nomes sintéticos e301303bytes. Essa massa não autentica contas reais.

Mocks não provam Entra/PostgreSQL/cliente produtivo. Não houve impressão física,
piloto real, habilitação de acesso ou distribuição de QR. A montagem pertence a
#757, QA integrada a #758 e impressão/dispositivos/Entra/dados legítimos a #759.
G-B continua PARCIAL. Rollback compatível preserva schema, dados, chaves e revogações.
Próxima entrega após publicação verificada desta: #756.
