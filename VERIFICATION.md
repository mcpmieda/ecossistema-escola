# VERIFICATION — Centro de Administração HeroUI Native v2

## Estado da verificação

A candidata atual do Centro de Administração foi integrada em `main`, implantada no domínio oficial de validação e verificada pelo pipeline permanente após o deploy.

`releaseState = validation`.

Produção oficial não está autorizada.

## Candidata atual

PR:

`#45 — HeroUI — hardening final de autenticação, busca e mobile`

Commit integrado em `main`:

`f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`

Domínio de validação:

`https://admin.escolaieda.com`

Workflow pós-merge:

`32877197391` — **success**.

## Classificação de risco e contrato

O PR #45 atualizou o contrato semântico da candidata para risco **alto**, porque endurece fluxos browser-facing de autenticação e comportamento observável de sessão, além da camada de apresentação.

A candidata adiciona critérios de aceite explícitos para:

- reentrada, múltiplas abas, expiração e callbacks inválidos do fluxo OIDC;
- recuperação amigável de autenticação sem JSON cru ou material sensível;
- token exchange exclusivamente server-side e por POST;
- limpeza de sessão e transações temporárias no logout;
- busca inline desktop/mobile no header;
- perfil HeroUI com Avatar/Dropdown;
- breadcrumbs, tabelas e rodapé responsivos;
- Ambient Constellation restrita ao background geral;
- ausência de overflow crítico, clipping e regressões de reduced-motion.

## Fundação preservada

O PR #45 não reconstruiu nem substituiu:

- Microsoft Entra ID;
- BFF e cookie HttpOnly selado;
- capabilities e grants server-side;
- grupos/roles institucionais;
- Graph;
- SharePoint;
- Cloudflare Pages;
- pipeline CI/CD;
- recovery técnico;
- rotação automática;
- contratos de dados e regras de negócio existentes.

## Verificação de autenticação

### Início de login

A cobertura automatizada confirma que:

- cada `/auth/login` cria uma transação nova;
- cada transação mantém `state`, `nonce`, PKCE verifier e expiração;
- múltiplas tentativas independentes podem coexistir;
- o envelope temporário mantém no máximo quatro transações vivas;
- transações expiradas são removidas antes de persistir nova tentativa;
- o navegador é enviado ao endpoint de autorização, nunca ao endpoint de token.

### Callback e recuperação

A cobertura automatizada confirma que callbacks rejeitados, incompletos, divergentes ou expirados:

- não estabelecem sessão;
- removem a tentativa inválida sem destruir transações independentes ainda válidas;
- redirecionam para a origem oficial com sinalização de recuperação;
- apresentam ao usuário uma tela amigável com ação `Entrar novamente`;
- não retornam JSON cru no browser;
- não expõem authorization code, token, state, nonce, verifier, cookie ou segredo;
- preservam correlation ID para diagnóstico sem material sensível.

### Token exchange

A implementação e os testes mantêm o token exchange:

- exclusivamente no BFF;
- por `POST`;
- com `grant_type=authorization_code`;
- usando PKCE verifier server-side;
- sem uso de APIs de browser para a troca de token.

### Logout e cache

O logout:

- permanece `POST` e protegido por origem;
- limpa cookie de sessão;
- limpa cookie temporário de autenticação;
- redireciona para a origem oficial;
- aplica `Cache-Control: no-store, no-cache, must-revalidate, private`;
- aplica `Pragma: no-cache` e `Expires: 0` nas rotas protegidas.

## Verificação de UI e interação

### Perfil

- perfil usa componentes HeroUI nativos `Avatar`, `Dropdown` e `Button`;
- menu concentra a ação de logout;
- nome, cargo e descrição usam truncamento para evitar quebra em viewports estreitas.

### Busca

- desktop e mobile usam `SearchField` no próprio header;
- o mobile não usa Drawer para pesquisa;
- `Ctrl/Cmd + K` abre/foca a busca;
- `Escape` fecha o estado ativo;
- resultados são ações semânticas e fecham a busca na mesma interação que navega;
- não existe listener global de `hashchange` como mecanismo concorrente de fechamento.

### Responsividade

- breadcrumbs usam contenção para evitar overflow;
- tabelas estruturadas usam `Table.ScrollContainer`;
- scroll horizontal mobile é preservado quando necessário;
- rodapé usa grid/empilhamento para data e correlation ID sem truncamento destrutivo;
- busca mobile ocupa linha própria no header quando aberta.

### Ambient Constellation

- não existe dentro de cards, surfaces, tabelas, page headers ou blocos internos;
- permanece somente como background geral dos estados principais;
- reduced-motion continua suportado.

## Gates automatizados pós-merge

Workflow:

`32877197391` — **success**.

Jobs concluídos com sucesso:

- `Validate GitHub Actions security` — actionlint + zizmor;
- `Validate application` — install, formatting, lint, typecheck, contrato semântico, testes e build;
- `Deploy production` — Cloudflare Pages;
- `Verify recovery after deploy` — rebuild do source publicado + round trip descartável de backup/restore SharePoint + publicação de evidência redigida.

### Validate application

O job concluiu com sucesso os passos:

- instalação locked de dependências;
- formatação;
- lint;
- typecheck;
- validação do contrato semântico;
- testes;
- build.

### Deploy production

O deploy da candidata foi concluído pelo pipeline permanente no Cloudflare Pages.

Nesta fase, o nome do job não significa liberação oficial; o domínio continua sendo ambiente controlado de validação até o comando humano previsto no protocolo.

### Verify recovery after deploy

O job pós-deploy concluiu:

- rebuild da mesma fonte publicada como evidência de recovery;
- round trip descartável de backup/restore no SharePoint;
- cleanup do recurso descartável;
- publicação de evidência redigida.

Essa prova continua sendo um self-test técnico de recovery e não deve ser interpretada como declaração de disaster recovery completo.

## Baseline anterior preservado

O PR #43 permanece como baseline histórica da Native v2 anterior ao hardening final. Evidências anteriores, como os workflows `32853049680`, `32853049698`, `32854416111` e o smoke `32855103697`, continuam úteis para comparação histórica, mas não representam a candidata atual.

A candidata atual é exclusivamente o commit:

`f59cf4bcf6815ef57edc9eb4558e09a08f93aedd`.

## Performance e otimização futura

O Vite ainda pode emitir warning para chunk JavaScript acima de `500 kB` minificado.

Esse warning não é tratado como bloqueador nesta candidata porque:

- os gates obrigatórios passaram;
- não há falha funcional registrada no pipeline atual;
- a decisão de code splitting deve usar métricas específicas de carregamento inicial, não apenas o limite estático do bundler.

## Estado de pendências técnicas

Na sincronização pré-liberação:

- não há issues abertas registradas para o repositório;
- não há job obrigatório falhando no workflow pós-merge da candidata;
- não há migração destrutiva pendente;
- não há alteração de tenant, app registration, redirect URI, grupos, roles ou permissões Entra autorizada ou necessária nesta rodada;
- a documentação de estado/verificação foi sincronizada para o PR #45 antes da aprovação oficial.

## Gate humano

Todos os gates técnicos documentados da candidata atual estão concluídos.

A produção oficial permanece bloqueada até o comando humano exato:

`APROVADO PARA PRODUÇÃO`

Deploy, merge técnico, CI verde ou validação parcial não substituem esse comando.

Qualquer mudança material posterior em regra, fluxo, dados, autorização, segurança, integração ou comportamento observável exige nova validação proporcional antes da liberação.

## Referências

- estado atual: `PROJECT_STATE.md`;
- contrato semântico: `specs/semantic-contract.json`;
- assurance semântico: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`;
- histórico Native v2: `docs/HEROUI_NATIVE_V2_HARDENING_2026-08-25.md`.
