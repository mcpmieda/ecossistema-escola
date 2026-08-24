# VERIFICATION — Centro de Administração v0.2

## Escopo

Candidata de validação controlada do núcleo inicial do Centro de Administração. Esta matriz separa claramente gates técnicos, validação visual e liberação oficial.

## Modo

`independent`

O sistema é `production-system` institucional com autenticação, autorização e dados compartilhados. A candidata continua somente leitura nos novos domínios administrativos.

## Estado após o primeiro teste autenticado

A v0.2 **não está visualmente aprovada**.

O primeiro teste administrativo real identificou:

- acabamento visual abaixo do nível moderno esperado a partir das referências da App Factory;
- logout que apagava a sessão no servidor, mas deixava o shell autenticado visível até recarga forçada.

Portanto:

- arquitetura/segurança da candidata original continuam válidas como baseline;
- gate visual está **reaberto**;
- logout entrou em repair loop;
- release state permanece `validation`;
- nenhuma condição autoriza produção oficial.

## Evidência histórica da candidata original

Execução GitHub Actions `32762212762`: **success**.

Passaram:

- `npm run format:check`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- actionlint;
- zizmor em modo pedantic.

Esses gates comprovam integridade técnica do código, não aprovação estética humana.

## Auditoria do processo visual

A fonte normativa é a App Factory, especialmente `ui/PROFESSIONAL_UI_PROFILE.md`.

Para interfaces administrativas, a Factory estabelece:

- shadcn/ui como base preferencial;
- ReUI como complemento seletivo para componentes avançados quando houver ganho real;
- `professional-default` como quality bar transversal;
- browser QA real para UI material quando a capacidade estiver disponível.

Na v0.2, a arquitetura registrou CSS/HTML nativos e nenhuma nova biblioteca visual. O `package.json` não contém Tailwind, shadcn/ui ou ReUI.

A candidata implementou hierarquia, responsividade, estados, foco e reduced-motion, mas isso não constituiu uma comparação/lapidação visual autenticada suficiente para considerar o design aprovado.

Conclusão do gate visual v0.2: **fail**.

Detalhes: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`.

## Logout — causa e correção

### Comportamento anterior

`POST /auth/logout`:

1. validava `Origin` oficial;
2. limpava `SESSION_COOKIE`;
3. retornava `204 No Content`.

O formulário de logout navegava para uma resposta sem documento de destino. O servidor encerrava a sessão, mas o navegador podia manter o shell React anterior visualmente estático até recarga.

### Correção da candidata atual

`POST /auth/logout` agora deve:

1. manter validação exata de `Origin`;
2. limpar o mesmo cookie de sessão;
3. retornar `303 See Other`;
4. enviar `Location: OFFICIAL_ORIGIN`;
5. fazer o navegador executar GET da raiz e reconstruir a interface sem sessão.

### Teste de regressão obrigatório

`tests/routes.test.ts` deve exigir, para POST same-origin:

- status `303`;
- `Location` igual à origem oficial;
- cookie de sessão expirado (`Max-Age=0`);
- `Referrer-Policy: same-origin` preservado.

Origens ausente, `null` ou estrangeira continuam obrigatoriamente rejeitadas com `403`.

## Autorização preservada

- `/api/platform/snapshot` continua com `requireAuth` + `requireRole(..., 'ADMINISTRADOR')` no BFF;
- `401` sem sessão permanece testado;
- `403` para sessão `PROFESSOR` permanece testado;
- UI não é considerada barreira de segurança.

## Dados e privacidade preservados

`tests/platform-snapshot.test.ts` continua exigindo que o read model não exponha:

- `ValorJson`;
- `AtualizadoPorObjectId` desnecessário;
- `UsuarioObjectId`;
- `DetalhesJson`.

## Próximo gate visual

Uma próxima candidata visual só pode ser chamada de lapidada quando houver evidência proporcional de:

1. direção explícita baseada nas referências da App Factory;
2. inventário real de componentes e arquétipos;
3. linguagem administrativa coerente com shadcn como referência principal;
4. ReUI apenas onde houver necessidade administrativa avançada real;
5. hierarquia, spacing, tipografia, superfícies e densidade coerentes;
6. estados completos;
7. browser QA desktop e mobile;
8. foco/teclado/reduced-motion;
9. logout e navegação testados no fluxo real;
10. validação humana do administrador sobre aparência e usabilidade.

## Smoke externo histórico

Execução `32763013640`: **success** para raiz pública, headers de segurança e proteção anônima dos endpoints.

Esse smoke não comprovou UI autenticada e não deve ser usado como evidência de aprovação visual.

## Critério atual

Antes de integrar o repair loop do logout:

- format, lint, typecheck, testes e build devem passar novamente;
- actionlint e zizmor devem permanecer verdes;
- nenhuma mudança em Entra, Graph, SharePoint, grupos, OIDC, secrets ou rotação automática é permitida;
- após deploy técnico, o logout deve ser revalidado no domínio oficial.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.