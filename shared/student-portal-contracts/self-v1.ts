import { z } from 'zod';
import { academicLinkV1, instantV1, periodV1, portalIdV1, revisionsV1 } from './core-v1';

export const markV1 = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('score'), value: z.number().finite().nonnegative(), maximum: z.number().finite().nonnegative().nullable(), meetsMinimum: z.boolean().nullable() }).strict(),
  z.object({ kind: z.literal('nc') }).strict(),
  z.object({ kind: z.literal('absent') }).strict(),
  z.object({ kind: z.literal('rr') }).strict(),
  z.object({ kind: z.literal('recovery-pending') }).strict(),
]);
export const subjectV1 = z.object({
  subjectId: z.number().int().positive(), label: z.string().min(1).max(120), order: z.number().int().nonnegative(),
  periods: z.array(z.object({
    period: periodV1, final: markV1,
    partials: z.array(z.object({ assessmentId: z.number().int().positive(), label: z.string().min(1).max(120), mark: markV1 }).strict()).max(12).optional(),
  }).strict()).max(6).refine((v) => new Set(v.map((p) => p.period)).size === v.length, 'Duplicate period'),
  officialOutcome: z.enum(['approved', 'failed', 'failed-attendance']).optional(),
}).strict();
export const selfResponseV1 = z.object({
  contractVersion: z.literal(1), requestId: portalIdV1, state: z.enum(['ready', 'no-publication']),
  profile: z.object({ accountId: portalIdV1, link: academicLinkV1, name: z.string().min(1).max(200), classLabel: z.string().min(1).max(80), academicState: z.enum(['regular', 'special', 'assisted']), result: z.enum(['in-progress', 'approved', 'failed', 'failed-attendance', 'not-applicable']) }).strict(),
  revisions: revisionsV1, generatedAt: instantV1, subjects: z.array(subjectV1).max(100),
}).strict().superRefine((v, ctx) => {
  if (v.state === 'no-publication' && v.subjects.length) ctx.addIssue({ code: 'custom', path: ['subjects'], message: 'Unpublished data' });
  if (v.profile.academicState === 'assisted' && v.profile.result !== 'not-applicable') ctx.addIssue({ code: 'custom', path: ['profile', 'result'], message: 'No global outcome for assisted student' });
});
export type SelfResponseV1 = z.infer<typeof selfResponseV1>;
