import React, { useState } from 'react';
import { Client } from '../types';
import { Plus, Edit2, Trash2, Search, UserCheck } from 'lucide-react';

interface ClientDirectoryProps {
  clients: Client[];
  onSaveClient: (client: Client) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
}

export const ClientDirectory: React.FC<ClientDirectoryProps> = ({
  clients,
  onSaveClient,
  onDeleteClient
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenNew = () => {
    setErrorMsg('');
    setEditingClient({
      id: 'cli_' + Math.random().toString(36).substring(2, 9),
      name: '',
      email: '',
      phone: '',
      billingAddress: '',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setShowModal(true);
  };

  const handleOpenEdit = (c: Client) => {
    setErrorMsg('');
    setEditingClient({ ...c });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.name.trim()) {
      setErrorMsg('Client name is required.');
      return;
    }

    try {
      await onSaveClient({
        ...editingClient,
        name: editingClient.name.trim(),
        updatedAt: new Date().toISOString()
      });
      setShowModal(false);
      setEditingClient(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to save client: ${msg}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Client Directory</h2>
          <p className="text-xs text-slate-500 sm:text-sm">
            Manage reusable client contact information and billing addresses.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenNew}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-98"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Add Client</span>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        {/* Search Bar */}
        <div className="border-b border-slate-200 p-4">
          <div className="relative max-w-sm">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              placeholder="Search clients by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search clients"
              className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Clients Table */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <UserCheck size={32} className="mx-auto text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500">No clients found.</p>
            <button
              type="button"
              onClick={handleOpenNew}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Create Client</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Email</th>
                  <th scope="col" className="px-4 py-3">Phone</th>
                  <th scope="col" className="px-4 py-3">Address</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((cli) => (
                  <tr key={cli.id} className="transition hover:bg-slate-50/75">
                    <td className="px-4 py-3 font-semibold text-slate-900">{cli.name}</td>
                    <td className="px-4 py-3 text-slate-600">{cli.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{cli.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{cli.billingAddress || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(cli)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50"
                          aria-label={`Edit client ${cli.name}`}
                        >
                          <Edit2 size={13} aria-hidden="true" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(cli.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 shadow-2xs hover:bg-red-100"
                          aria-label={`Delete client ${cli.name}`}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Client Modal */}
      {showModal && editingClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 id="client-modal-title" className="text-base font-bold text-slate-900">
                {editingClient.name ? 'Edit Client Details' : 'New Client Profile'}
              </h3>

              {errorMsg && (
                <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="cli-name" className="block text-xs font-semibold text-slate-700">
                  Client / Company Name *
                </label>
                <input
                  id="cli-name"
                  type="text"
                  required
                  value={editingClient.name}
                  onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cli-email" className="block text-xs font-semibold text-slate-700">
                    Email Address
                  </label>
                  <input
                    id="cli-email"
                    type="email"
                    value={editingClient.email}
                    onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="cli-phone" className="block text-xs font-semibold text-slate-700">
                    Phone Number
                  </label>
                  <input
                    id="cli-phone"
                    type="tel"
                    value={editingClient.phone}
                    onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="cli-address" className="block text-xs font-semibold text-slate-700">
                  Billing Address
                </label>
                <textarea
                  id="cli-address"
                  rows={2}
                  value={editingClient.billingAddress}
                  onChange={(e) => setEditingClient({ ...editingClient, billingAddress: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="cli-notes" className="block text-xs font-semibold text-slate-700">
                  Internal Notes
                </label>
                <input
                  id="cli-notes"
                  type="text"
                  placeholder="e.g. Preferred PO format, account manager"
                  value={editingClient.notes}
                  onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  Save Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Client Confirmation Modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-cli-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 id="del-cli-title" className="text-base font-bold text-slate-900">
              Confirm Client Deletion
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this client? Existing historical invoices will retain their saved client snapshot.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onDeleteClient(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700"
              >
                Delete Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
