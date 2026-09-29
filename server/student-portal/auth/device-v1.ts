import type { AuditDetailV1 } from '../../../shared/student-portal-contracts/admin-v1';

type DeviceV1 = NonNullable<AuditDetailV1['device']>;

/**
 * Coarse device family of a sign-in (owner request 29/09/2026), enough to guide a family ("no
 * iPhone, pelo Safari") and never the user agent itself, a model or a version. Unknown reads as
 * "other"; no header at all keeps no device.
 */
export function deviceFamilyV1(userAgent: string | null | undefined): DeviceV1 | undefined {
  if (!userAgent) return undefined;
  const ua = userAgent.slice(0, 512);
  const platform: DeviceV1['platform'] = /Android/iu.test(ua)
    ? 'android'
    : /iPhone|iPad|iPod/iu.test(ua) || (/Macintosh/iu.test(ua) && /Mobile\//iu.test(ua))
      ? 'ios'
      : /CrOS/iu.test(ua)
        ? 'chromeos'
        : /Windows/iu.test(ua)
          ? 'windows'
          : /Macintosh|Mac OS X/iu.test(ua)
            ? 'macos'
            : /Linux/iu.test(ua)
              ? 'linux'
              : 'other';
  const browser: DeviceV1['browser'] = /SamsungBrowser/iu.test(ua)
    ? 'samsung'
    : /Edg(?:e|A|iOS)?\//iu.test(ua)
      ? 'edge'
      : /Firefox|FxiOS/iu.test(ua)
        ? 'firefox'
        : /Chrome|CriOS/iu.test(ua)
          ? 'chrome'
          : /Safari/iu.test(ua)
            ? 'safari'
            : 'other';
  return { platform, browser };
}
