import { ExportBackupEnvelope } from '../types';

export async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createIntegrityBackup(
  payloadData: ExportBackupEnvelope['data']
): Promise<string> {
  const dataString = JSON.stringify(payloadData);
  const checksum = await computeSha256(dataString);

  const envelope: ExportBackupEnvelope = {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    app: 'InvoiceStudio2',
    data: payloadData,
    checksumSha256: checksum
  };

  return JSON.stringify(envelope, null, 2);
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
  data?: ExportBackupEnvelope['data'];
}

export async function verifyAndParseBackup(jsonString: string): Promise<VerificationResult> {
  if (!jsonString || typeof jsonString !== 'string') {
    return { valid: false, error: 'Backup content is empty or invalid.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return { valid: false, error: 'Malformed JSON: Unable to parse backup payload.' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { valid: false, error: 'Invalid backup structure: Root must be a JSON object.' };
  }

  const envelope = parsed as Partial<ExportBackupEnvelope>;
  if (envelope.app !== 'InvoiceStudio2') {
    return { valid: false, error: 'Invalid backup: Not an Invoice Studio 2 backup file.' };
  }

  if (envelope.schemaVersion !== 2) {
    return { valid: false, error: `Unsupported schema version: ${envelope.schemaVersion}. Expected version 2.` };
  }

  if (!envelope.data || typeof envelope.data !== 'object') {
    return { valid: false, error: 'Backup envelope is missing data payload.' };
  }

  if (!envelope.checksumSha256 || typeof envelope.checksumSha256 !== 'string') {
    return { valid: false, error: 'Missing integrity checksum in backup envelope.' };
  }

  const computed = await computeSha256(JSON.stringify(envelope.data));
  if (computed !== envelope.checksumSha256) {
    return {
      valid: false,
      error: 'Integrity check failed: Checksum mismatch. The file may have been tampered with or corrupted in transit.'
    };
  }

  return {
    valid: true,
    data: envelope.data as ExportBackupEnvelope['data']
  };
}
