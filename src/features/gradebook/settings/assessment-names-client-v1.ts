import {
  assessmentNamesRequestSchemaV1,
  assessmentNamesResponseSchemaV1,
  type AssessmentNamesRequestV1,
  type AssessmentNamesResponseV1,
} from '../../../../shared/gradebook-contracts/settings/assessment-names-v1';

export async function requestAssessmentNamesV1(
  input: AssessmentNamesRequestV1,
  signal?: AbortSignal,
): Promise<AssessmentNamesResponseV1> {
  const request = assessmentNamesRequestSchemaV1.safeParse(input);
  if (!request.success) return { contractVersion: 1, state: 'invalid-request' };
  const response = await fetch('/api/gradebook/assessment-names', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.data),
  });
  if (response.status === 401 || response.status === 403)
    return { contractVersion: 1, state: 'not-authorized' };
  const text = await response.text();
  if (text.length > 16_384) return { contractVersion: 1, state: 'unavailable' };
  try {
    const parsed = assessmentNamesResponseSchemaV1.safeParse(JSON.parse(text));
    if (
      !parsed.success ||
      (parsed.data.state === 'ready' && (!response.ok || parsed.data.year !== request.data.year))
    )
      return { contractVersion: 1, state: 'unavailable' };
    return parsed.data;
  } catch {
    return { contractVersion: 1, state: 'unavailable' };
  }
}
