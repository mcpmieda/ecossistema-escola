import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const SPEC_PATH = 'specs/semantic-contract.json';
const ASSURANCE_PATH = 'specs/semantic-assurance.json';
const PLAN_PATH = 'specs/verification-plan.json';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [spec, assurance, plan] = await Promise.all([
  readJson(SPEC_PATH),
  readJson(ASSURANCE_PATH),
  readJson(PLAN_PATH),
]);

assert(spec.schema_version === 1, 'semantic contract schema_version must be 1');
assert(assurance.schema_version === 1, 'semantic assurance schema_version must be 1');
assert(plan.schema_version === 1, 'verification plan schema_version must be 1');

const currentFingerprint = fingerprint(spec);
assert(
  assurance.source_contract_fingerprint === currentFingerprint,
  'semantic assurance is stale: source_contract_fingerprint does not match semantic contract',
);
assert(
  plan.spec_fingerprint === currentFingerprint,
  'verification plan is stale: spec_fingerprint does not match semantic contract',
);

const criteria = Array.isArray(spec.acceptance_criteria) ? spec.acceptance_criteria : [];
const criterionIds = new Set();
for (const criterion of criteria) {
  assert(/^AC-\d{3,}$/.test(criterion.id), `invalid acceptance criterion id: ${criterion.id}`);
  assert(!criterionIds.has(criterion.id), `duplicate acceptance criterion: ${criterion.id}`);
  criterionIds.add(criterion.id);
}

const planRows = new Map((plan.criteria ?? []).map((row) => [row.id, row]));
for (const criterion of criteria) {
  const row = planRows.get(criterion.id);
  assert(row, `${criterion.id} has no verification-plan row`);
  assert(
    row.priority === criterion.priority,
    `${criterion.id} priority differs from verification plan`,
  );
  if (criterion.priority === 'must') {
    assert(
      Array.isArray(row.evidence) && row.evidence.length > 0,
      `${criterion.id} has no executable evidence`,
    );
  }
}
for (const row of plan.criteria ?? []) {
  assert(criterionIds.has(row.id), `verification plan references unknown criterion: ${row.id}`);
}

const invariantIds = new Set((spec.invariants ?? []).map((item) => item.id));
const conceptIds = new Set([
  ...(assurance.glossary ?? []).map((item) => item.id),
  ...(assurance.entities ?? []).map((item) => item.id),
  ...(assurance.states ?? []).map((item) => item.id),
]);
const coveredCriteria = new Set();
for (const requirement of assurance.requirements ?? []) {
  assert(/^REQ-\d{3,}$/.test(requirement.id), `invalid requirement id: ${requirement.id}`);
  for (const ref of requirement.acceptance_refs ?? []) {
    assert(
      criterionIds.has(ref),
      `${requirement.id} references unknown acceptance criterion: ${ref}`,
    );
    coveredCriteria.add(ref);
  }
  for (const ref of requirement.invariant_refs ?? []) {
    assert(invariantIds.has(ref), `${requirement.id} references unknown invariant: ${ref}`);
  }
  for (const ref of requirement.concept_refs ?? []) {
    assert(conceptIds.has(ref), `${requirement.id} references unknown concept: ${ref}`);
  }
}

for (const criterion of criteria.filter((item) => item.priority === 'must')) {
  assert(coveredCriteria.has(criterion.id), `${criterion.id} is not covered by semantic assurance`);
}

console.log(`Semantic contract valid and current: ${currentFingerprint}`);
