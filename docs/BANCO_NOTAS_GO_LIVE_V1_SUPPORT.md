# Banco de Notas — Suporte GO-LIVE V1

| Sintoma                    | Verificação                    | Ação segura                                                  |
| -------------------------- | ------------------------------ | ------------------------------------------------------------ |
| professor não autorizado   | ownership e status             | corrigir identidade canônica; não trocar OID com sync ativo  |
| workbook não reconhecido   | metadata/model/version/mapping | regenerar ou reanalisar; não forçar                          |
| modelo stale/conflito      | attempt + baseline             | `Analisar novamente`; nunca overwrite                        |
| offline/network unknown    | outcome por requestId          | aguardar resultado; não gerar novo requestId automaticamente |
| duplicate retry            | status duplicate               | confirmar zero evento adicional                              |
| sync disabled              | flags globais/model/source     | tratar como estado operacional; só operador habilita         |
| add-in não visível         | cohort M365 e versão           | validar implantação central no escopo correto                |
| turma/componente incorreto | assignment/source/gradeKey     | bloquear modelo e corrigir mapping server-side               |

Monitorar attempts committed/rejected/conflict/failed, duplicatas, duração média, pendências por severidade e último sync bem-sucedido. Qualquer write não autorizado, duplicação ou overwrite silencioso exige kill switch imediato.
