# Contrato de módulos

## Regra central

Um item em `PLATAFORMA_MODULOS` significa **módulo registrado no inventário institucional**. Isso, sozinho, não significa que o módulo está integrado, disponível ou autorizado no Centro.

Um módulo só é tratado como integrado quando existe também um manifesto versionado válido em `server/modules/contracts.ts` e o registro operacional é compatível com esse manifesto.

## Fonte de verdade por responsabilidade

- `server/modules/contracts.ts`: contrato de integração que o Centro sabe montar e autorizar;
- `PLATAFORMA_MODULOS`: inventário operacional dos módulos registrados;
- política de capabilities: autorização efetiva no servidor;
- módulo especializado: fonte de verdade das próprias regras de negócio.

O Centro não copia regras internas do módulo para o núcleo.

## Manifesto de integração v1

Todo módulo integrado deve declarar:

| Campo | Regra |
| --- | --- |
| `contractVersion` | versão explícita do schema do manifesto; atualmente `1` |
| `key` | minúsculo, estável, sem espaços |
| `name` | nome legível |
| `baseRoute` | caminho absoluto same-origin iniciado por `/`, nunca `//` ou barra invertida |
| `version` | semver `x.y.z` |
| `status` | `installed`, `disabled` ou `deprecated` |
| `order` | inteiro não negativo |
| `requiredCapabilities` | capabilities explícitas, válidas e sem duplicatas |
| `healthEndpoint` | caminho same-origin sob `/api/` |

O único manifesto integrado atualmente é `plataforma-base` 1.0.0.

## Estados de integração

O BFF compara o registro SharePoint com o manifesto versionado e deriva um estado:

- `ready`: registro instalado, manifesto presente e campos críticos compatíveis;
- `registry-only`: existe registro, mas não existe manifesto integrado no código;
- `contract-mismatch`: rota, versão ou health endpoint divergem do manifesto;
- `disabled`: registro explicitamente desabilitado;
- `deprecated`: registro explicitamente depreciado;
- `invalid-registry`: estado do registro não é reconhecido.

`available = true` somente quando o estado é `ready` **e** a sessão possui todas as `requiredCapabilities` do manifesto.

## Compatibilidade e `RolesJson`

A coluna histórica `RolesJson` continua fisicamente presente em `PLATAFORMA_MODULOS` porque removê-la exige migração de schema separada.

Ela está **fora do caminho ativo** da v0.7:

- o BFF não solicita `RolesJson` ao Graph ao compor o snapshot;
- o read model não possui campo `roles`;
- `RolesJson` não concede capability;
- `RolesJson` não transforma `registry-only` em `ready`;
- a busca não indexa papéis legados.

Condição objetiva para remover a coluna: executar uma migration de schema SharePoint versionada, com verificação de consumidores e recovery proporcional. Até lá, a coluna é legado inerte, não compatibilidade de autorização.

## Incorporação de um módulo futuro

Um módulo futuro deve, no mesmo bloco de integração:

1. declarar manifesto v1 válido;
2. declarar suas capabilities na política institucional apropriada;
3. possuir rota same-origin compatível com `baseRoute`;
4. possuir health endpoint contratual sob `/api/` quando aplicável;
5. registrar/atualizar seu inventário em `PLATAFORMA_MODULOS` de forma idempotente;
6. manter read models e regras de negócio dentro do próprio módulo;
7. adicionar testes de autorização permitida/negada e de mismatch do contrato;
8. atualizar os contratos semânticos e a documentação do Centro;
9. passar os gates da App Factory antes de ser considerado `ready`.

Nenhum módulo pode acessar SharePoint diretamente pelo navegador.
