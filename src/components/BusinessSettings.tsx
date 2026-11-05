import React, { useState } from 'react';
import { BusinessProfile, TemplateSettings } from '../types';
import { Save, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';

interface BusinessSettingsProps {
  business: BusinessProfile;
  template: TemplateSettings;
  onSaveBusiness: (profile: BusinessProfile) => Promise<void>;
  onSaveTemplate: (template: TemplateSettings) => Promise<void>;
}

export const BusinessSettings: React.FC<BusinessSettingsProps> = ({
  business,
  template,
  onSaveBusiness,
  onSaveTemplate
}) => {
  const [profile, setProfile] = useState<BusinessProfile>({ ...business });
  const [tmpl, setTmpl] = useState<TemplateSettings>({ ...template });
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setErrorMsg('Logo image exceeds 1MB. Please upload a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfile((prev) => ({ ...prev, logoDataUrl: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg('');
      await onSaveBusiness(profile);
      await onSaveTemplate(tmpl);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to save settings: ${msg}`);
    }
  };

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Business Profile & Template Settings
          </h2>
          <p className="text-xs text-slate-500 sm:text-sm">
            Configure your company identity, default tax parameters, and template styling.
          </p>
        </div>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-98"
        >
          {savedSuccess ? (
            <Check size={14} className="text-white" aria-hidden="true" />
          ) : (
            <Save size={14} aria-hidden="true" />
          )}
          <span>{savedSuccess ? 'Saved!' : 'Save Settings'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Business Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Business Profile
        </h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="biz-name" className="block text-xs font-semibold text-slate-700">
              Business Name *
            </label>
            <input
              id="biz-name"
              type="text"
              required
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="biz-email" className="block text-xs font-semibold text-slate-700">
                Contact Email
              </label>
              <input
                id="biz-email"
                type="email"
                value={profile.contactEmail}
                onChange={(e) => setProfile({ ...profile, contactEmail: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="biz-phone" className="block text-xs font-semibold text-slate-700">
                Phone Number
              </label>
              <input
                id="biz-phone"
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="biz-address" className="block text-xs font-semibold text-slate-700">
                Business Address
              </label>
              <textarea
                id="biz-address"
                rows={2}
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="biz-taxid" className="block text-xs font-semibold text-slate-700">
                Tax ID / Business Registration
              </label>
              <input
                id="biz-taxid"
                type="text"
                placeholder="e.g. GST/HST Registration #"
                value={profile.taxId}
                onChange={(e) => setProfile({ ...profile, taxId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="biz-country" className="block text-xs font-semibold text-slate-700">
                Country
              </label>
              <input
                id="biz-country"
                type="text"
                value={profile.country || 'Canada'}
                onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor="biz-jurisdiction" className="block text-xs font-semibold text-slate-700">
                Province / Jurisdiction
              </label>
              <input
                id="biz-jurisdiction"
                type="text"
                value={profile.jurisdiction || 'Alberta'}
                onChange={(e) => setProfile({ ...profile, jurisdiction: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Logo Upload */}
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Business Logo (Max 1MB, offline stored)
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                <ImageIcon size={14} aria-hidden="true" />
                <span>Upload Logo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
              </label>

              {profile.logoDataUrl && (
                <div className="flex items-center gap-2">
                  <img
                    src={profile.logoDataUrl}
                    alt="Logo preview"
                    className="max-h-10 max-w-[120px] rounded border border-slate-200 p-1 object-contain bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, logoDataUrl: '' })}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="biz-pay" className="block text-xs font-semibold text-slate-700">
              Default Payment Instructions / Bank Details
            </label>
            <textarea
              id="biz-pay"
              rows={3}
              value={profile.paymentInstructions}
              onChange={(e) => setProfile({ ...profile, paymentInstructions: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Numbering & Defaults */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Invoicing & Currency Defaults
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="biz-curr" className="block text-xs font-semibold text-slate-700">
              Default Currency
            </label>
            <input
              id="biz-curr"
              type="text"
              maxLength={4}
              value={profile.defaultCurrency}
              onChange={(e) => setProfile({ ...profile, defaultCurrency: e.target.value.toUpperCase() })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm font-bold text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="biz-taxlbl" className="block text-xs font-semibold text-slate-700">
              Default Tax Label
            </label>
            <input
              id="biz-taxlbl"
              type="text"
              value={profile.defaultTaxLabel}
              onChange={(e) => setProfile({ ...profile, defaultTaxLabel: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="biz-taxrate" className="block text-xs font-semibold text-slate-700">
              Default Tax Rate (%)
            </label>
            <input
              id="biz-taxrate"
              type="number"
              step="0.01"
              min="0"
              value={profile.defaultTaxRate}
              onChange={(e) => setProfile({ ...profile, defaultTaxRate: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="biz-prefix" className="block text-xs font-semibold text-slate-700">
              Invoice Prefix
            </label>
            <input
              id="biz-prefix"
              type="text"
              value={profile.invoicePrefix}
              onChange={(e) => setProfile({ ...profile, invoicePrefix: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="biz-seq" className="block text-xs font-semibold text-slate-700">
              Next Sequence Number
            </label>
            <input
              id="biz-seq"
              type="number"
              min="1"
              value={profile.nextInvoiceNumber}
              onChange={(e) =>
                setProfile({ ...profile, nextInvoiceNumber: parseInt(e.target.value, 10) || 1 })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Template Settings */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          Template Styling & Appearance
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tmpl-accent" className="block text-xs font-semibold text-slate-700">
              Accent Color
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="tmpl-accent"
                type="color"
                value={tmpl.accentColor}
                onChange={(e) => setTmpl({ ...tmpl, accentColor: e.target.value })}
                className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5"
              />
              <input
                type="text"
                value={tmpl.accentColor}
                onChange={(e) => setTmpl({ ...tmpl, accentColor: e.target.value })}
                className="w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm font-mono text-slate-800 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label htmlFor="tmpl-footer" className="block text-xs font-semibold text-slate-700">
              Default Footer Note
            </label>
            <input
              id="tmpl-footer"
              type="text"
              value={tmpl.footerNote}
              onChange={(e) => setTmpl({ ...tmpl, footerNote: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Bottom Save Action Button */}
      <div className="flex items-center justify-end pt-2">
        <button
          type="submit"
          className={`inline-flex items-center gap-2 rounded-xl px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-md transition-all active:scale-98 ${
            savedSuccess
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {savedSuccess ? (
            <Check size={16} className="text-white" aria-hidden="true" />
          ) : (
            <Save size={16} aria-hidden="true" />
          )}
          <span>{savedSuccess ? 'Settings Saved Successfully!' : 'Save All Settings'}</span>
        </button>
      </div>

      {/* Always Visible Floating Action Button */}
      <div className="no-print fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-30">
        <button
          type="submit"
          className={`inline-flex items-center gap-2 rounded-full px-4 py-3 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-bold text-white shadow-2xl transition-all duration-200 active:scale-95 ${
            savedSuccess
              ? 'bg-emerald-600 hover:bg-emerald-700 ring-4 ring-emerald-100'
              : 'bg-blue-600 hover:bg-blue-700 ring-4 ring-blue-100/50'
          }`}
          title="Save Settings"
          aria-label="Save Settings"
        >
          {savedSuccess ? (
            <Check size={18} className="text-white" aria-hidden="true" />
          ) : (
            <Save size={18} aria-hidden="true" />
          )}
          <span>{savedSuccess ? 'Saved!' : 'Save Settings'}</span>
        </button>
      </div>
    </form>
  );
};
