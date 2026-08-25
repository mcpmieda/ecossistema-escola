# GitHub Copilot Code Review — Ecossistema Escolar

## Objetivo

Ao revisar pull requests deste repositório, procure defeitos concretos, regressões, riscos de segurança, inconsistências arquiteturais e violações dos contratos existentes.

Responda em português do Brasil.

Não invente problemas apenas para produzir comentários. Se não houver defeito concreto, não crie falso positivo.

## Fonte técnica de verdade

Antes de sugerir uma mudança que afete arquitetura, segurança, autenticação, release ou contratos, considere principalmente:

- `PROJECT_STATE.md`
- `ARCHITECTURE.md`
- `VERIFICATION.md`
- `specs/semantic-contract.json`
- `specs/semantic-assurance.json`
- `specs/verification-plan.json`
- `docs/PROTOCOLO_VALIDACAO_E_LIBERACAO.md`

Mudanças de código e documentação devem permanecer coerentes entre essas fontes.

## Fundação que deve ser preservada

Não recomendar reconstrução ou substituição da infraestrutura existente sem defeito comprovado.

Preservar:

- Microsoft Entra ID;
- autenticação BFF e sessões HttpOnly;
- autorização server-side por capabilities;
- grupos e roles institucionais;
- Microsoft Graph;
- SharePoint;
- Cloudflare Pages;
- CI/CD;
- recovery pós-deploy;
- rotação automática da identidade técnica;
- contratos modulares e semânticos.

Tratar mudanças não justificadas nesses componentes como risco elevado.

## Segurança

Dar prioridade máxima a:

- bypass de autenticação ou autorização;
- comportamento fail-open;
- exposição de tokens, authorization codes, cookies, secrets, state, nonce ou PKCE verifier;
- credenciais hardcoded;
- permissões excessivas;
- dados sensíveis enviados ao navegador ou logs;
- alteração insegura de headers ou cache em rotas autenticadas;
- operações destrutivas sem validação;
- redução silenciosa de controles de segurança.

Autorização crítica deve permanecer validada no servidor.

Falhas browser-facing não devem revelar JSON interno ou material sensível.

## Qualidade e limpeza de código

Sinalizar quando uma alteração:

- cria código morto;
- duplica lógica já existente;
- mantém implementação antiga após substituí-la;
- cria CSS em camadas para sobrescrever CSS antigo em vez de corrigir a fonte;
- cria funções novas apenas para sobrescrever comportamento legado;
- deixa hacks temporários, flags obsoletas ou compatibility shims sem necessidade;
- aumenta complexidade sem benefício funcional;
- cria duas fontes de verdade para o mesmo estado.

Preferir código original, simples e consolidado.

Uma correção não deve acumular regra sobre regra quando a implementação anterior pode ser removida com segurança.

## Regressões

Verificar se a mudança preserva comportamentos existentes que não fazem parte do escopo do PR.

Dar atenção especial a:

- login;
- callback de autenticação;
- logout;
- múltiplas abas;
- expiração de sessão;
- busca;
- navegação;
- mobile;
- teclado e foco;
- reduced-motion;
- autorização;
- recovery;
- integrações existentes.

## HeroUI e interface

Quando a alteração envolver UI:

- preferir componentes nativos HeroUI v3 já adotados pelo projeto;
- evitar recriar manualmente componentes já fornecidos pelo design system;
- verificar acessibilidade, foco, teclado e contraste;
- verificar desktop e mobile;
- evitar overflow, clipping e sobreposição;
- respeitar `prefers-reduced-motion`;
- preservar Ambient Constellation apenas onde o contrato atual permitir.

Não recomendar mudança puramente estética sem relação com defeito real do PR.

## Contratos e testes

Alteração funcional deve possuir verificação proporcional ao risco.

Sinalizar:

- comportamento novo sem teste quando deveria ser testável;
- teste removido sem justificativa;
- contrato semântico incompatível com a implementação;
- documentação que afirma algo diferente do runtime;
- referência a PR, commit, workflow ou estado antigo como se fosse atual.

Nunca reduzir testes apenas para fazer CI passar.

## Release

O estado `releaseState = validation` é deliberado enquanto não houver liberação humana.

Deploy técnico não significa aprovação oficial.

Não considerar merge, CI verde ou deploy como equivalente ao comando:

`APROVADO PARA PRODUÇÃO`

Mudanças materiais posteriores à validação devem exigir regressão proporcional.

## Formato dos comentários

Priorize comentários acionáveis.

Explique:

1. qual é o defeito;
2. qual consequência real ele pode causar;
3. onde ele ocorre;
4. qual direção de correção é apropriada.

Priorize segurança, correção funcional, perda de dados e regressões acima de preferências de estilo.