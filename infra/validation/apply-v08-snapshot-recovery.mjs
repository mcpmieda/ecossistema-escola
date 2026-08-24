import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const paths = [
  'specs/semantic-contract.json',
  'specs/semantic-assurance.json',
  'specs/verification-plan.json',
];

const replacements = [
  [
    'verificação de backup e restore de registro em lista SharePoint descartável criada exclusivamente pelo próprio teste de recovery',
    'verificação de backup e restore de metadado em pasta descartável RECOVERY_VERIFY_ criada exclusivamente dentro da biblioteca técnica SNAPSHOTS_PLATAFORMA',
  ],
  [
    'round-trip em lista RECOVERY_VERIFY_ descartável no CENTROADMIN',
    'round-trip de metadado em pasta RECOVERY_VERIFY_ descartável dentro de SNAPSHOTS_PLATAFORMA no CENTROADMIN',
  ],
  [
    'o teste cria somente uma lista descartável com prefixo RECOVERY_VERIFY_ no CENTROADMIN',
    'o teste cria somente uma pasta descartável com prefixo RECOVERY_VERIFY_ dentro de SNAPSHOTS_PLATAFORMA no CENTROADMIN',
  ],
  [
    'a lista descartável é removida antes de a execução ser considerada verificada',
    'a pasta descartável é removida antes de a execução ser considerada verificada',
  ],
  [
    'Criar somente uma lista descartável RECOVERY_VERIFY_ no CENTROADMIN.',
    'Criar somente uma pasta descartável RECOVERY_VERIFY_ dentro de SNAPSHOTS_PLATAFORMA no CENTROADMIN.',
  ],
  [
    'Executar backup, sobrescrita e restore de um registro sentinela e comparar checksums SHA-256.',
    'Executar backup, sobrescrita e restore de um metadado sentinela da pasta técnica e comparar checksums SHA-256.',
  ],
  [
    'um registro sentinela é lido como backup, sobrescrito de forma controlada e restaurado ao mesmo checksum SHA-256',
    'um metadado sentinela da pasta técnica é lido como backup, sobrescrito de forma controlada e restaurado ao mesmo checksum SHA-256',
  ],
];

function transform(value) {
  if (Array.isArray(value)) return value.map(transform);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transform(item)]));
  }
  if (typeof value !== 'string') return value;
  return replacements.reduce(
    (current, [before, after]) => current.replaceAll(before, after),
    value,
  );
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

const [contract, assurance, plan] = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(path, 'utf8'))),
);

const nextContract = transform(contract);
const nextAssurance = transform(assurance);
const nextPlan = transform(plan);

const nextFingerprint = fingerprint(nextContract);
nextAssurance.source_contract_fingerprint = nextFingerprint;
nextPlan.spec_fingerprint = nextFingerprint;

await Promise.all([
  writeFile(paths[0], `${JSON.stringify(nextContract, null, 2)}\n`),
  writeFile(paths[1], `${JSON.stringify(nextAssurance, null, 2)}\n`),
  writeFile(paths[2], `${JSON.stringify(nextPlan, null, 2)}\n`),
]);

console.log(nextFingerprint);
