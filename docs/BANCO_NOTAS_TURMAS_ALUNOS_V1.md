# Banco de Notas — Turmas e Alunos V1

## Escopo

Vertical slice administrativo read-only na mesma aplicação e sessão do Banco de Notas. As rotas `/banco-de-notas/turmas` e `/banco-de-notas/alunos` possuem lista, filtros na URL, paginação no servidor e drill-down. Todas as consultas exigem `grades.analytics.read`.

## Decisão de roster

Não foi criada tabela de matrícula. O roster canônico deriva de assignments docentes ativos, versão mais recente de cada `teacher_model` não arquivado, seus `cell_mappings` e igualdade exata entre `mapping.grade_key` e `year|classGroupId|componentId|studentId` reconstruída com IDs reais. A relação é deduplicada por ano + turma + aluno, independentemente de componentes, professores, mappings ou fields.

Não há `LIKE`, substring ou fuzzy match para estabelecer relação. Um estudante cadastrado sem evidência permanece na pesquisa global e o detalhe explica que não há turma relacionada no estado atual.

## API

- `GET /v1/turmas-alunos/filters`;
- `GET /v1/turmas` e `GET /v1/turmas/:id`;
- `GET /v1/alunos` e `GET /v1/alunos/:id`.

As listas validam filtros Zod, limitam `page`/`pageSize`, mantêm ordenação estável e agregam no D1 sem N+1. Turmas filtram ano, status, professor, componente, atenção e texto. Alunos filtram ano, turma, status, relação canônica, snapshots e texto. Storage ausente falha fechado; IDs inválidos retornam 400 e entidades ausentes retornam 404.

## UI e navegação

Turmas exibe roster comprovado, componentes/professores, modelos conectados/total, pendências, atenção e última atividade. O detalhe reutiliza o read model de Acompanhamento para assignments, modelo, sync, fonte e findings. Alunos inclui todo o cadastro canônico; o detalhe organiza contextos por ano/turma e snapshots por componente/campo, valor, origem e atualização.

Acompanhamento → Turma, Turma → Acompanhamento, Turma → Aluno e Aluno → Turma estão conectados. Zero numérico é `0`; `is_absent=1` é “Ausência explícita”; campos sem snapshot não são fabricados.

## Limites deliberados

Não há CRUD de aluno/matrícula, integração inferida com SMECEL, escrita de nota, ativação de sync, Graph/Entra mutation ou acesso D1 remoto. Uma fonte institucional de matrícula deve ser missão própria se funções futuras exigirem vínculos além da evidência dos mappings.

## Browser QA sintético

Executado localmente contra o build de produção e um adaptador HTTP temporário, encerrado e removido ao final.

- desktop 1440 × 900 e mobile 390 × 844;
- Turmas: filtros HeroUI, query string após reload, busca com debounce, empty, detalhe, assignments, modelo, fonte, finding e roster;
- navegação Turma → Aluno → Turma e Turma → Acompanhamento;
- Alunos: filtros de relação/snapshot, aluno relacionado e aluno cadastrado sem vínculo;
- detalhe: snapshot numérico `0`, ausência explícita, origem e atualização;
- estados HTTP 500 e 403 com mensagens administrativas;
- estado parcial quando filtros falham com a lista disponível e 404 com mensagem própria;
- cabeçalho da turma com status, total relacionado e última atividade; lista de alunos com contagem factual de snapshots e contexto com pendências;
- `documentElement.scrollWidth=clientWidth=375` nas listas e detalhes mobile;
- tabela de Turmas com contêiner próprio `overflow-x:auto` (`285px` visíveis para `945px` de conteúdo), sem overflow da página.

O QA identificou antes do commit que “Relação com turma” e “Snapshots” estavam na tela de Turmas. Os filtros foram movidos para Alunos, o build foi refeito e toda a validação foi repetida com sucesso. Nenhum dado ou serviço remoto foi usado.

Gate local final: `npm run verify` com 353 testes em 67 arquivos, build de aplicação e add-in, manifest, lint, tipos, formatação e contrato semântico aprovados; audit com zero vulnerabilidades e diff check limpo.
