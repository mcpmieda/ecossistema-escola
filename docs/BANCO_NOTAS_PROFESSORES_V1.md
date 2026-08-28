# Banco de Notas — Professores V1

Data: 28/08/2026

Branch: `feat/banco-notas-professores-v1`

Estado: vertical slice read-only implementado e validado localmente; publicação em PR Draft e CI registradas ao final da missão.

## Funcionalidade

`/professores` é o diretório operacional de professores do Banco de Notas. A lista oferece pesquisa com debounce, filtros server-side, paginação e contexto persistido na URL. Ela mostra status, identidade institucional, turmas/componentes, assignments, modelos conectados, pendências, situação operacional e atividade recente.

`/professores/:id` apresenta cabeçalho, resumo anual, assignments por turma/componente, fonte vigente, modelo/versão/sync, disponibilidade factual de arquivo, pendências e atividade recente. O fluxo é somente leitura e navega para Turmas e Acompanhamento com retorno ao professor e aos filtros anteriores.

Professores canônicos sem assignment permanecem visíveis e recebem o texto administrativo `Sem atribuição no período selecionado`.

## Domínio e regras

- `teachers` é a fonte canônica da identidade do professor no Banco de Notas.
- Relações usam apenas IDs persistidos; nomes não fazem vínculo nem fuzzy matching.
- Assignments, class groups, components, teacher models, model versions, sources, findings, grade events e snapshots formam o read model.
- Identidade Entra é reduzida a `linked` ou `missing` no DTO; OID, claims, tenant internals e Drive IDs não saem da API.
- O modelo corrente é derivado da versão de maior número persistida em `teacher_model_versions`.
- A fonte exibida é a fonte efetiva no contexto anual e da atribuição.
- Não há identidade paralela, migration nova, cadastro de RH ou correção automática de inconsistências.

A situação operacional usa `deriveOperationalAttention`, compartilhada com Acompanhamento:

- `error`: importação/finding com erro ou modelo suspenso;
- `warning`: finding aberto, modelo esperado ausente, fonte obrigatória ausente, identidade obrigatória ausente, professor inativo com assignment ativo ou modelo sem assignment;
- `info`: professor sem assignment ou modelo ainda não conectado;
- `normal`: nenhum sinal factual relevante.

`sync_enabled=0` isoladamente não produz erro.

## API e autorização

- `GET /api/banco-notas/v1/professores/filters`
- `GET /api/banco-notas/v1/professores`
- `GET /api/banco-notas/v1/professores/:id`

As três rotas exigem `grades.analytics.read`, validam query params com Zod e falham fechadas. A lista usa ordenação estável e paginação server-side. O repositório D1 usa CTEs, joins e agregações, sem consulta por professor em loop.

Filtros: ano, status, turma, componente, identidade, estado do modelo, com/sem assignment, situação de atenção e pesquisa por nome.

Contrato: `api/banco-notas-professores-v1.openapi.yaml` e `shared/banco-notas-professores.ts`.

## Diagnósticos

O read model contabiliza, sem corrigir automaticamente:

- assignments órfãos;
- teacher models sem assignment válido;
- professores inativos com assignment ativo;
- assignments sem fonte efetiva.

## UI e estados

A implementação HeroUI cobre loading, vazio global, filtro sem resultado, professor sem assignment, identidade ausente, resposta parcial, erro genérico, 403 e 404. Tabelas largas mantêm rolagem própria; a página não cria overflow horizontal global.

Também foram adicionados links Turma → Professor e Acompanhamento → Professor, preservando retorno interno seguro.

## Verificação local

- `npm test`: 369 testes em 71 arquivos — PASS;
- lint — PASS;
- typecheck — PASS;
- semantic contract — PASS;
- build web e add-in — PASS;
- warning histórico de chunk acima de 500 kB permanece não bloqueador.

Foram adicionados 16 testes focados: 5 de repositório SQLite, 3 de API, 3 de contrato e 5 de UI/integração estática. A regressão completa inclui Acompanhamento, Turmas e Alunos.

## Browser QA sintético

Executado em servidor local temporário com nomes e IDs sintéticos; fixture e servidor foram removidos ao final.

Desktop 1440 × 900:

- lista, pesquisa com debounce, filtros e paginação;
- query persistida após reload;
- detalhe completo e professor sem assignment/identidade;
- Professor → Turma → Professor;
- Professor → Acompanhamento → Professor;
- vazio, HTTP 500, 403 e 404.

Mobile 390 × 844:

- filtros utilizáveis;
- detalhe legível;
- `documentScrollWidth <= innerWidth`;
- tabelas com scroll próprio.

Nenhuma PII real foi usada ou registrada.

## Limites preservados

- sem merge e sem deploy;
- produção, D1 remoto, Graph e Entra intactos;
- add-in não publicado;
- nenhum compartilhamento novo;
- nenhuma edição de notas;
- `sync_enabled=0` preservado.

## Próxima missão recomendada

`Pesquisa Global V1`, porque os diretórios read-only de Acompanhamento, Turmas, Alunos e Professores já oferecem os destinos necessários para uma busca unificada. Operações de escrita e experiência cotidiana do add-in permanecem fases separadas e de maior risco.
