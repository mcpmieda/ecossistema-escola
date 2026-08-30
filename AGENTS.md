# AGENTS.md — Ecossistema Escolar

Este repositório é a fonte técnica de verdade do Centro de Administração e dos sistemas incorporados a ele.

## Processo de trabalho

A App Factory **não governa mais este repositório por padrão**. Use-a somente quando o usuário pedir explicitamente para uma tarefa específica.

Para mudanças normais:

1. leia somente o contexto relevante;
2. faça a menor alteração segura que resolva o pedido;
3. use branch/PR;
4. execute validação proporcional ao que mudou;
5. não crie documentação, specs, handoffs, matrizes ou gates extras sem necessidade concreta.

### Validação proporcional

- copy, ícone, layout ou navegação simples: checks locais relevantes;
- código funcional comum: lint, typecheck, testes e build aplicáveis;
- add-in: validar manifesto/build do add-in somente quando arquivos do add-in forem afetados;
- migrations/D1: testar persistência/migration quando essa superfície mudar;
- Entra/Graph/SharePoint/autorização: testar integração e segurança quando essas superfícies mudarem;
- workflows: validar GitHub Actions somente quando workflows/políticas de CI forem alterados.

Specs e documentos antigos da App Factory ou do Banco de Notas são referência histórica até serem consolidados; não são gates automáticos de toda alteração.

## Banco de Notas — regras que permanecem

- Nenhum arquivo real de professor, nome/nota de estudante, token, secret ou exportação institucional deve entrar no Git ou em logs públicos.
- HeroUI React v3 permanece o design system do Banco; Ambient Constellation permanece proibido.
- Rota canônica: `/banco-de-notas`; APIs: `/api/banco-notas/v1/*`.
- Autorização de operações protegidas deve permanecer server-side.
- Frontend não acessa SharePoint/Graph diretamente para dados de negócio.
- Cloudflare D1 permanece a persistência transacional estruturada; SharePoint/OneDrive permanecem armazenamento/versionamento de arquivos.
- Não mesclar silenciosamente fontes concorrentes de notas.
- Ausência de lançamento é ausência/null, nunca zero implícito.
- Mudanças de nota e importações devem preservar origem e rastreabilidade quando aplicável.
- Golden masters privados continuam exclusivamente para regressão autorizada e nunca viram runtime/template/configuração do produto.

## Produção

- Não escrever diretamente em `main`.
- Não alterar secrets, permissões, identidade, migrations destrutivas ou produção implicitamente.
- Deploy continua pelo pipeline do repositório.
- Recovery completo só é obrigatório quando a alteração afetar storage, migration, backup/restore ou mecanismo de recuperação.

## Continuidade

Atualize documentação apenas quando uma decisão de produto/arquitetura realmente mudar ou quando a informação for necessária para retomar o trabalho. Não há obrigação de atualizar `PROJECT_STATE`, handoff, semantic specs ou verification plans a cada alteração.

Mantenha a árvore final sem tentativas descartadas, código morto ou duplicações desnecessárias, mas não transforme correções pequenas em refactors amplos.
