# Padrão de read models

Read model é um resumo preparado para uma tela, evitando que cada carregamento faça muitas consultas Graph. Nesta fundação foi definido o padrão; nenhum resumo acadêmico foi criado.

Cada módulo futuro deve:

1. possuir read model próprio e versionado;
2. armazenar somente o mínimo necessário no SharePoint institucional;
3. incluir `geradoEmUTC`, versão, origem e correlation ID;
4. ser reconstruível a partir dos dados oficiais;
5. respeitar papéis e não ser compartilhado entre perfis incompatíveis;
6. usar ETag para atualização concorrente;
7. definir validade explícita e fallback seguro;
8. nunca conter token, cookie, segredo ou documento completo.

A API agregadora deve preferir uma resposta curta por página. Graph batching pode agrupar até 20 leituras independentes; paginação e retries permanecem no adapter central. Cache público não é permitido para respostas autenticadas.
