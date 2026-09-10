# Contexto acadêmico — modelo simplificado

## Fonte atual

Ano é explícito; não é inferido pelo relógio. `gradebook.ano_letivo` usa o próprio ano como chave, com `minimo_aprovacao` e `max_componentes_conselho`. Cadastro mestre, turmas, professores, disciplinas, pessoas e vínculos pertencem ao ano e são relacionados por chaves/FKs.

`aluno_id` não é matrícula interanual universal. Uma pessoa pode ter vários vínculos no mesmo ano; `FOI_PARA` não é vínculo corrente. Não unificar anos por nome nem reutilizar número para outra pessoa no mesmo vínculo.

## Leitura e resultado

O serviço `relational-student-annual-projection-v1.ts` lê contexto/vínculo corrente, ofertas da turma, fatos do componente e decisão formal. Cálculo e deliberação continuam separados; `conselho_anterior` desconhecido não vira falso automaticamente. A precedência de situação atual não depende de preencher todas as ofertas.

O núcleo simplificado resolve composição, arredondamento, REC e resultado anual conforme as regras aprovadas na #613. Referências AM/U são comparadas, não somadas à nota. Nenhuma interface escolhe perfil/autoridade localmente.

## Compatibilidade ainda pendente

O contexto V1 antigo, `AcademicYearV1`, perfis/versionamentos e catálogo em `academic_years`/`academic_year_versions`/`academic_year_configuration_versions` continuam em consumidores antigos. Não são a representação persistida do schema simplificado. A FINAL-1 deve adaptar contexto e transporte antes de reaproveitar esses serviços nas telas.

Não fabricar escola, matrícula, versão de configuração, situação ou data ausentes para caber no contrato V1. O histórico de alterações/configurações aprovado deve ser preservado por contrato mínimo, e emissões antigas não podem ser reinterpretadas silenciosamente.

A composição V1 histórica, inclusive `authorityMode: imported-source`, está preservada em [`history/pre-final-1/ACADEMIC_CONTEXT.md`](history/pre-final-1/ACADEMIC_CONTEXT.md). A #347 controla o aceite acadêmico por consumidor/escopo; este documento não ativa autoridade.
