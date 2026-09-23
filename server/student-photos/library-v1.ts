import type { RuntimeEnv } from '../env';

/** Non-secret locator of the existing FOTOS_ALUNOS library, verified through Graph.
 * No caller can select another drive or supply an arbitrary download/upload URL. */
export const PHOTO_LIBRARY_V1 = Object.freeze({
  driveId: 'b!-kbL2AHkqUCfgYdtWejLsAR6pIn6NHdIijwA010kbFYonDXCPQFURqsU3XFm1kqg',
  parentItemId: '01B2B4THN6Y2GOVW7725BZO354PWSELRRZ',
});
export function photoLibraryV1(env: RuntimeEnv) {
  if (env.SHAREPOINT_SITE_ID.toLowerCase() !== 'eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56')
    throw new Error('student-photo-library-unavailable');
  return PHOTO_LIBRARY_V1;
}
