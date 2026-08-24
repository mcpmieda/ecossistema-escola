# VERIFICATION — Centro de Administração v0.4

## Escopo

Validação da candidata v0.4 do Centro de Administração, construída sobre a fundação visual shadcn/ui da v0.3. O bloco adiciona busca transversal permission-scoped e reduz o acoplamento do shell, sem criar escrita ou nova fonte de dados.

Release state: `validation`. Nenhuma condição abaixo autoriza produção oficial.

## Fundação preservada

A v0.4 não altera:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- autorização server-side por `ADMINISTRADOR`;
- Graph e SharePoint `CENTROADMIN`;
- grupos e automações existentes;
- contratos de rotas e snapshot;
- logout corrigido em `303 See Other`;
- estado de Publicações e Páginas, que continuam sem escrita.

## Mudança estrutural

O shell foi dividido em responsabilidades menores:

- rotas e apresentação;
- navegação;
- páginas;
- modelo puro de busca;
- interface de busca;
- primitive de input.

Objetivo verificado: não manter uma segunda implementação das telas ou uma camada nova por cima do `App.tsx` antigo. O arquivo central foi reduzido e passou a orquestrar identidade, sessão, snapshot e shell.

## Busca transversal

A busca é alimentada exclusivamente por `PlatformSnapshotContract`, recebido somente após autenticação e autorização server-side.

O índice contém apenas:

- `coreModules`;
- `registeredModules`;
- metadados de `configurations`.

O índice não contém:

- `recentAudit`;
- `migrations`;
- valores protegidos de configuração;
- dados externos ao snapshot.

A busca suporta:

- normalização de acentos e caixa;
- múltiplos termos fora de sequência;
- limite máximo de sete resultados;
- atalhos desktop `Ctrl+K`/`Cmd+K`;
- interface mobile em Sheet;
- roteamento de áreas, sistemas e configurações para destinos já existentes.

## Testes da busca

`tests/platform-search.test.ts` adiciona quatro verificações semânticas:

1. normalização de acentos e caixa;
2. escopo exato do índice, incluindo prova de que auditoria e migrações não são indexadas;
3. busca por múltiplos termos e roteamento correto;
4. limite de resultados.

Durante o desenvolvimento, um teste revelou que a busca inicial exigia frase contínua (`banco notas` não encontrava `Banco de Notas`). O comportamento foi corrigido no produto para busca por termos, em vez de enfraquecer o teste.

## Higiene de dependências

- Playwright usado exclusivamente no QA descartável da v0.3 foi removido de `package.json` e `package-lock.json`;
- `shadcn` foi mantido porque `src/styles.css` importa `shadcn/tailwind.css`; removê-lo quebra o build e não seria uma limpeza válida;
- workflow temporário de limpeza foi removido antes do baseline final.

## Gates técnicos

No ciclo v0.4, após correções:

- `npm run format:check`: **pass**;
- `npm run lint`: **pass**;
- `npm run typecheck`: **pass**;
- `npm test`: **pass** após melhoria da busca por termos;
- `npm run build`: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

A suíte total passou de 68 para 72 testes.

Um último CI normal deve validar o head definitivo contendo também esta documentação antes do merge.

## Logout

`POST /auth/logout` permanece com:

1. validação de `Origin`;
2. expiração do cookie de sessão;
3. `303 See Other`;
4. `Location: OFFICIAL_ORIGIN`.

A correção foi validada externamente e confirmada manualmente pelo administrador.

## Autorização

- `/api/platform/snapshot` continua com sessão + `ADMINISTRADOR` no BFF;
- `401` sem sessão permanece esperado/testado;
- `403` para sessão sem `ADMINISTRADOR` permanece testado;
- a busca não é uma nova barreira de segurança: ela apenas pesquisa dados já autorizados pelo servidor.

## Dados e privacidade

`tests/platform-snapshot.test.ts` continua protegendo o read model contra exposição de:

- `ValorJson`;
- `AtualizadoPorObjectId` desnecessário;
- `UsuarioObjectId`;
- `DetalhesJson`.

A busca não reintroduz esses campos e seus testes demonstram que categorias não previstas no índice permanecem fora dos resultados.

## Gate visual humano

Estado: **pending**.

A inspeção contínua deve ocorrer no domínio `https://admin.escolaieda.com`, restrito a `ADMINISTRADOR`, após cada bloco tecnicamente aprovado. O administrador pode avaliar login, shell, navegação, dashboard, busca, Sistemas, Auditoria, Configurações, mobile e logout.

## Critério atual

- autenticação/autorização: **pass**;
- dados minimizados: **pass**;
- logout: **pass**;
- fundação visual shadcn: **pass técnico / pending visual humano**;
- modularização v0.4: **pass técnico**;
- busca transversal: **pass técnico**;
- workflow temporário: **removido**;
- CI definitivo do head documentado: **próximo gate**;
- deploy de validação: **após merge em main**;
- produção oficial: **bloqueada**.

A produção oficial continua condicionada ao comando humano exato `APROVADO PARA PRODUÇÃO`.
