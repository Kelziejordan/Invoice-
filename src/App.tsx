import React, { useEffect, useState, useCallback } from 'react';
import {
  BusinessProfile,
  Client,
  Item,
  Invoice,
  InvoiceStatus,
  TemplateSettings,
  InvoiceLineItem,
  BuddyInvoiceDraft
} from './types';
import { storage } from './services/storage';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { InvoiceList } from './components/InvoiceList';
import { InvoiceBuilder } from './components/InvoiceBuilder';
import { InvoiceDetail } from './components/InvoiceDetail';
import { ClientDirectory } from './components/ClientDirectory';
import { ItemLibrary } from './components/ItemLibrary';
import { BusinessSettings } from './components/BusinessSettings';
import { BackupRestore } from './components/BackupRestore';
import { InvoiceBuddyModal } from './components/InvoiceBuddyModal';
import { LayoutDashboard, FileText, Users, Box, Settings, Database, Loader2 } from 'lucide-react';

type Tab = 'dashboard' | 'invoices' | 'clients' | 'items' | 'settings' | 'backup';

export default function App() {
  const [currentTab, setCurrentTab] = useState<Tab>('dashboard');
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [template, setTemplate] = useState<TemplateSettings | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Detail / Builder State
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [isBuildingInvoice, setIsBuildingInvoice] = useState<boolean>(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);

  // Invoice Buddy State
  const [isBuddyOpen, setIsBuddyOpen] = useState<boolean>(false);
  const [pendingBuddyItems, setPendingBuddyItems] = useState<InvoiceLineItem[]>([]);
  const [pendingBuddyDraft, setPendingBuddyDraft] = useState<BuddyInvoiceDraft | null>(null);
  const [buddyItemCallback, setBuddyItemCallback] = useState<
    ((items: InvoiceLineItem[]) => void) | null
  >(null);

  // Load IndexedDB initial workspace
  const loadInitialData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [bz, tm, cls, its, invs] = await Promise.all([
        storage.getBusinessProfile(),
        storage.getTemplateSettings(),
        storage.getAllClients(),
        storage.getAllItems(),
        storage.getAllInvoices()
      ]);
      setBusiness(bz);
      setTemplate(tm);
      setClients(cls);
      setItems(its);
      setInvoices(invs);
    } catch (err) {
      console.error('Failed to load initial data from local IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  if (isLoading || !business || !template) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-slate-50 text-slate-600">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-hidden="true" />
        <p className="text-sm font-medium">Initializing Invoice Studio 2 workspace...</p>
      </div>
    );
  }

  // --- Invoice Actions ---
  const handleSaveInvoice = async (invoice: Invoice) => {
    // Safely parse the numeric sequence from the invoice number using the configured prefix
    const escapedPrefix = (business.invoicePrefix || 'INV-').replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const seqMatch = invoice.invoiceNumber.match(new RegExp(`^${escapedPrefix}(\\d+)$`));
    let nextBusiness: BusinessProfile | null = null;
    if (seqMatch && seqMatch[1]) {
      const savedSeq = parseInt(seqMatch[1], 10);
      if (savedSeq >= business.nextInvoiceNumber) {
        nextBusiness = {
          ...business,
          nextInvoiceNumber: savedSeq + 1
        };
      }
    }

    if (nextBusiness) {
      await storage.saveInvoiceWithBusinessProfile(invoice, nextBusiness);
      setBusiness(nextBusiness);
    } else {
      await storage.saveInvoice(invoice);
    }

    const all = await storage.getAllInvoices();
    setInvoices(all);
    setIsBuildingInvoice(false);
    setEditingInvoice(undefined);
    setSelectedInvoiceId(invoice.id);
  };

  const handleUpdateInvoiceStatus = async (
    id: string,
    newStatus: InvoiceStatus,
    paymentDate?: string,
    amountReceived?: number
  ) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;

    const updated: Invoice = {
      ...inv,
      status: newStatus,
      paymentDate: paymentDate || inv.paymentDate,
      amountReceived: amountReceived !== undefined ? amountReceived : inv.amountReceived,
      updatedAt: new Date().toISOString()
    };

    await storage.saveInvoice(updated);
    const all = await storage.getAllInvoices();
    setInvoices(all);
  };

  const handleDeleteInvoice = async (id: string) => {
    await storage.deleteInvoice(id);
    const all = await storage.getAllInvoices();
    setInvoices(all);
    if (selectedInvoiceId === id) {
      setSelectedInvoiceId(null);
    }
  };

  // --- Client Actions ---
  const handleSaveClient = async (client: Client) => {
    await storage.saveClient(client);
    setClients(await storage.getAllClients());
  };

  const handleDeleteClient = async (id: string) => {
    await storage.deleteClient(id);
    setClients(await storage.getAllClients());
  };

  // --- Item Library Actions ---
  const handleSaveItem = async (item: Item) => {
    await storage.saveItem(item);
    setItems(await storage.getAllItems());
  };

  const handleDeleteItem = async (id: string) => {
    await storage.deleteItem(id);
    setItems(await storage.getAllItems());
  };

  // --- Settings Actions ---
  const handleSaveBusiness = async (prof: BusinessProfile) => {
    await storage.saveBusinessProfile(prof);
    setBusiness(prof);
  };

  const handleSaveTemplate = async (tmpl: TemplateSettings) => {
    await storage.saveTemplateSettings(tmpl);
    setTemplate(tmpl);
  };

  // --- Atomic Workspace Restoration ---
  const handleRestoreFullData = async (data: {
    business: BusinessProfile;
    clients: Client[];
    items: Item[];
    invoices: Invoice[];
    template: TemplateSettings;
  }) => {
    // Atomic restore: single transaction clears and repopulates, auto-rolls-back on error
    await storage.restoreWorkspaceData(data);

    setBusiness(data.business);
    setTemplate(data.template);
    setClients(data.clients);
    setItems(data.items);
    setInvoices(data.invoices);
    setSelectedInvoiceId(null);
    setIsBuildingInvoice(false);
  };

  // --- Complete Buddy Invoice Population ---
  const handleApplyCompleteBuddyInvoice = async (draft: BuddyInvoiceDraft) => {
    let targetClientId = draft.customer?.matchedClientId;

    // If customer name was extracted but not yet in directory, create new client record
    if (!targetClientId && draft.customer?.name && draft.customer.name.trim().length > 0) {
      const match = clients.find(
        (c) => c.name.toLowerCase() === draft.customer?.name?.trim().toLowerCase()
      );
      if (match) {
        targetClientId = match.id;
      } else {
        const newClient: Client = {
          id: 'cli_' + Math.random().toString(36).substring(2, 9),
          name: draft.customer.name.trim(),
          email: draft.customer.email || '',
          phone: draft.customer.phone || '',
          billingAddress: draft.customer.billingAddress || '',
          notes: 'Added via Invoice Buddy conversational assistant',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await storage.saveClient(newClient);
        const updatedClients = await storage.getAllClients();
        setClients(updatedClients);
        targetClientId = newClient.id;
      }
    }

    const updatedDraft: BuddyInvoiceDraft = {
      ...draft,
      customer: {
        ...draft.customer,
        matchedClientId: targetClientId
      }
    };

    setPendingBuddyDraft(updatedDraft);
    setEditingInvoice(undefined);
    setIsBuildingInvoice(true);
  };

  const activeInvoice = invoices.find((i) => i.id === selectedInvoiceId);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 pb-20 sm:pb-0">
      <Header onOpenBuddy={() => setIsBuddyOpen(true)} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6">
        {isBuildingInvoice ? (
          <InvoiceBuilder
            business={business}
            clients={clients}
            items={items}
            template={template}
            existingInvoice={editingInvoice}
            initialExtraItems={pendingBuddyItems}
            initialDraft={pendingBuddyDraft || undefined}
            onSave={async (inv) => {
              setPendingBuddyItems([]);
              setPendingBuddyDraft(null);
              await handleSaveInvoice(inv);
            }}
            onCancel={() => {
              setPendingBuddyItems([]);
              setPendingBuddyDraft(null);
              setIsBuildingInvoice(false);
              setEditingInvoice(undefined);
            }}
            onOpenBuddyWithContext={(callback) => {
              setBuddyItemCallback(() => callback);
              setIsBuddyOpen(true);
            }}
            onQuickAddClient={() => {
              setCurrentTab('clients');
              setIsBuildingInvoice(false);
            }}
            onGoToSettings={() => {
              setIsBuildingInvoice(false);
              setCurrentTab('settings');
            }}
          />
        ) : selectedInvoiceId && activeInvoice ? (
          <InvoiceDetail
            invoice={activeInvoice}
            business={business}
            onBack={() => setSelectedInvoiceId(null)}
            onUpdateStatus={handleUpdateInvoiceStatus}
            onEdit={(inv) => {
              setEditingInvoice(inv);
              setIsBuildingInvoice(true);
            }}
          />
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <Dashboard
                invoices={invoices}
                business={business}
                onNewInvoice={() => {
                  setEditingInvoice(undefined);
                  setIsBuildingInvoice(true);
                }}
                onViewInvoice={(id) => setSelectedInvoiceId(id)}
                onGoToSettings={() => setCurrentTab('settings')}
              />
            )}

            {currentTab === 'invoices' && (
              <InvoiceList
                invoices={invoices}
                onSelectInvoice={(id) => setSelectedInvoiceId(id)}
                onNewInvoice={() => {
                  setEditingInvoice(undefined);
                  setIsBuildingInvoice(true);
                }}
                onDeleteInvoice={handleDeleteInvoice}
              />
            )}

            {currentTab === 'clients' && (
              <ClientDirectory
                clients={clients}
                onSaveClient={handleSaveClient}
                onDeleteClient={handleDeleteClient}
              />
            )}

            {currentTab === 'items' && (
              <ItemLibrary
                items={items}
                business={business}
                onSaveItem={handleSaveItem}
                onDeleteItem={handleDeleteItem}
              />
            )}

            {currentTab === 'settings' && (
              <BusinessSettings
                business={business}
                template={template}
                onSaveBusiness={handleSaveBusiness}
                onSaveTemplate={handleSaveTemplate}
              />
            )}

            {currentTab === 'backup' && (
              <BackupRestore
                business={business}
                clients={clients}
                items={items}
                invoices={invoices}
                template={template}
                onRestore={handleRestoreFullData}
              />
            )}
          </>
        )}
      </main>

      {/* Accessible Bottom / Footer Navigation */}
      <nav
        className="no-print fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-sm sm:static sm:border-t-0 sm:border-b sm:bg-slate-100/60 sm:py-2.5 sm:shadow-none"
        aria-label="Application tabs navigation"
      >
        <button
          type="button"
          onClick={() => {
            setCurrentTab('dashboard');
            setSelectedInvoiceId(null);
            setIsBuildingInvoice(false);
          }}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-xs ${
            currentTab === 'dashboard' && !isBuildingInvoice && !selectedInvoiceId
              ? 'text-blue-600 font-bold sm:bg-blue-50 sm:px-3 sm:py-1.5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Dashboard Tab"
        >
          <LayoutDashboard size={18} aria-hidden="true" />
          <span>Dashboard</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentTab('invoices');
            setSelectedInvoiceId(null);
            setIsBuildingInvoice(false);
          }}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-xs ${
            currentTab === 'invoices' && !isBuildingInvoice && !selectedInvoiceId
              ? 'text-blue-600 font-bold sm:bg-blue-50 sm:px-3 sm:py-1.5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Invoices Tab"
        >
          <FileText size={18} aria-hidden="true" />
          <span>Invoices</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentTab('clients');
            setSelectedInvoiceId(null);
            setIsBuildingInvoice(false);
          }}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-xs ${
            currentTab === 'clients'
              ? 'text-blue-600 font-bold sm:bg-blue-50 sm:px-3 sm:py-1.5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Clients Directory Tab"
        >
          <Users size={18} aria-hidden="true" />
          <span>Clients</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentTab('items');
            setSelectedInvoiceId(null);
            setIsBuildingInvoice(false);
          }}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-xs ${
            currentTab === 'items'
              ? 'text-blue-600 font-bold sm:bg-blue-50 sm:px-3 sm:py-1.5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Items Catalog Tab"
        >
          <Box size={18} aria-hidden="true" />
          <span>Items</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentTab('settings');
            setSelectedInvoiceId(null);
            setIsBuildingInvoice(false);
          }}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-xs ${
            currentTab === 'settings'
              ? 'text-blue-600 font-bold sm:bg-blue-50 sm:px-3 sm:py-1.5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Settings Tab"
        >
          <Settings size={18} aria-hidden="true" />
          <span>Settings</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCurrentTab('backup');
            setSelectedInvoiceId(null);
            setIsBuildingInvoice(false);
          }}
          className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition sm:flex-row sm:gap-1.5 sm:text-xs ${
            currentTab === 'backup'
              ? 'text-blue-600 font-bold sm:bg-blue-50 sm:px-3 sm:py-1.5'
              : 'text-slate-500 hover:text-slate-800'
          }`}
          aria-label="Backup and Restore Tab"
        >
          <Database size={18} aria-hidden="true" />
          <span>Backup</span>
        </button>
      </nav>

      {/* Conversational Invoice Buddy Assistant */}
      <InvoiceBuddyModal
        isOpen={isBuddyOpen}
        onClose={() => {
          setIsBuddyOpen(false);
          setBuddyItemCallback(null);
        }}
        clients={clients}
        items={items}
        business={business}
        onApplyCompleteInvoice={handleApplyCompleteBuddyInvoice}
      />
    </div>
  );
}
