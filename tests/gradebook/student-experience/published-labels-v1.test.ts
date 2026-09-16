// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { labelPublishedAssessmentsV1 } from '../../../server/student-portal/publication/self-projection-reader-v1';
import { gradesFixtureV1 } from '../../student-portal/ui/grades/fixtures-v1';
import { selfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';
describe('published labels are metadata, not new grades or disclosure', () => {
  it('overlays known names without modifying stored data, grade values, revisions or generatedAt', () => {
    const value = gradesFixtureV1(),
      original = JSON.stringify(value);
    const result = labelPublishedAssessmentsV1(value, new Map([[900001, 'Simulado']]));
    expect(result.revisions).toBe(value.revisions);
    expect(result.generatedAt).toBe(value.generatedAt);
    expect(result.profile).toBe(value.profile);
    for (const [i, subject] of result.subjects.entries())
      for (const [j, period] of subject.periods.entries()) {
        const prior = value.subjects[i]!.periods[j]!;
        expect(period.final).toBe(prior.final);
        for (const [k, partial] of (period.partials ?? []).entries()) {
          expect(partial.mark).toBe(prior.partials![k]!.mark);
          expect(partial.assessmentId).toBe(prior.partials![k]!.assessmentId);
          expect(partial.label).toBe(
            partial.assessmentId === 900001 ? 'Simulado' : prior.partials![k]!.label,
          );
        }
      }
    expect(JSON.stringify(value)).toBe(original);
    expect(selfResponseV1.safeParse(result).success).toBe(true);
  });
  it('does not add granular data when hidden or periods when nothing is published', () => {
    const hidden = gradesFixtureV1(false),
      labels = new Map([[900001, 'Simulado']]);
    const result = labelPublishedAssessmentsV1(hidden, labels);
    expect(result.subjects.every((s) => s.periods.every((p) => p.partials === undefined))).toBe(
      true,
    );
    const absent = selfResponseV1.parse({ ...hidden, state: 'no-publication', subjects: [] });
    expect(labelPublishedAssessmentsV1(absent, labels)).toBe(absent);
  });
});
