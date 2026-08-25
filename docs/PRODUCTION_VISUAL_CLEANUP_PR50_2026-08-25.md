# Evidência de produção — limpeza visual do Centro — PR #50

Data: 2026-08-25

## Estado

A limpeza visual do Centro de Administração foi integrada e implantada em produção.

- PR: `#50 — Visual — limpar Ambient e padronizar shell HeroUI`;
- commit em `main`: `9ae6c49bbfe5f57577537ff480dfc833bddaad8a`;
- workflow pós-merge: `32892663858` — run `#417` — **success**;
- domínio oficial: `https://admin.escolaieda.com`.

## Alterações verificadas

- Ambient Constellation removido fisicamente do código ativo;
- arquivos `src/components/ambient-constellation.tsx` e `src/components/ambient-constellation.css` removidos;
- hooks visuais antigos de Ambient, `pro-spectrum` e `living-aura` removidos do shell ativo;
- fundo geral neutralizado em `#F4F4F5`;
- login e superfícies principais neutralizados;
- busca composta com `SearchField` HeroUI nativo;
- `v1` visual removido da navegação;
- sidebar e topbar alinhadas em 72 px;
- perfil e menu padronizados com `Avatar`/`Avatar.Fallback` HeroUI;
- autenticação, autorização, BFF, Graph, SharePoint, Cloudflare e regras funcionais preservados.

## Contrato semântico

O review do PR identificou corretamente que o contrato anterior ainda exigia o Ambient como background. Antes do merge foram sincronizados:

- `specs/semantic-contract.json`;
- `specs/semantic-assurance.json`;
- `specs/verification-plan.json`.

Novo fingerprint do contrato:

`d363edbc202a646a98c078cc3aee9fc69eec87aec5c8d61802258864a5186c89`

`INV-015`, `AC-017` e `REQ-017` passaram a exigir a ausência do Ambient na interface ativa.

## Gates do PR

Workflow final do PR:

`32892522700` — run `#416` — **success**.

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**;
- formatting — **success**;
- lint — **success**;
- typecheck — **success**;
- semantic check — **success**;
- testes — **success**;
- build — **success**.

Deploy e recovery permaneceram `skipped` no evento de pull request, conforme o desenho do pipeline.

## Gates pós-merge

Workflow de produção:

`32892663858` — run `#417` — **success**.

Jobs:

- `Validate application` — **success**;
- `Validate GitHub Actions security` — **success**;
- `Deploy production` — **success**;
- `Verify recovery after deploy` — **success**.

## Recovery

Artefato:

- nome: `recovery-verification-32892663858`;
- artifact ID: `9580090126`;
- tamanho: `429 bytes`;
- digest: `sha256:1e9aec7d3bc7f6fa51590c3c56b17953f7907ac1f701797b919ea6b39d52b552`;
- expiração prevista: `2026-11-23`.

O recovery comprova o round trip técnico descartável previsto pelo projeto e não representa declaração de disaster recovery completo dos dados operacionais.

## Resultado

A limpeza visual está implantada em produção e o contrato vivo do projeto está alinhado com o comportamento real: **Ambient Constellation ausente da interface ativa**.
