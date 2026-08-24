# VERIFICATION — Centro de Administração v0.2

## Escopo

Candidata de validação controlada do núcleo inicial do Centro de Administração. Esta matriz separa gates técnicos, validação visual e liberação oficial.

## Estado atual

A v0.2 **não está visualmente aprovada**.

O primeiro teste administrativo real identificou:

- acabamento visual abaixo do nível moderno esperado a partir das referências da App Factory;
- logout que apagava a sessão no servidor, mas deixava o shell autenticado visível até recarga forçada.

O logout já foi corrigido, integrado e validado externamente. O gate visual permanece **aberto/fail** até uma nova candidata.

Release state: `validation`. Nenhuma condição abaixo autoriza produção oficial.

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

Esses gates comprovam integridade técnica, não aprovação estética humana.

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

## Logout — correção concluída

### Comportamento anterior

`POST /auth/logout` validava a origem e limpava o cookie, mas retornava `204 No Content`. O navegador não recebia um documento de destino, permitindo que o shell React antigo permanecesse visualmente estático até recarga.

### Contrato implantado

`POST /auth/logout` agora:

1. mantém validação exata de `Origin`;
2. limpa o mesmo cookie de sessão;
3. retorna `303 See Other`;
4. envia `Location: OFFICIAL_ORIGIN`;
5. faz o navegador executar GET da raiz e reconstruir a interface sem sessão.

### CI do hotfix

PR #8, execução `32764734020`: **success**.

Passaram novamente:

- format;
- lint;
- typecheck;
- testes;
- build;
- actionlint;
- zizmor.

`tests/routes.test.ts` exige:

- `303` no POST same-origin;
- `Location` igual à origem oficial;
- cookie de sessão expirado com `Max-Age=0`;
- `Referrer-Policy: same-origin` preservado;
- `403` para Origin ausente, `null` ou estrangeira.

### Smoke externo do logout

Executado após o merge do PR #8 contra `https://admin.escolaieda.com`.

Resultado: **success**.

Foi comprovado externamente:

- POST com `Origin: https://admin.escolaieda.com` retorna `303`;
- `Location: https://admin.escolaieda.com`;
- `Set-Cookie: __Host-ecossistema_session=...; Max-Age=0`.

O PR temporário #9 foi fechado sem merge e seu branch foi resetado para a `main`; o workflow descartável não faz parte do produto.

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

Uma nova candidata visual só pode ser chamada de lapidada quando houver evidência proporcional de:

1. direção explícita baseada nas referências da App Factory;
2. inventário real de componentes e arquétipos;
3. linguagem administrativa coerente com shadcn como referência principal;
4. ReUI apenas onde houver necessidade administrativa avançada real;
5. hierarquia, spacing, tipografia, superfícies e densidade coerentes;
6. estados completos;
7. browser QA desktop e mobile;
8. foco, teclado e reduced-motion;
9. logout e navegação testados no fluxo autenticado;
10. validação humana do administrador sobre aparência e usabilidade.

## Smoke externo histórico da superfície pública

Execução `32763013640`: **success** para raiz pública, headers de segurança e proteção anônima dos endpoints.

Esse smoke não comprovou UI autenticada e não deve ser usado como evidência de aprovação visual.

## Critério atual

- hotfix de logout: **pass**;
- segurança/autorização preservadas: **pass**;
- gate visual v0.2: **fail / reaberto**;
- candidata visual substituta: ainda não construída;
- produção oficial: bloqueada.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
