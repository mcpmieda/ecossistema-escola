# Banco de Notas — Acompanhamento V1

Data: 28/08/2026

Status do código local: vertical slice funcional concluído, ainda sujeito aos gates completos e à CI do PR.

## Escopo entregue

- rota `/banco-de-notas/acompanhamento`;
- detalhe `/banco-de-notas/acompanhamento/turmas/:id`;
- APIs administrativas read-only de summary, lista paginada e detalhe;
- autorização server-side por `grades.analytics.read`;
- agregações e filtros executados no D1;
- filtros de ano, turma, professor, estado do modelo, sync, situação e pesquisa;
- query string como fonte do contexto de filtros, paginação e retorno do detalhe;
- turmas, professores, componentes, modelos, fonte autoritativa, snapshots e findings reais;
- alunos apenas quando podem ser relacionados pelos mappings canônicos do modelo;
- zero numérico e ausência explícita exibidos separadamente;
- estados de loading, vazio, filtro sem resultado, erro, parcial e sem permissão.

Não há edição de notas, resolução destrutiva de finding, ativação de sync, Graph no browser ou mudança de produção.

## Regra de “Precisa de atenção”

A classificação é derivada somente de estados persistidos:

| Sinal                                                        | Nível      |
| ------------------------------------------------------------ | ---------- |
| import job em `failed`                                       | erro       |
| finding `error` sem resolução                                | erro       |
| teacher model `suspended`                                    | erro       |
| finding não resolvido sem erro                               | warning    |
| modelo ausente                                               | warning    |
| fonte autoritativa vigente ausente                           | warning    |
| identidade Entra ausente quando necessária para compartilhar | warning    |
| modelo existente ainda não `connected`                       | informação |

`sync_enabled=0` é apresentado como **Desligada** e não é, isoladamente, um erro ou warning.

## Fonte de alunos e notas

A V1 não cria enrollment paralelo. Um aluno aparece no detalhe somente quando o modelo docente mais recente possui `cell_mappings` com `gradeKey` canônica para a turma e estudante persistido. `studentPosition` continua governado pelo contrato de geração e não é reinventado no read model.

Os totais de notas consideram apenas `grade_snapshots` existentes:

- valor presente: `is_absent=0`;
- ausência explícita: `is_absent=1`;
- zero numérico: `is_absent=0 AND value_numeric=0`.

Nenhum “percentual lançado” ou “aluno sem nota” é inferido.

## Contrato

OpenAPI: `api/banco-notas-acompanhamento-v1.openapi.yaml`.

Endpoints:

- `GET /api/banco-notas/v1/acompanhamento/summary`;
- `GET /api/banco-notas/v1/acompanhamento/turmas`;
- `GET /api/banco-notas/v1/acompanhamento/turmas/:id`.

## Browser QA sintético

Executado localmente contra o build de produção e um adaptador HTTP temporário com dados sintéticos.

Cobertura observada:

- desktop;
- viewport 390 × 844;
- filtros e pesquisa com debounce;
- query string após reload;
- lista → detalhe → voltar preservando contexto;
- detalhe de professor/modelo/fonte;
- zero numérico e ausência explícita;
- estado vazio;
- estado de erro;
- tabela com scroll próprio em viewport menor.

O primeiro teste em 390 px identificou overflow horizontal da página. O contêiner foi corrigido e a revalidação retornou `scrollWidth=clientWidth=375`.

O servidor temporário foi encerrado e o arquivo de fixture do browser foi removido. Nenhum preview remoto ou dado persistente foi criado.

## Segurança

- produção intacta;
- D1 remoto não acessado;
- `sync_enabled` não alterado;
- nenhum deploy;
- nenhum add-in publicado;
- nenhum Graph scope alterado;
- somente nomes sintéticos nos testes e no QA;
- endpoints falham fechados sem capability ou adapter D1.
