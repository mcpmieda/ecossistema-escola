# Ativação inicial do GitHub Control Plane em produção

## Objetivo

Este registro documenta o acionamento inicial do pipeline de produção após a integração do GitHub Control Plane.

O PR que introduziu o Control Plane foi integrado com validações de pull request aprovadas, porém o evento de `push` gerado pela integração automatizada não criou um GitHub Actions run.

Para preservar o fluxo normal de produção, este commit documental produz um novo `push` versionado na `main` por meio do fluxo regular:

branch -> pull request -> CI -> merge -> push main -> deploy -> recovery.

## Escopo

Este arquivo não altera comportamento da aplicação, infraestrutura, autenticação, permissões, deploy ou dados.

Ele existe como evidência versionada da ativação inicial do pipeline operacional.
