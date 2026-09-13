import { SYNTHETIC_SELF_V1 } from '../../../../shared/student-portal-contracts/fixtures-v1';
import {
  selfResponseV1,
  type SelfResponseV1,
} from '../../../../shared/student-portal-contracts/self-v1';

type Mark = SelfResponseV1['subjects'][number]['periods'][number]['final'];
export const score = (
  value: number,
  maximum: number | null,
  meetsMinimum: boolean | null,
): Mark => ({ kind: 'score', value, maximum, meetsMinimum });
/** Invented UI examples only; never derived from records or used as runtime seeds. */
export function gradesFixtureV1(detailed = true): SelfResponseV1 {
  return selfResponseV1.parse({
    ...SYNTHETIC_SELF_V1,
    subjects: Array.from({ length: 13 }, (_, index) => ({
      subjectId: 900100 + index,
      label:
        index === 0
          ? 'Disciplina sintética com descrição institucional muito extensa para testar a leitura'
          : `Disciplina sintética ${index + 1}`,
      order: index + 1,
      periods: [
        {
          period: 'T1',
          final: index === 0 ? score(22.499, 30, false) : score(22.5, 30, true),
          ...(detailed
            ? {
                partials: [
                  { assessmentId: 900001, label: 'I AVALIAÇÃO', mark: score(0, 10, false) },
                  { assessmentId: 900002, label: 'II AVALIAÇÃO', mark: { kind: 'nc' } },
                  ...Array.from({ length: 10 }, (_, activity) => ({
                    assessmentId: 900003 + activity,
                    label:
                      activity === 0
                        ? 'Atividade com descrição oficial extensa: observação e registro de uma situação de aprendizagem'
                        : `Atividade ${activity + 1}`,
                    mark:
                      activity === 0
                        ? { kind: 'rr' }
                        : activity === 1
                          ? { kind: 'absent' }
                          : score(1.5, activity === 2 ? null : 2, activity === 2 ? null : true),
                  })),
                ],
              }
            : {}),
        },
        { period: 'T3', final: { kind: 'absent' } },
        ...(index < 2
          ? [
              {
                period: 'REC1',
                final: index === 0 ? { kind: 'recovery-pending' } : score(20, 30, true),
              },
            ]
          : []),
      ],
      ...(index === 1 ? { officialOutcome: 'approved' } : {}),
    })).reverse(),
  });
}
