# Notas granulares e Painel do Aluno — #817 / PR #818

## Pedido e escopo

Pedido explícito do responsável em 16/09/2026. Baseline: `main@7e15e566c28f90923089b1b9737982ffd25657c4`. Esta entrega diferencia atividade não realizada de zero real, cria nomes institucionais de AV1/AV2 e simplifica o Painel do Aluno administrativo com HeroUI React v3. Não cria outro motor acadêmico, sistema de permissões, scheduler ou fluxo App Factory. Estado de integração, DDL e deploy deve ser conferido nos checkpoints da issue/PR; presença deste documento não comprova publicação.

## Observação granular, não inferência

O produtor canônico V9 passa a enviar `granularObservationVersion: 1`. Nos slots AV1, AV2, PARA e atividades 1–10, o valor bruto observado é a autoridade: branco lido vira `null`, zero digitado/resultado numérico zero de fórmula vira `0`; indisponível/erro/não observado continua `['u']`. O marcador legado `0,1` continua significando zero acadêmico. AM/REC/U e suas regras não recebem essa conversão. Não exigir uma nova planilha técnica.

No estado atual, **linha em `nota` com `valor = NULL` significa branco observado**; ausência de linha significa que não há observação atual registrada. Instrumento qualitativo inativo (sem máximo, descrição real ou evidência) não ganha uma ocorrência de “Não fez” apenas por ocupar uma coluna do modelo. Dados indisponíveis não apagam observações anteriores. Reimportação idêntica continua sem delta acadêmico. Os dois flags históricos distinguem criação/remoção de uma observação em branco de uma mudança de valor, mantendo a restrição de delta real.

O transporte sem a nova identificação preserva a compatibilidade anterior de limpeza. O importador oficial do Centro produz a identificação nova. Não existe backfill de zeros descartados, nem transformação retroativa de toda nota ausente em atividade não realizada: **reler/importar a fonte é necessário para recuperar fatos que a versão anterior descartou**.

Os DTOs acrescentam `notDone?: true` somente para marca ausente/valor nulo; zero continua numérico. Interface granular: `Não fez` / `Tirou zero`; indisponível mantém seu estado anterior. A mudança abrange Avaliações e detalhe lateral de Desempenho, parciais no Portal e Boletim detalhado. Não substitui a nota trimestral nem transforma qualitativo em comportamento. O núcleo continua calculando com seus estados de cobertura; AM/U oficiais e decisões humanas permanecem independentes.

## Nomear avaliações

Seis chaves por ano: `1:1`, `1:2`, `2:1`, `2:2`, `3:1`, `3:2`. Nome de 1–80 caracteres, sem controles; vazio remove a substituição e repõe a descrição de origem/padrão. A identidade do instrumento permanece oferta/trimestre/slot. Os nomes valem para todas as turmas daquele ano, não para uma disciplina isolada.

`POST /api/gradebook/assessment-names`, contrato V1, operações `read` / `save`, ano explícito e `expectedVersion`. Mesma autenticação Entra/capability administrativa, origem, gate PostgreSQL/produção, resposta privada `no-store` e erros opacos. Uma única transação de salvamento mantém coordenação anual, CAS, idempotência semântica e evento `academic-policy`; falha do hook reverte a alteração do nome. Não há gravação por simples abertura da tela.

Editor HeroUI com seis campos e autosave de 650ms, Enter/saída do campo, estado curto Salvo/Salvando/Não salvo. Requisições são serializadas; edição durante salvamento não se perde; leitura de fundo não substitui rascunho; conflito exige escolha explícita da versão salva. Erro de rede não dispara repetição indefinida de escrita. Perda de autorização limpa os nomes. Ano/aba/recorte preservam rascunhos em memória ou bloqueiam navegação enquanto há edição, sem armazenamento persistente de dados acadêmicos.

Consumidores reaproveitam `assessmentLabelV1`: detalhe e matriz de avaliações V2/V3, analytics por meio do mesmo coletor, Portal/projeção de publicação e novas prévias/emissões de Boletins detalhados. O Self autorizado aplica uma sobreposição **somente de rótulos** em avaliações já visíveis; não revela parciais ocultas, não troca marcas congeladas nem falsifica revisão de publicação. Boletins já emitidos mantêm seu snapshot e não leem a fonte atual para reinterpretar a reimpressão.

## Administração e uso em computador

HeroUI Tabs diretamente acessíveis: Visão geral, Alunos, Nascimento, QR e cartões, Notas publicadas, Sessões, Auditoria e Configurações. Removidos o subtítulo repetido e os disclosures sobrepostos à navegação. Fichas agrupam os dados básicos; tabelas omitem metadados redundantes, mantêm detalhes/dicas onde necessários e usam linhas compactas. Removida somente a máscara horizontal esquerda de tabelas, preservando a direita e as máscaras verticais.

Um único Select de turma carrega o catálogo autorizado/paginado; pesquisa textual continua onde é de fato pesquisa por aluno. Limites são explícitos, sem cortar silenciosamente o catálogo. Cores/avatares são decorativos e determinísticos, sem supor foto de aluno; estados continuam textuais. Perda de identidade limpa seleções e artefatos.

Nascimento: digitar quatro dígitos válidos salva e confirma a ação do operador; abrir a tela não confirma um valor importado. Sem coluna/aba Ações nem revisão de lote obrigatória. Mantidos validação, permissão, CAS, idempotência, erro por linha e trilha. Campo incompleto não apaga nascimento; Escape restaura a base. Paginação/troca de escopo não descartam silenciosamente edição pendente.

Sessões: feeds independentes **Ativas**, depois **Histórico**, obtidos pelo filtro opt-in `sessionView` no contrato administrativo V2. A classificação é a validade efetiva do núcleo (não apenas ausência de revogação). Cursores assinados incluem o filtro; cada resposta examina no máximo 500 candidatos, devolvendo continuação inclusive numa janela sem correspondência. O histórico não impede encontrar sessões ativas mais antigas. Revogação preserva contagem atual, versão, confirmação e idempotência; consultas não são comandos.

Datas: DatePicker + Calendar nativos HeroUI, pt-BR, hora/minuto em Brasília, agrupados por ano, trimestres e recuperação/resultado. `CloseButton slot={null}` evita herdar o contexto do botão de abrir calendário (IDs/ações duplicados). A Auditoria aplica datas válidas sem botão Aplicar. Configurações críticas e abertura/retirada de notas continuam com as confirmações necessárias; simplificar o nascimento não remove a proteção dessas operações.

## QR e impressão

Tabela HeroUI com seleção à esquerda, `Checkbox.Content`/Control/Indicator nativos e avatares coloridos. SVG, PNG e PDF usam a **mesma geometria arredondada** de módulos e localizadores, mantendo payload, contraste preto/branco e quatro módulos de margem. Não inserir logo ou decoração dentro do conteúdo do código. URL/token não vão para metadados, logs, imagens de testes reais ou textos explicativos.

PDF A4, três colunas, margem de 18pt, intervalo zero entre cartões, linhas de corte tracejadas compartilhadas e QR com 108pt. Linhas se expandem para nomes extensos em vez de cortar nomes ou reduzir o QR. Seleção, progresso, cancelamento e liberação de URLs/artefatos continuam existentes. Removidos caminhos de revisão de nascimento e controles redundantes sem consumidores; contratos legados ainda utilizados não foram apagados por mera semelhança de nome.

## Dependências e banco

Declaradas diretamente as versões que já constavam transitivamente no lockfile: `@internationalized/date@3.12.3` e `react-aria-components@1.20.0`, utilizadas pela composição oficial do DatePicker; `sharp@0.35.4` apenas em desenvolvimento para decodificar o SVG real nos testes. Não foi acrescentada outra biblioteca de UI.

Ordem: `gradebook-simplified/0009_granular_observations_names_v1.sql`, depois `student-portal/0012_granular_observations_names_v1.sql`. Alteração aditiva mínima: nulabilidade de nota, flags históricos, JSON/versão de nomes no ano e extensão das projeções existentes. A restrição de eventos do Portal continua em 2026, inclusive para renomeações em outros anos do Banco. Não há nova tabela, importação, reset, backfill, mudança de pessoas/permissões/secrets ou concessão pública. A aplicação produtiva tem checkpoint próprio após preflight e gates; nunca deduzi-la do merge.

## Verificação e limites

Testes sintéticos cobrem persistência V11, observação/null/zero/não lido, histórico/idempotência, nomes/CAS/isolamento de ano/rollback do hook, transporte e autorização, editor/StrictMode/autosave/respostas atrasadas, Portal sem nova divulgação, Boletim detalhado, calendário HeroUI real, sessões filtradas/paginadas e decodificação do QR arredondado. Os testes antigos de UI foram adaptados aos controles e rótulos pedidos, preservando os casos de segurança e concorrência.

QA de impressão: PDFs reais gerados com 100 cartões sintéticos (incluindo nome de 200 caracteres), renderizados com Poppler e inspecionados na primeira/última página. A variante somente QR ocupa seis páginas; nome+turma com casos extremos, oito. Amostras reais rasterizadas dos PDFs a 200dpi foram decodificadas com jsQR, inclusive cartão 100; SVGs reais também foram rasterizados/decodificados. Não é homologação de uma impressora/câmera física.

QA da aplicação: Browser plugin não disponível. Tentativa de Playwright/Chromium no servidor Vite `http://127.0.0.1:4173/qa-817.html` bloqueada por `net::ERR_BLOCKED_BY_ADMINISTRATOR`, antes de renderizar; não houve contorno. Harness temporário removido. Não há screenshot/aceite visual desktop ou mobile, nem smoke autenticado de produção nesta rodada. Testes React reais HeroUI e PDFs não substituem essa inspeção. Resultado completo de verify/CI, SHA e deploy ficam na issue/PR.
