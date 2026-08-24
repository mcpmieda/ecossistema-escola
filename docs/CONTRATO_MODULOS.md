# Contrato de módulos

O schema executável está em `server/modules/contracts.ts`. Todo módulo futuro deve declarar:

| Campo            | Regra                                   |
| ---------------- | --------------------------------------- |
| `key`            | minúsculo, estável, sem espaços         |
| `name`           | nome legível                            |
| `baseRoute`      | rota iniciada por `/`                   |
| `version`        | semver `x.y.z`                          |
| `status`         | `installed`, `disabled` ou `deprecated` |
| `order`          | inteiro não negativo                    |
| `roles`          | subconjunto da allowlist institucional  |
| `healthEndpoint` | rota `/api/*`                           |

O único módulo registrado é `plataforma-base` 1.0.0. Um módulo futuro deve passar o schema, criar sua migration idempotente, registrar o catálogo SharePoint, declarar feature flags e read models próprios e adicionar testes de autorização. Nenhum módulo pode acessar SharePoint diretamente pelo browser.
