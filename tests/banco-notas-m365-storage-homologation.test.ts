// @vitest-environment node

import { writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { genericModelInstanceSchema } from '../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSchema } from '../shared/banco-notas-workbook-presentation';
import { xlsxLegacyAnalysisProfileSchema } from '../shared/banco-notas-xlsx-analysis-profile';
import type { RuntimeEnv } from '../server/env';
import { createTeacherModelGraphGateway } from '../server/banco-notas/teacher-model-graph-gateway';
import { createGenericXlsxLegacyAnalyzer } from '../server/banco-notas/xlsx-legacy-analyzer';
import { assertSharePointWorkbookIntegrity } from '../server/banco-notas/xlsx-sharepoint-integrity';
import { createGenericXlsxWorkbookSerializer } from '../server/banco-notas/xlsx-workbook-serializer';
import { graphContentRequest, graphRequest } from '../server/graph/client';
import {
  analyzeLegacyWorkbook,
  serializeGenericWorkbook,
} from '../server/banco-notas/workbook-pipeline';

const homologationEnabled = process.env.BANCO_NOTAS_M365_HOMOLOGATION === '1';
const homologation = homologationEnabled ? describe : describe.skip;
const homologationStage = process.env.BANCO_NOTAS_M365_HOMOLOGATION_STAGE ?? 'storage';
const replaceStage = homologationStage === 'replace';
const shareStage = homologationStage === 'share' || replaceStage;
const driveName = 'ARQUIVOS_PLATAFORMA';
const folderName = 'BANCO_NOTAS_HOMOLOGACAO';
const runSuffix = (process.env.GITHUB_RUN_ID ?? 'local').replace(/[^a-zA-Z0-9_-]/gu, '') || 'local';
const fileName = shareStage
  ? 'banco-notas-share-excel-sintetico-20260826.xlsx'
  : `banco-notas-roundtrip-sintetico-${runSuffix}.xlsx`;

const modelId = '71111111-1111-4111-8111-111111111111';
const teacherId = '72222222-2222-4222-8222-222222222222';
const classId = '73333333-3333-4333-8333-333333333333';
const componentId = '74444444-4444-4444-8444-444444444444';
const studentId = '75555555-5555-4555-8555-555555555555';
const relationshipSnapshotId = '76666666-6666-4666-8666-666666666666';
const sheetKey = `generated:${classId}:${componentId}`;
const gradeKey = `2026|${classId}|${componentId}|${studentId}`;

const instance = genericModelInstanceSchema.parse({
  schemaVersion: 1,
  modelId,
  teacherEntraObjectId: teacherId,
  schoolYear: 2026,
  definitionVersion: '2026.1-m365-storage-homologation',
  sourceHash: '7'.repeat(64),
  relationshipSnapshotId,
  environment: 'homologation',
  syncEnabled: false,
  mappingVersion: 1,
  layout: {
    layoutVersion: '2026.1-m365-storage-homologation-layout',
    firstStudentRow: 2,
    gradeColumns: [
      { field: 'NotaT1', column: 'B' },
      { field: 'NotaFinal', column: 'C' },
    ],
  },
  mappings: [
    { gradeKey, field: 'NotaT1', sheetKey, studentPosition: 1, cellAddress: 'B2' },
    { gradeKey, field: 'NotaFinal', sheetKey, studentPosition: 1, cellAddress: 'C2' },
  ],
});

const presentation = genericWorkbookPresentationSchema.parse({
  schemaVersion: 1,
  presentationVersion: '2026.1-m365-homologation',
  modelId,
  schoolYear: 2026,
  title: 'Banco de Notas 2026',
  teacherDisplayName: 'Docente Sintético',
  studentPositionColumn: 'A',
  studentNameColumn: 'D',
  positionHeader: 'Nº',
  studentHeader: 'Estudante',
  gradeHeaders: [
    { field: 'NotaT1', label: '1º trimestre' },
    { field: 'NotaFinal', label: 'Nota final' },
  ],
  sheets: [
    {
      sheetKey,
      displayName: 'Turma Sintética - Matemática',
      classDisplayName: 'Turma Sintética',
      componentDisplayName: 'Matemática',
      rows: [{ studentPosition: 1, gradeKey, studentDisplayName: 'Estudante Sintético' }],
    },
  ],
});

const profile = xlsxLegacyAnalysisProfileSchema.parse({
  schemaVersion: 1,
  profileId: 'm365-storage-homologation-v1',
  analysisVersion: 'xlsx-m365-storage-homologation-v1',
  worksheetRules: [
    {
      ruleId: 'class-component',
      sheetNamePattern: '^(?<class>.+?) - (?<component>.+)$',
      caseInsensitive: false,
      studentNameColumn: 'D',
      firstStudentRow: 2,
      maxStudentRows: 100,
      gradeColumns: [
        { field: 'NotaT1', column: 'B' },
        { field: 'NotaFinal', column: 'C' },
      ],
    },
  ],
});

type Drive = { id: string; name: string; driveType?: string };
type DriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
};
type PermissionIdentity = {
  user?: { id?: string };
  group?: { id?: string };
};
type Permission = {
  id: string;
  roles?: string[];
  link?: { scope?: string; type?: string };
  invitation?: { email?: string };
  grantedToV2?: PermissionIdentity;
  grantedToIdentitiesV2?: PermissionIdentity[];
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`m365_homologation_missing_env:${name}`);
  return value;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 180) : 'unknown_error';
}

async function githubOidcGraphToken(): Promise<string> {
  const requestUrl = new URL(requiredEnv('ACTIONS_ID_TOKEN_REQUEST_URL'));
  requestUrl.searchParams.set('audience', 'api://AzureADTokenExchange');
  const oidcResponse = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${requiredEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN')}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!oidcResponse.ok) throw new Error(`m365_homologation_oidc_failed:${oidcResponse.status}`);
  const oidc = (await oidcResponse.json()) as { value?: string };
  if (!oidc.value) throw new Error('m365_homologation_oidc_token_missing');

  const tenantId = requiredEnv('ENTRA_TENANT_ID');
  const clientId = requiredEnv('ENTRA_OPERATIONS_CLIENT_ID');
  const tokenResponse = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: oidc.value,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenResponse.ok || !token.access_token) {
    throw new Error(`m365_homologation_token_exchange_failed:${tokenResponse.status}`);
  }
  return token.access_token;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function resolveDriveAndFolder(
  token: string,
): Promise<{ driveId: string; folderId: string }> {
  const siteId = requiredEnv('SHAREPOINT_SITE_ID');
  const env = {} as RuntimeEnv;
  const encodedSiteId = encodeURIComponent(siteId);
  const drives = (
    await graphRequest<{ value: Drive[] }>({
      env,
      token,
      path: `/sites/${encodedSiteId}/drives?$select=id,name,driveType&$top=200`,
      correlationId: 'banco-notas-m365-drive-discovery',
    })
  ).data.value.filter((drive) => drive.name === driveName);

  if (drives.length !== 1) throw new Error(`m365_homologation_drive_count:${drives.length}`);
  const drive = drives[0]!;
  const encodedDriveId = encodeURIComponent(drive.id);
  const children = (
    await graphRequest<{ value: DriveItem[] }>({
      env,
      token,
      path: `/drives/${encodedDriveId}/root/children?$select=id,name,folder&$top=200`,
      correlationId: 'banco-notas-m365-folder-discovery',
    })
  ).data.value.filter((item) => item.name === folderName);

  if (children.length > 1) throw new Error('m365_homologation_folder_duplicated');
  if (children.length === 1) {
    if (!children[0]!.folder) throw new Error('m365_homologation_target_is_not_folder');
    return { driveId: drive.id, folderId: children[0]!.id };
  }

  const created = (
    await graphRequest<DriveItem>({
      env,
      token,
      path: `/drives/${encodedDriveId}/root/children`,
      method: 'POST',
      body: {
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      },
      correlationId: 'banco-notas-m365-folder-create',
    })
  ).data;
  if (!created.id || !created.folder) throw new Error('m365_homologation_folder_create_invalid');
  return { driveId: drive.id, folderId: created.id };
}

homologation('Banco de Notas M365 storage homologation', () => {
  it('creates/reuses the dedicated folder and round-trips a synthetic XLSX through the real Graph gateway', async () => {
    const token = await githubOidcGraphToken();
    const target = await resolveDriveAndFolder(token);
    const artifact = await serializeGenericWorkbook({
      instance,
      serializer: createGenericXlsxWorkbookSerializer(presentation),
    });
    const content = new Uint8Array(artifact.bytes.byteLength);
    content.set(artifact.bytes);
    expect(await sha256(content)).toBe(artifact.metadata.sha256);

    const gateway = createTeacherModelGraphGateway({
      env: {} as RuntimeEnv,
      target: { driveId: target.driveId, parentItemId: target.folderId },
      dependencies: { tokenProvider: async () => token },
    });

    let driveItemId: string | undefined;
    let cleanupSucceeded = false;
    let cleanupError = '';
    let analysisSucceeded = false;
    let failure = '';
    let metadataByteLength: number | undefined;
    let downloadedByteLength: number | undefined;
    let uploadEtag = '';
    let metadataEtag = '';
    let downloadedContentType = '';
    let downloadedBytes: Uint8Array | undefined;
    let downloadedHash = '';
    let packageIntegrity: 'exact' | 'sharepoint_normalized' | undefined;
    let analysisError = '';
    let permissionId: string | undefined;
    let recipientIdentityMatch = false;
    let permissionBoundaryVerified = false;
    let resourceRetainedForExcel = false;
    let previousRecipientPermissionRevoked = false;
    let previousWorkbookRemoved = false;
    let preexistingEffectiveUserPermissionCount: number | undefined;
    let webUrl = '';
    let executionError: unknown;
    try {
      if (shareStage) {
        const existing = (
          await graphRequest<{ value: DriveItem[] }>({
            env: {} as RuntimeEnv,
            token,
            path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(target.folderId)}/children?$select=id,name,file&$top=200`,
            correlationId: 'banco-notas-m365-share-preflight',
          })
        ).data.value.filter((item) => item.name === fileName);
        if (!replaceStage && existing.length !== 0) {
          throw new Error('m365_homologation_share_file_preexisting');
        }
        if (replaceStage) {
          if (existing.length !== 1 || !existing[0]!.file) {
            throw new Error(`m365_homologation_replace_file_count:${existing.length}`);
          }
          const previousDriveItemId = existing[0]!.id;
          const recipientEntraObjectId = requiredEnv('BANCO_NOTAS_M365_RECIPIENT_OID');
          const previousPermissions = (
            await graphRequest<{ value: Permission[] }>({
              env: {} as RuntimeEnv,
              token,
              path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(previousDriveItemId)}/permissions?$select=id,roles,link,invitation,grantedToV2,grantedToIdentitiesV2`,
              correlationId: 'banco-notas-m365-replace-permissions',
            })
          ).data.value;
          if (
            previousPermissions.some(
              (permission) =>
                permission.link?.scope === 'anonymous' ||
                permission.link?.scope === 'organization' ||
                Boolean(permission.grantedToV2?.group?.id) ||
                Boolean(permission.grantedToIdentitiesV2?.some((identity) => identity.group?.id)),
            )
          ) {
            throw new Error('m365_homologation_replace_broad_permission_detected');
          }
          const recipientPermissions = previousPermissions.filter((permission) => {
            const userIds = [
              permission.grantedToV2?.user?.id,
              ...(permission.grantedToIdentitiesV2?.map((identity) => identity.user?.id) ?? []),
            ].filter((id): id is string => Boolean(id));
            return userIds.includes(recipientEntraObjectId) && permission.roles?.includes('write');
          });
          if (recipientPermissions.length !== 1) {
            throw new Error(
              `m365_homologation_replace_recipient_permission_count:${recipientPermissions.length}`,
            );
          }
          await gateway.revokeShare({
            driveItemId: previousDriveItemId,
            permissionId: recipientPermissions[0]!.id,
            correlationId: 'banco-notas-m365-replace-revoke',
          });
          previousRecipientPermissionRevoked = true;
          await gateway.remove({
            driveItemId: previousDriveItemId,
            correlationId: 'banco-notas-m365-replace-remove',
          });
          previousWorkbookRemoved = true;
          const remaining = (
            await graphRequest<{ value: DriveItem[] }>({
              env: {} as RuntimeEnv,
              token,
              path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(target.folderId)}/children?$select=id,name,file&$top=200`,
              correlationId: 'banco-notas-m365-replace-confirm-remove',
            })
          ).data.value.filter((item) => item.name === fileName);
          if (remaining.length !== 0) {
            throw new Error('m365_homologation_replace_file_still_present');
          }
        }
      }

      const stored = await gateway.store({
        fileName,
        content,
        correlationId: 'banco-notas-m365-store',
      });
      driveItemId = stored.driveItemId;
      uploadEtag = stored.etag;

      const metadata = await gateway.metadata({
        driveItemId,
        correlationId: 'banco-notas-m365-metadata',
      });
      metadataByteLength = metadata.size;
      metadataEtag = metadata.etag;

      const downloaded = await gateway.download({
        driveItemId,
        correlationId: 'banco-notas-m365-download',
      });
      downloadedBytes = downloaded;
      downloadedByteLength = downloaded.byteLength;
      downloadedHash = await sha256(downloaded);

      const directDownload = await graphContentRequest({
        env: {} as RuntimeEnv,
        token,
        path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(driveItemId)}/content`,
        method: 'GET',
        correlationId: 'banco-notas-m365-download-diagnostic',
      });
      downloadedContentType = directDownload.response.headers.get('Content-Type') ?? '';
      expect(new Uint8Array(await directDownload.response.arrayBuffer())).toEqual(downloaded);
      packageIntegrity = await assertSharePointWorkbookIntegrity(content, downloaded);

      try {
        const analysis = await analyzeLegacyWorkbook({
          source: {
            metadata: {
              sourceFormat: 'xlsx',
              sourceHash: downloadedHash,
              byteLength: downloaded.byteLength,
              schoolYear: 2026,
            },
            bytes: downloaded,
          },
          analyzer: createGenericXlsxLegacyAnalyzer(profile),
        });
        expect(analysis.model.classes.map((item) => item.displayName)).toEqual(['Turma Sintética']);
        expect(analysis.model.components.map((item) => item.displayName)).toEqual(['Matemática']);
        expect(analysis.model.students.map((item) => item.displayName)).toEqual([
          'Estudante Sintético',
        ]);
        expect(analysis.model.findings).toEqual([]);
        analysisSucceeded = true;
      } catch (error) {
        analysisError = safeError(error);
      }

      expect(metadataByteLength).toBe(downloadedByteLength);
      expect(packageIntegrity).toBe('sharepoint_normalized');
      expect(analysisSucceeded).toBe(true);

      if (shareStage) {
        const recipientUpn = requiredEnv('BANCO_NOTAS_M365_RECIPIENT_UPN');
        const recipientEntraObjectId = requiredEnv('BANCO_NOTAS_M365_RECIPIENT_OID');
        const permissionsBeforeShare = (
          await graphRequest<{ value: Permission[] }>({
            env: {} as RuntimeEnv,
            token,
            path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(driveItemId)}/permissions?$select=id,roles,link,invitation,grantedToV2,grantedToIdentitiesV2`,
            correlationId: 'banco-notas-m365-share-permissions-before',
          })
        ).data.value;
        const preexistingPermissionIds = new Set(
          permissionsBeforeShare.map((permission) => permission.id),
        );
        preexistingEffectiveUserPermissionCount = permissionsBeforeShare.filter(
          (permission) =>
            Boolean(permission.grantedToV2?.user?.id) ||
            Boolean(permission.grantedToIdentitiesV2?.some((identity) => identity.user?.id)),
        ).length;
        const shared = await gateway.share({
          driveItemId,
          recipientUpn,
          recipientEntraObjectId,
          requireSignIn: true,
          correlationId: 'banco-notas-m365-share',
        });
        permissionId = shared.permissionId;

        const item = (
          await graphRequest<DriveItem>({
            env: {} as RuntimeEnv,
            token,
            path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(driveItemId)}?$select=id,name,webUrl,file`,
            correlationId: 'banco-notas-m365-share-item',
          })
        ).data;
        if (item.name !== fileName || !item.webUrl || !item.file) {
          throw new Error('m365_homologation_share_item_invalid');
        }
        webUrl = item.webUrl;

        const permissions = (
          await graphRequest<{ value: Permission[] }>({
            env: {} as RuntimeEnv,
            token,
            path: `/drives/${encodeURIComponent(target.driveId)}/items/${encodeURIComponent(driveItemId)}/permissions?$select=id,roles,link,invitation,grantedToV2,grantedToIdentitiesV2`,
            correlationId: 'banco-notas-m365-share-permissions',
          })
        ).data.value;
        const granted = permissions.find((permission) => permission.id === permissionId);
        const grantedUserIds = [
          granted?.grantedToV2?.user?.id,
          ...(granted?.grantedToIdentitiesV2?.map((identity) => identity.user?.id) ?? []),
        ].filter((id): id is string => Boolean(id));
        recipientIdentityMatch = grantedUserIds.includes(recipientEntraObjectId);
        const hasBroadLink = permissions.some(
          (permission) =>
            permission.link?.scope === 'anonymous' || permission.link?.scope === 'organization',
        );
        const hasGroupGrant = permissions.some(
          (permission) =>
            Boolean(permission.grantedToV2?.group?.id) ||
            Boolean(permission.grantedToIdentitiesV2?.some((identity) => identity.group?.id)),
        );
        const newOtherSharedUser = permissions.some((permission) => {
          if (preexistingPermissionIds.has(permission.id)) return false;
          const userIds = [
            permission.grantedToV2?.user?.id,
            ...(permission.grantedToIdentitiesV2?.map((identity) => identity.user?.id) ?? []),
          ].filter((id): id is string => Boolean(id));
          return userIds.some((id) => id !== recipientEntraObjectId);
        });
        expect(recipientIdentityMatch).toBe(true);
        expect(granted?.roles).toContain('write');
        expect(granted?.link?.scope).not.toBe('anonymous');
        expect(granted?.link?.scope).not.toBe('organization');
        expect(hasBroadLink).toBe(false);
        expect(hasGroupGrant).toBe(false);
        expect(newOtherSharedUser).toBe(false);
        permissionBoundaryVerified = true;
        resourceRetainedForExcel = true;
      }
    } catch (error) {
      failure = safeError(error);
      executionError = error;
    } finally {
      if (driveItemId && !resourceRetainedForExcel) {
        try {
          if (permissionId) {
            await gateway.revokeShare({
              driveItemId,
              permissionId,
              correlationId: 'banco-notas-m365-share-compensation',
            });
          }
          await gateway.remove({
            driveItemId,
            correlationId: 'banco-notas-m365-cleanup',
          });
          cleanupSucceeded = true;
        } catch (error) {
          cleanupError = safeError(error);
        }
      }
      await writeFile(
        'banco-notas-m365-homologation-audit.json',
        `${JSON.stringify(
          {
            status:
              packageIntegrity &&
              analysisSucceeded &&
              (shareStage
                ? resourceRetainedForExcel && recipientIdentityMatch && permissionBoundaryVerified
                : cleanupSucceeded)
                ? 'success'
                : 'failed',
            storageBoundary: 'ARQUIVOS_PLATAFORMA/BANCO_NOTAS_HOMOLOGACAO',
            source: 'synthetic-generic-xlsx',
            executionEnvironment: 'node',
            syncEnabled: false,
            stage: homologationStage,
            sharing: shareStage ? 'individual-write-no-invitation' : 'not-performed-storage-only',
            recipientUpn: shareStage ? requiredEnv('BANCO_NOTAS_M365_RECIPIENT_UPN') : undefined,
            recipientIdentityMatch: shareStage ? recipientIdentityMatch : undefined,
            permissionBoundaryVerified: shareStage ? permissionBoundaryVerified : undefined,
            preexistingEffectiveUserPermissionCount: shareStage
              ? preexistingEffectiveUserPermissionCount
              : undefined,
            permissionIdPresent: shareStage ? Boolean(permissionId) : undefined,
            webUrl: resourceRetainedForExcel ? webUrl : undefined,
            uploadPerformed: Boolean(driveItemId),
            expectedByteLength: content.byteLength,
            metadataByteLength,
            downloadedByteLength,
            expectedHash: artifact.metadata.sha256,
            downloadedHash,
            uploadEtag: uploadEtag || undefined,
            metadataEtag: metadataEtag || undefined,
            downloadedContentType: downloadedContentType || undefined,
            downloadedZipSignature: downloadedBytes
              ? Array.from(downloadedBytes.slice(0, 4), (byte) =>
                  byte.toString(16).padStart(2, '0'),
                ).join('')
              : undefined,
            normalizationObserved: downloadedHash !== artifact.metadata.sha256,
            packageIntegrity,
            metadataMatchesDownloadedContent: metadataByteLength === downloadedByteLength,
            byteExactUpload: downloadedHash === artifact.metadata.sha256,
            downloadedHashVerified: downloadedHash === artifact.metadata.sha256,
            ooxmlReanalysis: analysisSucceeded,
            ooxmlReanalysisError: analysisError || undefined,
            uploadedFileRemoved: cleanupSucceeded,
            retainedForExcelValidation: resourceRetainedForExcel,
            previousRecipientPermissionRevoked: replaceStage
              ? previousRecipientPermissionRevoked
              : undefined,
            previousWorkbookRemoved: replaceStage ? previousWorkbookRemoved : undefined,
            cleanupError: cleanupError || undefined,
            failure: failure || undefined,
            dedicatedFolderRetained: true,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
    }
    if (executionError !== undefined) throw executionError;
    if (cleanupError) throw new Error(`m365_homologation_cleanup_failed:${cleanupError}`);
    if (shareStage && !resourceRetainedForExcel) {
      throw new Error('m365_homologation_share_resource_not_retained');
    }
  }, 60_000);
});
