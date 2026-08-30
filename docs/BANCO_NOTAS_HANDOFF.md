# Banco de Notas — Handoff

## Retomada atual

O Banco de Notas é um módulo do `ecossistema-escola`, acessível em `/banco-de-notas`.

O caminho operacional inicial para receber conteúdo de planilhas é o **upload administrativo de uma cópia XLSX**, com análise e proveniência. A sincronização automática pelo add-in não é requisito atual e não deve ser retomada por iniciativa do agente.

## Como trabalhar daqui em diante

Para pedidos comuns do Banco:

1. leia apenas o código/documentação diretamente relacionados ao pedido;
2. implemente a menor mudança segura;
3. use branch/PR;
4. rode os checks normais do repositório;
5. execute validações especiais somente se o diff tocar a superfície correspondente.

Não existe próximo “gate obrigatório” geral. Não retome automaticamente antigas sequências de homologação de Entra, Graph, Excel, D1, Semantic Assurance, Merge Train ou App Factory.

## Regras que devem continuar preservadas

- dados reais, notas, tokens e secrets não entram no Git/logs públicos;
- autorização protegida permanece server-side;
- D1 permanece o store transacional estruturado;
- SharePoint/OneDrive permanecem armazenamento/versionamento de arquivos;
- ausência de nota é diferente de zero;
- fontes de notas concorrentes não são combinadas silenciosamente;
- golden masters privados não entram no produto;
- HeroUI permanece no Banco e Ambient Constellation permanece proibido.

## Validação

A política vigente está em `VERIFICATION.md` e `specs/banco-notas/verification-plan.json`: validação proporcional ao que mudou.

## Histórico

Branches, PRs, provas de homologação, tentativas de add-in/NAA, runs de CI e marcos anteriores continuam disponíveis no histórico do Git e nos documentos específicos em `docs/`. Eles são referência histórica, não uma fila de trabalho pendente.
