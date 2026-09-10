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
