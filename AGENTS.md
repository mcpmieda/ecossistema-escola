# Regras para agentes de IA

Este repositório deve permanecer simples. A prioridade é alterar somente o necessário para o Centro de Administração e para integrações explicitamente solicitadas.

## Limites obrigatórios

- Faça a menor mudança suficiente para atender ao pedido atual.
- Reutilize a estrutura existente antes de criar qualquer nova camada.
- Não crie GitHub Actions, pipelines de CI/CD, automações, merge trains, App Factory, Factory Runs, orquestradores, agentes auxiliares ou mecanismos de governança sem autorização explícita do responsável.
- Não crie nem altere regras de proteção de branch, required checks, rulesets, permissões, secrets, ambientes ou políticas do GitHub sem autorização explícita.
- Não crie infraestrutura, serviços, bancos, bindings, filas, workers, aplicações Entra, recursos Cloudflare ou recursos Microsoft 365 "para o futuro" sem necessidade direta e autorização explícita.
- Não crie documentação operacional extensa, issues, tarefas de homologação, branches permanentes ou artefatos de auditoria apenas por precaução.
- Não recrie componentes, rotas, dados, documentação ou infraestrutura removidos do Banco de Notas.
- Não transforme uma integração simples de aplicativo em um projeto de governança ou plataforma.

## Ao integrar um aplicativo

- Integre somente o necessário para o aplicativo funcionar dentro do ecossistema atual.
- Preserve o Centro de Administração e seus contratos existentes.
- Adicione apenas rotas, links, permissões, configurações e código indispensáveis à integração solicitada.
- Testes diretamente relacionados à mudança são permitidos quando necessários, mas não devem introduzir novos pipelines, políticas ou camadas de governança.
- Qualquer ampliação estrutural que ultrapasse a integração pedida deve ser apresentada ao responsável antes de ser implementada.

## Regra de decisão

Quando houver duas soluções tecnicamente válidas, escolha a que tiver menos arquivos, menos serviços, menos automação permanente e menor impacto no repositório.
