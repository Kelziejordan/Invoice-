import React, { useState } from 'react';
import { Item, BusinessProfile } from '../types';
import { formatCurrency } from '../utils/calc';
import { Plus, Edit2, Trash2, Box } from 'lucide-react';

interface ItemLibraryProps {
  items: Item[];
  business: BusinessProfile;
  onSaveItem: (item: Item) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
}

export const ItemLibrary: React.FC<ItemLibraryProps> = ({
  items,
  business,
  onSaveItem,
  onDeleteItem
}) => {
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleOpenNew = () => {
    setErrorMsg('');
    setEditingItem({
      id: 'itm_' + Math.random().toString(36).substring(2, 9),
      name: '',
      description: '',
      unit: 'hours',
      defaultRate: 75,
      taxable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item: Item) => {
    setErrorMsg('');
    setEditingItem({ ...item });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name.trim()) {
      setErrorMsg('Item name is required.');
      return;
    }

    try {
      await onSaveItem({
        ...editingItem,
        name: editingItem.name.trim(),
        updatedAt: new Date().toISOString()
      });
      setShowModal(false);
      setEditingItem(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Failed to save item: ${msg}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Item & Service Library</h2>
          <p className="text-xs text-slate-500 sm:text-sm">
            Catalog of reusable products, service offerings, and standard rates.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenNew}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-98"
        >
          <Plus size={16} aria-hidden="true" />
          <span>Add Item</span>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        {items.length === 0 ? (
          <div className="py-12 text-center">
            <Box size={32} className="mx-auto text-slate-300" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500">No items or services saved yet.</p>
            <button
              type="button"
              onClick={handleOpenNew}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus size={14} aria-hidden="true" />
              <span>Create Item</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-4 py-3">Description</th>
                  <th scope="col" className="px-4 py-3">Unit</th>
                  <th scope="col" className="px-4 py-3">Rate</th>
                  <th scope="col" className="px-4 py-3">Taxable</th>
                  <th scope="col" className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="transition hover:bg-slate-50/75">
                    <td className="px-4 py-3 font-semibold text-slate-900">{it.name}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{it.description || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{it.unit}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {formatCurrency(it.defaultRate, business.defaultCurrency)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{it.taxable ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(it)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50"
                          aria-label={`Edit ${it.name}`}
                        >
                          <Edit2 size={13} aria-hidden="true" />
                          <span className="hidden sm:inline">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(it.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 shadow-2xs hover:bg-red-100"
                          aria-label={`Delete ${it.name}`}
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

      {/* Edit Item Modal */}
      {showModal && editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="item-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 id="item-modal-title" className="text-base font-bold text-slate-900">
                {editingItem.name ? 'Edit Item' : 'New Library Item'}
              </h3>

              {errorMsg && (
                <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                  {errorMsg}
                </div>
              )}

              <div>
                <label htmlFor="item-name" className="block text-xs font-semibold text-slate-700">
                  Item / Service Name *
                </label>
                <input
                  id="item-name"
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="item-desc" className="block text-xs font-semibold text-slate-700">
                  Default Description
                </label>
                <input
                  id="item-desc"
                  type="text"
                  placeholder="e.g. Standard hourly engineering rate"
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="item-unit" className="block text-xs font-semibold text-slate-700">
                    Unit
                  </label>
                  <input
                    id="item-unit"
                    type="text"
                    placeholder="hours, units, mo"
                    value={editingItem.unit}
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label htmlFor="item-rate" className="block text-xs font-semibold text-slate-700">
                    Default Rate ({business.defaultCurrency})
                  </label>
                  <input
                    id="item-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingItem.defaultRate}
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, defaultRate: parseFloat(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-xs sm:text-sm text-slate-800 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={editingItem.taxable}
                  onChange={(e) => setEditingItem({ ...editingItem, taxable: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Subject to Default Tax</span>
              </label>

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
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Item Confirmation Modal */}
      {deleteConfirmId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="del-item-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 id="del-item-title" className="text-base font-bold text-slate-900">
              Confirm Item Deletion
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this catalog item? Historical invoices will retain their saved line items.
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
                  await onDeleteItem(deleteConfirmId);
                  setDeleteConfirmId(null);
                }}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-red-700"
              >
                Delete Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
