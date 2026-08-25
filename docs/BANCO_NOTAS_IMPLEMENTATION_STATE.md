# Banco de Notas — Implementation State

Última atualização: 25/08/2026

Branch: `feat/banco-de-notas-foundation`

Fase: **1 — fundação executável**

## Entregue no PR #52

- contrato semântico global inclui explicitamente o primeiro módulo especializado;
- migration D1 inicial com anos, vínculos, fontes, importações, modelos, regras, eventos, snapshots, compartilhamentos, conciliação e auditoria;
- constraints para autoridade temporal, idempotência, sequence, ausência versus zero e streams append-only;
- repositório D1 e domínio de `SourceAuthority`, com override docente prevalecendo explicitamente sobre o padrão anual e sem merge silencioso;
- capabilities `grades.*`, concedidas explicitamente somente ao administrador nesta fase;
- manifesto `banco-de-notas` 0.1.0 e registro SharePoint idempotente;
- API `/api/banco-notas`, health e operações iniciais de ano/fonte/vigência;
- shell path-based `/banco-de-notas` com HeroUI e React Router;
- `Configurações > Fonte` funcional, incluindo padrão anual, override por professor e `SyncEnabled=false`;
- testes de domínio, migration, API, contrato, UI, autorização e isolamento dos golden masters.

## Estado externo

O D1 de homologação não foi criado porque o Wrangler local não possui sessão autenticada. Não há ID fictício no repositório e não houve deploy. O script `infra/banco-notas/cloudflare/provision-homologation.ps1` faz login, cria o D1, gera uma configuração local ignorada pelo Git e aplica as migrations em um único comando.

O registro SharePoint está implementado no provisionador idempotente, mas não foi aplicado ao tenant nesta fase.

## Segurança e defaults

- navegador não acessa Graph/SharePoint diretamente;
- mutations exigem sessão, capability específica e Origin oficial;
- health degrada de forma explícita se o binding D1 não existir;
- sincronização nasce desligada;
- nenhum dado real ou arquivo docente está no Git;
- Ambient Constellation, shadcn e ReUI não fazem parte do módulo.

## Próximo bloco

Provisionar homologação, migrar OpenAPI/AsyncAPI, implementar jobs/importação e `grade-events`, adaptar o add-in, materializar o modelo genérico limpo e executar regressão privada externa.

## Regra crítica permanente

Os arquivos privados de homologação citados em `BANCO_NOTAS_MODELO_GENERICO_E_GOLDEN_MASTERS.md` não são produto, template, seed, fixture pública ou dependência. A produção deve transformar qualquer planilha docente legada numa instância nova do modelo genérico, sem regras dependentes de pessoa, abas, turmas, disciplinas ou células específicas.
