export type RuntimeHomologationResult = {
  status: string;
  bearerOwnership: { status: string };
  d1Atomicity: { status: string };
};

export async function runBancoNotasRuntimeHomologation(args: {
  accessToken: string;
  origin: string;
  fetcher?: typeof fetch;
}): Promise<RuntimeHomologationResult> {
  const endpoint = new URL('/__banco-notas-homologation/run', args.origin);
  const response = await (args.fetcher ?? fetch)(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    cache: 'no-store',
  });
  const result = (await response.json()) as RuntimeHomologationResult & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'RUNTIME_HOMOLOGATION_FAILED');
  return result;
}

