# BN-DEC-035 — PARA melhora o quantitativo, não o acrescenta

**Data:** 18/09/2026, confirmação 09:39–09:57 UTC. **Contrato:** #850. **Baseline:** `3aa7e5cb19417c01b6b79b39a3e695dceed697d8`.

## Retificação e precedência

O responsável esclareceu e confirmou o exemplo Q=4, P=7, L=10 -> **17**, nunca 21. A composição aditiva registrada na BN-DEC-033/#844 resultou de interpretação equivocada do executor. Não deve ser apresentada como intenção do responsável. Esta decisão **substitui expressamente** a soma Q+P+L da #033 e a ocultação incondicional de nota numérica não elegível da BN-DEC-034/#848. Preserva a história de implementação, sem reutilizá-la como regra vigente.

## Regra única

Q = AV1 + AV2, sempre. L = atividades qualitativas. O quantitativo máximo é 13,5 em T1/T2 e 18 em T3. A PARA é uma oportunidade de recuperar o quantitativo; não cria uma terceira avaliação a somar a Q e não aumenta o máximo.

Elegibilidade normal: Q < 8,1 e Q+L < 18 em T1/T2; Q < 10,8 e Q+L < 24 em T3. Todos os limites são estritos, institucionais e comparados antes de PARA/arredondamento. Não é necessário existir nota em uma ou ambas as AV; ausência contribui zero somente à aritmética.

Exceção única: **se o professor lançou P numérica, inclusive zero, respeitar a nota mesmo sem elegibilidade normal**. P vazia não aciona a exceção. A aplicabilidade efetiva combina elegibilidade normal OU P numérica. O campo existente `parallelApplicable` expressa essa aplicabilidade efetiva; o predicado local `parallelEligible` conserva os dois limites normais. Não há fórmula nos consumidores nem novos campos HTTP.

Se P > Q, quantitativo considerado = P. Caso contrário, quantitativo considerado = Q. Bruto = quantitativo considerado + L. Ganho = quantitativo considerado - Q. Para P vazia, preservar Q+L. Igualdade não gera ganho. Não somar Q novamente, nem somar P à parcela qualitativa independentemente. `quantitativeOriginalMilli` permanece Q e `quantitativeConsideredMilli` é o valor após a oportunidade de recuperação. Arredondamento final permanece na função homologada.

## Visibilidade, cobertura e consumidores

Para elegível com instrumento PARA: vazio observado mostra Não fez e permanece pendente; sem observação não inventa Não fez; qualquer nota, inclusive zero, resolve somente a PARA. Zero mostra Tirou zero.

Sem elegibilidade e sem P: linha oculta, sem pendência. Sem elegibilidade e com P: linha visível, número/zero preservado, e comparação pelo mesmo núcleo. A exceção registrada já está resolvida e não gera um asterisco novo. Nenhum desses casos apaga ausências de AV1/AV2/atividades ou inventa instrumento/período.

O contrato central já é consumido por `termRecoveryVisibilityV1`, detalhe Banco, Avaliações V3, analytics V6, prévias de Boletim e reader do Portal. Resumos de PARA podem conter alunos da exceção; uma coluna não some quando existe P registrada no recorte. Ganhos do painel passam a medir P-Q, não um bônus P. Comparação pedagógica das duas avaliações permanece sobre Q original; composição do resultado usa o quantitativo considerado, sem misturar os dois propósitos.

O aviso histórico `parallel-present-when-not-applicable` permanece decodificável, mas não é emitido para P registrada, que passou a ser exceção válida. Avisos de máximo e outras validações continuam.

## Autoridade e segurança

Somente cálculo/projeções correntes. AM/U importadas, fatos originais, histórico, máscaras NC/RR, decisões humanas e snapshots emitidos não são sobrescritos. O Portal aplica a regra aos fatos da edição aprovada; não consulta notas atuais para mudar uma edição antiga. O adaptador de cobertura regular para REC/autoridade da #848 permanece separado da exibição da PARA. Não há reimportação, backfill ou republicação forçada.

Sem DDL/DML acadêmico produtivo, alteração de fonte/importador, permissões, infraestrutura, dependências, workflows ou PROJECT_STATE. Nenhum comentário explicativo é acrescentado às telas. Dados e exemplos nos testes são exclusivamente sintéticos.

## Validação e revisão

Cobrir exemplo 4/7/10, ausência/zero, limites dos três trimestres, exceção com P maior/igual/menor/zero, quantitativo original/considerado/ganho, não aditividade, cobertura e consumidores SQL/UI/Portal. Atualizar expectativas antigas incompatíveis sem remover testes ou afrouxar segurança/limites de consultas/tamanho.

Revisão CodeRabbit autorizada exclusivamente nesta correção, sem learning persistente ou automação global. Auxílio de merge somente se o executor não puder efetuá-lo por conexão somente leitura, com HEAD esperado, ambos os gates verdes e sem contorno de proteções. A presença desta documentação não prova CI nem deploy: registrar SHAs, revisão, resultados, publicação e limitações separadamente na issue/PR.
