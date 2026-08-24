import { z } from 'zod';

const trigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('manual') }),
  z.object({ type: z.literal('schedule'), expression: z.string().min(1).max(120) }),
  z.object({ type: z.literal('event'), event: z.enum(['list.item.created', 'list.item.updated']) }),
  z.object({
    type: z.literal('condition'),
    field: z.string().min(1),
    operator: z.enum(['eq', 'ne', 'exists']),
    value: z.unknown().optional(),
  }),
]);
const action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('audit.write'), event: z.string().min(1).max(100) }),
  z.object({
    type: z.literal('email.notify'),
    template: z.enum(['credential-expiry']),
    recipientGroup: z.literal('secretaria'),
  }),
  z.object({
    type: z.literal('list.item.create'),
    list: z.enum(['PLATAFORMA_AUDITORIA', 'PLATAFORMA_EXECUCOES_AUTOMACAO']),
    fields: z.record(z.string(), z.unknown()),
  }),
]);

export const automationContract = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  allowlistVersion: z.literal('1'),
  enabled: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  trigger,
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum(['eq', 'ne', 'exists']),
        value: z.unknown().optional(),
      }),
    )
    .max(20),
  actions: z.array(action).min(1).max(20),
  idempotencyKey: z.string().min(8).max(200),
});
