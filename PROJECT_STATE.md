# PROJECT_STATE — Ecossistema Escolar

## Estado atual

O Centro de Administração atingiu **100% do escopo técnico definido para esta fase** e está consolidado em **HeroUI v0.9**.

- fonte técnica de verdade: `main`;
- candidata atual: `main@dd665205d0bbc37bcfbc6f423de02ec5e0e03527`;
- domínio de validação: `https://admin.escolaieda.com`;
- design system: HeroUI React v3 (`@heroui/react 3.2.4` + `@heroui/styles 3.2.4`);
- acesso da candidata: restrito às capabilities administrativas existentes;
- release state: `validation`;
- produção oficial: **não autorizada**.

A inspeção autenticada do administrador e a decisão de aprovação são gates humanos posteriores ao término do desenvolvimento técnico desta fase.

## Escopo fechado desta fase

Por decisão de produto, permanecem adiados e fora do cálculo de 100% desta fase:

- integração funcional do primeiro sistema independente;
- módulo `Publicações`;
- módulo `Páginas`.

Notificações/pendências também não receberam implementação artificial: não existe nesta fase uma fonte autoritativa e regra institucional suficientes para criar comportamento real sem inventar produto.

## Núcleo entregue

- Microsoft Entra ID + BFF + cookie HttpOnly selado;
- autorização server-side por capabilities;
- grants administrativos fail closed;
- shell administrativo HeroUI React v3;
- navegação restaurável;
- busca transversal permission-scoped;
- snapshot server-side minimizado e recortado por capability;
- Visão geral;
- Operação/saúde e degradação observável;
- Sistemas com contrato modular versionado e resolução fail closed;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- estados loading, vazio, erro e permissão negada;
- responsividade, foco e reduced-motion;
- logout com redirecionamento imediato;
- recovery técnico pós-deploy com evidência real;
- CI/CD, segurança de workflows e semantic assurance ativos;
- `ambient-constellation` como assinatura visual HeroUI, calibrado em microescala proporcional.

## HeroUI v0.9

A migração transversal para HeroUI foi incorporada pelo PR #35 e implantada inicialmente em:

`main@ff4dba8b22e3c4ef8f42d8968872ee0d98d3ba65`

Workflow `32826760272`:

- Validate GitHub Actions security: **success**;
- Validate application: **success**;
- deploy Cloudflare Pages: **success**;
- recovery pós-deploy: **success**.

A implementação visual preservou BFF, Entra ID, sessão, capabilities, Graph, SharePoint, recovery e contratos funcionais.

## Calibração final do Ambient Constellation

A inspeção visual identificou que a primeira primitive usava geometria proporcional à viewport e transformava partículas em círculos grandes.

A App Factory foi corrigida pelo PR #54 para registrar microescala em screen-space, overscan/crop, drift proporcional e o anti-padrão que causou a regressão.

No Centro, o PR #36 substituiu o modelo anterior por:

- 2 camadas de 28 micro-partículas;
- tamanho final entre aproximadamente `0.6px` e `1.3px` no desktop;
- redução adicional no mobile;
- overscan aproximado de `1.36×` por `1.78×`;
- ciclos de `12s` e `15s` em direções opostas;
- amplitude aproximada de `20px` desktop e `12px` mobile;
- glow estático;
- fallback estático em `prefers-reduced-motion`.

Candidata final após essa correção:

`main@dd665205d0bbc37bcfbc6f423de02ec5e0e03527`

## Gates técnicos finais

Workflow definitivo da candidata HeroUI v0.9: `32829296147`.

Resultado:

- Validate GitHub Actions security: **success**;
- actionlint: **pass**;
- zizmor persona `pedantic`: **pass**;
- Validate application: **success**;
- `npm ci`: **pass**;
- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic contract: **pass**;
- testes: **pass**;
- build Vite: **pass**;
- deploy Cloudflare Pages: **success**;
- Verify recovery after deploy: **success**.

Evidência de recovery da candidata final:

- artifact: `9556184489`;
- nome: `recovery-verification-32829296147`;
- SHA-256: `d11dc3f9b82d1598251a942065458ff22b176a0b2e96a1c6129d9bb8a8cf10a7`.

O recovery continua limitado ao escopo documentado de backup/restore descartável da área técnica do SharePoint. Não é apresentado como disaster recovery integral do Microsoft 365.

## QA visual real

### QA da build calibrada

Workflow temporário: `32828658258` — **success**.

Artifact:

- `9555899769`;
- SHA-256 `1ed2260d306b141d903c707809f24d60b1e4031b14cc35923ec847f532afee66`.

Chrome real validou:

- login desktop `1440×900`;
- login mobile `390×844`;
- overview desktop com fixture administrativa isolada;
- overview mobile;
- overview desktop com `prefers-reduced-motion`.

O DOM renderizado confirmou maior partícula `≤ 1.3px`. A inspeção das capturas confirmou ausência dos círculos grandes e manutenção da assinatura constelar em microescala.

### Smoke do domínio oficial após deploy

Harness descartável PR #37: fechado **sem merge**.

Run `32829585427`: **success**.

Artifact:

- `9556213823`;
- SHA-256 `61b3161328b95407a2a677a7d31ef34ff5ba748e5378d021d1b66f92efcca221`.

Foram confirmados no domínio real:

- documento raiz servido;
- candidata atual servida pelo Cloudflare Pages;
- `/api/me` = `401` sem sessão;
- `/api/platform/snapshot` = `401` sem sessão;
- login desktop e mobile renderizados em Chrome real;
- link institucional continua apontando para `/auth/login`;
- `/#/sistemas` sem sessão continua bloqueado pelo login;
- constelação servida no domínio sem retorno dos círculos grandes.

## Higiene final

- nenhum harness visual temporário foi incorporado à `main`;
- PR #37 foi fechado sem merge;
- branches `test/heroui-v0.9`, `test/heroui-v0.9-constellation-scale` e `test/final-domain-smoke-v09-constellation` foram alinhadas novamente à candidata válida;
- branch de correção da App Factory foi alinhada à `main` após o merge do PR #54;
- o diff operacional da correção do Ambient Constellation ficou restrito à camada visual e documentação;
- nenhuma alteração foi feita em BFF, Entra, Graph, SharePoint, capabilities, contratos funcionais ou regras institucionais.

## Fundação preservada

Não foram reconstruídos nem substituídos:

- Microsoft Entra ID;
- grupos institucionais;
- automação cargo → grupos;
- BFF e formato da sessão;
- SharePoint `CENTROADMIN`;
- permissões Graph existentes;
- Cloudflare Pages;
- CI/CD permanente;
- rotação automática da identidade técnica;
- certificados, secrets e protocolos existentes.

## Marco atual

**O Centro está tecnicamente pronto para a inspeção autenticada e decisão de aprovação do responsável.**

Isso não significa publicação regular para os usuários. A candidata continua em `validation` e restrita ao público administrativo já autorizado.

A inspeção autenticada das rotas internas deve usar uma sessão real de `ADMINISTRADOR`; não será criado bypass ou sessão falsa para automatizar esse gate.

A liberação oficial continua condicionada ao comando humano exato:

`APROVADO PARA PRODUÇÃO`

Qualquer alteração material posterior a este marco invalida a aprovação da candidata anterior e exige nova validação.

## Referências internas

- arquitetura: `ARCHITECTURE.md`;
- redesign HeroUI: `docs/REDESIGN_HEROUI_V0.9.md`;
- contrato modular: `docs/CONTRATO_MODULOS.md`;
- verificação: `VERIFICATION.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
