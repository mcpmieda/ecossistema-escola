# Relatório de implantação da base do Ecossistema Escolar

Data: 2026-08-24 (America/Sao_Paulo)

## 1. Resumo executivo

**Estado: concluído**, considerando a especificação mestre e a instrução posterior que substituiu o alerta Outlook por manutenção automática segura. A fundação está em <https://admin.escolaieda.com>, com Cloudflare Pages/Functions Free, Microsoft Entra ID, BFF, Microsoft Graph limitado por `Sites.Selected`, SharePoint CENTROADMIN, GitHub privado e CI/CD.

Não foi criado serviço pago, cartão, banco Cloudflare, runtime Azure, grupo `ECO-*`, módulo de negócio ou automação vazia. A única diferença deliberada do plano original é melhor: não foi criada uma conexão Outlook/Power Automate para lembrar expirações. GitHub OIDC faz rotação automática, testada e com rollback, dos certificados Web e Graph. O fluxo antigo de grupos não foi tocado.

Pendências reais: nenhuma para operar a fundação. `PLATAFORMA_CREDENCIAIS` é inventário sem segredo e não é a fonte operacional de validade; o estado auditável da rotação está no Entra, Cloudflare e nos artefatos do GitHub Actions.

## 2. Passo a passo cronológico real

| Etapa              | O que/por quê                                     | Serviço, ferramenta e caminho                                                                    | Recurso/resultado                                                                                         | Teste e auditoria manual                                                       |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Pré-estado         | Evitar colisão e preservar legado                 | Graph/Az PowerShell, Cloudflare MCP read-only, `gh`, DNS                                         | Snapshot em `docs/PRE_IMPLANTACAO_SNAPSHOT.md`; site/apps/repo/projeto não existiam; `admin` era NXDOMAIN | Repetir comandos do documento read-only e comparar                             |
| SharePoint         | Persistência institucional sem M365 Group novo    | SharePoint Admin Center → Active sites → Create → Communication site; Graph e script idempotente | `CENTROADMIN`, 7 listas e 3 bibliotecas; sharing externo Off                                              | Site contents; External sharing; executar script novamente sem duplicar        |
| Entra Web          | Login single-tenant BFF                           | Entra Admin Center → Identity → Applications → App registrations                                 | Web app, redirect final, group claims, dois certificados runtime                                          | Authentication/Token configuration/Certificates; login institucional real      |
| Entra Graph        | Acesso app-only mínimo                            | Entra → App registrations → API permissions; Graph `/sites/{id}/permissions`                     | somente `Sites.Selected`; grant `CENTROADMIN → write`                                                     | CENTROADMIN lista 8 recursos; site externo retorna 403                         |
| Provisionamento    | Criar schema sem manter privilégio amplo          | `infra/sharepoint/provision-foundation.ps1` com app X.509 temporário                             | app recebeu `Sites.FullControl.All` só durante execução e foi apagado no `finally`                        | busca posterior confirmou ausência do app e da permissão temporária            |
| Código base        | Separar UI, BFF, adapters e contratos             | React, TypeScript, Vite, Zod, Vitest; terminal                                                   | página técnica; auth/session/roles/Graph; contratos                                                       | `npm run verify`: 53 testes, lint, typecheck e build aprovados                 |
| GitHub             | Fonte privada e entrega bloqueada por qualidade   | GitHub `mcpmieda/ecossistema-escola`; Actions                                                    | repo privado, `main`, workflows CI/deploy e rotação                                                       | run 32748629808 verde; branch inválida falhou antes de produção e foi removida |
| Cloudflare         | Edge e backend sem Azure                          | Dashboard → Workers & Pages → Create/Pages; Wrangler                                             | projeto `ecossistema-escola` Free, Functions, vars e secrets                                              | health 200; assets fora de Functions; secret list mostra só nomes              |
| DNS                | Publicar sem migrar zona                          | GoDaddy → DNS Management → `escolaieda.com`                                                      | CNAME `admin → ecossistema-escola.pages.dev`                                                              | DNS resolve; HTTPS válido; raiz/www/MX comparados e preservados                |
| Login final        | Fixar host oficial                                | Entra redirect final + `OFFICIAL_ORIGIN`                                                         | callback somente no domínio `admin`                                                                       | login institucional concluído; pages.dev API retorna 421                       |
| Alerta/credenciais | Remover dependência de lembrete e conexão Outlook | Power Automate inspecionado; GitHub/Entra/Cloudflare redesenhados                                | fluxo de alerta incompleto nunca salvo; nenhuma conexão Outlook; rotação automática criada                | Power Automate mostra só fluxo antigo; Actions prova rotação e failure-safe    |
| OIDC de manutenção | Não guardar segredo no GitHub para alterar Entra  | Entra Maintenance app + FIC GitHub immutable subject                                             | `Application.ReadWrite.OwnedBy`, owner só dos apps Web/Graph, sem client secret                           | exchange OIDC real e leitura/escrita apenas nos apps próprios                  |
| Rotação Graph/Web  | Evitar interrupção e expiração                    | workflow semanal + `rotate-graph-certificate.mjs` + Wrangler                                     | slots A/B, certificados 180 dias, threshold 60 dias                                                       | runs 32748356526, 32747509433 e 32748886048                                    |
| Limpeza            | Remover bootstrap e testes                        | Graph, Cloudflare, GitHub e filesystem                                                           | credenciais legacy apagadas; temporários/branch/dados removidos                                           | dois slots funcionais por app; repo limpo; CI normal verde                     |

Erros reais e correções: a primeira FIC falhou com `AADSTS700213` porque GitHub emitiu subject com IDs imutáveis; foi configurado o subject exato. Secret novo do Pages não aparecia sem deploy; o workflow passou a republicar antes do teste. Um `fetch` global gerou `Illegal invocation`; foi encapsulado. A consistência eventual de `keyCredentials` exigiu confirmar três leituras consecutivas antes de declarar cleanup. Cada correção foi seguida por novo teste real.

## 3. Arquitetura final real

```text
Usuário → admin.escolaieda.com (GoDaddy CNAME + TLS Cloudflare)
       → Pages: React estático
       → Pages Functions: BFF /auth e /api
          → Entra Web: login + group claims
          → sessão selada HttpOnly (8h)
          → Entra Graph Backend: certificado A/B
             → Graph Sites.Selected
                → somente SharePoint CENTROADMIN (write)

GitHub main → quality gate → Wrangler Pages deploy
GitHub OIDC → Entra Maintenance → certificados A/B → Cloudflare secrets → validação runtime
```

## 4. Inventário completo

| SERVIÇO        | TIPO              | NOME                                     | ID                                                                                                 | URL                                                | FINALIDADE                                                            | STATUS                           |
| -------------- | ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Cloudflare     | Conta             | conta institucional                      | `40cef24b2a2a1df8ab3d974dcafb2c03`                                                                 | Dashboard                                          | hospedar a fundação                                                   | Free/ativa                       |
| Cloudflare     | Pages             | `ecossistema-escola`                     | nome do projeto                                                                                    | `https://ecossistema-escola.pages.dev`             | frontend e Functions                                                  | ativo; API alternativa bloqueada |
| Cloudflare     | Custom domain     | `admin.escolaieda.com`                   | —                                                                                                  | `https://admin.escolaieda.com`                     | origem oficial                                                        | ativo/HTTPS                      |
| Cloudflare     | API token         | `GitHub Deploy - ecossistema-escola`     | `c9da7542185da52fc853b5ba0cac8e87`                                                                 | Manage Account → Account API Tokens                | Pages Write no CI/rotação                                             | ativo; sem expiração             |
| GitHub         | Repositório       | `mcpmieda/ecossistema-escola`            | repo privado                                                                                       | `https://github.com/mcpmieda/ecossistema-escola`   | fonte e CI/CD                                                         | ativo                            |
| Entra          | Tenant            | escola                                   | `f04e0fa3-b8dc-4f77-be3c-7dfda0635188`                                                             | Entra Admin Center                                 | identidade oficial                                                    | ativo                            |
| Entra          | App               | `Ecossistema Escolar - Web`              | object `0fcc9402-26bb-4c9d-9ccd-eb4f625cf278`; client `78185e20-c824-4acc-9ccd-41b9f7509a6f`       | App registrations                                  | login BFF                                                             | ativo; 2 certs                   |
| Entra          | App               | `Ecossistema Escolar - Graph Backend`    | object `2d04bd2b-3ef5-4ac6-bd2e-11885a5b3401`; client `7d565352-1f77-4a7c-a4a4-4ae1b55b5c0c`       | App registrations                                  | Graph app-only                                                        | ativo; 2 certs                   |
| Entra          | App               | `Ecossistema Escolar - Manutenção OIDC`  | object `dc65fd54-ea89-44d0-a2bb-76503de3841c`; client `ccaa876c-a453-4eba-b998-cffcd25a4996`       | App registrations                                  | rotacionar apps próprios                                              | ativo; sem secret                |
| Entra          | Service principal | Maintenance                              | `b36a09d2-043f-424a-8c8e-39419a9194bf`                                                             | Enterprise applications                            | workload GitHub                                                       | ativo                            |
| SharePoint     | Site              | CENTROADMIN                              | `eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56` | `https://eduieda.sharepoint.com/sites/CENTROADMIN` | persistência                                                          | ativo; externo Off               |
| SharePoint     | Lists             | 7 listas `PLATAFORMA_*`                  | IDs internos no site                                                                               | Site contents                                      | configuração, módulos, auditoria, migrações, credenciais e automações | ativas                           |
| SharePoint     | Libraries         | ARQUIVOS/SNAPSHOTS/RELATORIOS_PLATAFORMA | IDs internos no site                                                                               | Site contents                                      | documentos técnicos futuros                                           | ativas/versionadas               |
| Power Automate | Flow existente    | `AUTO                                    | Grupos por Cargo                                                                                   | Microsoft 365`                                     | preservado                                                            | make.powerautomate.com           | cargo → grupos | intacto |
| DNS            | CNAME             | `admin`                                  | —                                                                                                  | GoDaddy DNS                                        | domínio Cloudflare                                                    | ativo                            |

## 5. Serviços em linguagem simples

- **Pages** entrega os arquivos da página perto do usuário; **Pages Functions/Workers runtime** executa o backend sob demanda.
- **Cloudflare Skills/MCP** serviram para consulta e documentação; como a conexão MCP era read-only, mutações usaram Wrangler, API oficial e Dashboard.
- **Entra ID** valida a conta. O app **Web** faz login; o **Graph Backend** fala com dados; o app **Maintenance** gira certificados.
- **Graph** é a API Microsoft. **Sites.Selected** significa “nenhum site até receber concessão explícita”; só CENTROADMIN recebeu `write`.
- **SharePoint Lists** são tabelas institucionais; **Libraries** são áreas versionadas de arquivos.
- **GitHub/CI/CD** guarda o código e só publica após format, lint, tipos, testes e build.
- **DNS/CNAME** faz `admin.escolaieda.com` apontar para Pages sem mexer em site raiz ou e-mail.
- **BFF** é o backend entre navegador e Microsoft; por isso o browser não guarda token privilegiado.
- **Cookie HttpOnly** não pode ser lido pelo JavaScript; **ETag** evita sobrescrever alteração concorrente.
- **Feature flag** liga/desliga capacidade por configuração; **módulo** é um componente versionado; **read model** é um resumo otimizado para tela.
- **Automação** é uma definição allowlisted, ainda sem motor ativo. **Correlation ID** liga resposta, log e auditoria sem expor o conteúdo.

## 6. Como auditar Cloudflare

Dashboard → escolha a conta → Workers & Pages → `ecossistema-escola`. Em Deployments deve haver produção em `main`; Custom domains mostra `admin.escolaieda.com` Active; Settings → Variables and Secrets mostra as variáveis públicas e cinco nomes de secrets com valores ocultos; Metrics/Logs mostra invocações e erros. Manage Account → Account API Tokens mostra o token de deploy com Pages Write e sem expiração. Billing/Workers plan deve permanecer Free. A integração efetiva de deploy é GitHub Actions + Wrangler, não build nativo duplicado.

## 7. Como auditar SharePoint

SharePoint Admin Center → Sites → Active sites → CENTROADMIN. Confira URL, owner administrativo e External sharing Off. Abra o site → Settings → Site contents: sete listas e três bibliotecas. Nas bibliotecas, Settings → Versioning settings deve indicar versionamento. Em cada lista, Columns/Indexed columns mostra os campos e índices do script. A aplicação usa o backend; o grupo Secretaria não recebeu Full Control coletivo só por ser administrador da aplicação.

## 8. Como auditar Entra

Entra Admin Center → Identity → Applications → App registrations → All applications. Nos apps Web/Graph confira Overview (IDs), Owners, Certificates & secrets e API permissions. Web: redirect `https://admin.escolaieda.com/auth/callback`, tenant único e group claims. Graph: somente `Sites.Selected` application. Maintenance: Federated credentials com issuer GitHub, audience `api://AzureADTokenExchange` e subject `repo:mcpmieda@268288370/ecossistema-escola@1345061518:environment:production`; API permission `Application.ReadWrite.OwnedBy`; nenhum secret/certificado próprio.

Certificados finais Graph: slots A/B, key IDs `816386d6-edf0-465d-bad1-0ec3067902c6` e `2a0fd5cb-79ae-4f83-9cef-bd5f3b230d56`, validade até 2027-02-20. Web: `0593be62-ad30-4a74-95a4-c5dbe2d0989e` e `bddcfb3a-92cf-4456-bb97-28948562ea6d`, mesma data. Nunca exporte chaves privadas.

## 9. Sites.Selected — prova

`Sites.Selected` sozinho não concede site algum. O grant explícito no recurso CENTROADMIN associa o Client ID Graph Backend à role `write`. Na rotação real 32748356526, o candidato Graph emitiu token, listou 8 listas no CENTROADMIN e recebeu 403 ao consultar outro site. Isso prova acesso positivo e isolamento lateral.

## 10. Grupos existentes

| Grupo                                 | Object ID                              | Papel         |
| ------------------------------------- | -------------------------------------- | ------------- |
| GRUPO DA SECRETARIA - ARQUIVO DIGITAL | `6b9be4a5-52a4-4e41-8654-1564f14e5ab5` | ADMINISTRADOR |
| PROFESSORES                           | `96227794-63b1-421c-96f4-cd062fcdf00a` | PROFESSOR     |
| ALUNOS                                | `8255b76e-dd85-4d04-a360-8ce1baf6ce63` | ALUNO         |
| EQUIPE DE APOIO                       | `74386ce1-2db4-4352-8618-7ab4659ab7b6` | APOIO         |
| VISITANTE                             | `9b0283b8-8883-4257-8085-3ac60060d489` | VISITANTE     |

Eles não foram criados, substituídos nem tiveram membros/configuração alterados. O encadeamento permanece `cargo → Power Automate existente → grupo → group claim no login → role no BFF`.

## 11. Power Automate e credenciais

O fluxo `AUTO | Grupos por Cargo | Microsoft 365` foi somente inspecionado e permanece intacto. O rascunho `ECO | Alerta de Credenciais da Plataforma` nunca foi salvo; nenhuma conexão Office 365 Outlook/Outlook.com foi criada.

A intenção do alerta 60/30/7 foi superada por prevenção: GitHub verifica semanalmente e rotaciona automaticamente a 60 dias. `PLATAFORMA_CREDENCIAIS` permanece apenas inventário sem valores. Artefatos redigidos de 90 dias e os key IDs do Entra dão a trilha. Não há e-mail repetitivo nem memória humana.

## 12. GitHub, CI/CD e DNS

Repo privado, branch de produção `main`. Todo push executa `npm ci`, format, lint, typecheck, 53 testes e build; somente então `deploy-production` usa Wrangler. Falha aparece em GitHub → Actions → `CI and deploy` e impede o job dependente. O teste negativo de branch confirmou isso e foi removido.

Registro adicionado: CNAME `admin.escolaieda.com → ecossistema-escola.pages.dev`. Raiz continuou nos quatro IPs GitHub Pages, `www` continuou em `mcpmieda.github.io` e MX continuou `escolaieda-com.mail.protection.outlook.com`. Nameservers não mudaram.

## 13. Login, sessão e backend

`/auth/login` cria PKCE/state/nonce e cookie temporário. O Entra autentica a conta institucional e retorna ao callback oficial. O BFF valida assinatura, issuer, tenant, audience, tempo e nonce; mapeia Object IDs de grupos; rejeita usuário sem papel; sela uma sessão de até 8 horas. `/api/me` devolve só nome/papéis. `/api/sharepoint/health` exige sessão e ADMINISTRADOR. `/api/maintenance/rotation/validate` exige GitHub OIDC de subject/audience exatos.

## 14. Segredos

| NOME                    | ONDE ESTÁ                        | QUEM USA          | CRIADO EM  | EXPIRA EM                 | ALERTA              | COMO ROTACIONAR                        |
| ----------------------- | -------------------------------- | ----------------- | ---------- | ------------------------- | ------------------- | -------------------------------------- |
| `GRAPH_CREDENTIAL_A`    | Cloudflare Pages Secret          | Graph adapter     | 2026-08-24 | cert 2027-02-20           | workflow semanal    | automático slot A/B                    |
| `GRAPH_CREDENTIAL_B`    | Cloudflare Pages Secret          | Graph adapter     | 2026-08-24 | cert 2027-02-20           | workflow semanal    | automático slot A/B                    |
| `WEB_CREDENTIAL_A`      | Cloudflare Pages Secret          | OIDC Web          | 2026-08-24 | cert 2027-02-20           | workflow semanal    | automático slot A/B                    |
| `WEB_CREDENTIAL_B`      | Cloudflare Pages Secret          | OIDC Web          | 2026-08-24 | cert 2027-02-20           | workflow semanal    | automático slot A/B                    |
| `SESSION_SECRET`        | Cloudflare Pages Secret          | selagem de sessão | 2026-08-24 | sem expiração de provedor | incidente           | substituir e redeploy; encerra sessões |
| `CLOUDFLARE_API_TOKEN`  | GitHub repository Actions Secret | deploy/rotação    | 2026-08-24 | sem expiração             | incidente/revogação | novo account token Pages Write         |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secret                    | Wrangler          | 2026-08-24 | não expira                | não aplicável       | corrigir somente se conta mudar        |

Não existem `ENTRA_*_CLIENT_SECRET`; credenciais bootstrap legacy foram removidas.

## 15. Automações, módulos e eficiência

Listas de definições/execuções e contratos Zod estão prontos; ações são allowlisted e nenhuma automação real, Cron ou Workflow vazio foi criado. Futuro scheduler deve ser único, compartilhado, idempotente e auditável. `plataforma-base` é o único módulo. Banco de Notas e demais sistemas entram depois pelo contrato.

`_routes.json` evita Functions em assets. APIs agregadas reduzem round-trips. Graph tem batch, paginação limitada, timeout, correlação e retry/backoff com `Retry-After`. Feature flags falham para fallback seguro. Rate limiting possui proteção de plataforma, limites de body/método/origin e hook arquitetural; não foi criado storage/limiter distribuído sem demanda.

## 16. Observabilidade

Cloudflare Metrics/Functions Logs registra invocação, erro técnico e correlation ID; o código não loga tokens, cookies, headers ou respostas Graph. `PLATAFORMA_AUDITORIA` recebe futuramente eventos institucionais mínimos e não é descrita como WORM. GitHub preserva artefatos redigidos de rotação por 90 dias.

## 17. Testes obrigatórios

| #   | TESTE / PROCEDIMENTO         | RESULTADO                            | EVIDÊNCIA                               |
| --- | ---------------------------- | ------------------------------------ | --------------------------------------- |
| 1   | HTTPS domínio final          | aprovado                             | 200/TLS Cloudflare                      |
| 2   | login institucional real     | aprovado                             | retorno ao domínio e sessão             |
| 3   | conta pessoal rejeitada      | aprovado automatizado                | OIDC tenant/issuer tests                |
| 4   | tenant diferente             | aprovado                             | teste de claims                         |
| 5   | issuer errado                | aprovado                             | Vitest                                  |
| 6   | audience errada              | aprovado                             | Vitest                                  |
| 7   | state inválido               | aprovado                             | callback 401/teste                      |
| 8   | nonce inválido               | aprovado                             | Vitest                                  |
| 9   | cookie adulterado            | aprovado                             | AES-GCM/session test                    |
| 10  | sessão expirada              | aprovado                             | Vitest                                  |
| 11  | sem grupo conhecido          | aprovado                             | roles/callback 403                      |
| 12  | Secretaria → ADMINISTRADOR   | aprovado                             | roles test                              |
| 13  | PROFESSORES sem admin        | aprovado                             | roles test                              |
| 14  | ALUNOS sem admin             | aprovado                             | roles test                              |
| 15  | Apoio → APOIO                | aprovado                             | roles test                              |
| 16  | Visitante sem admin          | aprovado                             | roles test                              |
| 17  | `/api/me` anônimo            | aprovado                             | produção 401                            |
| 18  | SharePoint health sem admin  | aprovado                             | autorização 403                         |
| 19  | Graph app-only               | aprovado                             | token real na rotação                   |
| 20  | CENTROADMIN permitido        | aprovado                             | 8 listas lidas                          |
| 21  | outro site                   | aprovado                             | 403 real                                |
| 22  | metadata mínima              | aprovado                             | health/listagem real                    |
| 23  | escrita migration controlada | aprovado e removido                  | item técnico temporário                 |
| 24  | ETag correto                 | aprovado                             | teste Graph/SharePoint                  |
| 25  | ETag incorreto               | aprovado                             | 412 equivalente                         |
| 26  | external sharing             | aprovado                             | Off no Admin Center                     |
| 27  | sem Graph `*.All` runtime    | aprovado                             | somente Sites.Selected                  |
| 28  | sem secret frontend          | aprovado                             | bundle/repo scan                        |
| 29  | sem secret GitHub            | aprovado                             | só GitHub Secrets, valores ocultos      |
| 30  | locais sensíveis ignorados   | aprovado                             | `.gitignore`/git status                 |
| 31  | assets não invocam Functions | aprovado                             | `_routes.json`                          |
| 32  | `/api` e `/auth` invocam     | aprovado                             | respostas runtime                       |
| 33  | API no-store                 | aprovado                             | header real                             |
| 34  | pages.dev sem API/login      | aprovado                             | 421 real                                |
| 35  | CSP/headers                  | aprovado                             | headers real e testes                   |
| 36  | body inválido                | aprovado                             | security tests                          |
| 37  | Origin inválida              | aprovado                             | security tests                          |
| 38  | método indevido              | aprovado                             | 405                                     |
| 39  | 429 sem loop                 | aprovado                             | máximo 5 tentativas                     |
| 40  | Retry-After                  | aprovado                             | Vitest com sleep observado              |
| 41  | batch helper                 | aprovado                             | contratos/Graph tests                   |
| 42  | módulo base                  | aprovado                             | schema test                             |
| 43  | feature flag                 | aprovado                             | schema/fallback tests                   |
| 44  | ação não allowlisted         | aprovado                             | contrato rejeita                        |
| 45  | nenhuma automação real       | aprovado                             | listas/workflows auditados              |
| 46  | nenhum Cron inútil           | aprovado                             | Cloudflare audit                        |
| 47  | Cloudflare Free              | aprovado                             | Dashboard                               |
| 48  | nenhum Azure runtime         | aprovado                             | inventário Azure                        |
| 49  | raiz funciona                | aprovado                             | DNS/HTTP preservado                     |
| 50  | www funciona                 | aprovado                             | CNAME preservado                        |
| 51  | MX preservado                | aprovado                             | DNS MX Microsoft                        |
| 52  | fluxo antigo intacto         | aprovado                             | Power Automate                          |
| 53  | alerta 60/30/7               | substituído pela instrução posterior | rotação semanal preventiva; sem Outlook |
| 54  | nenhum `ECO-*`               | aprovado                             | consulta Entra                          |
| 55  | cinco grupos não alterados   | aprovado                             | snapshot/final                          |
| 56  | push main CI/deploy          | aprovado                             | run 32748629808                         |
| 57  | commit inválido bloqueado    | aprovado e limpo                     | run negativo anterior                   |
| 58  | repo sem secrets             | aprovado                             | varredura integral                      |
| 59  | logs sem payload sensível    | aprovado                             | formato de log e inspeção               |
| 60  | página mínima                | aprovado                             | produção mostra só status/identidade    |

Provas extras obrigatórias do redesenho: run 32748356526 rotacionou Graph e Web; run 32747509433 simulou falha e registrou `candidateCleaned:true` e `functionalCredentialPreserved:true`; auditoria tardia confirmou dois certificados; run 32748886048 retornou `not-due` para ambos após remoção dos legados.

## 18. Custo e limites Free

Nenhum serviço pago, cartão adicional, runtime Azure, D1/KV/R2/DO ou Worker/Cron ocioso foi criado. Cloudflare permanece Free. Em 2026-08-24, documentação oficial informa: 500 builds Pages/mês, 1 build simultâneo, 20 minutos por build, 100 custom domains por projeto, 20.000 arquivos e 25 MiB por arquivo; assets estáticos são gratuitos/ilimitados; Functions compartilham Workers Free: 100.000 requests/dia, 10 ms CPU por chamada, 128 MB e 50 subrequests. Fontes: <https://developers.cloudflare.com/pages/platform/limits/>, <https://developers.cloudflare.com/pages/functions/pricing/> e <https://developers.cloudflare.com/workers/platform/limits/>.

## 19. Manutenção, rollback e pendências

Manutenção inevitável: agir se o workflow semanal falhar; rotacionar token Cloudflare ou SESSION_SECRET somente por incidente/política; atualizar dependências quando necessário. Não existe checklist mensal de expiração.

Rollback está detalhado em `MANUTENCAO_BASE.md`: retirar CNAME/custom domain/Pages, revogar token, remover apps/grant/site/repo em ordem controlada. Nunca remover os grupos existentes ou o fluxo antigo.

Pendências reais: nenhuma de fundação. O teste de conta pessoal foi automatizado porque não era necessário criar/usar uma conta pessoal real. O runtime secretless Cloudflare→Entra permanece não suportado/não comprovado; a compensação GitHub OIDC + rotação automática está implantada.

## 19A. Hardening da cadeia GitHub Actions

Em 2026-08-24, todas as Actions externas foram fixadas em commits completos verificados: checkout v7.0.1, setup-node v7.0.0, upload-artifact v7.0.1 e zizmor-action v0.6.2. Checkout deixou de persistir credenciais. O deploy passou a depender também de actionlint 1.7.12 e zizmor 1.29.0; os oito achados iniciais do zizmor foram corrigidos sem suppression. Dependabot semanal tem cooldown de sete dias e não faz automerge.

Além dos pins no YAML, o repositório foi configurado com `sha_pinning_required: true` e `allowed_actions: selected`: Actions GitHub-owned são permitidas e o único padrão externo permitido é `zizmorcore/zizmor-action@*`.

O CI normal continua com `contents: read`; `id-token: write` foi reduzido ao job de rotação. PRs executam testes/scanners sem `environment: production` e sem referência aos secrets Cloudflare. Deploy continua restrito por condição a push em `main`; rotação continua semanal/manual, serial e automática. FIC Entra permanece issuer, audience e subject imutável originais.

Auditoria revelou que os dois secrets Cloudflare estão no escopo do repositório, e não no environment. GitHub confirma somente um colaborador, a conta administradora; PRs de forks e Dependabot não recebem repository secrets. Branch protection e deployment branch policies para repositório privado não estão disponíveis no plano atual. Nenhum valor foi lido, copiado, substituído ou ampliado.

## 20. Terreno pronto

### Pronto

Domínio, HTTPS, login, roles, sessão, BFF, Graph, Sites.Selected, SharePoint, CI/CD, contrato de módulos, feature flags, automações declarativas, read-model pattern, observabilidade, correlação, auditoria e manutenção automática de certificados.

### Ainda não existe

Centro de Administração real, Banco de Notas, painel de professor, painel de aluno, automações de negócio, dashboards acadêmicos e design definitivo.

## RESUMO PARA CONTINUIDADE NO CHATGPT

Data 2026-08-24. Produção `https://admin.escolaieda.com`; Cloudflare Pages Free `ecossistema-escola`, conta `40cef24b2a2a1df8ab3d974dcafb2c03`; GitHub privado `mcpmieda/ecossistema-escola`, `main`, quality gate + supply-chain gate + Wrangler. Actions externas usam SHA completo e Dependabot sem automerge. Tenant `f04e0fa3-b8dc-4f77-be3c-7dfda0635188`. Web client/object `78185e20-c824-4acc-9ccd-41b9f7509a6f` / `0fcc9402-26bb-4c9d-9ccd-eb4f625cf278`. Graph client/object `7d565352-1f77-4a7c-a4a4-4ae1b55b5c0c` / `2d04bd2b-3ef5-4ac6-bd2e-11885a5b3401`. Maintenance client/object `ccaa876c-a453-4eba-b998-cffcd25a4996` / `dc65fd54-ea89-44d0-a2bb-76503de3841c`, GitHub OIDC, no secret. SharePoint Site ID `eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56`; sete listas PLATAFORMA e bibliotecas ARQUIVOS/SNAPSHOTS/RELATORIOS; Graph `Sites.Selected`, CENTROADMIN write, outro site 403. Grupos: Secretaria `6b9be4a5-52a4-4e41-8654-1564f14e5ab5`, Professores `96227794-63b1-421c-96f4-cd062fcdf00a`, Alunos `8255b76e-dd85-4d04-a360-8ce1baf6ce63`, Apoio `74386ce1-2db4-4352-8618-7ab4659ab7b6`, Visitante `9b0283b8-8883-4257-8085-3ac60060d489`. Secrets somente pelos nomes: GRAPH_CREDENTIAL_A/B, WEB_CREDENTIAL_A/B, SESSION_SECRET, GitHub CLOUDFLARE_API_TOKEN/ACCOUNT_ID. Certificados expiram 2027-02-20 e giram automaticamente a 60 dias; token Cloudflare e sessão não têm expiração de provedor. Fluxo antigo de grupos intacto; alerta Outlook cancelado/substituído por rotação semanal. Testes: 53 locais + matriz 60 + actionlint/zizmor + rotações real/failure-safe aprovadas. Custo: zero novo/Free; nenhum Azure runtime. Pendência de fundação: nenhuma. Risco residual GitHub: sem branch protection/deployment branch policy no plano privado atual. Documentos: `docs/RELATORIO_IMPLANTACAO_BASE_ECOSSISTEMA.md`, `ARQUITETURA_BASE.md`, `SEGURANCA_BASE.md`, `DECISOES_ARQUITETURA.md`, `CONTRATO_MODULOS.md`, `CONTRATO_AUTOMACOES.md`, `PADRAO_READ_MODELS.md`, `MANUTENCAO_BASE.md`, `CHECKLIST_AUDITORIA_MANUAL_BASE_ECOSSISTEMA.md`, `COMANDOS_AUDITORIA_SOMENTE_LEITURA.md`.
