import type { RuntimeEnv } from '../server/env';

export const testEnv = {
  TENANT_ID: 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
  WEB_CLIENT_ID: '78185e20-c824-4acc-9ccd-41b9f7509a6f',
  GRAPH_CLIENT_ID: '7d565352-1f77-4a7c-a4a4-4ae1b55b5c0c',
  SHAREPOINT_SITE_ID:
    'eduieda.sharepoint.com,d8cb46fa-e401-40a9-9f81-876d59e8cbb0,89a47a04-34fa-4877-8a3c-00d35d246c56',
  GROUP_ADMIN_ID: '6b9be4a5-52a4-4e41-8654-1564f14e5ab5',
  GROUP_PROFESSOR_ID: '96227794-63b1-421c-96f4-cd062fcdf00a',
  GROUP_ALUNO_ID: '8255b76e-dd85-4d04-a360-8ce1baf6ce63',
  GROUP_APOIO_ID: '74386ce1-2db4-4352-8618-7ab4659ab7b6',
  GROUP_VISITANTE_ID: '9b0283b8-8883-4257-8085-3ac60060d489',
  OFFICIAL_ORIGIN: 'https://admin.escolaieda.com',
  WEB_PRIVATE_KEY_PKCS8: 'x'.repeat(256),
  WEB_CERT_THUMBPRINT: 'thumbprint-value-12345',
  GRAPH_PRIVATE_KEY_PKCS8: 'x'.repeat(256),
  GRAPH_CERT_THUMBPRINT: 'thumbprint-value-12345',
  SESSION_SECRET: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFG',
} satisfies RuntimeEnv;
