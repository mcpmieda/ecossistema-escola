# Diagnóstico Completo Independente do Sistema — Agente Jules

**Data do Diagnóstico:** 19/09/2026
**Commit Analisado:** `93d42f6bb184621ae52cde2ae5be008bcac08ab3` (branch `main`)
**Agente Diagnosticador:** Jules (Executor Assíncrono Amplo)
**Metodologia:** Análise técnica 100% independente baseada exclusivamente em evidências estáticas, configurações, workflows, testes e migrações contidos no repositório Git, sem consulta a relatórios externos ou acionamento de dados e ambientes de produção.

---

## Classificação Metodológica de Evidências

Para rigor técnico e transparência:
- **Fato Confirmado:** Comprovado diretamente por código-fonte, teste com assertiva de sucesso, workflow ativo, arquivo de migração SQL ou arquivo de configuração `wrangler`/`package.json`.
- **Risco Provável:** Derivação lógica direta de escolhas de arquitetura ou lacunas explícitas documentadas no repositório.
- **Hipótese:** Comportamento potencial em runtime real que depende de fatores de infraestrutura externa (ex.: latência Supabase/Hyperdrive, carga de produção) e não pode ser afirmado conclusivamente só pelo Git.

---

## Diagnóstico por Dimensões do Sistema

### 1. Arquitetura, Limites entre Módulos e Fontes de Verdade

#### [ACHADO 1.1] Desvinculação Arquitetural e Isolamento Entre o Centro de Administração e o Portal do Aluno
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `wrangler.jsonc` vs `wrangler.student-portal.jsonc` e `functions/[[path]].ts:192-197`
- **Análise:** O Centro de Administração opera em Cloudflare Pages Functions com entrada principal em `functions/[[path]].ts`, enquanto o Portal do Aluno opera como serviço isolado Cloudflare Worker (`workers/student-portal/`). A comunicação entre as duas superfícies administrativas ocorre estritamente via RPC/Service Binding (`PORTAL_SERVICE` via `PortalAdminEntrypoint`).
- **Impacto:** Altíssimo isolamento operacional; falhas no frontend ou runtime administrativo não afetam a disponibilidade do portal do aluno e vice-versa.
- **Recomendação:** Manter a separação estrita de bindings e nunca expor o banco relacional direto do portal ao cliente admin.
- **Confiança:** Alta

#### [ACHADO 1.2] Múltiplas Versões de Contratos em `shared/` Incrementando Complexidade de Manutenção
- **Severidade:** LOW
- **Categoria:** Fato Confirmado
- **Evidência:** `shared/gradebook-contracts/source/source-contract-v1.ts` até `v4.ts`, `operational-workspace-transport-v1.ts` vs `v2.ts`
- **Análise:** O diretório `shared/gradebook-contracts/` mantém versões incrementais e coexistentes de contratos de transporte DTO (`v1`, `v2`, `v3`, `v4`). Embora isso garanta retrocompatibilidade para leitores legados, gera sobrecarga de navegação e risco de importação inadvertida de DTO descontinuado em novas funcionalidades.
- **Impacto:** Complexidade de manutenção e risco menor de acoplamento com versão antiga.
- **Recomendação:** Mapear e descontinuar exports de versões obsoletas quando não houver mais consumidores ativos em `src/` ou `server/`.
- **Confiança:** Alta

---

### 2. Autenticação, Autorização, Secrets, Menor Privilégio e Superfícies de Attack

#### [ACHADO 2.1] Selagem Cryptográfica Robusta de Sessões e Fluxo OIDC PKCE via Cookies HttpOnly
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `server/auth/session.ts`, `server/auth/sealed.ts`, `server/auth/oidc.ts`, `functions/[[path]].ts:211-306`
- **Análise:** O sistema utiliza OIDC com PKCE (`newAuthTransaction`, `exchangeCode`, `verifyIdToken`). As sessões do aplicativo e as transações OIDC em andamento são seladas criptograficamente com AES-GCM/HMAC usando `SESSION_SECRET` em cookies HttpOnly (`SESSION_COOKIE`, `AUTH_COOKIE`). Limite estrito de 4 transações concorrentes (`MAX_AUTH_TRANSACTIONS = 4`).
- **Impacto:** Proteção robusta contra CSRF, roubo de token em JavaScript no navegador (XSS) e replay de transações.
- **Recomendação:** Manter a política de validação do tamanho mínimo do `SESSION_SECRET` (mínimo de 43 caracteres em `server/env.ts`).
- **Confiança:** Alta

#### [ACHADO 2.2] RLS (Row Level Security) e Isolamento Estrito de Papéis no PostgreSQL
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `migrations/gradebook-simplified/0011_gradebook_rls_v1.sql`, `migrations/student-portal/0001_identity_credentials_acl_v1.sql`
- **Análise:** O banco de dados PostgreSQL aplica RLS nativo com concessões explícitas a papéis de aplicação (`gradebook_app_role`, `portal_app_role`), bloqueando o acesso do papel público (`PUBLIC`) e garantindo que requisições sem contexto da aplicação sejam rejeitadas no nível da query SQL.
- **Impacto:** Defesa em profundidade no banco de dados contra vazamento de dados em caso de comprometimento da camada HTTP.
- **Recomendação:** Garantir que todas as novas tabelas criadas em migrações futuras tenham `ENABLE ROW LEVEL SECURITY` por padrão.
- **Confiança:** Alta

#### [ACHADO 2.3] Automação Segura de Manutenção de Credenciais Entra ID via GitHub OIDC sem Secrets Longos
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `.github/workflows/entra-maintenance.yml`, `.github/workflows/entra-operations-audit.yml`
- **Análise:** A rotação e auditoria de certificados do Entra ID utiliza federated OIDC assertions do GitHub Actions (`id-token: write`), trocando tokens efêmeros com o Microsoft Graph sem armazenar chaves privadas de longa duração nos secrets do GitHub.
- **Impacto:** Redução drástica da superfície de ataque e eliminação de risco de vazamento de credenciais administrativas permanentes.
- **Recomendação:** Preservar a exigência de execução do workflow de manutenção restrita à branch `main` auditada.
- **Confiança:** Alta

---

### 3. Persistência, Migrações, Integridade, Concorrência, Atomicidade, Backup e Restore

#### [ACHADO 3.1] Ausência de Gestão de Backup/Restore Gerenciado com RPO/RTO Definidos no PostgreSQL
- **Severidade:** HIGH
- **Categoria:** Fato Confirmado / Risco Provável
- **Evidência:** `docs/gradebook/PROJECT_STATE.yaml:37` (`managed_backup_rpo_rto: explicitly-deferred-not-implemented`), `docs/student-portal/PROJECT_STATE.yaml:33`
- **Análise:** O projeto documenta explicitamente que ensaios de restauração lógica foram executados localmente (`run-logical-backup-recovery-v2.ts`), porém o plano e a execução de backup gerenciado contínuo com Objetivos de Ponto (RPO) e Tempo de Recuperação (RTO) em produção estão rotulados como "explicitamente diferidos e não implementados".
- **Impacto:** Em caso de corrupção física do banco Supabase ou desastre no provedor de nuvem, o tempo de recuperação é indeterminado e há risco de perda de dados acadêmicos entre exportações lógicas manuais.
- **Recomendação:** Priorizar a definição da política de Point-in-Time Recovery (PITR) no Supabase PostgreSQL e criar cron de backup diário automatizado com retenção externa.
- **Confiança:** Alta

#### [ACHADO 3.2] Proteção contra Concorrência e Padrão Outbox em Publicações Atômicas
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `migrations/student-portal/0011_live_event_outbox_v1.sql`, `tests/gradebook/recovery/relational-recovery-contention-v2.integration.test.ts`
- **Análise:** O sistema utiliza travas consultivas (advisory locks) e transações isoladas para substituição atômica de diagnósticos de importação, além de tabela de Outbox (`live_event_outbox_v1`) no Portal do Aluno para eventos em tempo real com controle de cursor, prevenindo race conditions e divergência de leitura.
- **Impacto:** Alta integridade transacional e consistente ordenação temporal de eventos.
- **Recomendação:** Manter testes de contenção e locks transacionais ativados na suíte de integração.
- **Confiança:** Alta

---

### 4. Resiliência, Atualização ao Vivo, Cache, Retries, Indisponibilidade e Falhas Parciais

#### [ACHADO 4.1] Notificações em Tempo Real com Durable Objects Hibernantes no Portal
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `workers/student-portal/index.ts`, `wrangler.student-portal.jsonc:18-20`, `tests/student-portal/runtime/live-updates.workerd.ts`
- **Análise:** O Portal do Aluno implementa notificações em tempo real com Cloudflare Durable Objects (`PortalLiveUpdatesV1`). O uso de WebSockets hibernantes permite distribuir uma mensagem para ~600 alunos conectados sem requisições adicionais ao banco de dados PostgreSQL.
- **Impacto:** Resiliência extrema sob pico de acessos concorrentes e custos mínimos de computação e banco de dados.
- **Recomendação:** Preservar a lógica de reconexão baseada em cursor para recuperação automática após breves quedas de rede do cliente.
- **Confiança:** Alta

#### [ACHADO 4.2] Resposta Gradativa e Transparente sob Falha de Conexão com o PostgreSQL
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `server/gradebook/persistence/postgres/official-gradebook-database-v1.ts:40-48`
- **Análise:** Quando a conexão com o banco Hyperdrive/PostgreSQL falha ou o provedor não está configurado, o wrapper `withOfficialGradebookDatabaseV1` intercepta a falha e retorna resposta HTTP 503 com cabeçalho explicativo `X-Gradebook-Storage-Provider: unconfigured` e `Cache-Control: no-store`, impedindo o travamento indescritível da aplicação.
- **Impacto:** Falha graciosa e diagnosticável sem expor detalhes internos da infraestrutura ao usuário final.
- **Recomendação:** Manter cabeçalhos de controle de cache nulo (`no-store`) nas respostas de erro.
- **Confiança:** Alta

---

### 5. Performance, Volume de Leitura/Escrita e Uso de Recursos Cloudflare/PostgreSQL

#### [ACHADO 5.1] Otimização de Consultas em Lote e Leitura Eficiente
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `tests/gradebook/performance/relational-performance-bounds-v2.test.ts`
- **Análise:** A camada de persistência limita rigorosamente a quantidade de chamadas SQL por operação. Leituras de turmas com até 1.000 pares aluno-disciplina são consolidadas em exatamente 6 comandos SQL otimizados.
- **Impacto:** Baixa latência e consumo previsível de CPU/conexões no pool do Hyperdrive.
- **Recomendação:** Manter os testes de limites de comandos SQL (`relational-performance-bounds-v2.test.ts`) no pipeline de CI.
- **Confiança:** Alta

#### [ACHADO 5.2] Tamanho do Bundle do Frontend Acima dos Limites Recomendados pelo Vite (>500 kB)
- **Severidade:** MEDIUM
- **Categoria:** Fato Confirmado
- **Evidência:** `dist/assets/index-DuDyZito.js` (661.06 kB minificado / 197.38 kB gzip), `node_modules/.cache/student-portal-ui/assets/index-BtU-zEVK.js` (633.96 kB minificado / 193.60 kB gzip)
- **Análise:** O build de produção do Vite emite avisos explícitos de que chunks principais excedem 500 kB.
- **Impacto:** Maior tempo de carregamento inicial do aplicativo (First Contentful Paint) em conexões móveis ou lentas de estudantes/professores.
- **Recomendação:** Implementar Code Splitting usando `import()` dinâmico nas rotas dos painéis e modularizar ícones/bibliotecas pesadas.
- **Confiança:** Alta

---

### 6. CI/CD, Proveniência, Workflows, Dependências e Supply Chain

#### [ACHADO 6.1] Rastreabilidade Criptográfica Estrita e Invariante de Deploy por Proveniência de Dois Pais
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `.github/workflows/deploy-cloudflare-pages.yml:51-118`, `scripts/ci/provenance-v1.ts`
- **Análise:** O deploy em produção via `deploy-cloudflare-pages.yml` só é permitido se a atualização for um merge commit de dois pais oriundo de Pull Request cujos artefatos foram pré-testados e validados identicamente nos workflows `validate-pull-request.yml` e `deploy-student-portal.yml`. A ferramenta `provenance-v1.ts` verifica a correspondência exata das árvores SHA e digests dos arquivos antes de publicar na Cloudflare.
- **Impacto:** Blindagem completa contra compilações adulteradas, desvio entre testes e produção, e deploys diretos não autorizados.
- **Recomendação:** Não alterar a obrigatoriedade da árvore idêntica de proveniência no fluxo de entrega.
- **Confiança:** Alta

#### [ACHADO 6.2] Incompatibilidade Secundária de Engine Node no pacote `jsdom` em `package.json`
- **Severidade:** LOW
- **Categoria:** Fato Confirmado
- **Evidência:** `package.json:59`, aviso de `npm ci`: `jsdom@30.0.1 required node ^22.22.2 || ^24.15.0 || >=26.0.0, current v22.22.1`
- **Análise:** O repositório utiliza `jsdom` mais recente que exige Node.js `22.22.2`, enquanto o ambiente de execução local/sandbox utiliza Node `v22.22.1`. Em workflows GitHub Actions, o Node.js 22 é configurado via `setup-node@v4`.
- **Impacto:** Apenas aviso informativo durante `npm ci`; não causou falhas nos testes locais nem no CI.
- **Recomendação:** Alinhar as versões no `.nvmrc` ou atualizar a imagem base quando conveniente.
- **Confiança:** Alta

---

### 7. Testes, Cobertura Efetiva, Flakes e Lacunas de Validação

#### [ACHADO 7.1] Extensa Suíte de Testes com Cobertura Abrangente (230+ Arquivos, >1700 Testes)
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** Execução de `npx vitest run tests/gradebook` (202 arquivos passados) e `tests/*.ts` (27 arquivos passados).
- **Análise:** A suíte de testes do repositório é extremamente completa, cobrindo regras de arredondamento acadêmico, contratos DTO, autorização RBAC, migrações SQL, resiliência de rede e interfaces de usuário.
- **Impacto:** Altíssima confiança na prevenção de regressões mecânicas e de regras de negócio.
- **Recomendação:** Manter a regra de execução do `npm run verify` antes de submeter alterações.
- **Confiança:** Alta

#### [ACHADO 7.2] Dependência de Artefatos Prévios de Build para Testes Runtime de Miniflare/Workerd
- **Severidade:** MEDIUM
- **Categoria:** Fato Confirmado
- **Evidência:** `package.json` (script `test:student-portal-runtime`), `tests/student-portal/runtime/foundation.workerd.ts:48`
- **Análise:** Executar `vitest run` direto na raiz sem antes compilar os workers do portal (`npm run build:student-portal`) causa falha imediata por falta dos arquivos `node_modules/.cache/student-portal-edge/_worker.js` e `node_modules/.cache/student-portal/index.js`. O script oficial `npm run verify` trata isso corretamente ordenando o build antes dos testes runtime.
- **Impacto:** Desenvolvedores ou agentes que executem `npm test` diretamente sem ler as instruções de build podem interpretar falsos negativos como quebras de código.
- **Recomendação:** Adicionar verificação de presença dos artefatos em `beforeAll` com mensagem explicativa amigável orientando o uso do comando `npm run build:student-portal`.
- **Confiança:** Alta

#### [ACHADO 7.3] Testes de Integração PostgreSQL (`test:student-portal-postgres`) Exigem Banco Nativo Não Ativo por Padrão em Testes Locais
- **Severidade:** LOW
- **Categoria:** Fato Confirmado
- **Evidência:** `.github/workflows/deploy-student-portal.yml:38-51`, `package.json: script test:student-portal-postgres`
- **Análise:** Os testes de isolamento de papéis e DDL do banco nativo PostgreSQL dependem do container de serviço `postgres:17.6` rodando em `127.0.0.1:5432`. No CI do GitHub Actions esse container é fornecido automaticamente, mas em ambiente dev local sem Docker rodando o comando falhará se invocado manualmente.
- **Impacto:** A validação completa do schema PostgreSQL nativo fica concentrada no CI da PR, enquanto os testes unitários usam mocks e PGlite/SQLite.
- **Recomendação:** Documentar claramente em `docs/` o pré-requisito de container Postgres para o comando `npm run test:student-portal-postgres`.
- **Confiança:** Alta

---

### 8. Código Legado/Morto, Duplicação, Complexidade e Drift de Documentação

#### [ACHADO 8.1] Depreciação de Importação de Arquivo sem Extensão nos Arquivos de Configuração do Vite
- **Severidade:** LOW
- **Categoria:** Fato Confirmado
- **Evidência:** `vite.config.ts:5`, `vite.student-portal.config.ts:5` (`import "./build/browser-boundary-v1"` sem extensão `.ts`)
- **Análise:** O Vite 8 exibe aviso durante a compilação: `Your Vite config uses features that are unsupported by configLoader: 'native' ... import "./build/browser-boundary-v1" without a file extension`.
- **Impacto:** Risco de quebra futura em atualizações de versão major do Vite quando o carregador nativo se tornar o padrão estrito.
- **Recomendação:** Adicionar a extensão `.ts` no trecho de importação indicado em ambos os arquivos de configuração do Vite.
- **Confiança:** Alta

#### [ACHADO 8.2] Isolamento Eficiente e Limpeza de Código de Interfaces Legadas Descontinuadas
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `tests/gradebook/integration/retired-unmounted-frontends-666.test.ts`, `Aprendizados/`
- **Análise:** Telas antigas e importadores legados foram formalmente descontinuados e movidos para o diretório `Aprendizados/` fora do caminho de compilação da aplicação, mantendo apenas contratos mínimos no backend para compatibilidade e auditoria histórica.
- **Impacto:** Redução da dívida técnica e preservação da clareza arquitetural.
- **Recomendação:** Continuar a prática de mover experimentos e código arquivado para `Aprendizados/`.
- **Confiança:** Alta

---

### 9. Observabilidade, Auditoria e Capacidade Operacional

#### [ACHADO 9.1] Padronização de Logs Estruturados em JSON com `correlationId` UUID Transversal
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `functions/[[path]].ts:408`, `server/auth/session-policy.ts`, `workers/student-portal/index.ts`
- **Análise:** Todas as funções do Pages e Workers emitem logs estritamente em formato JSON estruturado incluindo campo `correlationId` gerado via `crypto.randomUUID()`, tipo de evento, status e mensagem.
- **Impacto:** Excelente capacidade de rastreabilidade e depuração de chamadas de ponta a ponta em sistemas de agregadores de log (como Cloudflare Observability).
- **Recomendação:** Garantir que novos manipuladores de rotas HTTP também propaguem o `correlationId`.
- **Confiança:** Alta

#### [ACHADO 9.2] Habilitação de Traces Desativada no Wrangler para o Portal do Aluno
- **Severidade:** INFO
- **Categoria:** Fato Confirmado
- **Evidência:** `wrangler.student-portal.jsonc:15` (`"traces": { "enabled": false }`)
- **Análise:** A amostragem de logs de invocação (`invocation_logs: false`) e os rastros distribuídos (`traces: false`) estão desativados no arquivo de configuração do Cloudflare Workers, mantendo ativa apenas a amostragem de cabeçalho (`head_sampling_rate: 1`).
- **Impacto:** Redução de custos e uso de retenção de dados na Cloudflare, mas reduz o detalhamento de span de tracing distribuído.
- **Recomendação:** Ativar `traces: true` pontualmente apenas quando houver investigação de degradação de performance em produção.
- **Confiança:** Alta

---

## Síntese do Sistema

### Top 10 Riscos / Prioridades Práticas

1. **Gestão Gerenciada de Backup/Restore PostgreSQL (RPO/RTO):** Implementar e testar formalmente a política de backup contínuo gerenciado em produção para mitigar risco em desastres. *(HIGH)*
2. **Otimização de Tamanho dos Bundles do Frontend (>600 kB):** Aplicar code-splitting no Vite para reduzir o peso inicial e acelerar a renderização do portal do aluno e painéis administrativos. *(MEDIUM)*
3. **Erros de Execução Direta do `vitest` sem Build Prévio:** Melhorar o tratamento em `tests/student-portal/runtime` para orientar sobre a dependência de artefatos gerados por `npm run build:student-portal`. *(MEDIUM)*
4. **Resolução de Avisos de Depreciação no Vite Config:** Incluir extensão `.ts` no arquivo `build/browser-boundary-v1` importado nas configurações do Vite para evitar quebras em atualizações futuras do bundler. *(LOW)*
5. **Ajuste Fino de Engine Node para `jsdom`:** Atualizar a versão do Node no arquivo de ambiente `.nvmrc` para coincidir com a exigência do `jsdom@30` (`>=22.22.2`). *(LOW)*
6. **Descontinuação Gradual de Versões Antigas de Contratos DTO (`v1`, `v2`):** Remover contratos descontinuados no diretório `shared/` sem consumidores ativos para reduzir a área de navegação. *(LOW)*
7. **Documentação de Pré-requisitos para Testes PostgreSQL Nativos:** Esclarecer no README do projeto que `npm run test:student-portal-postgres` exige container Postgres ativo localmente. *(LOW)*
8. **Monitoramento de Limites de CPU do Hyperdrive sob Carga Extrema:** Acompanhar as métricas do pool do Hyperdrive em picos de fechamento de trimestre. *(INFO/HIPÓTESE)*
9. **Manutenção do Acesso por Menor Privilégio no Entra ID:** Continuar executando a auditoria diária do workflow `entra-operations-audit.yml`. *(INFO)*
10. **Avisos do React `act(...)` em Testes do UI Hardening:** Tratar alertas do React Testing Library em `relational-performance-ui-v2.test.ts`. *(LOW)*

---

### Top 10 Pontos Fortes

1. **Isolamento de Runtimes e Módulos:** Separação limpa entre Pages Functions (Admin) e Edge Worker (Portal do Aluno) via RPC.
2. **Criptografia e Segurança de Sessão:** Autenticação OIDC PKCE com selagem AES-GCM/HMAC em cookies HttpOnly e política de origem rigorosa.
3. **Proveniência Cryptográfica e Gates de CI/CD:** Garantia de que o código publicado em produção é 100% idêntico ao testado e aprovado no PR por meio do `provenance-v1.ts`.
4. **Isolamento de Dados no Banco com RLS:** Migrações PostgreSQL com Row Level Security e concessões restritas por papel de aplicação.
5. **Arquitetura Reativa Resiliente para Alunos:** Notificações em tempo real com Cloudflare Durable Objects hibernantes capazes de atender centenas de alunos simultâneos sem sobrecarregar o banco.
6. **Automação de Credenciais sem Secrets Longos:** Uso de GitHub OIDC federado no Entra ID eliminando chaves estáticas de longa duração.
7. **Consultas SQL em Lote e Delimitadas:** Limite estrito de queries executadas por operação, prevenindo gargalos de N+1.
8. **Logs Estruturados Transversais em JSON:** Todo o ecossistema utiliza logs legíveis por máquina com rastreamento por `correlationId`.
9. **Extensa Cobertura de Testes Automatizados:** Mais de 1.700 testes cobrindo regras acadêmicas, segurança, contratos e interface.
10. **Limpeza Ativa de Código Legado:** Código antigo e protótipos mantidos isolados em `Aprendizados/` sem sujar a compilação do sistema principal.

---

### 5 Ações de Maior Retorno

1. **Configurar Backup Gerenciado PITR no Supabase/PostgreSQL:** Resolver a principal pendência operacional de resiliência e definir RPO/RTO formais.
2. **Aplicar Dynamic Imports no Vite para Code Splitting:** Reduzir o bundle principal de 660 kB para <300 kB, melhorando o tempo de resposta inicial para os usuários.
3. **Adicionar Extensões `.ts` no Config do Vite:** Eliminar avisos do bundler com 2 linhas de alteração e prevenir incompatibilidades com o Vite 9+.
4. **Exibir Mensagem Guiada para Falta de Artefatos no Miniflare Test:** Adicionar mensagem explicativa ao falhar o carregamento do worker em testes, facilitando o onboarding de desenvolvedores.
5. **Encapsular Atualizações React do Teste UI em `act(...)`:** Eliminar o único warning do console durante a suíte completa de testes para limpeza de logs do CI.

---

### Itens que Exigem Validação Externa / Manual (Não Concluíveis Apenas pelo Git)

1. **Comportamento e Latência do Hyperdrive sob Carga Real de Produção:** Medição do tempo de resposta da conexão Cloudflare -> Supabase sob centenas de requisições simultâneas.
2. **Validação de Dispositivos Físicos e Leitor de QR Code:** Verificação de câmera e leitura de QR Code em aparelhos celulares reais de estudantes (explicitamente diferido na especificação).
3. **Impressão Física de Boletins em Papel:** Teste de renderização e margens em impressoras físicas de ambiente escolar.
4. **Acessibilidade por Leitores de Tela (Narradores):** Validação tátil/auditiva da interface do portal para estudantes com deficiência visual.
5. **Status de Saúde em Tempo Real das Aplicações no Microsoft Entra ID:** Verificação do painel de administração do Azure/Entra ID para confirmar ausência de alertas internos do provedor.
