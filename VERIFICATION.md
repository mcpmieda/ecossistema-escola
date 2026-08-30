# VERIFICATION — Ecossistema Escolar

## Política atual

A verificação é **proporcional à alteração**. Não existe mais um ritual único de release aplicado a qualquer mudança do Banco de Notas ou do Centro de Administração.

## Padrão para PR comum

O fluxo normal cobre:

1. formatação;
2. lint;
3. typecheck da aplicação;
4. testes;
5. build da aplicação.

Os dois checks preservados pela proteção de `main` são:

- `Validate application`;
- `Validate GitHub Actions security`.

## Verificações condicionais

Execute validações adicionais somente quando houver relação direta com o diff:

- **Add-in Office.js** — manifesto, typecheck e build do add-in quando `addin/banco-notas/**` ou sua configuração mudar.
- **D1/migrations** — testes de migration, constraints, idempotência e recovery quando persistência ou schema mudar.
- **Entra/Graph/SharePoint** — integração/autorização quando código ou configuração dessas integrações mudar.
- **GitHub Actions** — actionlint/zizmor quando workflows forem alterados.
- **Recovery** — somente para mudanças em storage, migrations, backup/restore ou mecanismo de recuperação; o workflow manual continua disponível.
- **Produção** — deploy continua gerando o bundle completo para preservar a aplicação e o add-in já publicados.

## O que deixou de ser obrigatório por padrão

- Project Adoption Gate;
- Semantic Assurance/Verification;
- Independent Verification;
- Merge Train e reviewers múltiplos;
- Browser QA completo para alteração não visual;
- Graph/Excel/D1/recovery para mudança que não toca essas superfícies;
- atualização de documentos de evidência a cada PR.

## Segurança mínima permanente

A simplificação não elimina controles concretos:

- secrets e dados pessoais não entram no repositório/logs públicos;
- autorização protegida permanece server-side;
- operações destrutivas e mudanças de privilégio exigem autorização explícita;
- migrations e alterações de produção devem continuar reversíveis e verificáveis;
- nunca declarar como executado um teste que não foi executado.

## Histórico

Evidências detalhadas de homologações anteriores permanecem recuperáveis no histórico do Git e nos documentos específicos em `docs/`. Elas são histórico técnico, não gates automáticos para novos trabalhos.
