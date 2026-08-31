# Regras para agentes de IA

Este repositório deve permanecer simples, funcional e rastreável. A prioridade é alterar somente o necessário para o Centro de Administração e para o Banco de Notas, reutilizando a estrutura existente e evitando camadas permanentes sem utilidade comprovada.

## Regras gerais

- Faça a menor mudança suficiente para a issue atribuída.
- Trabalhe em uma branch curta, com uma issue e um pull request por entrega.
- Reutilize contratos, componentes e serviços existentes antes de criar novos.
- Não altere branch protection, rulesets, permissões, secrets, ambientes, aplicações Entra, recursos Cloudflare ou Microsoft 365 sem autorização explícita.
- Não crie, invoque, utilize, aplique nem delegue trabalho ao App Factory, Factory Runs, merge trains, orquestradores ou agentes auxiliares, salvo autorização explícita na própria issue.
- Cada issue `[BN]` deve ser executada diretamente pelo agente designado; a issue e a documentação canônica já constituem o fluxo de trabalho.
- Não execute merge ou publicação por conta própria, salvo quando a issue declarar expressamente essa autoridade.
- Nunca inclua nomes, notas, arquivos ou outros dados reais de estudantes em código, fixtures, issues, commits, logs ou screenshots. O repositório é público.
- Execute `npm run verify` antes de declarar a entrega pronta.

## Banco de Notas

A construção modular do Banco de Notas está explicitamente autorizada e é coordenada por `docs/gradebook/` e pelas issues `[BN]`.

Antes de modificar o Banco de Notas, leia nesta ordem:

1. `AGENTS.md`;
2. `docs/gradebook/README.md`;
3. `docs/gradebook/PROJECT_STATE.yaml`;
4. `docs/gradebook/DECISIONS.md`;
5. a issue atribuída;
6. os contratos, o contrato da fonte e a matriz de testes relacionados.

Regras obrigatórias:

- HeroUI React v3 é o sistema visual transversal. O domínio e o motor nativo não importam React nem HeroUI.
- O Banco usa o mesmo shell, identidade, autorização, pesquisa e publicação do Centro de Administração.
- A fonte operacional inicial são as planilhas atuais dos professores; o arquivo `BANCO DE NOTAS 2026.xlsb` é referência funcional. Outras fontes ficam fora do escopo inicial.
- Não exigir planilha técnica padronizada. O importador reconhece os arquivos reais existentes.
- O motor nativo é construído junto com o Banco, em paralelo à preservação e conferência do resultado importado.
- Uma regra acadêmica existe em um único lugar no domínio. Interface, Desempenho, Conselho, Boletins e relatórios não criam cálculos concorrentes.
- Mudanças em contratos compartilhados exigem issue `[BN][CONTRATO]` própria. Um agente não amplia contrato silenciosamente dentro de outra tarefa.
- Cada issue declara caminhos permitidos. Não altere arquivos fora deles sem registrar a necessidade e aguardar ajuste de escopo.
- Agentes de implementação não editam `PROJECT_STATE.yaml`, salvo quando a issue os nomear como integrador. O integrador atualiza o estado depois do merge.
- Ao concluir, registre na issue: estado, commit, arquivos, contratos alterados, testes, pendências e próxima tarefa segura.
- Uma entrega independente só é considerada concluída depois de integrada à `main`, publicada pelo workflow oficial e verificada no site quando houver resultado visível.

## Precedência de decisões

As decisões cronológicas em `docs/gradebook/DECISIONS.md` são a autoridade do projeto. Quando duas instruções divergirem, prevalece a primeira decisão oficial. Uma decisão posterior somente substitui a anterior quando declarar explicitamente a revogação ou substituição.

## Regra de decisão técnica

Quando houver duas soluções válidas, escolha a que preserve os contratos oficiais com menos duplicação, menos serviços, menos automação permanente e menor impacto no repositório.
