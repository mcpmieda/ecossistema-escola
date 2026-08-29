# Banco de Notas — Piloto e rollout GO-LIVE V1

## Pré-condições obrigatórias

- `main`, CI, Semgrep, audit e release candidate verdes;
- backup D1 e snapshot de bindings/deployment registrados;
- produção read-only validada com flags globais em zero;
- add-in distribuído somente ao alvo piloto inequívoco;
- Excel Online, NAA, contexto e detecção validados;
- `/v1/sync/readiness` identifica o modelo como `ready`;
- operador conhece modelo interno, workbook, turma, componente, estudante, campo e baseline canônicos.

Não escolher alvo por nome, email, UPN ou proximidade. Se não houver exatamente um alvo institucional confirmado, parar como blocker externo.

## Sequência inicial

1. Confirmar `sync_enabled=0`, `commit_route_enabled=0` e zero piloto.
2. Executar readiness; registrar contagens e o modelo ready escolhido.
3. Inserir elegibilidade para exatamente um model, com aprovação, motivo e janela.
4. Validar contexto/Excel; preflight deve terminar em `SYNC_DISABLED` enquanto todos os demais fatos permanecem ready na consulta administrativa.
5. Habilitar somente `commit_route_enabled=1`; sync global continua zero e writes continuam bloqueados.
6. Habilitar `sync_enabled=1`; provar piloto permitido e um modelo não piloto negado.
7. Capturar baseline e confirmar uma alteração mínima de um campo.
8. Verificar um evento lógico, snapshot +1, attempt committed e nenhum efeito colateral.
9. Repetir exatamente o mesmo requestId; exigir duplicate, zero evento adicional e snapshot idêntico.
10. Usar uma segunda requisição com baseline anterior; exigir `BASELINE_STALE`/conflict e zero overwrite.
11. Desligar sync global; provar write bloqueado, admin/readiness/attempts intactos e add-in disabled.

## Expansão

Somente após ciclo perfeito: `1 campo → vários campos → vários estudantes → turma/componente piloto`. Reexecutar health, attempts, conflitos, falhas, duplicatas, duração, integridade e pendências após cada tranche. Manter o mesmo professor/modelo inicialmente.

## Limites de parada

Qualquer write não autorizado, evento duplicado, overwrite silencioso, falha atômica, crescimento inesperado de conflicts/failed ou perda de observabilidade exige: sync off, revogar elegibilidade, preservar histórico, investigar e aplicar recovery. Não expandir enquanto houver anomalia.

## Rollback final

1. `sync_enabled=0`;
2. `sync_pilot_eligibility.enabled=0` para a coorte;
3. confirmar admin read-only e attempts;
4. promover deployment anterior se houver regressão de runtime;
5. reconciliar somente por evento compensatório aprovado; nunca apagar histórico.
