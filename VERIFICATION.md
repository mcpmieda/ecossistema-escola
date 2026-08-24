# VERIFICATION — Centro de Administração v0.2

## Escopo

Candidata de validação controlada do núcleo inicial do Centro de Administração. Esta matriz verifica a mudança sem transformar produção em laboratório destrutivo.

## Modo

`independent`

Motivo: trata-se de um `production-system` institucional com autenticação, autorização e dados compartilhados. A candidata é somente leitura e não altera schema, portanto não há justificativa nesta fatia para DAST ativo, fuzz destrutivo, mutation testing amplo ou model checker formal.

## Gates obrigatórios

### CI da aplicação

- `npm run format:check`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`.

### Segurança da cadeia de entrega

O workflow existente continua executando:

- actionlint;
- zizmor em modo pedantic;
- Actions externas pinadas por SHA;
- deploy somente da `main` após os jobs de validação.

A correção de segurança de logout integrada na `main` pelo PR #5 foi absorvida pela candidata antes do merge, preservando `Referrer-Policy: same-origin`, validação de `Origin` e os testes de regressão correspondentes.

### Autorização

Cobertura obrigatória:

- papel `ADMINISTRADOR` permitido pelas regras existentes;
- papéis não administrativos não adquirem `ADMINISTRADOR` por mapeamento;
- `/api/platform/snapshot` possui `requireAuth` + `requireRole(..., 'ADMINISTRADOR')` no BFF;
- `tests/routes.test.ts` exige 401 sem sessão e 403 para sessão `PROFESSOR` antes de qualquer leitura administrativa;
- a UI restrita não é considerada barreira de segurança.

### Dados e privacidade

`tests/platform-snapshot.test.ts` valida a transformação pura do read model e injeta campos que não devem chegar ao navegador. O resultado deve descartar:

- `ValorJson`;
- `AtualizadoPorObjectId` como dado de exposição desnecessária;
- `UsuarioObjectId`;
- `DetalhesJson`.

O teste também confirma que o snapshot permanece no estado `validation`, que as listas essenciais são reconhecidas e que registros malformados são tratados de forma fechada.

### Contrato de módulos

`tests/platform-contract.test.ts` verifica:

- IDs e rotas únicas;
- uma área para cada rota declarada;
- papel `ADMINISTRADOR` em toda a candidata;
- capacidades explícitas;
- Publicações/Páginas ainda em estado `planned`;
- fallback de rota desconhecida para Visão geral.

## Browser QA obrigatório para a candidata de teste

Após merge e deploy técnico em `admin.escolaieda.com`:

1. raiz pública carrega a experiência de login;
2. CTA de login aponta ao fluxo institucional existente;
3. endpoint administrativo sem sessão não retorna dados;
4. viewport desktop não apresenta clipping/overflow material;
5. viewport móvel mantém navegação e hierarquia utilizáveis;
6. foco visível e navegação por teclado são conferidos;
7. reduced-motion não depende de movimento para comunicar estado;
8. com conta `ADMINISTRADOR`, Visão geral, Sistemas, Auditoria e Configurações carregam;
9. rotas hash sobrevivem a refresh/deep link;
10. Publicações/Páginas permanecem sem escrita;
11. logout encerra a sessão pelo endpoint existente;
12. nenhum perfil não administrativo deve receber o snapshot protegido.

A verificação autenticada exige uma sessão institucional real e não deve capturar senha, token ou cookie em evidência.

## Checks não selecionados nesta fatia

- OWASP ZAP ativo: não executar contra produção nesta candidata somente leitura;
- Schemathesis/RESTler: endpoint interno `lightweight`, sem contrato REST público/governed;
- Squawk: não há PostgreSQL nem migration SQL;
- k6: não há SLO/workload novo definido que justifique gate de carga;
- Toxiproxy: integração Graph já possui timeout/retry e esta fatia não modifica esse mecanismo;
- cross-browser completo: QA Chromium é suficiente para o primeiro teste, podendo ampliar antes da liberação oficial;
- mutation testing: custo desproporcional ao read model inicial; reconsiderar quando regras de domínio de escrita forem implementadas.

## Change Hygiene

Antes do merge:

- confirmar que a antiga leitura separada de `/api/sharepoint/health` não continua como caminho ativo do frontend;
- confirmar que não existe implementação paralela para a mesma responsabilidade;
- confirmar ausência de CSS criado apenas para neutralizar CSS anterior;
- confirmar ausência de `!important`, suppressions novas, arquivos temporários ou conflito;
- confirmar que o workflow temporário de formatação usado durante o repair loop foi removido;
- rerodar os gates após qualquer correção.

## Critério para “pronto para teste”

A candidata pode ser considerada pronta para o usuário testar quando:

- PR e CI aplicáveis estiverem verdes;
- mudança estiver integrada à `main`;
- deploy técnico estiver acessível em `admin.escolaieda.com`;
- raiz pública e proteção sem sessão forem verificadas;
- documentação/estado refletirem a candidata implantada.

Isso não é “pronto para produção oficial”. A liberação definitiva continua dependendo de `APROVADO PARA PRODUÇÃO` e de nova verificação proporcional da candidata aprovada.
