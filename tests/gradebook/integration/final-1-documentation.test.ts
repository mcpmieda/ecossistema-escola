import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const base = 'docs/gradebook/';
const history = `${base}history/pre-final-1/`;
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const state = source(`${base}PROJECT_STATE.yaml`);
function section(name: string): string {
  const lines = state.split('\n');
  const start = lines.indexOf(`${name}:`);
  if (start < 0) throw new Error(`Missing project-state section: ${name}`);
  let end = start + 1;
  while (end < lines.length && (lines[end] === '' || /^\s/u.test(lines[end]!))) end += 1;
  return lines.slice(start, end).join('\n');
}

describe('FINAL-1 documentation distinguishes facts, migration debt and historical checkpoints', () => {
  it('records relational storage as official without declaring every consumer accepted', () => {
    expect(state).toMatch(/^schema_version: 2$/mu);
    expect(section('storage')).toContain('current_official_storage: supabase-postgresql-via-cloudflare-hyperdrive');
    expect(section('storage')).toContain('cutover_completed: true');
    expect(section('storage')).toContain('core_table_count: 19');
    expect(section('storage')).toContain('diagnostic_table_count: 1');
    expect(section('storage')).toContain('total_table_count: 20');
    expect(section('runtime')).toContain('global_academic_authority_switch_verified: false');
    expect(section('work_in_progress')).toContain('phase_complete: false');
    expect(section('work_in_progress')).toContain('production_activation_in_this_delivery: false');
    expect(state).not.toMatch(/^\s*(?:production_academic_runtime_enabled|production_gate_final):/mu);
  });
  it('has a concrete four-phase queue and separate acceptance and delivery gates', () => {
    expect(section('coordination')).toContain('executable_issue: 648');
    expect(section('coordination')).toContain('current_delivery_issue: 648');
    expect(section('final_phases').match(/phase: FINAL-/gu)).toHaveLength(4);
    for (const issue of [633,634,635,406]) expect(section('final_phases')).toContain(`issue: ${issue}`);
    expect(section('institutional_delivery')).toContain('issue: 596');
    expect(section('institutional_delivery')).toContain('authority_acceptance_issue: 347');
    expect(section('next_safe_action')).toContain('issue: 648');
  });
  it('records current-only diagnostics separately from preserved academic history', () => {
    expect(section('storage')).toContain('diagnostic_retention: current-evidence-only-replaced-on-next-source-observation');
    expect(section('storage')).toContain('historical_academic_retention: preserved-real-deltas');
    expect(source(`${base}DECISIONS.md`)).toContain('Substitui BN-DEC-017');
    expect(source(`${base}DECISIONS.md`)).toContain('Substitui BN-DEC-021');
  });
  it('preserves the original historical blobs byte for byte', () => {
    const originals = {
      'PROJECT_STATE.yaml':'4dc15e432c723c47f7aa256a060aaa0a0b40c74b',
      'COMECE_AQUI.md':'4068f05bb7cb9a4926f99896f83341d44d2ed5c9',
      'PRODUCTION_READINESS.md':'67a6065b3b009d2c34d0ad02d0945dc5fabed4d8',
      'DECISIONS.md':'32c4b5126563c72593a0f368d80431332bda642d',
    };
    for (const [path,expected] of Object.entries(originals)) {
      const bytes = readFileSync(join(root,history,path));
      const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      expect(digest,path).toBe(expected);
    }
  });
  it('maps all exposed consumers and does not conflate file diagnostics with legacy audit', () => {
    const map = source(`${base}CONSUMER_MAP.md`);
    for (const endpoint of ['import-persistence','import-diagnostics','operational-workspace','audit-workspace','performance','bulletins','reports','council-workspace']) expect(map).toContain(`/api/gradebook/${endpoint}`);
    expect(map).toContain('handleGradebookD1AdminRequestV1');
    expect(map).toContain('não é smoke HTTP autenticado');
    expect(map).toContain('não equivale à Auditoria atual de arquivos');
    expect(map).toContain('não é ainda uma matriz de turma');
    expect(map).toContain('createRelationalWorkspaceV2');
    expect(map).toContain('createRelationalCouncilV3');
  });
  it('documents remaining limits without erasing the atomicity and schema work already tested', () => {
    const readiness = source(`${base}PRODUCTION_READINESS.md`);
    expect(readiness).toContain('Uma migration existente não comprova restore');
    expect(readiness).toContain('contexto e ofertas separadamente');
    expect(readiness).toContain('substituição transacional');
    expect(readiness).toContain('última confirmada no servidor');
    const contracts = source(`${base}CONTRACTS.md`);
    expect(contracts).toContain('Conselho — única parte preservada do documento antigo');
    expect(contracts).toContain('não modifica contratos compartilhados');
    expect(contracts).toContain('O teste sintético de projeção não é teste de reconstrução');
  });
  it('records actual deployments separately from authenticated acceptance and the security release checkpoint', () => {
    expect(section('baseline')).toContain('last_audited_main_commit: 459443db90277baf55690fe69d35dbfdba8550f1');
    expect(section('baseline')).toContain('authorized_deploy_run: 34559675760');
    expect(section('baseline')).toContain('authenticated_post_deploy_smoke_this_session: false');
    expect(section('storage')).toContain('distinct_trigger_count: 3');
    expect(section('storage')).toContain('information_schema_trigger_event_rows: 6');
    expect(section('storage')).toContain('production_data_restore_proven_by_this_pr: false');
    expect(section('runtime')).toContain('diagnostic_atomic_replacement: integrated-pr-636-deploy-254-success-awaiting-authenticated-smoke');
    expect(section('runtime')).toContain('relational_centers_v2: integrated-pr-640-deploy-255-success-awaiting-authenticated-smoke');
    expect(section('runtime')).toContain('relational_performance_v2: integrated-pr-643-deploy-257-success-awaiting-authenticated-smoke');
    expect(section('security')).toContain('dependency_remediation: integrated-pr-641-deploy-256-success');
    expect(section('security')).toContain('audited_lock_blob: ad6059ec46be02970b340f97e7cbb585abd79715');
    expect(existsSync(join(root,'migrations/gradebook-simplified/0001_current_schema.sql'))).toBe(true);
    const inspect = source('migrations/gradebook-simplified/inspect_current_schema.sql');
    expect(inspect).toContain('a.attnotnull::text');
    expect(inspect).toContain("WHERE c.contype <> 'n'");
  });
  it('records standing integration authorization without bypassing verification or academic acceptance', () => {
    expect(section('coordination')).toContain('merge_and_deploy: standing-authorization-after-final-head-verification');
    expect(section('coordination')).toContain('authorization_comment: 5618750384');
    const decisions = source(`${base}DECISIONS.md`);
    expect(decisions).toContain('BN-DEC-023');
    expect(decisions).toContain('sem nova confirmação por PR');
    expect(source('AGENTS.md')).toContain('Não contorne checks');
    expect(source('AGENTS.md')).toContain('CI no head final');
    expect(section('security')).toContain('automatic_authority_activation: forbidden');
    const workflow = readFileSync(join(root,'.github/workflows/validate-pull-request.yml'));
    expect(createHash('sha1').update(`blob ${workflow.length}\0`).update(workflow).digest('hex')).toBe('d147df2a95b4f78d965a5452bfc52109ecb6dabb');
  });
  it('keeps the canonical local documentation links resolvable', () => {
    const pages = ['README.md','COMECE_AQUI.md','DECISIONS.md','ARCHITECTURE.md','ACADEMIC_CONTEXT.md','CONTRACTS.md','ROADMAP.md','ISSUE_MAP.md','PRODUCTION_READINESS.md','CONSUMER_MAP.md','CURRENT_SCHEMA_AND_DIAGNOSTICS.md','RELATIONAL_CENTERS_V2.md','SECURITY_REMEDIATION_637.md','RELATIONAL_PERFORMANCE_V2.md','PERFORMANCE_LENSES_V3.md','FINAL2_SOURCE_DESKTOP_646.md','TERM_COMPARISON_2026_V4.md','RELATIONAL_COUNCIL_V3.md'];
    for (const page of pages) {
      const fullPath = join(root,base,page);
      for (const match of source(`${base}${page}`).matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/gu)) {
        const target = match[1]!;
        if (/^(?:https?:|mailto:)/u.test(target)) continue;
        expect(existsSync(resolve(dirname(fullPath),target)),`${page} → ${target}`).toBe(true);
      }
    }
  });
});
