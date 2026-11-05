import { describe, it, expect } from 'vitest';
import { createIntegrityBackup, verifyAndParseBackup, computeSha256 } from '../src/utils/backup';
import { DEFAULT_BUSINESS_PROFILE, DEFAULT_TEMPLATE } from '../src/services/storage';

describe('Backup & Restore SHA-256 Integrity Verification', () => {
  it('computes correct SHA-256 hexadecimal hash', async () => {
    const hash = await computeSha256('hello world');
    expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('creates and verifies a legitimate backup envelope', async () => {
    const testData = {
      business: DEFAULT_BUSINESS_PROFILE,
      clients: [
        {
          id: 'cli_1',
          name: 'Stark Industries',
          email: 'tony@stark.com',
          phone: '123-456-7890',
          billingAddress: '10880 Malibu Point, Malibu, CA',
          notes: '',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01'
        }
      ],
      items: [],
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    const exportedString = await createIntegrityBackup(testData);
    expect(exportedString).toContain('"checksumSha256"');
    expect(exportedString).toContain('"app": "InvoiceStudio2"');

    const result = await verifyAndParseBackup(exportedString);
    expect(result.valid).toBe(true);
    expect(result.data?.business.name).toBe(DEFAULT_BUSINESS_PROFILE.name);
    expect(result.data?.clients.length).toBe(1);
  });

  it('rejects tampered JSON payload with checksum mismatch', async () => {
    const testData = {
      business: DEFAULT_BUSINESS_PROFILE,
      clients: [],
      items: [],
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    const exportedString = await createIntegrityBackup(testData);
    const parsed = JSON.parse(exportedString);

    // Tamper with data payload
    parsed.data.business.name = 'Tampered Fraudulent Co.';
    const tamperedString = JSON.stringify(parsed);

    const result = await verifyAndParseBackup(tamperedString);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Integrity check failed: Checksum mismatch');
  });

  it('rejects malformed or invalid JSON payloads', async () => {
    const result = await verifyAndParseBackup('{ not valid json');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Malformed JSON');
  });

  it('rejects non-InvoiceStudio2 backups or wrong schema versions', async () => {
    const wrongApp = JSON.stringify({
      schemaVersion: 2,
      app: 'AnotherApp',
      data: {},
      checksumSha256: 'xyz'
    });
    const res1 = await verifyAndParseBackup(wrongApp);
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('Not an Invoice Studio 2 backup file');

    const wrongVersion = JSON.stringify({
      schemaVersion: 99,
      app: 'InvoiceStudio2',
      data: {},
      checksumSha256: 'xyz'
    });
    const res2 = await verifyAndParseBackup(wrongVersion);
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain('Unsupported schema version');
  });
});
