# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Evoluir o Centro de Administração em blocos grandes e completos, preservando integralmente a fundação existente e mantendo `releaseState = validation` até autorização humana explícita de produção.

Ao final de cada bloco concluído, a candidata corrente deve ser publicada em `https://admin.escolaieda.com`, ainda restrita a `ADMINISTRADOR`, para inspeção contínua. Deploy de validação não equivale a liberação oficial.

## Estado corrente

- fase publicada: `v0.5` — operação e saúde observável;
- baseline corrente: `main@0e04f64e61619977d0f7579b0878cd8f400e727b` — v0.5 via PR #14;
- CI definitivo do PR #14: workflow `32776526342` — **success**;
- smoke externo da v0.5: workflow `32776751948`, job `97589445198` — **success**;
- v0.4: busca transversal + modularização via PR #12;
- v0.3: fundação visual shadcn/ui via PR #11;
- logout corrigido: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação/autorização: Microsoft Entra ID + BFF + cookie HttpOnly selado; `ADMINISTRADOR` validado server-side;
- fonte autoritativa administrativa: SharePoint `CENTROADMIN` pela integração Graph existente;
- release state: `validation`;
- produção oficial: **não autorizada**.

## v0.4 — busca transversal e modularização

A v0.4 modularizou o shell e adicionou busca transversal permission-scoped.

A busca:

- usa somente o snapshot já autorizado pelo BFF;
- indexa áreas do núcleo, sistemas registrados e metadados de configuração;
- não indexa auditoria, migrações ou valores protegidos;
- normaliza acentos e caixa;
- aceita múltiplos termos fora de sequência;
- limita resultados;
- oferece `Ctrl+K`/`Cmd+K` no desktop e Sheet no mobile.

A v0.4 foi confirmada externamente no domínio antes do início da v0.5.

## v0.5 — operação e saúde observável

A v0.5 adiciona a área `Operação` com capability declarada `platform.health.read`, sem criar escrita ou endpoint paralelo.

### Correção de falso positivo operacional

Antes da v0.5, `foundation.status` era sempre `ok`, mesmo quando uma lista estrutural obrigatória não existia. A v0.5 elimina esse falso positivo.

Listas esperadas:

- `PLATAFORMA_CONFIGURACOES`;
- `PLATAFORMA_MODULOS`;
- `PLATAFORMA_AUDITORIA`;
- `PLATAFORMA_MIGRACOES`.

Se alguma estiver ausente:

- `foundation.status = degraded`;
- `expectedPlatformListsPresent = false`;
- `missingPlatformLists` informa as estruturas faltantes;
- `operational.status = attention`.

### Sinais operacionais conservadores

O snapshot autorizado informa:

- quantidade de falhas explícitas nos eventos recentes de auditoria;
- quantidade de sistemas registrados com `HealthEndpoint` configurado;
- quantidade de sistemas sem contrato de health check;
- data do último evento de auditoria disponível;
- recuperação como `not-verified` enquanto não existir evidência real de restore testado.

A área Operação não transforma ausência de erro em garantia de saúde:

- `HealthEndpoint` configurado significa **cobertura de contrato**, não disponibilidade comprovada;
- nenhum HealthEndpoint é executado pelo navegador ou BFF nesta candidata;
- ausência de eventos de auditoria aparece como evidência insuficiente;
- recuperação/restore permanece `Não verificado` até existir evidência própria.

## App Factory — contratos executáveis no CI

Os artefatos semânticos foram atualizados até busca v0.4 e operação v0.5:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

O contrato inclui `AC-010` para busca e `AC-011` para saúde/degradação.

`infra/validation/validate-semantic-contract.mjs` é executado por `npm run semantic:check` e pelo CI e valida fingerprint, sincronização dos artefatos, critérios, prioridades, referências e cobertura dos critérios `must`.

Fingerprint corrente:

`67d5428e416ae83ddc42f6d8be36102b2c2716c26b09e353bccf2648309c9ec8`

## Verificação técnica v0.5

Workflow preparatório `32776244752`, job `97587861851`:

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic freshness/coverage: **pass**;
- 11 arquivos de teste / **75 testes**: **pass**;
- build Vite: **pass**.

CI definitivo `32776526342`:

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic check: **pass**;
- testes: **pass**;
- build: **pass**;
- actionlint: **pass**;
- zizmor pedantic: **pass**.

## Deploy de validação v0.5

A v0.5 foi integrada em `main` e publicada no domínio.

Smoke externo `32776751948` / `97589445198`, concluído em 2026-08-24T20:57:37Z:

- bundle servido contém `Centro v0.5 em validação controlada`;
- bundle servido contém `Sem degradação observada no snapshot`;
- bundle servido contém `Recuperação e restore`;
- `/api/me` sem sessão retorna `401`;
- `/api/platform/snapshot` sem sessão retorna `401`.

O PR de smoke #15 foi fechado sem merge e a branch temporária foi resetada para o baseline da `main`.

## Fundação preservada

A v0.5 não altera:

- Microsoft Entra ID;
- BFF/cookie de sessão;
- autorização server-side por `ADMINISTRADOR`;
- Graph e permissões existentes;
- SharePoint `CENTROADMIN` como fonte autoritativa;
- grupos e automações existentes;
- Cloudflare Pages e CI/CD;
- secrets e rotação automática de identidade técnica;
- logout `POST` + validação de Origin + `303` + expiração do cookie.

## Funcionalidades disponíveis no domínio de validação

- login institucional;
- shell administrativo shadcn/ui;
- navegação restaurável por hash;
- busca transversal permission-scoped;
- Visão geral;
- Operação;
- Sistemas;
- Auditoria somente leitura;
- Configurações somente leitura sem valores protegidos;
- Publicações e Páginas planejadas e sem escrita;
- estados loading, vazio, erro e permissão negada;
- responsividade e reduced-motion;
- logout com redirecionamento imediato.

## Regra de validação contínua

Cada bloco deve terminar com:

1. higiene e remoção de artefatos temporários;
2. format, lint, typecheck, semantic check, testes, build, actionlint e zizmor verdes;
3. documentação de estado atualizada;
4. integração em `main` quando os gates permitirem;
5. deploy em `https://admin.escolaieda.com` restrito a `ADMINISTRADOR`;
6. confirmação externa de que a candidata corrente está sendo servida;
7. `releaseState = validation` até autorização humana final.

## Próximo trabalho

Continuar o núcleo transversal sem inventar regras institucionais ainda não definidas. Prioridades técnicas incluem autorização por capabilities efetivamente aplicada no servidor, integração progressiva de módulos e, somente quando houver fonte/regra clara, notificações e pendências.

## Bloqueios para produção oficial

- validação visual humana final ainda pendente;
- recuperação/restore ainda não possui evidência registrada de teste;
- módulos de produto ainda incompletos;
- Publicações e Páginas continuam planejadas;
- `APROVADO PARA PRODUÇÃO` não foi emitido.

## Regra de liberação

O comando humano exato `APROVADO PARA PRODUÇÃO` continua sendo requisito separado para disponibilização regular aos usuários. Merge, CI e deploy técnico não substituem essa autorização.

## Links internos

- arquitetura: `ARCHITECTURE.md`;
- auditoria visual v0.2: `docs/AUDITORIA_VISUAL_CENTRO_ADMIN_V0.2.md`;
- contrato semântico: `specs/semantic-contract.json`;
- semantic assurance: `specs/semantic-assurance.json`;
- plano de verificação: `specs/verification-plan.json`;
- verificação: `VERIFICATION.md`;
- protocolo de liberação: `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`.
