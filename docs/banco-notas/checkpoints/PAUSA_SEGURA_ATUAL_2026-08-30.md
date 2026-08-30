# PAUSA SEGURA ATUAL — Base limpa do Banco de Notas

Atualizado em: 30/08/2026

Status: formatação controlada concluída no código de trabalho e no D1; publicação do novo shell ainda condicionada a PR, CI e deploy canônico.

O checkpoint detalhado e as evidências estão em [FORMATACAO_CONTROLADA_2026-08-30.md](FORMATACAO_CONTROLADA_2026-08-30.md).

## Estado seguro live

- D1 de produção sem registros de negócio ou piloto nas 28 tabelas verificadas;
- schema e migrations preservados;
- `sync_enabled=0`;
- `commit_route_enabled=0`;
- gatilhos append-only de eventos e auditoria presentes;
- SharePoint/Graph, Entra e add-in não alterados;
- backup D1 externo e archive do código anterior disponíveis para recuperação.

## Estado Git

- baseline `main`: `fc24abea43d22bd4a1e3be0a8a6bccbc05cc9cfb`;
- branch: `refactor/banco-notas-clean-slate`;
- o conteúdo desta branch não está em produção enquanto não for integrado pelo fluxo protegido.
