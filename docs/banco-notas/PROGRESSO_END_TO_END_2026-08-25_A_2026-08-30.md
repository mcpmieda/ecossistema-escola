# Banco de Notas — progresso end-to-end, decisões e erros

Período consolidado: 25/08/2026 a 30/08/2026

Última atualização: 30/08/2026

Finalidade: permitir auditoria e retomada sem depender do histórico de uma conversa ou de arquivos locais do Codex.

## Resultado acumulado

O Banco de Notas evoluiu de uma fundação isolada para um módulo integrado ao Centro de Administração, com:

- UI HeroUI e rotas canônicas;
- autorização por capabilities no servidor;
- D1 como banco transacional e auditável;
- fontes e autoridade temporal;
- import jobs, findings e análises imutáveis;
- analyzer e serializer `.xlsx` reais;
- turmas, alunos, professores, acompanhamento, pesquisa e pendências;
- modelo genérico, mappings de célula e distinção entre zero e ausência;
- Graph backend-only para geração, armazenamento e compartilhamento controlado;
- add-in distribuído para uma única conta piloto;
- endpoints bearer/ownership/preflight/commit com kill switches;
- CI, Semgrep, proteção de branch, deploy e recovery verificados.

Nenhuma nota acadêmica foi escrita durante a missão de go-live. O primeiro write nunca foi autorizado porque o gate NAA/contexto não passou.

## Linha do tempo consolidada

### Fundação e arquitetura

- O Banco foi implementado como módulo same-origin do Centro, e não como um aplicativo paralelo.
- O contrato fixou D1 para dados estruturados e SharePoint/OneDrive para arquivos.
- GitHub permaneceu fora do caminho de runtime.
- A regra `SyncEnabled=false` por padrão foi preservada desde a criação do modelo.
- Golden masters privados foram usados somente fora do Git como regressão autorizada.

### Pipeline de planilhas

- Foi implementado parser OOXML com limites de tamanho, quantidade de entradas e células.
- Arquivos macro-enabled e relações externas perigosas são rejeitados.
- A análise produz modelo intermediário com turmas, componentes, estudantes, slots de nota, origem de guia/célula e findings.
- Foi implementado serializer do modelo genérico e corrigida a compatibilidade com Excel Online.
- Um ciclo real D1 → Graph → SharePoint → Excel Online → Graph → analyzer foi comprovado em homologação e limpo ao final.
- `.xlsb` permaneceu fail-closed no runtime; Excel COM ficou documentado apenas como ponte administrativa/oráculo de regressão.

### Superfícies administrativas

- Acompanhamento V1 foi implementado e integrado.
- Turmas e Alunos V1 foram implementados, incluindo roster comprovado e diferença entre zero, ausência e snapshot inexistente.
- Professores V1 foi implementado sem expor OID, UPN ou DriveItem.
- Pesquisa Global V1 foi implementada com ranking determinístico, limites e navegação canônica.
- Central de Pendências V1 foi implementada como diagnóstico read-only, sem resolução automática.
- Experiência Cotidiana do Add-in V1 foi implementada e testada sinteticamente.

### Go-live e piloto

- `main`, GitHub Actions, Cloudflare Pages e D1 foram auditados antes das mutações.
- Uma fonte institucional de 2026 foi validada; identidade acadêmica baseada em turma + número sequencial foi preservada.
- Foi criada uma cópia piloto, sem modificar o arquivo original.
- Um modelo, versão, mappings e baselines foram provisionados para o menor escopo autorizado.
- O add-in foi distribuído somente à conta piloto da Secretaria.
- O Excel Online exibiu o grupo `Banco de Notas`, abriu o taskpane oficial e reconheceu suporte a NAA 1.1.
- Consentimento administrativo do escopo próprio da API foi concedido e comprovado.
- As flags globais de sync e commit permaneceram desligadas e as contagens de tentativas continuaram zeradas.

## Erros, diagnósticos e correções

### Rede e GitHub

Erro observado:

- falha temporária de DNS/TCP 443 e credencial `gh` inválida durante uma pausa inicial.

Tratamento:

- nenhuma publicação foi forçada;
- o trabalho foi preservado em worktrees e bundles;
- após restabelecimento, branches foram rebaseadas, publicadas e validadas em CI.

### CI de Acompanhamento

Erros observados:

- teste SQLite sem diretiva correta de ambiente Node;
- diferença de comportamento do SQLite em `ORDER BY` correlacionado.

Tratamento:

- o ambiente do teste foi fixado explicitamente;
- a consulta foi reescrita sem alterar a semântica;
- CI final passou.

### UI e navegação

Erros observados:

- overflow responsivo em tela estreita;
- destino incorreto de navegação para Acompanhamento.

Tratamento:

- contenção responsiva corrigida e revalidada em viewport móvel;
- rota alterada para o destino canônico e coberta por regressão.

### Propagação do add-in

Erro observado:

- o catálogo do Excel não mostrou imediatamente o add-in após a implantação central.

Diagnóstico:

- propagação assíncrona do Microsoft 365; a implantação estava dirigida somente à coorte correta.

Resultado:

- o add-in apareceu posteriormente sem necessidade de distribuição ampla.

### Consentimento Entra

Erro observado:

- o app registration possuía o escopo, mas não havia grant efetivo no service principal.

Tratamento:

- o consentimento foi feito pelo fluxo oficial com Global Administrator;
- Graph confirmou grant `AllPrincipals` somente para o escopo próprio do Banco;
- nenhuma permissão Graph adicional foi concedida ao add-in.

### NAA silencioso pendente

Erro observado:

- `ssoSilent` permaneceu pendente indefinidamente e não chegou ao fallback.

Tratamento:

- foi implementado timeout fail-closed;
- o teste real mostrou que a promessa original continuava ativa no broker e concorria com o popup;
- a estratégia foi simplificada para popup direto no gesto explícito.

### Deploy sem identificadores públicos

Erro observado:

- um deploy automático gerou bundle sem os dois identificadores públicos necessários ao add-in.

Tratamento:

- produção foi restaurada imediatamente com deploy controlado do mesmo SHA;
- workflow e CI passaram a falhar se o bundle não contiver a configuração pública esperada;
- D1 e notas permaneceram intocados durante o incidente.

### Redirects NAA

Erros/hipóteses investigadas:

- taskpane `.html` redirecionado por Cloudflare Pages para URL canônica sem extensão;
- bridge `auth.html` também canonicalizada;
- possibilidade de redirect SPA não coincidir com a URL real de execução.

Tratamento controlado:

- redirects documentados pela Microsoft e URLs canônicas foram adicionados de forma mínima;
- cada alteração foi lida de volta pelo Graph;
- testes de contrato impediram regressão;
- nenhuma dessas correções resolveu o broker no host real.

### Falha final do NAA no Excel Online

Erro observado:

- distribuição central e sideload local reproduziram a mesma falha de login;
- popup não concluiu dentro do iframe do Excel;
- console mostrou `about:blank` bloqueado por sandbox, sem erro MSAL explícito utilizável.

Decisão:

- novas tentativas por hipótese foram interrompidas;
- Office Dialog API e shared runtime foram pesquisados, mas não implementados em produção;
- em 30/08/2026, a direção decidiu concluir a primeira versão por upload manual.

### Inspeção estrutural da planilha autorizada

Erros operacionais observados:

- a primeira abertura Excel COM com a assinatura completa de parâmetros opcionais falhou; a abertura mínima, com `UpdateLinks=0`, `ReadOnly=true`, eventos desligados e macros bloqueadas, funcionou;
- uma varredura célula a célula que também consultava validações foi rejeitada pelo Excel com `RPC_E_CALL_REJECTED`; a consulta foi interrompida e substituída por leituras estruturais menores;
- a primeira regressão privada falhou em `xlsx_component_cell_invalid`, embora o Excel exibisse o componente;
- a inspeção OOXML comprovou que o valor existia em cache, após uma célula vazia autocontida;
- a causa real era o regex do parser: uma célula `<c/>` podia engolir a próxima célula completa;
- a remoção direta da pasta temporária foi bloqueada pela política do ambiente; a cópia foi então movida de forma recuperável para a Lixeira após validar caminho e conteúdo exatos.

Correções e resultado:

- o parser passou a tratar separadamente células autocontidas e células com corpo;
- foi adicionada regressão sintética permanente para impedir retorno desse defeito;
- o perfil institucional foi fixado por estrutura, sem nome de professor: guias `6AVG` a `9CVG`, componente em `K2`, número sequencial em `J`, nome de conferência em `K`, primeira linha 5 e campos consolidados em `R`, `S`, `U`, `V`, `W`, `X`, `Y` e `Z`;
- a prova privada sobre uma cópia `.xlsx` autorizada passou sem imprimir nomes ou notas;
- a cópia temporária foi movida para a Lixeira e o arquivo original permaneceu intocado;
- nenhuma linha D1 foi criada durante essa prova local.

## Decisões de dados tomadas durante a missão

- a fonte institucional de estudantes é a relação oficial de 2026, não um golden master docente;
- a guia `Vínculo Notas` representa o padrão compartilhado pelas planilhas dos professores;
- `RELACAOTURMA*` e `SITUACAOTURMA*` podem orientar leitura de roster/situação;
- estudante é identificado por turma + número sequencial; nome serve para conferência, não como chave;
- quando necessário, uma cópia `.xlsx` deve ser criada; o original `.xlsb` não é alterado;
- a planilha piloto foi uma cópia controlada e autorizada.

## Estado vivo revalidado no pivot

Em 30/08/2026, imediatamente antes do início do Upload Manual V1:

- GitHub `main`: `9c3488bef6e9a925dd69ecc8b2f1f7a4da8fe49f`;
- workflow principal `33325864994`: `success`;
- Cloudflare Pages production deployment: `ba1407f1-5d61-4572-89cf-94d88afa301c`;
- health público do Centro: saudável na última verificação;
- sync global: desligado;
- rota de commit: desligada;
- tentativas e invocações de sync: zero;
- grade events existentes: somente baselines do piloto; nenhum evento de nota novo produzido pela missão;
- worktree: branch isolada `feat/banco-notas-manual-upload-v1`, derivada exatamente da `main` viva.

Na última leitura anterior ao push, D1 também confirmou `import_analysis_profiles=0`, `import_jobs=0` e `import_analyses=0`, com `changed_db=false` e `rows_written=0`.

Este estado deve ser revalidado antes de merge, deploy ou qualquer mutação remota.

## Decisão de encerramento desta fase

O add-in deixa de ser blocker da primeira entrega. O Banco de Notas V1 passa a operar por lotes `.xlsx` enviados manualmente por operador autorizado, com análise, conferência, histórico e promoção explícita. A sincronização automática permanece como evolução futura, não como condição para o produto funcionar.

## Correção pós-deploy: preservação do binding D1

Após o merge do Upload Manual V1, a aplicação e a rota foram publicadas, mas o smoke autenticado encontrou `Banco de Notas storage unavailable`. A leitura do projeto Pages comprovou ausência de `BANCO_NOTAS_DB` em produção, apesar de o D1 continuar existente e íntegro.

O deploy genérico usava o `wrangler.jsonc` raiz, que preservava variáveis públicas, mas não declarava o binding D1 nem as variáveis operacionais do Banco. Assim, cada release posterior ao provisionamento controlado podia publicar Functions sem storage.

O control plane histórico não foi contornado: ele falhou porque exige piloto zero, enquanto o checkpoint canônico já contém exatamente um piloto/modelo/assignment interno preparado, sempre sob kill switches globais desligados. A solução escolhida foi versionar o binding correto no config usado por todos os deploys de `main`, sem remover o piloto e sem relaxar sync/commit.
