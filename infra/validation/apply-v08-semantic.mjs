import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const specPath = 'specs/semantic-contract.json';
const assurancePath = 'specs/semantic-assurance.json';
const planPath = 'specs/verification-plan.json';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};
const fingerprint = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonicalize(value)), 'utf8')
    .digest('hex');
const addUnique = (items, value) => {
  if (!items.includes(value)) items.push(value);
};

const [spec, assurance, plan] = await Promise.all([
  readJson(specPath),
  readJson(assurancePath),
  readJson(planPath),
]);

spec.goal =
  'Evoluir o núcleo do Centro de Administração em validação controlada, mantendo-o permission-aware e operacionalmente explicável, com capabilities aplicadas no servidor, snapshot recortado por autorização, contrato versionado para integração segura de módulos independentes e recovery verificável em recurso SharePoint descartável, preservando integralmente a fundação institucional existente.';

addUnique(
  spec.scope.in,
  'verificação de backup e restore de registro em lista SharePoint descartável criada exclusivamente pelo próprio teste de recovery',
);
addUnique(
  spec.scope.in,
  'endpoint de manutenção de recovery autenticado por GitHub OIDC do environment production, sem ampliar o acesso SharePoint da identidade de manutenção',
);
addUnique(
  spec.scope.in,
  'evidência versionada de recovery no snapshot e na área Operação somente após execução real bem-sucedida e cleanup confirmado',
);

const oldRecoveryOut =
  'declaração de recuperação ou restore como aprovado sem evidência registrada de teste';
const outIndex = spec.scope.out.indexOf(oldRecoveryOut);
if (outIndex >= 0) {
  spec.scope.out[outIndex] =
    'declaração de disaster recovery completo, restauração integral de site ou recuperação de dados operacionais reais a partir do self-test descartável';
} else {
  addUnique(
    spec.scope.out,
    'declaração de disaster recovery completo, restauração integral de site ou recuperação de dados operacionais reais a partir do self-test descartável',
  );
}

addUnique(
  spec.assumptions,
  'O self-test de recovery cria e remove apenas recurso com prefixo RECOVERY_VERIFY_ no CENTROADMIN; listas operacionais existentes não são alvo do teste.',
);

if (!spec.invariants.some((item) => item.id === 'INV-012')) {
  spec.invariants.push({
    id: 'INV-012',
    statement:
      'Recovery só pode ser marcado como verificado após round-trip real de backup, sobrescrita, restore por checksum e cleanup do recurso descartável criado pelo próprio teste; a evidência não autoriza afirmar disaster recovery completo.',
  });
}

if (!spec.data_contracts.some((item) => item.name === 'RecoveryVerificationEvidence')) {
  spec.data_contracts.push({
    name: 'RecoveryVerificationEvidence',
    source:
      'workflow GitHub Actions production + endpoint de manutenção + round-trip em lista RECOVERY_VERIFY_ descartável no CENTROADMIN',
    direction: 'evidência técnica redigida para estado versionado e PlatformSnapshot',
    privacy:
      'somente status, escopo, timestamp, referência de evidência e checksums; sem conteúdo operacional, credenciais ou dados pessoais',
  });
}

if (!spec.interfaces.some((item) => item.name === '/api/maintenance/recovery/verify')) {
  spec.interfaces.push({
    name: '/api/maintenance/recovery/verify',
    mode: 'maintenance-production-oidc-disposable-write',
    purpose:
      'executar exclusivamente o round-trip de recovery em recurso SharePoint descartável após autenticação GitHub OIDC do environment production',
  });
}

const ac11 = spec.acceptance_criteria.find((item) => item.id === 'AC-011');
if (ac11) {
  ac11.then = ac11.then.map((statement) =>
    statement ===
    'recuperação permanece não verificada enquanto não existir evidência correspondente'
      ? 'recuperação só aparece como verificada quando houver evidência versionada de uma execução real bem-sucedida dentro do escopo declarado'
      : statement,
  );
}

if (!spec.acceptance_criteria.some((item) => item.id === 'AC-014')) {
  spec.acceptance_criteria.push({
    id: 'AC-014',
    priority: 'must',
    given:
      'a candidata está implantada, o workflow executa em main no environment production e nenhuma lista operacional deve ser modificada',
    when: 'a verificação de recovery é executada pela identidade GitHub OIDC autorizada',
    then: [
      'requisição sem a identidade de manutenção válida é negada antes de qualquer mutação',
      'o teste cria somente uma lista descartável com prefixo RECOVERY_VERIFY_ no CENTROADMIN',
      'um registro sentinela é lido como backup, sobrescrito de forma controlada e restaurado ao mesmo checksum SHA-256',
      'a lista descartável é removida antes de a execução ser considerada verificada',
      'falha de restore, checksum ou cleanup impede o estado verified',
      'a evidência publicada é redigida e não contém conteúdo operacional, credenciais ou dados pessoais',
      'a prova é descrita como round-trip descartável de registro e não como disaster recovery completo',
    ],
    verification: ['test', 'gate', 'runtime'],
  });
}

const operationalEntity = assurance.entities.find((item) => item.id === 'ENT-005');
if (operationalEntity) {
  for (const attribute of ['recoveryVerifiedAt', 'recoveryEvidenceRef', 'recoveryScope']) {
    addUnique(operationalEntity.attributes, attribute);
  }
}

const req11 = assurance.requirements.find((item) => item.id === 'REQ-011');
if (req11) {
  req11.response = req11.response.map((statement) =>
    statement ===
    'Tratar HealthEndpoint apenas como cobertura de contrato e manter recuperação como não verificada sem evidência de restore.'
      ? 'Tratar HealthEndpoint apenas como cobertura de contrato e mostrar recovery como verificado somente quando a evidência versionada corresponder a uma execução real bem-sucedida no escopo declarado.'
      : statement,
  );
}

if (!assurance.requirements.some((item) => item.id === 'REQ-014')) {
  assurance.requirements.push({
    id: 'REQ-014',
    priority: 'must',
    pattern: 'policy',
    component: 'Recovery verificável',
    scope: [
      '/api/maintenance/recovery/verify',
      'workflow Verify recovery',
      'CENTROADMIN',
      'RecoveryVerificationEvidence',
    ],
    preconditions: [
      'execução em main no environment production',
      'GitHub OIDC válido para a audience específica de recovery',
    ],
    trigger: 'o workflow de recovery solicita a verificação da candidata implantada',
    response: [
      'Criar somente uma lista descartável RECOVERY_VERIFY_ no CENTROADMIN.',
      'Executar backup, sobrescrita e restore de um registro sentinela e comparar checksums SHA-256.',
      'Remover a lista descartável antes de aceitar a execução como verificada.',
      'Falhar fechado em erro de autorização, restore, checksum ou cleanup.',
      'Publicar apenas evidência redigida e não inferir disaster recovery completo a partir deste teste.',
    ],
    timing: '',
    concept_refs: ['TERM-004', 'TERM-006', 'ENT-004', 'ENT-005'],
    acceptance_refs: ['AC-014'],
    invariant_refs: ['INV-002', 'INV-012'],
    formalization_refs: [],
  });
}

if (!plan.criteria.some((item) => item.id === 'AC-014')) {
  plan.criteria.push({
    id: 'AC-014',
    priority: 'must',
    preferred_evidence: ['test', 'gate', 'runtime'],
    evidence: [
      { kind: 'test', gate: 'package:test', ref: 'tests/recovery.test.ts' },
      { kind: 'test', gate: 'package:test', ref: 'tests/routes.test.ts' },
      { kind: 'gate', gate: 'package:typecheck' },
      { kind: 'gate', gate: 'package:build' },
      { kind: 'runtime', gate: 'github-actions:verify-recovery' },
    ],
  });
}

const nextFingerprint = fingerprint(spec);
assurance.source_contract_fingerprint = nextFingerprint;
plan.spec_fingerprint = nextFingerprint;

await Promise.all([
  writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`),
  writeFile(assurancePath, `${JSON.stringify(assurance, null, 2)}\n`),
  writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`),
]);

console.log(nextFingerprint);
