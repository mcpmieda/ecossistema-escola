# Configuração docente relacional — #660

## Decisão vigente

Em 2026, professor, componente e oferta são cadastros materializados pelo importador a partir das planilhas reconhecidas. `CONFIGURAÇÃO!A2` identifica o professor; cada grupo de guias informa turma e componente; a oferta canônica continua `ano + turma + disciplina + professor`. A aplicação não mantém um segundo cadastro manual paralelo.

O schema simplificado não contém os campos de nomes alternativos, confirmação, vigência ou versão usados pela manutenção V1. Acrescentá-los apenas para reativar aquela interface criaria uma autoridade cadastral nova e uma falsa equivalência. Por isso, a adaptação correta é a Central relacional somente leitura: pesquisa professor/turma/componente, abre o cadastro e mostra todas as ofertas reconhecidas em 2026.

## Ordem de apresentação

O catálogo observado em `CONFIGURAÇÃO`/`CONFIGURAÇÕES!H3:I16` define a sequência P, M, H, G, C, A, RL, RD, F, ET, I e CT. A mesma função compartilhada ordena agora Desempenho, Boletins, projeção anual e ofertas das Centrais. Acentos, caixa e espaços são normalizados. Um componente desconhecido fica depois dos conhecidos, em ordem textual estável; não recebe sigla nem posição inventada.

Essa ordem é apresentação, não identidade acadêmica. A tabela de notas continua sem arraste manual de colunas.

## Transporte e segurança

`contractVersion: 2` permanece exclusivamente read-only e restrito a 2026. O antigo payload `maintenanceVersion: 1` não é mais servido pelo endpoint operacional: após autenticação e autorização, ele é recusado como requisição inválida antes de instanciar o runtime de entidades/versões ou tocar seu binding. Depois de confirmar por busca estática que só se referenciavam entre si e por testes de não montagem, os arquivos de UI, cliente e aplicação exclusivos dessa manutenção foram removidos; seu histórico continua no Git. As operações V1 de leitura permanecem compatibilidade apenas para consumidores ainda comprovados; não são fallback do V2.

Nenhuma migration, DDL/DML produtivo, alteração de importador, regra acadêmica ou troca de autoridade faz parte da #660. Para alterar professor, turma, componente ou oferta, corrige-se a fonte e reaplica-se a Importação, preservando o fluxo único já homologado.

## Interface HeroUI

A Central usa cabeçalho compacto sem o card grande “Banco de Notas”, KPIs pequenos com cor funcional, `Select` HeroUI, pesquisa, item cards e cards de oferta com sigla, turma e professor. Os controles não mudam de posição quando o contexto carrega. O desenho deriva dos padrões públicos Widget/KPI/Item Card do HeroUI Pro, mas é implementado com o HeroUI OSS já instalado; não copia pacote ou código proprietário.

## Evidência e limites

Testes cobrem ordem conhecida/desconhecida, Centrais PostgreSQL, paginação/concatenação no cliente, projeção anual, recusa HTTP do transporte antigo antes de armazenamento, ausência de select HTML escrito pela aplicação, auth, no-store e ausência de DML. A inspeção no BrowserAct e o smoke autenticado final desta entrega são somente leitura. A rodada visual conjunta com o responsável continua separada e será anunciada antes de começar.
