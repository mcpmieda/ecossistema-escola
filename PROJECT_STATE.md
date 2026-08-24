# PROJECT_STATE — Ecossistema Escolar

## Objetivo atual

Evoluir o Centro de Administração em blocos grandes e completos, preservando integralmente a fundação existente e mantendo `releaseState = validation` até autorização humana explícita de produção.

Ao final de cada bloco concluído, a candidata corrente deve ser publicada em `https://admin.escolaieda.com`, ainda restrita a `ADMINISTRADOR`, para inspeção contínua. Deploy de validação não equivale a liberação oficial.

## Estado corrente

- fase: `v0.5` — operação e saúde observável;
- candidata: branch `feat/centro-admin-v0.5-operational-health`, PR #14;
- baseline publicada: `main@0c6bbee725e64aae0e5602ba07f817b3626c2684` — v0.4 via PR #12;
- v0.4 confirmada externamente no domínio pelo workflow `32771055987`;
- v0.3: fundação visual shadcn/ui integrada via PR #11;
- logout corrigido: `main@c87cbe8be7594a6d8e87f4d219d79de984c52599` via PR #8;
- baseline seguro anterior ao Centro: `8d28f1d35384a12a7028e25e0ec2a126edfdfdab`;
- nível do sistema: `production-system`;
- autenticação/autorização: Microsoft Entra ID + BFF + cookie HttpOnly selado; `ADMINISTRADOR` validado server-side;
- fonte autoritativa administrativa: SharePoint `CENTROADMIN` pela integração Graph existente;
- produção oficial: **não autorizada**.

## v0.4 — publicada e verificada

A v0.4 modularizou o shell e adicionou busca transversal permission-scoped.

A busca:

- usa somente o snapshot já autorizado pelo BFF;
- indexa áreas do núcleo, sistemas registrados e metadados de configuração;
- não indexa auditoria, migrações ou valores protegidos;
- normaliza acentos e caixa;
- aceita múltiplos termos fora de sequência;
- limita resultados;
- oferece `Ctrl+K`/`Cmd+K` no desktop e Sheet no mobile.

O smoke externo da v0.4 encontrou no bundle efetivamente servido `Centro v0.4 em validação controlada` e `Buscar no Centro` e confirmou `401` anônimo em `/api/me` e `/api/platform/snapshot`. O PR temporário foi fechado e a branch de smoke foi resetada para `main`.

## v0.5 — operação e saúde observável

A v0.5 cria a área `Operação`, capability `platform.health.read`, sem adicionar escrita ou endpoint paralelo.

### Correção de verdade operacional

Antes da v0.5, `foundation.status` era sempre `ok`, mesmo quando uma lista estrutural obrigatória não existia. A v0.5 elimina esse falso positivo.

Listas estruturais esperadas:

- `PLATAFORMA_CONFIGURACOES`;
- `PLATAFORMA_MODULOS`;
- `PLATAFORMA_AUDITORIA`;
- `PLATAFORMA_MIGRACOES`.

Se alguma estiver ausente:

- `foundation.status = degraded`;
- `expectedPlatformListsPresent = false`;
- `missingPlatformLists` informa exatamente quais estruturas faltam;
- `operational.status = attention`.

### Sinais operacionais derivados

O mesmo snapshot autorizado agora informa:

- quantidade de falhas explícitas nos eventos recentes de auditoria;
- quantidade de sistemas registrados com `HealthEndpoint` configurado;
- quantidade de sistemas sem contrato de health check;
- data do último evento de auditoria disponível;
- recuperação como `not-verified` enquanto não existir evidência real de restore testado.

Resultados de auditoria somente contam como falha quando começam explicitamente por termos como `erro`, `error`, `falha`, `failed` ou equivalentes definidos no classificador. Texto benigno como `sem erro` não é tratado como falha.

### Regra conservadora de saúde

A área Operação não afirma disponibilidade que o sistema não mediu:

- `HealthEndpoint` configurado significa **cobertura de contrato**, não disponibilidade comprovada;
- nenhum HealthEndpoint é executado pelo navegador ou pelo BFF nesta candidata;
- ausência de eventos de auditoria é exibida como evidência insuficiente, não como estado saudável;
- recuperação/restore permanece `Não verificado` até existir evidência própria.

Isso evita transformar ausência de erro em falsa garantia de saúde.

## App Factory — contratos agora executáveis no CI

Os arquivos semânticos foram atualizados até a busca v0.4 e a operação v0.5:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

O contrato inclui `AC-010` para busca e `AC-011` para saúde/degradação.

Foi adicionado `infra/validation/validate-semantic-contract.mjs`, executado por `npm run semantic:check` e pelo CI. O gate valida:

- fingerprint canônico do contrato;
- sincronização do semantic assurance;
- sincronização do verification plan;
- critérios de aceitação e prioridades;
- evidência para todos os critérios `must`;
- referências de requisitos, invariantes e conceitos;
- cobertura semântica dos critérios obrigatórios.

Fingerprint corrente:

`67d5428e416ae83ddc42f6d8be36102b2c2716c26b09e353bccf2648309c9ec8`

## Verificação técnica da v0.5 até este ponto

O workflow temporário de formatação executou `npm run verify` com sucesso sobre a candidata formatada:

- format: **pass**;
- lint: **pass**;
- typecheck: **pass**;
- semantic freshness/coverage: **pass**;
- 11 arquivos de teste / **75 testes**: **pass**;
- build Vite: **pass**.

O workflow temporário foi removido do branch. Falta apenas o CI normal do head definitivo, contendo também esta documentação, antes do merge.

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

## Funcionalidades disponíveis na candidata

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
