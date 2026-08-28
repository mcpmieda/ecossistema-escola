# Banco de Notas — Homologação runtime NAA, ownership e atomicidade D1

Data: 28/08/2026

Branch: feat/banco-de-notas-foundation

PR: #52 — open, draft, sem merge e sem produção.

## Resultado

Status geral: **BANCO_NOTAS_RUNTIME_HOMOLOGATION_PASSED**.

O add-in carregado no Excel Online inicializou Office NAA 1.1, obteve um access token delegado institucional e o enviou como bearer para uma rota temporária isolada em Cloudflare Pages Functions. A resposta sanitizada confirmou todos os gates sem registrar token, identificadores pessoais ou PII.

## Token e ownership

- token v2: aprovado;
- tenant, issuer, audience e scope: aprovados;
- authorized party e lifetime: aprovados;
- presença de OID: aprovada, valor não persistido;
- ownership correto: aceito;
- ownership de outro professor: rejeitado;
- modelo inexistente: rejeitado;
- professor inativo: rejeitado;
- sync desabilitado: rejeitado com zero escritas.

## Atomicidade pelo binding D1 real

Runtime: Cloudflare Pages Functions.

Database: banco-notas-homologation.

Binding: BANCO_NOTAS_DB.

Método: D1Database.batch().

- positivo: evento e snapshot inseridos;
- negativo: falha controlada observada;
- escritas parciais do evento negativo: zero;
- snapshot positivo preservado após a falha;
- rollback pelo binding real: aprovado.

## Estado final e isolamento

- teacher_models.sync_enabled=0;
- source_assignments.sync_enabled=0;
- fixtures negativas removidas;
- identidade temporária não foi criada: a identidade autorizada já existente foi reutilizada;
- redirect temporário auth.html do preview removido do Entra;
- dois redirects institucionais preservados;
- uma declaração de acesso da própria API preservada;
- zero passwords e zero certificados;
- nenhum deploy de Worker de produção;
- Pages de produção inalterado;
- D1 de produção inalterado.

## Execução isolada

- workflow runtime: 33160734080 — success;
- artefato runtime: 9681522688;
- deployment Pages temporário: 239e9bc8-d504-41e1-8d15-d2b092039872;
- URL temporária: https://239e9bc8.ecossistema-escola.pages.dev;
- limpeza do preview: pendente neste registro inicial e acionada automaticamente pelas evidências.

## Evidências sanitizadas

- docs/evidence/BancoNotas-Bearer-Ownership-Homologation-2026-08-27.json;
- docs/evidence/BancoNotas-D1-Binding-Atomicity-Homologation-2026-08-27.json.

As evidências contêm somente estados booleanos, identificadores operacionais do deployment e resultados técnicos não pessoais. Não contêm bearer, refresh token, UPN, e-mail, nome, OID, account ID ou segredo.
