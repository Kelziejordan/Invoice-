import React, { useState } from 'react';
import { BusinessProfile, Client, Item, Invoice, TemplateSettings } from '../types';
import { createIntegrityBackup, verifyAndParseBackup } from '../utils/backup';
import { Download, Upload, ShieldCheck, AlertTriangle, Database } from 'lucide-react';

interface BackupRestoreProps {
  business: BusinessProfile;
  clients: Client[];
  items: Item[];
  invoices: Invoice[];
  template: TemplateSettings;
  onRestore: (data: {
    business: BusinessProfile;
    clients: Client[];
    items: Item[];
    invoices: Invoice[];
    template: TemplateSettings;
  }) => Promise<void>;
}

export const BackupRestore: React.FC<BackupRestoreProps> = ({
  business,
  clients,
  items,
  invoices,
  template,
  onRestore
}) => {
  const [importStatus, setImportStatus] = useState<{ success?: string; error?: string }>({});
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  const handleExport = async () => {
    try {
      const backupJson = await createIntegrityBackup({
        business,
        clients,
        items,
        invoices,
        template
      });

      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `InvoiceStudio2_Backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportStatus({ error: `Export failed: ${msg}` });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus({});
    setIsRestoring(true);

    try {
      const fileText = await file.text();
      const verification = await verifyAndParseBackup(fileText);

      if (!verification.valid || !verification.data) {
        setImportStatus({ error: verification.error || 'Verification failed.' });
        setIsRestoring(false);
        return;
      }

      await onRestore(verification.data);
      setImportStatus({
        success: `Successfully restored ${verification.data.invoices.length} invoices, ${verification.data.clients.length} clients, and system profile settings.`
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setImportStatus({ error: `Restore error: ${msg}` });
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
          Backup & Restore (Cryptographic Integrity)
        </h2>
        <p className="text-xs text-slate-500 sm:text-sm">
          Export your complete workspace as a verified JSON file, or restore existing data locally.
        </p>
      </div>

      {importStatus.error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs sm:text-sm text-red-700" role="alert">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{importStatus.error}</span>
        </div>
      )}

      {importStatus.success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs sm:text-sm text-emerald-700" role="status">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{importStatus.success}</span>
        </div>
      )}

      {/* Export Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-base font-bold text-slate-900 mb-2">Export Local Backup</h3>
        <p className="text-xs text-slate-600 sm:text-sm mb-4">
          Create an offline JSON backup containing all your invoices, client directory, item library, business profile, and templates. The file includes a cryptographic SHA-256 hash to ensure data integrity during storage and transfer.
        </p>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-98"
        >
          <Download size={15} aria-hidden="true" />
          <span>Download Verified Backup (.json)</span>
        </button>
      </div>

      {/* Restore Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-base font-bold text-slate-900 mb-2">Restore from Backup</h3>
        <p className="text-xs text-slate-600 sm:text-sm mb-4">
          Import and verify an existing backup file. The cryptographic SHA-256 checksum will be validated before replacing any IndexedDB records.
        </p>
        <label
          className={`inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 ${
            isRestoring ? 'opacity-50 cursor-wait' : 'cursor-pointer'
          }`}
        >
          <Upload size={15} aria-hidden="true" />
          <span>{isRestoring ? 'Verifying & Restoring...' : 'Select Backup File (.json)'}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={isRestoring}
            onChange={handleImportFile}
            className="hidden"
          />
        </label>
      </div>

      {/* Storage Information */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 font-semibold text-slate-700 mb-1">
          <Database size={13} aria-hidden="true" />
          <span>IndexedDB Local Storage State</span>
        </div>
        <p>
          All records are stored directly within your local browser database (`InvoiceStudio2_DB`). No data is sent to any external server or cloud service.
        </p>
      </div>
    </div>
  );
};
