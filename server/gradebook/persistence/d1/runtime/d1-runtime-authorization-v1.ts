import type { PlatformCapability } from '../../../../../shared/platform-contract';
import { capabilitiesForRoles, requireCapability } from '../../../../auth/capabilities';
import type { Session } from '../../../../auth/session';
import { AuthorizationError } from '../../../../auth/roles';

export const GRADEBOOK_D1_ADMIN_CAPABILITY =
  'gradebook.persistence.admin' satisfies PlatformCapability;

declare const gradebookD1RuntimeAuthorizationBrand: unique symbol;

export type GradebookD1RuntimeAuthorizationV1 = Readonly<{
  [gradebookD1RuntimeAuthorizationBrand]: true;
}>;

const issuedAuthorizations = new WeakSet<object>();

export function authorizeGradebookD1RuntimeV1(
  session: Pick<Session, 'roles'>,
): GradebookD1RuntimeAuthorizationV1 {
  requireCapability(capabilitiesForRoles(session.roles), GRADEBOOK_D1_ADMIN_CAPABILITY);
  const authorization = Object.freeze({});
  issuedAuthorizations.add(authorization);
  return authorization as GradebookD1RuntimeAuthorizationV1;
}

export function requireGradebookD1RuntimeAuthorizationV1(
  authorization: unknown,
): asserts authorization is GradebookD1RuntimeAuthorizationV1 {
  if (
    authorization === null ||
    typeof authorization !== 'object' ||
    !issuedAuthorizations.has(authorization)
  ) {
    throw new AuthorizationError();
  }
}
