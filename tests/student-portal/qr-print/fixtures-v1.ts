import { printCardV1 } from '../../../shared/student-portal-contracts/admin-v1';
import type {
  PrintCardV1,
  PrintModeV1,
} from '../../../src/features/student-portal-admin/credentials/qr-values-v1';
export const qrPrintIdV1 = (n: number) => '75500000-0000-4000-8000-' + String(n).padStart(12, '0');
/** Invented, unsigned credential-shaped payloads: cannot authenticate real students. */
export const qrPrintUrlV1 = (n: number) =>
  `https://aluno.escolaieda.com/access#v1.SYNTHETIC${String(n).padStart(34, '0')}.1.${'B'.repeat(43)}`;
export function qrPrintCardsV1(count = 1, mode: PrintModeV1 = 'qr-name-class'): PrintCardV1[] {
  return Array.from({ length: count }, (_, index) =>
    printCardV1.parse({
      accountId: qrPrintIdV1(index + 1),
      qr: qrPrintUrlV1(index + 1),
      mode,
      ...(mode !== 'qr-only'
        ? {
            name:
              index === 0
                ? ('SYNTHETIC JOÃO CONCEIÇÃO ÁLVARES ' + 'NOME COMPOSTO '.repeat(16)).slice(0, 200)
                : index === count - 1
                  ? 'W'.repeat(200)
                  : 'SYNTHETIC PRINT ' + String(index + 1).padStart(3, '0'),
          }
        : {}),
      ...(mode === 'qr-name-class'
        ? { classLabel: index === count - 1 ? 'W'.repeat(80) : 'SYNTHETIC CLASS 6A' }
        : {}),
    }),
  );
}
