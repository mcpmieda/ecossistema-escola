import type { Buffer } from 'node:buffer';

export const UPSTREAM_URL: string;
export const UPSTREAM_SHA256: string;
export const PATCH_VERSION: string;
export const ARTIFACT_PATH: string;
export const OUTPUT_SHA256: string;
export const REFERENCE_COPY_SOURCE: string;

/** Receives the exact upstream Node buffer and returns the rejected derivative bytes. */
export function patchSheetJsReferenceV1(input: Buffer): Buffer;
