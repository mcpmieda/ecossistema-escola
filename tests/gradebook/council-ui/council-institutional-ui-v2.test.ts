import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('Council institutional HeroUI V2', () => {
  const panel = source('src/features/gradebook/council/council-institutional-panel-v2.tsx');
  const client = source('src/features/gradebook/council/council-institutional-client-v2.ts');
  const contract = source(
    'shared/gradebook-contracts/council/council-institutional-contract-v2.ts',
  );
  const service = source(
    'server/gradebook/application/council/council-institutional-workspace-v2.ts',
  );
  const route = source('server/gradebook/http/council-routes-v1.ts');
  const surface = source('src/platform/gradebook-council-surface.tsx');
  const functions = source('functions/[[path]].ts');
  const runtime = source('server/gradebook/persistence/d1/runtime/d1-runtime-v1.ts');

  it('entrega painel HeroUI e o monta pelo wiring central da #343 no bridge existente', () => {
    expect(panel).toContain("from '@heroui/react'");
    expect(panel).toContain('<Card>');
    expect(panel).toContain('<Button');
    expect(panel).toContain('<Alert');
    expect(panel).toContain('<Surface');
    expect(panel).toContain('Fechamento institucional');
    expect(surface).toContain('CouncilInstitutionalPanelV2');
    expect(surface).toContain('focusedStudentReference={focusedStudentReference}');
    expect(surface).toContain('onFocusedStudentReferenceChange={setFocusedStudentReference}');
    expect(surface).not.toContain('focusedStudentReference={null}');
    expect(functions).toContain('createInstitutionalWorkspace(runtimeEnv, server)');
    expect(functions).toContain('.councilInstitutionalWorkspace(');
    expect(runtime).toContain('CouncilInstitutionalWorkspaceV2');
    expect(runtime).toContain('createCouncilInstitutionalWorkspaceV2');
  });

  it('mostra revisão pré-fechamento, confirmação explícita, conflitos e histórico', () => {
    expect(panel).toContain('Revisão antes do fechamento');
    expect(panel).toContain('Confirmação final');
    expect(panel).toContain('Confirmar fechamento institucional');
    expect(panel).toContain('Histórico de fechamentos');
    expect(panel).toContain('review.reviewReference');
    expect(panel).toContain('expectedVersion: {review.meeting.version}');
    expect(panel).toContain('review-conflict');
    expect(panel).toContain('closure-blocked');
    expect(panel).toContain('Fotografia imutável');
    expect(panel).toContain('Novas edições de decisão e contagens ficam bloqueadas');
  });

  it('mantém votação estritamente opcional, numérica e sem campo de abstenção', () => {
    expect(panel).toContain('Votação numérica opcional');
    expect(panel).toContain('A contagem não é necessária para registrar decisão');
    expect(panel).toContain('nunca produz decisão automaticamente');
    expect(panel).toContain('Votos por aprovar');
    expect(panel).toContain('Votos por não aprovar');
    expect(panel.match(/type="number"/gu)).toHaveLength(2);
    expect(panel.match(/min=\{0\}/gu)).toHaveLength(2);
    expect(panel).not.toMatch(/absten(ç|c)[aã]o/iu);
    expect(contract).toContain("'abstention-field'");
    expect(contract).toContain('voteRequiredForDecision: false');
    expect(contract).toContain('voteCreatesDecision: false');
  });

  it('expõe empate como bloqueio institucional sem inventar diretor, role ou capability', () => {
    expect(panel).toContain('Empate sem resolução automática');
    expect(panel).toContain('identidade/capability oficial de diretor não está formalizada');
    expect(panel).toContain('ADMINISTRADOR não é inferido como diretor');
    expect(contract).toContain("directorIdentity: 'not-formalized-fail-closed'");
    expect(contract).toContain('administratorIsDirector: false');
    expect(contract).toContain('COUNCIL_WORKSPACE_REQUIRED_CAPABILITY_V1');
    expect(service).toContain("return failure('tie-break-identity-unavailable'");
    expect(service).not.toContain("requireCapability('director");
    expect(service).not.toContain("role: 'DIRETOR'");
  });

  it('mantém teclado, foco, aria-live e texto além de cor', () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
    expect(panel).toContain('tabIndex={-1}');
    expect(panel).toContain('confirmationRef.current?.focus()');
    expect(panel).toContain('conflictRef.current?.focus()');
    expect(panel).toContain('focus-visible:ring-2');
    expect(panel).toContain('htmlFor="council-approved-votes"');
    expect(panel).toContain('htmlFor="council-failed-votes"');
    expect(panel).toContain('Revisão consistente para fechamento');
    expect(panel).toContain('Revisão ainda possui pendências');
  });

  it('é responsivo e não comprime layout fixo de desktop', () => {
    expect(panel).toContain('sm:flex-row');
    expect(panel).toContain('sm:grid-cols-2');
    expect(panel).toContain('xl:grid-cols-4');
    expect(panel).toContain('min-w-0');
    expect(panel).not.toContain('min-w-[1024px]');
    expect(panel).not.toContain('w-[1200px]');
  });

  it('não persiste academia no navegador, usa no-store e mantém um único bridge de Conselho', () => {
    const frontend = `${panel}\n${client}`;
    expect(client).toContain(
      "const COUNCIL_WORKSPACE_ENDPOINT = '/api/gradebook/council-workspace'",
    );
    expect(client).toContain("cache: 'no-store'");
    expect(frontend).not.toContain('localStorage');
    expect(frontend).not.toContain('sessionStorage');
    expect(frontend).not.toContain('indexedDB');
    expect(frontend).not.toContain('caches.open');
    expect(frontend).not.toContain('serviceWorker');
    expect(route.match(/'\/api\/gradebook\/council-workspace'/gu)).toHaveLength(1);
  });

  it('preserva identidade/instante server-side e produção fail-closed no handler existente', () => {
    expect(route).toContain('session = await requireAuth(request, env)');
    expect(route).toContain('authorizeGradebookD1RuntimeV1(session)');
    expect(route).not.toContain("env.RUNTIME_ENVIRONMENT === 'production'");
    expect(runtime).toContain("env.GRADEBOOK_PRODUCTION_ENABLED !== 'true'");
    expect(route).toContain("'Cache-Control': 'no-store, no-cache, must-revalidate, private'");
    expect(route).toContain('actorReference: session.oid');
    expect(route).toContain('occurredAt: now().toISOString()');
    expect(route).toContain('createInstitutionalWorkspace?');
  });
});
