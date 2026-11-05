import React, { useState } from 'react';
import { Invoice, InvoiceStatus, BusinessProfile } from '../types';
import { formatCurrency } from '../utils/calc';
import { ArrowLeft, Printer, CheckCircle, Clock, XCircle, Send, Edit3 } from 'lucide-react';
import { InvoicePrintView } from './InvoicePrintView';

interface InvoiceDetailProps {
  invoice: Invoice;
  business: BusinessProfile;
  onBack: () => void;
  onUpdateStatus: (
    id: string,
    newStatus: InvoiceStatus,
    paymentDate?: string,
    amountReceived?: number
  ) => Promise<void>;
  onEdit: (invoice: Invoice) => void;
}

export const InvoiceDetail: React.FC<InvoiceDetailProps> = ({
  invoice,
  business,
  onBack,
  onUpdateStatus,
  onEdit
}) => {
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(invoice.grandTotal);
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleRecordPayment = async () => {
    await onUpdateStatus(invoice.id, 'paid', paymentDate, paymentAmount);
    setShowPaymentModal(false);
  };

  const getStatusBadgeClass = (status: Invoice['status']) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'sent':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'overdue':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'draft':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'cancelled':
        return 'bg-zinc-100 text-zinc-500 border-zinc-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Action Header (Hidden during window.print) */}
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Back to Invoices</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
            aria-label="Print or Save as PDF"
          >
            <Printer size={14} aria-hidden="true" />
            <span>Print / PDF</span>
          </button>

          <button
            type="button"
            onClick={() => onEdit(invoice)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
          >
            <Edit3 size={14} aria-hidden="true" />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Lifecycle Actions Bar (Hidden during window.print) */}
      <div className="no-print rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Lifecycle Status:</span>
            <span
              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${getStatusBadgeClass(
                invoice.status
              )}`}
            >
              {invoice.status}
            </span>
            {invoice.status === 'paid' && invoice.paymentDate && (
              <span className="text-xs text-emerald-700 font-medium">
                Paid on {invoice.paymentDate} (
                {formatCurrency(invoice.amountReceived || invoice.grandTotal, invoice.currency)})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {invoice.status === 'draft' && (
              <button
                type="button"
                onClick={() => onUpdateStatus(invoice.id, 'sent')}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                <Send size={13} aria-hidden="true" />
                <span>Mark as Sent</span>
              </button>
            )}

            {invoice.status !== 'paid' && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700"
              >
                <CheckCircle size={13} aria-hidden="true" />
                <span>Record Payment</span>
              </button>
            )}

            {invoice.status === 'sent' && (
              <button
                type="button"
                onClick={() => onUpdateStatus(invoice.id, 'overdue')}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                <Clock size={13} aria-hidden="true" />
                <span>Mark Overdue</span>
              </button>
            )}

            {invoice.status !== 'cancelled' && invoice.status !== 'paid' && (
              <button
                type="button"
                onClick={() => onUpdateStatus(invoice.id, 'cancelled')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                <XCircle size={13} aria-hidden="true" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Printable Invoice Component */}
      <InvoicePrintView invoice={invoice} business={business} />

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-modal-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 id="payment-modal-title" className="text-base font-bold text-slate-900">
              Record Payment Received
            </h3>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="pay-amt" className="block text-xs font-semibold text-slate-700">
                  Amount Received ({invoice.currency})
                </label>
                <input
                  id="pay-amt"
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="pay-date" className="block text-xs font-semibold text-slate-700">
                  Payment Date
                </label>
                <input
                  id="pay-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordPayment}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
