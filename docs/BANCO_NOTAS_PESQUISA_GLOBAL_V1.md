# Banco de Notas — Pesquisa Global V1

Data: 28/08/2026

Branch: `feat/banco-notas-pesquisa-global-v1`

Base: `main` em `8eed2e9bc00ff4d53749f4c1ac630bf0f182fa52`

## Escopo implementado

- Rota HeroUI `/banco-de-notas/pesquisa`, acessível pelo menu existente.
- Busca read-only de alunos, professores e turmas a partir das tabelas e do roster canônico existentes.
- Endpoint `GET /api/banco-notas/v1/pesquisa` protegido por `grades.analytics.read`.
- Parâmetros `q`, `types`, `limitPerType` e `schoolYearId`, validados por Zod.
- Normalização por trim, espaços, caixa e acentos comuns.
- Ranking no servidor: nome exato, prefixo, ocorrência e contexto; desempate estável por nome e ID.
- Três consultas SQL preparadas, limitadas e independentes, executadas em paralelo quando solicitadas.
- Totais e `hasMore` por tipo sem N+1 e sem carregar diretórios completos.
- Navegação para detalhes existentes de Aluno, Professor e Turma, com retorno seguro para a pesquisa.
- Link para Acompanhamento somente quando existe assignment ativo comprovado.
- Debounce de 300 ms, cancelamento de requisição obsoleta, `q` persistido na URL e atalhos `/` e `Esc`.
- Estados distintos de termo curto, loading, vazio, erro e 403.

## Limites preservados

- Nenhuma migration, tabela, FTS, índice paralelo, busca fuzzy de identidade, IA ou banco vetorial.
- Nenhum ranking ou vínculo é calculado no navegador.
- DTOs não incluem external ID, OID, claims, UPN, DriveItem ID ou dados de nota.
- Nenhum write, deploy, acesso D1 remoto, Graph, Entra, add-in ou alteração de sync.
- `sync_enabled=0` permanece inalterado.
- Esta missão publica somente PR Draft; merge e Pesquisa Global V2 ficam fora do escopo.

## App Factory adoption

- Perfil: aplicação administrativa production-system, escala L, risco alto, capability server-side e D1 autoritativo.
- Contrato semântico atualizado antes da implementação: `BN-INV-020`, `BN-AC-016` e `BN-V-019`.
- HeroUI React v3 reutilizado sem Ambient Constellation ou novo design system.
- API, OpenAPI, read model, browser QA e documentação são gates obrigatórios.

## Verificação

- Testes dedicados usam SQLite real com migrations 0001–0007 e dados exclusivamente sintéticos.
- Cobertura: normalização, ranking, contexto, deduplicação, limites/totais, tipos, aluno sem turma, auth allow/deny, validação, falha fechada, privacidade, URL, debounce, cancelamento, estados e navegação.
- Browser QA local sintético passou em 1440 × 900 e 390 × 844: URL/reload, debounce, cancelamento real da requisição lenta, `/`, `Esc`, loading, vazio, 403, 500, resultados e ausência de overflow global.
- A QA encontrou e corrigiu o destino de Acompanhamento para a rota existente `/acompanhamento/turmas/:id`; Aluno, Professor, Turma e Acompanhamento preservam `retorno=/pesquisa?q=...`.
- Fixture, servidor e aba temporários foram removidos, e o viewport foi restaurado.
- O gate final é `npm run verify`, `npm audit --audit-level=high`, `git diff --check`, PR Draft e CI/Application Security/Semgrep verdes.
- Gate local final: `npm run verify` PASS com 386 testes em 76 arquivos; formatting, lint, typecheck, contrato semântico, manifest e builds web/add-in PASS. `npm audit --audit-level=high` e `git diff --check` também PASS.

## Contratos

- `shared/banco-notas-pesquisa.ts`
- `api/banco-notas-pesquisa-global-v1.openapi.yaml`
- `specs/banco-notas/semantic-contract.json`
- `specs/banco-notas/semantic-assurance.json`
- `specs/banco-notas/verification-plan.json`
