import { describe, expect, it, vi } from 'vitest';
import {
  parseCertificateValidity,
  readCertificateValidity,
} from '../../scripts/entra/certificate-validity';

const OPENSSL_FIXTURE = [
  'notBefore=Sep 19 13:55:07 2026 GMT',
  'notAfter=Mar 18 13:55:07 2027 GMT',
  '',
].join('\n');

describe('certificate validity extraction', () => {
  it('converts distinct X.509 notBefore and notAfter values to UTC ISO timestamps', () => {
    expect(parseCertificateValidity(OPENSSL_FIXTURE)).toEqual({
      startDateTime: '2026-09-19T13:55:07.000Z',
      endDateTime: '2027-03-18T13:55:07.000Z',
    });
  });

  it('reads the validity window through the bounded openssl command', () => {
    const runner = vi.fn(() => OPENSSL_FIXTURE);
    expect(readCertificateValidity('/tmp/candidate.pem', runner)).toEqual({
      startDateTime: '2026-09-19T13:55:07.000Z',
      endDateTime: '2027-03-18T13:55:07.000Z',
    });
    expect(runner).toHaveBeenCalledWith(
      'openssl',
      ['x509', '-in', '/tmp/candidate.pem', '-noout', '-startdate', '-enddate'],
      { encoding: 'utf8' },
    );
  });

  it('fails closed when the validity window is missing or reversed', () => {
    expect(() => parseCertificateValidity('notBefore=Sep 19 13:55:07 2026 GMT\n'))
      .toThrow('Invalid certificate validity');
    expect(() => parseCertificateValidity([
      'notBefore=Sep 19 13:55:07 2027 GMT',
      'notAfter=Mar 18 13:55:07 2027 GMT',
    ].join('\n'))).toThrow('Invalid certificate validity');
  });
});
