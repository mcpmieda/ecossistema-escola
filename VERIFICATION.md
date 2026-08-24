# VERIFICATION — Centro de Administração v0.2

## Escopo

Candidata de validação controlada do núcleo inicial do Centro de Administração. Esta matriz verifica a mudança sem transformar produção em laboratório destrutivo.

## Modo

`independent`

Motivo: trata-se de um `production-system` institucional com autenticação, autorização e dados compartilhados. A candidata é somente leitura e não altera schema, portanto não há justificativa nesta fatia para DAST ativo, fuzz destrutivo, mutation testing amplo ou model checker formal.

## Resultado da candidata

Estado técnico: **PRONTA PARA TESTE ADMINISTRATIVO**.

Isso não significa produção oficial. O estado de release continua `validation` e a futura promoção permanece condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.

## Gates obrigatórios executados

### CI da aplicação

Execução GitHub Actions `32762212762`: **success**.

Passaram:

- `npm run format:check`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`.

### Segurança da cadeia de entrega

Na mesma candidata passaram:

- actionlint;
- zizmor em modo pedantic;
- Actions externas permanecem pinadas por SHA;
- o fluxo de deploy continua restrito à `main` após validação.

A correção de segurança de logout integrada na `main` pelo PR #5 foi absorvida pela candidata antes do merge, preservando `Referrer-Policy: same-origin`, validação de `Origin` e os testes de regressão correspondentes.

## Autorização

Cobertura executada:

- papel `ADMINISTRADOR` permitido pelas regras existentes;
- papéis não administrativos não adquirem `ADMINISTRADOR` por mapeamento;
- `/api/platform/snapshot` possui `requireAuth` + `requireRole(..., 'ADMINISTRADOR')` no BFF;
- `tests/routes.test.ts` exige `401` sem sessão;
- `tests/routes.test.ts` exige `403` para sessão `PROFESSOR` antes de qualquer leitura administrativa;
- a UI restrita não é considerada barreira de segurança.

## Dados e privacidade

`tests/platform-snapshot.test.ts` valida a transformação pura do read model e exige que o resultado descarte dados que não devem chegar ao navegador:

- `ValorJson`;
- `AtualizadoPorObjectId` quando desnecessário para exposição;
- `UsuarioObjectId`;
- `DetalhesJson`.

O teste também confirma o estado `validation`, reconhecimento das listas essenciais e tratamento fechado de registros malformados.

## Contrato de módulos

`tests/platform-contract.test.ts` verifica:

- IDs e rotas únicas;
- uma área para cada rota declarada;
- papel `ADMINISTRADOR` em toda a candidata;
- capacidades explícitas;
- Publicações/Páginas em estado `planned`;
- fallback de rota desconhecida para Visão geral.

## Smoke externo do domínio oficial

Execução GitHub Actions `32763013640`: **success**.

Executada de um runner externo contra `https://admin.escolaieda.com` após o merge do PR #4.

Evidência obtida:

- raiz HTTPS respondeu com sucesso;
- HTML apresentou `<title>Ecossistema Escolar</title>`;
- resposta apresentou `Referrer-Policy: same-origin`;
- resposta apresentou `X-Content-Type-Options: nosniff`;
- `/api/me` sem sessão retornou `401` e `Unauthorized`;
- `/api/platform/snapshot` sem sessão retornou `401` e `Unauthorized`.

O smoke foi materializado temporariamente apenas para obter evidência externa. O PR #6 foi fechado sem merge e seu branch foi resetado para a `main`; o workflow descartável não faz parte do produto.

## Browser QA da etapa de usuário

A candidata está pronta para o teste autenticado. Com uma conta institucional `ADMINISTRADOR`, conferir no navegador real:

1. login institucional completa o fluxo sem pedir credenciais dentro do app;
2. Visão geral carrega;
3. Sistemas carrega o catálogo disponível;
4. Auditoria permanece somente leitura;
5. Configurações não expõe valores protegidos;
6. rotas hash sobrevivem à navegação/refresh;
7. Publicações e Páginas permanecem sem escrita;
8. desktop não apresenta clipping/overflow material;
9. viewport móvel mantém navegação e hierarquia utilizáveis;
10. foco visível e teclado permanecem utilizáveis;
11. reduced-motion mantém feedback funcional sem depender de animação;
12. logout encerra a sessão pelo endpoint existente.

A QA autenticada não deve registrar senha, token ou cookie em screenshot/log.

## Checks não selecionados nesta fatia

- OWASP ZAP ativo: não executar contra produção nesta candidata somente leitura;
- Schemathesis/RESTler: endpoint interno `lightweight`, sem contrato REST público/governed;
- Squawk: não há PostgreSQL nem migration SQL;
- k6: não há SLO/workload novo definido que justifique gate de carga;
- Toxiproxy: integração Graph já possui timeout/retry e esta fatia não modifica esse mecanismo;
- cross-browser completo: ampliar antes da liberação oficial se o risco justificar;
- mutation testing: reconsiderar quando regras de domínio de escrita forem implementadas.

## Change Hygiene concluído

Confirmado antes do merge:

- o frontend não usa mais `/api/sharepoint/health` como caminho paralelo ao snapshot;
- não existe segunda implementação ativa para a mesma responsabilidade;
- CSS antigo de reduced-motion baseado em `!important` foi removido em vez de sobreposto;
- nenhuma suppression nova foi introduzida para fazer gates passarem;
- o workflow temporário de formatação foi removido;
- o workflow temporário de smoke não foi mergeado;
- a correção concorrente de segurança da `main` foi incorporada como ancestral real da candidata;
- gates foram executados novamente após as correções finais.

## Critério de “pronto para teste”

Atendido:

- PR #4 integrado à `main` no commit de candidata `6effd9e0ee8f8bbc0e5864398e3ce6e53777cbc0`;
- CI da candidata verde;
- segurança de workflows verde;
- domínio oficial acessível externamente;
- proteção sem sessão verificada externamente;
- documentação atualizada para refletir o estado implantado.

A próxima etapa é teste visual/funcional autenticado pelo administrador, seguido de repair loop para qualquer achado. Nenhuma dessas condições autoriza liberação oficial aos usuários finais.
