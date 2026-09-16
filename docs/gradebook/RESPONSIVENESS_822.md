# Responsividade e carregamento incremental — #822 / PR #821

Base: `main@16d76d88b0c5cc7acc6f0fc08b691bbb4feaf2a5`. Pedido de continuidade em 16/09/2026. Escopo: Painel do Aluno e Desempenho do Banco de Notas, incluindo os dois screenshots fornecidos pelo responsável. Não se trata de homologação visual executada pelo agente.

## Diagnóstico e correção

O HeroUI mantém um `tabs__list-container__scroller` entre o contêiner e a lista, e o estilo nativo do tab usa largura total. Os seletores antigos esperavam uma lista diretamente no contêiner; impedir o encolhimento dos tabs sem retirar `width: 100%` fazia cada item ocupar uma faixa inteira. A primeira versão do PR estava restrita ao Painel e não corrigia o Desempenho. A continuação adiciona CSS compartilhado para as listas horizontais das duas superfícies, alcançando o scroller real e usando largura natural nos itens. Preserva o ScrollShadow e os controles nativos de overflow, foco, teclado e redução de movimento. Não transforma a seleção em um Select.

O dashboard usa a largura útil do Painel: três colunas como base, duas abaixo de 700 px de conteúdo e seis somente a partir de 1280 px. O número de colunas não é mais decidido pela janela incluindo a sidebar. Os painéis aninhados de turma/área não acumulam padding e margem superiores desnecessários.

As listas comuns não aguardam mais acumular 1000 registros. O hook entrega uma primeira página de até 100 e mais uma página por aproximação ao fim, inclusive quando a página filtrada está vazia. Contagens parciais não são tratadas como coleção concluída: o cursor permanece. A revalidação mantém o resultado anterior visível e limita a reconstrução à janela visitada. A história de cursores pertence à mesma carga/identidade e detecta ciclos entre continuidades, não apenas dentro de uma chamada. Cursores antigos são reconstruídos desde o início. Dados, cursores e seleções não são persistidos no navegador.

Nascimento conserva as duas leituras paralelas e seus cursores distintos/CAS; tanto a carga inicial como o incremento usam 100 linhas, e a revalidação não antecipa 1000 linhas não visitadas. Rascunhos, confirmação, revisão, limites de QR/PDF, permissões e isolamento permanecem intactos.

## Evidências e limites

A primeira CI do PR, run 35135605892, falhou em dois testes de UI que aguardavam o aluno 105 diretamente na abertura. Foram mantidos os fluxos de ficha e limite de PDF, mas a continuação passou a ser acionada explicitamente por um IntersectionObserver sintético. Não foram aumentados os timeouts para ocultar a mudança de comportamento.

As regressões adicionadas exercitam componentes HeroUI reais em JSDOM, correspondência do CSS ao scroller nativo, largura CSS dos itens, teclado com ativação manual e manutenção da turma. Elas não medem geometria de um navegador. Os testes de leitura cobrem primeira resposta independente de uma continuação lenta, 105/1005 registros, revalidação sem substituir a tela por 100 linhas, páginas vazias, ciclos entre appends e reconstrução de cursor expirado. Nascimento cobre o alcance dos 1005 registros, pares de cursores e bloqueio de leitura durante rascunho incompleto.

Browser plugin ausente. A tentativa de Playwright/Chromium em `https://admin.escolaieda.com/#/painel-do-aluno`, viewport 1440×900, retornou `net::ERR_BLOCKED_BY_ADMINISTRATOR` antes da renderização; não houve contorno. Clone local falhou por resolução DNS. Portanto, execução completa é comprovada pela CI oficial no SHA final, e não por um verify local alegado. Desktop/mobile autenticados, console do site e latência real continuam distintos do gate de build/deploy. Não há percentual ou tempo de aceleração produtiva medido.

Nenhuma alteração de dependências, workflow, infraestrutura, schema, contratos acadêmicos, ACL, segredos ou dados de produção. Merge e publicação somente após revisão e gates verdes no SHA final, conforme BN-DEC-023. O status efetivo deve ser consultado no PR e nos workflows oficiais.
