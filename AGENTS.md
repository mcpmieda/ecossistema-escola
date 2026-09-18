# Regras para agentes de IA

Este repositório deve permanecer simples, funcional e rastreável. A prioridade é alterar somente o necessário para o Centro de Administração e para o Banco de Notas, reutilizando a estrutura existente e evitando camadas permanentes sem utilidade comprovada.

## Regras gerais

- Faça a menor mudança suficiente para a issue atribuída.
- Trabalhe em uma branch curta, com uma issue e um pull request por entrega. Uma fase grande pode ter entregas sequenciais; PR parcial não fecha a fase automaticamente.
- Reutilize contratos, componentes e serviços existentes antes de criar novos.
- Não altere branch protection, rulesets, permissões, secrets, ambientes, aplicações Entra, recursos Cloudflare ou Microsoft 365 sem autorização explícita.
- Não crie, invoque, utilize, aplique nem delegue trabalho ao App Factory, Factory Runs, merge trains, orquestradores ou agentes auxiliares, salvo autorização explícita na própria issue.
- Cada issue `[BN]` deve ser executada diretamente pelo agente designado; a issue e a documentação canônica já constituem o fluxo de trabalho.
- Integre e publique entregas concluídas do escopo aprovado sem pedir nova confirmação por PR: autorização contínua de 10/09/2026, #182 comentário `5618750384`, BN-DEC-023. Antes do merge, revise o diff e confirme `npm run verify`/CI no head final; use SHA esperado e o workflow oficial de deploy. Não contorne checks, conflitos ou bloqueadores e não habilite merge incondicional.
- Nunca inclua nomes, notas, arquivos ou outros dados reais de estudantes em código, fixtures, issues, commits, logs ou screenshots. O repositório é público.
- Execute `npm run verify` antes de declarar a entrega pronta. Registre o SHA e o ambiente da execução; CI não é teste manual de produção.

## Hierarquia de agentes e delegação

Objetivo: permitir o uso de vários agentes sem criar arquiteturas concorrentes, regras duplicadas ou diferenças de qualidade entre módulos.

- Toda tarefa com impacto relevante deve ter um **agente líder**. O agente líder é o agente de maior capacidade disponível e explicitamente designado para compreender o problema de ponta a ponta. Na configuração atual, quando a coordenação ocorre via ChatGPT, o papel de líder é exercido por GPT-5.6 Sol, salvo decisão diferente do responsável. Essa designação é operacional e pode mudar no futuro sem alterar a política.
- Ficam reservadas ao agente líder a definição ou revisão de: arquitetura; regras de negócio e acadêmicas; contratos compartilhados; limites entre módulos; autenticação e autorização; modelo de dados, schema e migrations; segurança; comportamento transversal; CI/deploy; integrações externas; produção e qualquer decisão que possa criar um novo padrão para o Ecossistema.
- Jules e outros agentes auxiliares são, por padrão, **agentes executores ou revisores**, não autoridades arquiteturais. Podem implementar código, testes, documentação, refatorações mecânicas e correções localizadas quando o trabalho estiver suficientemente especificado. Só assumem papel de líder quando o responsável os designar expressamente para isso.
- Delegação a outro agente continua sujeita à regra de autorização explícita deste arquivo. Esta seção define **como** delegar com segurança; ela não autoriza, por si só, invocar agentes auxiliares em qualquer issue.
- Antes de delegar implementação, o agente líder deve deixar um handoff durável na issue, comentário ou descrição da tarefa contendo, no mínimo:
  1. objetivo e resultado esperado;
  2. caminhos ou componentes permitidos;
  3. regras e decisões canônicas que governam a mudança;
  4. contratos, invariantes e comportamentos que devem ser preservados;
  5. alterações proibidas e limites de escopo;
  6. testes, comandos e critérios objetivos de aceite;
  7. evidências que o executor deve devolver ao concluir.
- Um executor não deve reinterpretar requisitos vagos, criar arquitetura alternativa, ampliar contratos, mover responsabilidade entre módulos, alterar regras acadêmicas, enfraquecer testes, contornar gates ou “resolver por fora” uma limitação do handoff. Se descobrir que isso é necessário, deve parar nesse ponto e devolver a decisão ao agente líder.
- Trabalho delegado deve atingir o mesmo padrão de qualidade do restante do sistema: tipagem, testes, tratamento de erros, segurança, acessibilidade, nomenclatura, reutilização de contratos e consistência visual não podem ser reduzidos por o executor ser um agente secundário.
- Em trabalho paralelo, prefira escopos de arquivos e responsabilidades não sobrepostos. Dois agentes não devem implementar versões concorrentes da mesma regra de negócio ou do mesmo contrato. Quando houver sobreposição inevitável, o agente líder define previamente a fonte de verdade e faz a integração final.
- A saída de um executor é uma **entrega candidata**, não uma nova autoridade do projeto. Antes da integração, o agente líder deve revisar o diff e conferir coerência com os demais módulos, contratos, decisões canônicas e testes. CI verde não substitui essa revisão transversal.
- Regras de negócio continuam com uma única fonte de verdade. Delegar interfaces, relatórios, Portal, Conselho, Desempenho ou outros consumidores nunca autoriza recriar cálculo, elegibilidade ou interpretação já pertencentes ao núcleo oficial.
- Nenhum papel de agente concede, por si só, autoridade adicional para merge, deploy, produção, secrets, permissões ou infraestrutura. Essas ações continuam regidas pelas autorizações e gates próprios do repositório.

### Modelo mínimo de handoff para outro agente

Use uma especificação equivalente a esta antes de entregar trabalho de implementação:

- **Líder:** agente responsável pela decisão técnica e integração.
- **Executor:** Jules ou outro agente autorizado.
- **Objetivo:** resultado concreto a produzir.
- **Escopo permitido:** arquivos, módulos e operações autorizadas.
- **Fonte de verdade:** issue, decisão, contrato ou implementação canônica aplicável.
- **Preservar:** invariantes, APIs, regras, UX e compatibilidade obrigatórias.
- **Não fazer:** alterações fora do escopo, decisões arquiteturais e atalhos proibidos.
- **Validar:** testes e comandos que devem passar.
- **Entregar:** resumo, diff, testes executados, limitações encontradas e qualquer decisão devolvida ao líder.

## Textos nas interfaces — todo o Ecossistema

Orientação explícita do responsável em 18/09/2026, 00:10 UTC, registrada na #846; aplica-se ao Centro de Administração, Banco de Notas, Portal do Aluno e demais módulos, em correções e novas implantações.

- Não acrescente comentários explicativos, justificativas técnicas, notas sobre correções/implantações ou detalhes internos de cálculo às telas, salvo quando absolutamente necessários para compreender ou executar a tarefa com segurança. Não troque um comentário removido por outro texto, tooltip ou aviso não solicitado.
- Mantenha apenas textos úteis à operação: rótulos, resultados, estados e mensagens indispensáveis. Preserve acessibilidade, avisos essenciais de erro, conflito, indisponibilidade, segurança, perda de dados e confirmações de ações críticas; não faça remoção indiscriminada dessas mensagens.
- Registre razões técnicas, alterações de fórmula, evidências e histórico em issues, PRs e documentação, não como comentários permanentes na interface. Na revisão do diff, confira se cada novo texto visível é realmente necessário.

## Banco de Notas

A construção modular está autorizada e é coordenada por `docs/gradebook/` e pelas issues `[BN]`.

Antes de modificar o Banco, leia nesta ordem:

1. `AGENTS.md`;
2. `docs/gradebook/README.md`;
3. `docs/gradebook/PROJECT_STATE.yaml`;
4. `docs/gradebook/DECISIONS.md`, incluindo as decisões anteriores vinculadas e as substituições BN-DEC-022/023;
5. a issue atribuída;
6. `CONSUMER_MAP.md`, os contratos, o contrato da fonte e a matriz de testes relacionados.

Regras obrigatórias:

- HeroUI React v3 é o sistema visual transversal. Domínio e motor não importam React nem HeroUI.
- O Banco usa o mesmo shell, identidade, autorização, pesquisa e publicação do Centro.
- A Relação do ano é o cadastro mestre; planilhas dos professores são fonte de lançamentos. A reconstrução #613 e seus comentários finais governam o modelo relacional, não o antigo schema streams/versions.
- Não exigir planilha técnica padronizada. O importador reconhece os arquivos reais existentes.
- Importador externo V9 e serviços internos V10/V11 já estão homologados. Não os substituir pelo legado arquivado.
- PostgreSQL/Supabase via Hyperdrive `PROD_DB` é a persistência oficial. Um nome `d1-*` não prova uso físico do D1: verificar rota, composição e SQL antes de retirar código.
- Uma regra acadêmica existe em um único núcleo. Interface, Desempenho, Conselho, Boletins e Relatórios não criam cálculos concorrentes.
- Persistência homologada, motor implementado e autoridade acadêmica aceita são estados diferentes. A #347 registra o aceite por consumidor/escopo; não há ativação ou reinterpretação histórica silenciosa.
- Diagnósticos de importação guardam somente problemas atuais, conforme #629. Histórico acadêmico e decisões humanas permanecem separados e preservados.
- Mudanças em contratos compartilhados exigem issue `[BN][CONTRATO]` própria. Um agente não amplia contrato silenciosamente dentro de outra tarefa.
- Cada issue declara caminhos permitidos. Não altere arquivos fora deles sem registrar a necessidade e aguardar ajuste de escopo.
- Agentes de implementação não editam `PROJECT_STATE.yaml`, salvo quando a issue os nomear como integrador. Distinguir baseline integrada de trabalho na branch e de publicação verificada.
- Ao concluir, registre na issue: estado, commit, arquivos, contratos alterados, testes, pendências e próxima tarefa segura.
- Uma entrega independente só é concluída depois de integrada à `main`, publicada pelo workflow oficial e verificada no site quando houver resultado visível. Limitação de acesso para smoke autenticado/visual deve ser registrada; deploy não equivale a homologação funcional.

## Precedência de decisões

As decisões cronológicas indexadas em `docs/gradebook/DECISIONS.md` são a autoridade do projeto. A primeira decisão oficial permanece quando não existir substituição expressa. BN-DEC-022 consolida substituições aprovadas na #613/#629 e o programa final, sem apagar BN-DEC-001–021. BN-DEC-023 substitui somente a confirmação individual de integração/publicação por autorização contínua condicionada aos gates. `history/` e `Aprendizados/` são memória, não autorização operacional atual.

## Regra de decisão técnica

Quando houver duas soluções válidas, escolha a que preserve os contratos oficiais com menos duplicação, menos serviços, menos automação permanente e menor impacto no repositório. Não recrie tabelas antigas para fazer uma tela passar; registre e resolva a lacuna mínima de contrato/persistência.
