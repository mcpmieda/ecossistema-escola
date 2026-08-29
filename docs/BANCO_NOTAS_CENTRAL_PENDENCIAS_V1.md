# Banco de Notas — Central de Pendências V1

Data: 28/08/2026

Branch: `feat/banco-notas-central-pendencias-v1`

Base: `main` em `5e6d7cfd0b010da7f34c0044eca5ce704a06d429`

## Objetivo

A Central reúne evidências operacionais abertas para que a secretaria identifique o que está em erro, o que exige atenção, o que é informativo e qual contexto canônico deve ser investigado. V1 é estritamente **read-only + diagnóstico + navegação**.

Não existem comandos para resolver, ignorar, arquivar, atribuir responsável ou corrigir automaticamente.

## Fontes factuais

O read model usa somente relações e estados já persistidos no D1:

- `import_jobs` em `failed`;
- findings abertos, preservando severidade persistida;
- teacher models suspensos, ausentes para assignment, sem assignment ou ainda não conectados;
- identidade institucional ausente somente quando o estado do modelo a exige;
- assignment ativo sem fonte autoritativa vigente;
- professor inativo com assignment ativo;
- assignment com relação canônica incompleta;
- importação `draft` sem análise verificada.

Não foi criada migration, tabela materializada, índice paralelo ou heurística baseada em nomes. `sync_enabled=0` isoladamente não cria pendência.

## Classificação única

`operational-attention.ts` continua sendo a regra compartilhada para semânticas equivalentes. A Central adiciona `classifyOperationalPending`, que deriva erro/atenção/informação por meio de `deriveOperationalAttention`; findings preservam a severidade persistida e análise pendente permanece informação factual.

Ordenação: erro → atenção → informação → atualização mais recente → ID estável.

## API e autorização

Endpoints same-origin:

- `GET /api/banco-notas/v1/pendencias/summary`;
- `GET /api/banco-notas/v1/pendencias`;
- `GET /api/banco-notas/v1/pendencias/:id`.

Todos exigem `grades.analytics.read`, validam query/path com Zod e falham fechados se o storage não estiver disponível. Filtros e paginação são aplicados no servidor. O repository usa CTEs/joins e um número fixo de consultas, sem N+1.

## DTO e privacidade

`PendingItem` contém ID estável, tipo limitado, severidade, status aberto, título, descrição, evidência, origem factual, contexto mínimo, datas e links internos relacionados.

Ficam fora do DTO: tokens, OID, claims, UPN, IDs Graph/Drive, caminhos de storage, conteúdo de `details_json`, SQL e dados de nota.

## Interface

Rota: `/banco-de-notas/pendencias`, com detalhe em `/banco-de-notas/pendencias/:id`.

A experiência HeroUI contém:

- resumo por severidade;
- filtros por ano, severidade, tipo, professor, turma, componente, status e texto;
- URL persistente, debounce, cancelamento de request e paginação;
- lista responsiva com tabela em scroll próprio;
- estados loading, empty, partial, 403, 404 e erro;
- detalhe com causa, evidência, origem, contexto, datas e links de investigação;
- links filtrados a partir de Acompanhamento, Professor e Turma.

## Verificação automatizada

- SQLite real com migrations `0001`–`0007`;
- summary com erro/atenção/informação;
- taxonomia, deduplicação, ordenação e ID estável;
- filtros server-side e paginação;
- detalhe e 404;
- allow/deny por capability e storage fail closed;
- ausência de identificadores técnicos no DTO;
- rotas, estados, HeroUI, URL/debounce e natureza read-only;
- regressão global pelo `npm run verify` antes da publicação.

Gate local final em 28/08/2026:

- `npm run verify`: PASS;
- 403 testes em 80 arquivos: PASS;
- formatação, lint, tipos, contrato semântico e manifesto: PASS;
- builds web e add-in: PASS;
- `npm audit --audit-level=high`: 0 vulnerabilidades;
- `git diff --check`: PASS.

## Browser QA sintético

Executado localmente em 28/08/2026 com build de produção e fixture HTTP exclusivamente sintética:

- desktop em 1440 × 900: resumo, ordenação erro → atenção → informação, paginação, filtro por severidade e pesquisa com debounce;
- cancelamento de resposta obsoleta: uma busca lenta foi substituída por outra e somente o resultado mais recente permaneceu na URL e na lista;
- detalhe: causa, evidência, origem factual, contexto e datas apresentados sem identificadores técnicos;
- navegação contextual e retorno preservado para Professor, Turma e Acompanhamento;
- estados empty, 403, 404 e 500, incluindo retry no erro 500;
- mobile em 390 × 844: navegação recolhível, cards e filtros utilizáveis, sem overflow global; a tabela larga permanece contida no próprio scroll horizontal (`570 px` de conteúdo dentro de `285 px`, com documento em `375 px` para viewport de `390 px`);
- servidor, aba, viewport e fixture temporários encerrados/restaurados/removidos ao final.

## Limites operacionais preservados

- nenhum deploy;
- nenhuma consulta ou mutation D1 remota;
- nenhuma mudança Graph/Entra;
- nenhum token, secret ou dado real persistido;
- add-in não publicado;
- sync não ativado e `sync_enabled=0` preservado.

## Estado

Implementação, testes focados, Browser QA sintético e gate integral final concluídos localmente. Commits, PR Draft e CI ainda são gates obrigatórios antes de declarar `BANCO_NOTAS_CENTRAL_PENDENCIAS_V1_PASSED`.
