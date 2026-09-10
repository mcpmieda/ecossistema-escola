# Contexto, pesquisa e Centrais relacionais V2

Contrato e escopo: #639, entrega da FINAL-1 #633, PR #640. Base integrada: #636, `4d8256fa6f741f4fb0b6ade8676d0f9193b7a460`; deploy oficial 254 aprovado. O código desta página pertence à branch da #640 até sua integração e publicação autorizadas.

## Jornada entregue

Banco de Notas → Centrais → Carregar Centrais → selecionar explicitamente o ano → consultar o resumo cadastral → pesquisar aluno, turma, professor ou componente → abrir a central → navegar pelos vínculos e ofertas. O ano não é escolhido pelo relógio nem pela posição no catálogo.

A Relação continua cadastro mestre anual. Na busca, pessoas com nomes iguais continuam registros distintos. A central do aluno mostra vínculos atuais e históricos, números em cada turma e informação de Conselho anterior, incluindo “Não informado”. As ofertas dessa central são as da turma atual. A central da turma mostra seu cadastro, vínculos e ofertas; professor e componente mostram suas ofertas no ano.

Situação 6 é posição histórica; situação 7 é posição atual com turma de origem relacionada. Assistido, especial, desistente, transferido e falecido permanecem identificados sem inventar resultado anual. Posição atual **não é** elegibilidade acadêmica nem população de indicadores. Os números do resumo são contagens cadastrais, não métricas de desempenho.

## Contrato e caminho real

`src/platform/gradebook-operational-surface.tsx` → `relational-workspace-page-v2.tsx` → `use-relational-workspace-v2.ts` → `operational-workspace-client-v2.ts` → POST `/api/gradebook/operational-workspace` → dispatch `contractVersion: 2` em `operational-workspace-routes-v1.ts` → `createRelationalWorkspaceV2` → tabelas atuais.

O contrato está em `shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2.ts`. Operações: `bootstrap`, `context`, `search`, `center`. O transporte V1 não foi alterado. O caminho V2 não instancia o runtime antigo de entidades/versões e não faz fallback para D1.

IDs são inteiros positivos existentes e sempre escopados pelo ano. Não existem campos artificiais de lifecycle, versões de entidade, shortName ou data da situação. Os parâmetros anuais vêm de `ano_letivo`; não são uma nova cópia de regra acadêmica.

## Leitura, limites e concorrência

Cada chamada usa a mesma conexão/transação com `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY` antes da primeira consulta. Contexto, entidade, vínculos e ofertas de uma resposta compartilham o snapshot. Isso não congela resultados de requisições posteriores: uma nova importação pode alterar o catálogo entre páginas; atualizar a busca inicia uma leitura nova.

Não há consulta por aluno ou por oferta. Contagem de instruções do serviço, incluindo o SET (mas não BEGIN/COMMIT): bootstrap 2; contexto 3; busca 3; central aluno/turma até 5; professor/componente até 4. A latência real de rede/Hyperdrive e os planos produtivos não foram medidos por esses limites.

Página até 200 itens por lista, offset até 100.000, consulta textual até 80 caracteres e corpo HTTP até 16.384 bytes. O navegador pede páginas de 100. Cada consulta busca uma linha adicional para decidir `nextOffset`. Detalhes paginam vínculos e ofertas com o mesmo offset, cada lista em ordem própria; só termina quando ambas acabarem. Limite excedido não é truncado como sucesso. Bootstrap admite até 200 anos cadastrados; excesso resulta em indisponibilidade explícita. Busca literal por nome/código, sem curingas SQL, fuzzy, ranking pedagógico ou unificação de homônimos.

## Interface e segurança

HeroUI e shell existentes; tela somente leitura. O cliente valida formato, operação, ano, entidade e tamanho/paginação das respostas antes de exibi-las. Mudanças de ano/filtro/navegação invalidam a requisição anterior e descartam respostas atrasadas. Perda de autorização limpa os dados carregados. Nada é gravado em armazenamento persistente do navegador.

Autenticação Entra/capability existente, origem oficial, bloqueio de POST de outra origem e gate de produção permanecem no backend. Erros são opacos e respostas usam `no-store`. Falha de rede não vira “nenhum resultado”. Não há operação de escrita no V2.

A manutenção docente anterior fica preservada em código, mas não é montada nessa central relacional; a interface informa que a edição ainda aguarda adaptação. Seus testes legados não constituem evidência da nova tela. Outros consumidores V1 ainda existentes exigem migração própria, não uma equivalência presumida com V2.

## Evidências e limites de aceite

Os testes usam a baseline integral reconstruída em PGlite, o facade PostgreSQL e sessões sintéticas seladas para o handler HTTP. Verificam ano/identidade, homônimos, movimentos, paginação acima de 200 registros, tipos/limites, ausência de DML, configuração efetiva da transação e respostas 401/403/404/503. Os testes de React/cliente exercitam cancelamento, respostas antigas, perda de sessão, páginas e ação real de abertura do catálogo com HeroUI em jsdom.

Isso não é um teste visual em navegador, medição mobile, contenção PostgreSQL multi-sessão nem homologação autenticada produtiva. A sessão não dispõe de Browser e o container não resolve GitHub/npm para iniciar o app com Playwright; a validação executável ocorre no workflow existente. Registrar resultado final de `npm run verify` e SHA na PR, sem inferir CI verde do texto deste documento.

Ainda faltam neste programa: manutenção cadastral/gestão de anos, contexto anual compartilhado por todas as áreas, resultados/Desempenho, Boletins/Relatórios, Conselho e piloto integral. Não modifica regras do motor, schema, dados, dependências npm ou autoridade acadêmica. #637 permanece a remediação de dependências, separada desta entrega.
