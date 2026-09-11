# Retirada dos frontends antigos não montados — #666 / PR #667

## Base e prova de dependência

A entrega parte de `main@dc8005e7911b1dbfda914345a8c194987b6ebc22`, depois da integração da #664/PR #665 e do deploy 268 (`34602595928`). A inspeção considerou a composição efetiva do shell, imports de produção, clientes, rotas e testes. Sufixos `V1`, `V2` ou nomes históricos, isoladamente, não foram usados como prova de obsolescência.

O shell ativo monta as superfícies relacionais de Centrais, Desempenho, Conselho, Boletins e Relatórios. Os clusters anteriores dessas cinco áreas não tinham import de produção, não eram fallback e não eram alcançados pela navegação. Foram retirados:

- página e cliente antigos de Operational Workspace;
- página, cliente, gráficos, comparação e clientes V3/V4 antigos de Desempenho;
- página, cliente e painel institucional antigos de Conselho;
- página e cliente antigos de Relatórios;
- cliente antigo de Boletins e ações PDF V1 sem chamador;
- helper legado de ano letivo, já substituído pelo contexto fixo 2026.

As regressões que testavam exclusivamente essas implementações foram removidas. As regressões de integração agora apontam para os hooks, páginas e componentes ativos. Um teste de aposentadoria exige a ausência física dos 19 módulos e comprova a composição atual.

## Limite preservado

Nenhum endpoint, handler, contrato compartilhado, serviço, adapter, tabela, migration ou dado foi retirado. As operações V1 ainda aceitas nos endpoints existentes permanecem por compatibilidade externa, mesmo sem frontend montado. Sua remoção exige inventário próprio de consumidores externos.

O renderizador PDF V1 permanece porque `bulletin-pdf-renderer-v2.ts` o reutiliza. As ações PDF V1 retiradas não eram essa dependência. A Auditoria Atual V2 e o núcleo de Auditoria V1 ainda consumido por Relatórios V1 também permanecem.

Não há DDL/DML, alteração de 2026, comparação entre anos, regra acadêmica, autoridade, binding, segredo ou configuração de produção. A trilha humana durável da Auditoria, recuperação operacional gerenciada, piloto #406, aceite #347 e validação visual conjunta permanecem gates separados.
