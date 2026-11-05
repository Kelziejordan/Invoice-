import React, { useState } from 'react';
import {
  BusinessProfile,
  Client,
  Item,
  Invoice,
  InvoiceLineItem,
  TemplateSettings,
  BuddyInvoiceDraft
} from '../types';
import { calculateInvoiceTotals, formatCurrency } from '../utils/calc';
import { formatInvoiceNumber } from '../utils/numbering';
import { Plus, Trash2, ArrowLeft, Check, Sparkles, AlertCircle, Loader2, Save } from 'lucide-react';

interface InvoiceBuilderProps {
  business: BusinessProfile;
  clients: Client[];
  items: Item[];
  template: TemplateSettings;
  existingInvoice?: Invoice;
  initialExtraItems?: InvoiceLineItem[];
  initialDraft?: BuddyInvoiceDraft;
  onSave: (invoice: Invoice) => Promise<void>;
  onCancel: () => void;
  onOpenBuddyWithContext: (callback: (newItems: InvoiceLineItem[]) => void) => void;
  onQuickAddClient: () => void;
  onGoToSettings?: () => void;
}

export const InvoiceBuilder: React.FC<InvoiceBuilderProps> = ({
  business,
  clients,
  items,
  template,
  existingInvoice,
  initialExtraItems,
  initialDraft,
  onSave,
  onCancel,
  onOpenBuddyWithContext,
  onQuickAddClient,
  onGoToSettings
}) => {
  const [clientId, setClientId] = useState<string>(() => {
    if (existingInvoice?.clientId) return existingInvoice.clientId;
    if (initialDraft?.customer?.matchedClientId) return initialDraft.customer.matchedClientId;
    if (initialDraft?.customer?.name) {
      const match = clients.find(
        (c) => c.name.toLowerCase() === initialDraft.customer?.name?.toLowerCase()
      );
      if (match) return match.id;
    }
    return clients.length > 0 ? clients[0].id : '';
  });

  const [invoiceNumber] = useState<string>(
    existingInvoice?.invoiceNumber ||
      formatInvoiceNumber(business.invoicePrefix, business.nextInvoiceNumber)
  );

  const [issueDate, setIssueDate] = useState<string>(
    initialDraft?.issueDate || existingInvoice?.issueDate || new Date().toISOString().split('T')[0]
  );

  const [dueDate, setDueDate] = useState<string>(
    initialDraft?.dueDate ||
      existingInvoice?.dueDate ||
      new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(() => {
    if (initialDraft?.lineItems && initialDraft.lineItems.length > 0) {
      return initialDraft.lineItems;
    }
    if (existingInvoice?.lineItems && existingInvoice.lineItems.length > 0) {
      return existingInvoice.lineItems;
    }
    if (initialExtraItems && initialExtraItems.length > 0) {
      return initialExtraItems;
    }
    return [
      {
        id: 'line_' + Math.random().toString(36).substring(2, 8),
        description: 'Professional Services',
        quantity: 1,
        unit: 'hours',
        unitRate: 100,
        taxable: true,
        lineTotal: 100
      }
    ];
  });

  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>(
    existingInvoice?.discountType || 'percentage'
  );
  const [discountValue, setDiscountValue] = useState<number>(existingInvoice?.discountValue || 0);

  const [taxLabel, setTaxLabel] = useState<string>(
    existingInvoice?.taxLabel || business.defaultTaxLabel || 'GST'
  );
  const [taxRate, setTaxRate] = useState<number>(
    existingInvoice ? existingInvoice.taxRate : (business.defaultTaxRate ?? 5.0)
  );

  const [notes, setNotes] = useState<string>(
    initialDraft?.notes || existingInvoice?.notes || ''
  );
  const [paymentInstructions, setPaymentInstructions] = useState<string>(
    existingInvoice?.paymentInstructions || business.paymentInstructions
  );

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Recalculate totals dynamically
  const totals = calculateInvoiceTotals({
    lineItems,
    discountType,
    discountValue,
    taxRate
  });

  const handleAddLineItem = () => {
    const newItem: InvoiceLineItem = {
      id: 'line_' + Math.random().toString(36).substring(2, 9),
      description: '',
      quantity: 1,
      unit: 'units',
      unitRate: 0,
      taxable: true,
      lineTotal: 0
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleSelectCatalogItem = (index: number, itemId: string) => {
    const catalogItem = items.find((i) => i.id === itemId);
    if (!catalogItem) return;

    const updated = [...lineItems];
    const qty = updated[index].quantity || 1;
    updated[index] = {
      ...updated[index],
      itemId: catalogItem.id,
      description: catalogItem.name + (catalogItem.description ? ` - ${catalogItem.description}` : ''),
      unit: catalogItem.unit,
      unitRate: catalogItem.defaultRate,
      taxable: catalogItem.taxable,
      lineTotal: Math.round((qty * catalogItem.defaultRate + Number.EPSILON) * 100) / 100
    };
    setLineItems(updated);
  };

  const handleUpdateLine = (index: number, field: keyof InvoiceLineItem, value: unknown) => {
    const updated = [...lineItems];
    const item = { ...updated[index], [field]: value };

    if (field === 'quantity' || field === 'unitRate') {
      const q = field === 'quantity' ? Number(value) : item.quantity;
      const r = field === 'unitRate' ? Number(value) : item.unitRate;
      item.lineTotal = Math.round((q * r + Number.EPSILON) * 100) / 100;
    }

    updated[index] = item;
    setLineItems(updated);
  };

  const handleRemoveLine = (index: number) => {
    if (lineItems.length === 1) {
      setErrorMsg('An invoice must have at least one line item.');
      return;
    }
    setErrorMsg('');
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const handleSaveInvoice = async () => {
    setErrorMsg('');
    const selectedClient = clients.find((c) => c.id === clientId);

    if (!selectedClient) {
      setErrorMsg('Please select or create a client before saving.');
      return;
    }

    if (lineItems.length === 0) {
      setErrorMsg('Please add at least one line item.');
      return;
    }

    for (let i = 0; i < lineItems.length; i++) {
      if (!lineItems[i].description.trim()) {
        setErrorMsg(`Line item #${i + 1} has no description.`);
        return;
      }
    }

    const payload: Invoice = {
      id: existingInvoice?.id || 'inv_' + Math.random().toString(36).substring(2, 10),
      invoiceNumber,
      status: existingInvoice?.status || 'draft',
      issueDate,
      dueDate,
      clientId: selectedClient.id,
      clientSnapshot: selectedClient,
      lineItems,
      currency: business.defaultCurrency || 'CAD',
      discountType,
      discountValue,
      discountAmount: totals.discountAmount,
      taxLabel,
      taxRate,
      taxAmount: totals.taxAmount,
      subtotal: totals.subtotal,
      grandTotal: totals.grandTotal,
      notes,
      paymentInstructions,
      paymentDate: existingInvoice?.paymentDate,
      amountReceived: existingInvoice?.amountReceived || 0,
      template,
      createdAt: existingInvoice?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      setIsSubmitting(true);
      await onSave(payload);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to save invoice: ${msg}`);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      {/* Top Header Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Back</span>
        </button>

        <h2 className="text-base font-bold text-slate-900 sm:text-lg">
          {existingInvoice ? `Edit ${existingInvoice.invoiceNumber}` : `New Invoice: ${invoiceNumber}`}
        </h2>

        <button
          type="button"
          onClick={handleSaveInvoice}
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Check size={14} aria-hidden="true" />
          <span>{isSubmitting ? 'Saving...' : 'Save Invoice'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700" role="alert">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Unconfigured Business Warning */}
      {!business.name && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs sm:text-sm text-amber-900 shadow-xs"
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle size={20} className="shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="font-bold">Business Profile Incomplete:</strong>
              <p className="mt-0.5 text-xs text-amber-800">
                Your business name and payment instructions are not configured. Please complete your settings before issuing real invoices.
              </p>
            </div>
          </div>
          {onGoToSettings && (
            <button
              type="button"
              onClick={onGoToSettings}
              className="self-start sm:self-auto shrink-0 rounded-lg bg-amber-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 shadow-2xs"
            >
              Configure Settings
            </button>
          )}
        </div>
      )}

      {/* Step 1: Client & Dates */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          1. Client & Invoice Timing
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="client-select" className="text-xs font-semibold text-slate-700">
                Select Client *
              </label>
              <button
                type="button"
                onClick={onQuickAddClient}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                + New Client
              </button>
            </div>
            <select
              id="client-select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
              required
            >
              <option value="">-- Choose Client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.email ? `(${c.email})` : ''}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="mt-1 text-[11px] text-amber-600">
                No clients found. Click "+ New Client" to create one.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="inv-num" className="text-xs font-semibold text-slate-700">
              Invoice Number
            </label>
            <input
              id="inv-num"
              type="text"
              value={invoiceNumber}
              disabled
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 p-2 text-xs sm:text-sm font-medium text-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="issue-date" className="text-xs font-semibold text-slate-700">
              Issue Date
            </label>
            <input
              id="issue-date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="due-date" className="text-xs font-semibold text-slate-700">
              Due Date
            </label>
            <input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>
      </div>

      {/* Step 2: Line Items */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
            2. Line Items ({lineItems.length})
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onOpenBuddyWithContext((proposedItems) => {
                  setLineItems([...lineItems, ...proposedItems]);
                });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
            >
              <Sparkles size={13} className="text-purple-600" aria-hidden="true" />
              <span>Ask Invoice Buddy</span>
            </button>
            <button
              type="button"
              onClick={handleAddLineItem}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Plus size={13} aria-hidden="true" />
              <span>Add Item</span>
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {lineItems.map((item, idx) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs sm:text-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-700">Item #{idx + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveLine(idx)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline"
                  aria-label={`Remove Item #${idx + 1}`}
                >
                  <Trash2 size={12} aria-hidden="true" />
                  <span>Remove</span>
                </button>
              </div>

              {/* Load from item library selector */}
              {items.length > 0 && (
                <div className="mb-2">
                  <label htmlFor={`item-lib-${idx}`} className="block text-[11px] font-medium text-slate-500">
                    Auto-fill from Item Library:
                  </label>
                  <select
                    id={`item-lib-${idx}`}
                    onChange={(e) => handleSelectCatalogItem(idx, e.target.value)}
                    defaultValue=""
                    className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                  >
                    <option value="">-- Choose saved item or service --</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({formatCurrency(it.defaultRate, business.defaultCurrency)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mb-2">
                <label htmlFor={`desc-${idx}`} className="block text-[11px] font-medium text-slate-700">
                  Description *
                </label>
                <input
                  id={`desc-${idx}`}
                  type="text"
                  placeholder="e.g. Website redesign and responsive development"
                  value={item.description}
                  onChange={(e) => handleUpdateLine(idx, 'description', e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor={`qty-${idx}`} className="block text-[11px] font-medium text-slate-700">
                    Quantity
                  </label>
                  <input
                    id={`qty-${idx}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => handleUpdateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white p-1.5 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor={`unit-${idx}`} className="block text-[11px] font-medium text-slate-700">
                    Unit
                  </label>
                  <input
                    id={`unit-${idx}`}
                    type="text"
                    placeholder="hours, units"
                    value={item.unit}
                    onChange={(e) => handleUpdateLine(idx, 'unit', e.target.value)}
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white p-1.5 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor={`rate-${idx}`} className="block text-[11px] font-medium text-slate-700">
                    Rate ({business.defaultCurrency})
                  </label>
                  <input
                    id={`rate-${idx}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unitRate}
                    onChange={(e) => handleUpdateLine(idx, 'unitRate', parseFloat(e.target.value) || 0)}
                    className="mt-0.5 w-full rounded-md border border-slate-200 bg-white p-1.5 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/80 pt-2 text-xs">
                <label className="flex items-center gap-1.5 text-slate-600">
                  <input
                    type="checkbox"
                    checked={item.taxable}
                    onChange={(e) => handleUpdateLine(idx, 'taxable', e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Subject to Tax</span>
                </label>
                <div className="font-semibold text-slate-800">
                  Line Total: {formatCurrency(item.lineTotal, business.defaultCurrency)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 3: Discounts, Tax, Notes & Totals */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 mb-3">
          3. Adjustments, Tax & Terms
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Discount type & value */}
          <div>
            <label htmlFor="disc-type" className="text-xs font-semibold text-slate-700">
              Discount Type
            </label>
            <select
              id="disc-type"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed Amount</option>
            </select>
          </div>

          <div>
            <label htmlFor="disc-val" className="text-xs font-semibold text-slate-700">
              Discount Value {discountType === 'percentage' ? '(%)' : `(${business.defaultCurrency})`}
            </label>
            <input
              id="disc-val"
              type="number"
              min="0"
              step="0.01"
              value={discountValue}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Tax label & rate */}
          <div>
            <label htmlFor="tax-label" className="text-xs font-semibold text-slate-700">
              Tax Label
            </label>
            <input
              id="tax-label"
              type="text"
              value={taxLabel}
              onChange={(e) => setTaxLabel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="tax-rate" className="text-xs font-semibold text-slate-700">
              Tax Rate (%)
            </label>
            <input
              id="tax-rate"
              type="number"
              min="0"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="inv-notes" className="text-xs font-semibold text-slate-700">
              Client Memo / Notes
            </label>
            <textarea
              id="inv-notes"
              rows={2}
              placeholder="e.g. Thanks for your business. Terms net 30."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <div>
            <label htmlFor="inv-pay" className="text-xs font-semibold text-slate-700">
              Payment Instructions
            </label>
            <textarea
              id="inv-pay"
              rows={2}
              value={paymentInstructions}
              onChange={(e) => setPaymentInstructions(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Calculation Summary Box */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs sm:text-sm">
          <div className="space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-800">
                {formatCurrency(totals.subtotal, business.defaultCurrency)}
              </span>
            </div>

            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Discount ({discountType === 'percentage' ? `${discountValue}%` : 'Fixed'}):</span>
                <span>- {formatCurrency(totals.discountAmount, business.defaultCurrency)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>{taxLabel} ({taxRate}%):</span>
              <span className="font-semibold text-slate-800">
                {formatCurrency(totals.taxAmount, business.defaultCurrency)}
              </span>
            </div>

            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm sm:text-base font-extrabold text-blue-700">
              <span>Grand Total:</span>
              <span>{formatCurrency(totals.grandTotal, business.defaultCurrency)}</span>
            </div>
          </div>
        </div>

        {/* Bottom Save Action Row */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveInvoice}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-blue-700 active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 size={16} className="animate-spin text-white" aria-hidden="true" />
            ) : (
              <Check size={16} className="text-white" aria-hidden="true" />
            )}
            <span>{isSubmitting ? 'Saving Invoice...' : 'Save Invoice'}</span>
          </button>
        </div>
      </div>

      {/* Always Visible Floating Action Button for Mobile & Desktop */}
      <div className="no-print fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-30">
        <button
          type="button"
          onClick={handleSaveInvoice}
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 sm:px-5 sm:py-3.5 text-xs sm:text-sm font-bold text-white shadow-2xl transition-all duration-200 hover:bg-blue-700 active:scale-95 ring-4 ring-blue-100/60 disabled:opacity-50"
          title="Save Invoice"
          aria-label="Save Invoice"
        >
          {isSubmitting ? (
            <Loader2 size={18} className="animate-spin text-white" aria-hidden="true" />
          ) : (
            <Check size={18} className="text-white" aria-hidden="true" />
          )}
          <span>{isSubmitting ? 'Saving...' : 'Save Invoice'}</span>
        </button>
      </div>
    </div>
  );
};
