# KDF evidence — #711

Measured 2026-09-12 with synthetic inputs only. Compatibility date 2026-09-11,
Wrangler 4.131.1, installed Workers types 5.20260911.1. No academic data,
production credentials, bindings or database were used by the benchmark.

## Choice

`scrypt-hmac-sha256-v1`: N=32768, r=8, p=3, 32-byte output; independent random
16-byte salt, 32-byte versioned pepper applied as HMAC-SHA256 to the KDF output
with domain separation. Native allocation guard `maxmem=64 MiB`. Exact parameters
are validated before execution; unknown/downgraded/abusive verifiers fail closed.
The raw derived buffer is cleared after HMAC. Missing pepper/key versions fail
closed; retained older versions can still verify existing credentials.

This parameter set is one of the documented [OWASP scrypt alternatives](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
Its principal memory workspace is 32 MiB (128 × N × r), plus implementation
overhead. This is an algorithmic bound, **not a measurement of total isolate RSS**.
[Native Argon2 is not supported by Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).

## Results

20 observations after two warm-up calls per supported alternative. Nearest-rank
percentiles; a 20-observation p99 is simply the maximum, not a production SLO.

| Environment / metric | Alternative | p50 ms | p95 ms | p99 ms |
| --- | --- | ---: | ---: | ---: |
| local workerd, host wall time | scrypt N32768/r8/p3 | 193.80 | 223.17 | 227.11 |
| local workerd, host wall time | scrypt N65536/r8/p2 | 264.29 | 271.71 | 288.30 |
| local workerd, host wall time | native PBKDF2-SHA256/600000 | 413.56 | 453.54 | 529.04 |
| local workerd, host wall time | WebCrypto PBKDF2-SHA256/600000 | 409.60 | 417.83 | 419.00 |
| remote Cloudflare preview, host wall time | scrypt N32768/r8/p3 | 268.68 | 334.02 | 334.65 |
| remote Cloudflare preview, host wall time | scrypt N65536/r8/p2 | 407.00 | 420.72 | 435.63 |
| local workerd, sampled non-idle CPU profile | scrypt N32768/r8/p3 | 196.89 | 214.21 | 229.52 |
| local workerd, sampled non-idle CPU profile | scrypt N65536/r8/p2 | 269.04 | 284.39 | 287.09 |

Remote native and WebCrypto PBKDF2 both rejected 600000 iterations with a runtime
limit of 100000. The implementation does **not** weaken PBKDF2 to that limit.
The remote preview was bounded, used a 1000 ms CPU configuration and was closed
after the test. It was not a persistent public deployment.

CPU profiles use the local workerd DevTools Profiler, summing sampled frame time
except `(idle)`. They are estimates with sampling overhead, not remote billable
CPU measurements. During those profiles the maximum observed post-call JS heap
was 1,804,264 bytes for scrypt32 and 1,861,844 bytes for scrypt64; backing storage
was 909,112 and 910,696 bytes respectively. These snapshots exclude the peak
native KDF workspace and are **not total peak memory**.

Remote `performance.now()` did not advance during CPU-only work and the
`process.memoryUsage()` fields returned zero. These results mean unavailable
instrumentation, not zero resource consumption. See [Workers timer behavior](https://developers.cloudflare.com/workers/runtime-apis/performance/)
and [CPU profiling](https://developers.cloudflare.com/workers/observability/dev-tools/cpu-usage/).

## Automated regression and remaining integrated gates

`crypto.workerd.ts` bundles and runs the exact CryptoPort implementation, including
salt/pepper derivation, correct/wrong secret, QR HMAC and opaque tokens. Unit tests
cover key absence/versioning and hostile parameters. Native PostgreSQL tests use
this KDF for activation/reset/block/rotation/birth races through separate Portal
connections. No synthetic crypto is injected into an enabled application path.

#714/#715 still own production-composed invocation CPU/peak-memory and load
acceptance, browser-cookie acceptance, and end-to-end private pilot evidence.
The benchmark does not authorize opening access or populating accounts. Common
annual locks still serialize these operations; load testing must measure lock
waits as well as KDF cost. A capacity failure blocks activation rather than
lowering KDF strength, increasing resource limits or buying a plan automatically.

Runtime composition must supply the real versioned secret maps and Siteverify
verifier. The fixed Turnstile action is `student_portal_auth`, checked with the
exact `aluno.escolaieda.com` hostname. No benchmark token or key belongs in that
configuration.
