import React, { useMemo, useState } from 'react';
import { Invoice, BusinessProfile } from '../types';
import { formatCurrency } from '../utils/calc';
import { Plus, Search, Eye, AlertCircle, CheckCircle2, Clock, FileEdit } from 'lucide-react';

interface DashboardProps {
  invoices: Invoice[];
  business: BusinessProfile;
  onNewInvoice: () => void;
  onViewInvoice: (invoiceId: string) => void;
  onGoToSettings?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  invoices,
  business,
  onNewInvoice,
  onViewInvoice,
  onGoToSettings
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const stats = useMemo(() => {
    let outstandingTotal = 0;
    let paidTotal = 0;
    let draftsCount = 0;
    let overdueCount = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    for (const inv of invoices) {
      if (inv.status === 'paid') {
        paidTotal += inv.grandTotal;
      } else if (inv.status === 'sent' || inv.status === 'overdue') {
        outstandingTotal += inv.grandTotal;
      }

      if (inv.status === 'draft') draftsCount++;
      if (inv.status === 'overdue' || (inv.status === 'sent' && inv.dueDate < todayStr)) {
        overdueCount++;
      }
    }

    return { outstandingTotal, paidTotal, draftsCount, overdueCount };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices
      .filter((inv) => {
        const matchesSearch =
          inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
          inv.clientSnapshot.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [invoices, searchTerm, filterStatus]);

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
    <div className="space-y-6">
      {/* Unconfigured Profile Alert */}
      {!business.name && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs sm:text-sm text-amber-900 shadow-xs"
          role="alert"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle size={20} className="shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
            <div>
              <strong className="font-bold">Business Profile Setup Required:</strong>
              <p className="mt-0.5 text-xs text-amber-800">
                You have not yet configured your business name and payment instructions. Please complete your settings before sending real invoices to clients.
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

      {/* Top Banner & Quick Action */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Dashboard Overview</h2>
          <p className="text-xs text-slate-500 sm:text-sm">
            Overview of your invoices, payments, and client receivables.
          </p>
        </div>
        <button
          type="button"
          onClick={onNewInvoice}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-98"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Create Invoice</span>
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {/* Outstanding Total */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding</span>
            <Clock size={16} className="text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-lg font-bold text-amber-700 sm:text-2xl">
            {formatCurrency(stats.outstandingTotal, business.defaultCurrency)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Unpaid sent invoices</p>
        </div>

        {/* Paid Total */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Paid</span>
            <CheckCircle2 size={16} className="text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-lg font-bold text-emerald-700 sm:text-2xl">
            {formatCurrency(stats.paidTotal, business.defaultCurrency)}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Collected revenue</p>
        </div>

        {/* Overdue Count */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Overdue</span>
            <AlertCircle size={16} className="text-red-500" aria-hidden="true" />
          </div>
          <div className="mt-2 text-lg font-bold text-red-600 sm:text-2xl">
            {stats.overdueCount}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Requiring follow-up</p>
        </div>

        {/* Drafts Count */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">Drafts</span>
            <FileEdit size={16} className="text-slate-400" aria-hidden="true" />
          </div>
          <div className="mt-2 text-lg font-bold text-slate-700 sm:text-2xl">
            {stats.draftsCount}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Unfinalized invoices</p>
        </div>
      </div>

      {/* Recent Invoices Card */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-bold text-slate-900">Recent Invoices</h3>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Box */}
            <div className="relative flex-1 sm:w-64">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search number or client..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search invoices by number or client name"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
              />
            </div>

            {/* Filter Dropdown */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter invoices by status"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm text-slate-700 focus:border-blue-500 focus:outline-hidden"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Invoices List / Table */}
        {filteredInvoices.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500">No invoices match your search or filter.</p>
            <button
              type="button"
              onClick={onNewInvoice}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Create First Invoice</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Number</th>
                  <th scope="col" className="px-4 py-3">Client</th>
                  <th scope="col" className="px-4 py-3">Due Date</th>
                  <th scope="col" className="px-4 py-3">Total</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="transition hover:bg-slate-50/75">
                    <td className="px-4 py-3 font-semibold text-slate-900">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{inv.clientSnapshot.name || 'Unnamed Client'}</td>
                    <td className="px-4 py-3 text-slate-500">{inv.dueDate}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {formatCurrency(inv.grandTotal, inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeClass(
                          inv.status
                        )}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onViewInvoice(inv.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white hover:text-blue-600 shadow-2xs"
                        aria-label={`View invoice ${inv.invoiceNumber}`}
                      >
                        <Eye size={12} aria-hidden="true" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
