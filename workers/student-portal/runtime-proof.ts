import { provePortalHyperdriveV1 } from '../../server/student-portal/runtime/hyperdrive-proof-v1';

interface ProofEnv {
  PORTAL_DB: Hyperdrive;
  PROOF_RUN_ID: string;
  PROOF_DEADLINE: string;
}
export default {
  async fetch() {
    return new Response(null, { status: 404 });
  },
  async scheduled(_event, env) {
    const remaining = Number(env.PROOF_DEADLINE) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 20 * 60_000) return;
    const passed = await provePortalHyperdriveV1(env.PORTAL_DB, env.PROOF_RUN_ID).catch(
      () => false,
    );
    // Only a synthetic run id and boolean result: never SQL, credentials or student data.
    console.log(`PORTAL_PROOF_V1:${env.PROOF_RUN_ID}:${passed ? 'pass' : 'fail'}`);
  },
} satisfies ExportedHandler<ProofEnv>;
