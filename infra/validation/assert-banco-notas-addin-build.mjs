import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const assetDirectory = join(process.cwd(), 'dist/banco-de-notas/addin/assets');
const taskpaneAsset = readdirSync(assetDirectory).find(
  (name) => name.startsWith('taskpane-') && name.endsWith('.js'),
);

if (!taskpaneAsset) {
  throw new Error('BANCO_NOTAS_ADDIN_TASKPANE_ASSET_MISSING');
}

const bundle = readFileSync(join(assetDirectory, taskpaneAsset), 'utf8');
for (const name of ['VITE_BANCO_NOTAS_ADDIN_CLIENT_ID', 'VITE_TENANT_ID']) {
  const value = process.env[name]?.trim();
  if (!value || !bundle.includes(value)) {
    throw new Error(`BANCO_NOTAS_ADDIN_BUILD_CONFIG_MISSING:${name}`);
  }
}

console.log('BANCO_NOTAS_ADDIN_BUILD_CONFIG_PASSED');
