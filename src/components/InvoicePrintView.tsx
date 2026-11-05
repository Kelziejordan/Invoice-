import React from 'react';
import { Invoice, BusinessProfile } from '../types';
import { formatCurrency } from '../utils/calc';

interface InvoicePrintViewProps {
  invoice: Invoice;
  business: BusinessProfile;
}

export const InvoicePrintView: React.FC<InvoicePrintViewProps> = ({ invoice, business }) => {
  const accent = invoice.template?.accentColor || '#2563eb';

  return (
    <div
      className="printable-invoice-container mx-auto max-w-4xl bg-white p-5 sm:p-8 shadow-sm rounded-xl border border-slate-200 text-slate-800"
      style={{
        fontFamily: invoice.template?.fontFamily || 'Inter, system-ui, sans-serif',
        pageBreakInside: 'avoid',
        breakInside: 'avoid'
      }}
    >
      {/* Header Bar */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-4 mb-4"
        style={{ borderBottom: `3px solid ${accent}` }}
      >
        <div>
          {business.logoDataUrl ? (
            <img
              src={business.logoDataUrl}
              alt={`${business.name} logo`}
              className="max-h-12 max-w-[200px] object-contain mb-1.5"
            />
          ) : (
            <h1
              className="text-xl sm:text-2xl font-extrabold tracking-tight mb-1"
              style={{ color: accent }}
            >
              {business.name}
            </h1>
          )}
          <div className="text-xs text-slate-600 space-y-0.5 whitespace-pre-line leading-snug">
            <p>{business.address}</p>
            {business.contactEmail && <p>Email: {business.contactEmail}</p>}
            {business.phone && <p>Tel: {business.phone}</p>}
            {business.taxId && <p>Tax ID / Reg: {business.taxId}</p>}
          </div>
        </div>

        <div className="sm:text-right">
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-700">
            INVOICE
          </h2>
          <div className="text-base font-bold" style={{ color: accent }}>
            {invoice.invoiceNumber}
          </div>
          <div className="mt-1.5 text-xs text-slate-600 space-y-0.5">
            <p>
              <strong className="text-slate-800">Issue Date:</strong> {invoice.issueDate}
            </p>
            <p>
              <strong className="text-slate-800">Due Date:</strong> {invoice.dueDate}
            </p>
            <p>
              <strong className="text-slate-800">Status:</strong>{' '}
              <span className="uppercase font-semibold tracking-wider text-[11px]">{invoice.status}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Billed To Box */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 border border-slate-100 text-xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
          Billed To:
        </div>
        <div className="text-sm font-bold text-slate-900">
          {invoice.clientSnapshot.name}
        </div>
        <div className="mt-0.5 text-slate-600 whitespace-pre-line space-y-0.5">
          {invoice.clientSnapshot.billingAddress && <p>{invoice.clientSnapshot.billingAddress}</p>}
          {invoice.clientSnapshot.email && <p>Email: {invoice.clientSnapshot.email}</p>}
          {invoice.clientSnapshot.phone && <p>Phone: {invoice.clientSnapshot.phone}</p>}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr style={{ background: accent, color: '#ffffff' }}>
              <th scope="col" className="px-3 py-2 font-semibold">Description</th>
              <th scope="col" className="px-3 py-2 text-center font-semibold">Qty</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Rate</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lineItems.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-800">{item.description}</div>
                </td>
                <td className="px-3 py-2 text-center text-slate-600">
                  {item.quantity} {item.unit}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">
                  {formatCurrency(item.unitRate, invoice.currency)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {formatCurrency(item.lineTotal, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Summary */}
      <div className="flex justify-end mb-4 text-xs">
        <div className="w-full sm:w-64 space-y-1.5">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal:</span>
            <span className="font-semibold text-slate-800">
              {formatCurrency(invoice.subtotal, invoice.currency)}
            </span>
          </div>

          {invoice.discountAmount > 0 && (
            <div className="flex justify-between text-amber-700">
              <span>Discount ({invoice.discountType === 'percentage' ? `${invoice.discountValue}%` : 'Fixed'}):</span>
              <span>- {formatCurrency(invoice.discountAmount, invoice.currency)}</span>
            </div>
          )}

          <div className="flex justify-between text-slate-600">
            <span>{invoice.taxLabel} ({invoice.taxRate}%):</span>
            <span className="font-semibold text-slate-800">
              {formatCurrency(invoice.taxAmount, invoice.currency)}
            </span>
          </div>

          <div
            className="flex justify-between border-t-2 pt-1.5 text-sm sm:text-base font-black"
            style={{ borderColor: accent, color: accent }}
          >
            <span>Total Due:</span>
            <span>{formatCurrency(invoice.grandTotal, invoice.currency)}</span>
          </div>
        </div>
      </div>

      {/* Payment Instructions & Notes */}
      <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-3 text-xs sm:grid-cols-2">
        {invoice.paymentInstructions && (
          <div>
            <strong className="block text-slate-800 mb-0.5">Payment Instructions:</strong>
            <p className="text-slate-600 whitespace-pre-line leading-tight">{invoice.paymentInstructions}</p>
          </div>
        )}

        {invoice.notes && (
          <div>
            <strong className="block text-slate-800 mb-0.5">Notes / Terms:</strong>
            <p className="text-slate-600 whitespace-pre-line leading-tight">{invoice.notes}</p>
          </div>
        )}
      </div>

      {/* Footer Note */}
      {invoice.template?.footerNote && (
        <div className="mt-4 border-t border-dashed border-slate-200 pt-2 text-center text-[11px] text-slate-400">
          {invoice.template.footerNote}
        </div>
      )}
    </div>
  );
};
