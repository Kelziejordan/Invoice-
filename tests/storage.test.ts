import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DEFAULT_BUSINESS_PROFILE, DEFAULT_TEMPLATE } from '../src/services/storage';
import { BusinessProfile, Client, Item, Invoice } from '../src/types';

describe('IndexedDB Storage Service Integration & Durability', () => {
  let storage: StorageService;

  beforeEach(async () => {
    storage = new StorageService();
    await storage.clearAllData();
  });

  it('persists and retrieves business profile across database operations', async () => {
    const customProfile: BusinessProfile = {
      name: 'Apex Electrical Contractors',
      contactEmail: 'contact@apexelectrical.com.au',
      phone: '+61 400 123 456',
      address: '42 Industrial Drive, Brisbane QLD 4000',
      website: 'https://apexelectrical.com.au',
      taxId: 'ABN 12 345 678 901',
      logoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      paymentInstructions: 'Bank: Commonwealth Bank\nBSB: 062-000\nAccount: 12345678',
      defaultCurrency: 'AUD',
      defaultTaxLabel: 'GST',
      defaultTaxRate: 10.0,
      invoicePrefix: 'APEX-',
      nextInvoiceNumber: 2005
    };

    // Save profile to IndexedDB
    await storage.saveBusinessProfile(customProfile);

    // Retrieve from IndexedDB and verify every field
    const retrieved = await storage.getBusinessProfile();
    expect(retrieved.name).toBe('Apex Electrical Contractors');
    expect(retrieved.contactEmail).toBe('contact@apexelectrical.com.au');
    expect(retrieved.phone).toBe('+61 400 123 456');
    expect(retrieved.taxId).toBe('ABN 12 345 678 901');
    expect(retrieved.defaultCurrency).toBe('AUD');
    expect(retrieved.defaultTaxRate).toBe(10.0);
    expect(retrieved.invoicePrefix).toBe('APEX-');
    expect(retrieved.nextInvoiceNumber).toBe(2005);
  });

  it('persists clients, items, and invoices and verifies queries', async () => {
    const testClient: Client = {
      id: 'cli_integration_1',
      name: 'Highland Property Group',
      email: 'accounts@highland.com.au',
      phone: '02 9876 5432',
      billingAddress: 'Level 5, 200 George St, Sydney NSW 2000',
      notes: 'Payment terms 14 days',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const testItem: Item = {
      id: 'itm_integration_1',
      name: 'Site Compliance Inspection',
      description: 'Comprehensive electrical safety audit',
      unit: 'inspection',
      defaultRate: 350.0,
      taxable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.saveClient(testClient);
    await storage.saveItem(testItem);

    const clients = await storage.getAllClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].name).toBe('Highland Property Group');

    const items = await storage.getAllItems();
    expect(items).toHaveLength(1);
    expect(items[0].defaultRate).toBe(350.0);

    const testInvoice: Invoice = {
      id: 'inv_integration_1',
      invoiceNumber: 'INV-1001',
      status: 'draft',
      issueDate: '2026-11-01',
      dueDate: '2026-11-15',
      clientId: testClient.id,
      clientSnapshot: testClient,
      lineItems: [
        {
          id: 'line_1',
          itemId: testItem.id,
          description: testItem.name,
          quantity: 2,
          unit: testItem.unit,
          unitRate: testItem.defaultRate,
          taxable: true,
          lineTotal: 700.0
        }
      ],
      currency: 'AUD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: 'GST',
      taxRate: 10.0,
      taxAmount: 70.0,
      subtotal: 700.0,
      grandTotal: 770.0,
      notes: 'Thank you for your business',
      paymentInstructions: 'Direct Deposit',
      template: DEFAULT_TEMPLATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.saveInvoice(testInvoice);

    const retrievedInvoice = await storage.getInvoiceById('inv_integration_1');
    expect(retrievedInvoice).toBeDefined();
    expect(retrievedInvoice?.grandTotal).toBe(770.0);
    expect(retrievedInvoice?.clientSnapshot.name).toBe('Highland Property Group');

    // Delete invoice
    await storage.deleteInvoice('inv_integration_1');
    const afterDelete = await storage.getInvoiceById('inv_integration_1');
    expect(afterDelete).toBeUndefined();
  });

  it('performs atomic workspace restoration in a single transaction', async () => {
    // Populate some initial dummy data
    await storage.saveClient({
      id: 'old_client',
      name: 'Old Co',
      email: '',
      phone: '',
      billingAddress: '',
      notes: '',
      createdAt: '',
      updatedAt: ''
    });

    const restorePayload = {
      business: {
        ...DEFAULT_BUSINESS_PROFILE,
        name: 'Restored Electrical Pty Ltd',
        taxId: 'ABN 99 888 777 666'
      },
      clients: [
        {
          id: 'restored_cli_1',
          name: 'Sarah Connor',
          email: 'sarah@resistance.org',
          phone: '0400 999 888',
          billingAddress: '45 Shelter Ave',
          notes: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      items: [
        {
          id: 'restored_itm_1',
          name: 'Emergency Generator Maintenance',
          description: '',
          unit: 'service',
          defaultRate: 500,
          taxable: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    await storage.restoreWorkspaceData(restorePayload);

    // Verify old client was wiped and new client is present atomically
    const clients = await storage.getAllClients();
    expect(clients).toHaveLength(1);
    expect(clients[0].id).toBe('restored_cli_1');
    expect(clients[0].name).toBe('Sarah Connor');

    const biz = await storage.getBusinessProfile();
    expect(biz.name).toBe('Restored Electrical Pty Ltd');
    expect(biz.taxId).toBe('ABN 99 888 777 666');
  });

  it('persists and clears buddy draft state in IndexedDB', async () => {
    const messages = [
      {
        id: 'msg_1',
        role: 'user' as const,
        content: 'Invoice for Sarah Jenkins',
        timestamp: '11:00 AM',
        provenance: 'user' as const
      }
    ];

    const draft = {
      customer: { name: 'Sarah Jenkins' },
      lineItems: [],
      subtotal: 0,
      taxAmount: 0,
      grandTotal: 0,
      missingFields: ['Services'],
      uncertainFields: [],
      summary: 'Draft for Sarah Jenkins'
    };

    await storage.saveBuddyDraft(messages, draft);
    const loaded = await storage.getBuddyDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.currentDraft?.customer?.name).toBe('Sarah Jenkins');

    await storage.clearBuddyDraft();
    const afterClear = await storage.getBuddyDraft();
    expect(afterClear).toBeNull();
  });

  it('guarantees saveInvoice and saveClient await IDBTransaction.oncomplete before resolving', async () => {
    const db = await storage.openDB();
    const originalTransaction = db.transaction.bind(db);

    const eventSequence: string[] = [];

    // Spy on transaction to observe event dispatch order
    db.transaction = function (
      storeNames: string | string[],
      mode?: IDBTransactionMode,
      options?: IDBTransactionOptions
    ) {
      const tx = originalTransaction(storeNames, mode as IDBTransactionMode, options);

      tx.addEventListener('complete', () => {
        eventSequence.push('tx_oncomplete');
      });

      return tx;
    };

    const testInvoice: Invoice = {
      id: 'inv_atomic_seq_1',
      invoiceNumber: 'INV-9001',
      status: 'draft',
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      clientId: 'cli_seq',
      clientSnapshot: {
        id: 'cli_seq',
        name: 'Sequence Client',
        email: '',
        phone: '',
        billingAddress: '',
        notes: '',
        createdAt: '',
        updatedAt: ''
      },
      lineItems: [],
      currency: 'CAD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: 'GST',
      taxRate: 5.0,
      taxAmount: 0,
      subtotal: 0,
      grandTotal: 0,
      notes: '',
      paymentInstructions: '',
      template: DEFAULT_TEMPLATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      await storage.saveInvoice(testInvoice);
      eventSequence.push('saveInvoice_resolved');

      // The transaction 'complete' event MUST fire before the storage method's promise resolves
      expect(eventSequence).toEqual(['tx_oncomplete', 'saveInvoice_resolved']);

      eventSequence.length = 0;

      await storage.saveClient({
        id: 'cli_atomic_seq_2',
        name: 'Atomic Client',
        email: '',
        phone: '',
        billingAddress: '',
        notes: '',
        createdAt: '',
        updatedAt: ''
      });
      eventSequence.push('saveClient_resolved');

      expect(eventSequence).toEqual(['tx_oncomplete', 'saveClient_resolved']);
    } finally {
      // Restore original transaction method
      db.transaction = originalTransaction;
    }
  });

  it('rolls back completely and rejects when an IDBTransaction is aborted', async () => {
    let aborted = false;

    try {
      await storage.runTransaction<void>('invoices', 'readwrite', (store, tx) => {
        store.put({
          id: 'inv_aborted_1',
          invoiceNumber: 'INV-ABORT',
          status: 'draft',
          issueDate: '2026-11-02',
          dueDate: '2026-11-16',
          clientId: 'cli_abort',
          clientSnapshot: {
            id: 'cli_abort',
            name: 'Aborted Client',
            email: '',
            phone: '',
            billingAddress: '',
            notes: '',
            createdAt: '',
            updatedAt: ''
          },
          lineItems: [],
          currency: 'CAD',
          discountType: 'percentage',
          discountValue: 0,
          discountAmount: 0,
          taxLabel: 'GST',
          taxRate: 5.0,
          taxAmount: 0,
          subtotal: 0,
          grandTotal: 0,
          notes: '',
          paymentInstructions: '',
          template: DEFAULT_TEMPLATE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Trigger manual rollback via tx.abort()
        tx.abort();
      });
    } catch (err: unknown) {
      aborted = true;
      expect(err).toBeDefined();
    }

    expect(aborted).toBe(true);

    // Verify aborted record was completely rolled back and never committed
    const retrieved = await storage.getInvoiceById('inv_aborted_1');
    expect(retrieved).toBeUndefined();
  });

  it('supports atomic batch persistence and multi-store atomic operations', async () => {
    // 1. Batch client persistence
    const batchClients: Client[] = [
      {
        id: 'cli_batch_1',
        name: 'Client Alpha',
        email: 'alpha@test.com',
        phone: '',
        billingAddress: '',
        notes: '',
        createdAt: '',
        updatedAt: ''
      },
      {
        id: 'cli_batch_2',
        name: 'Client Beta',
        email: 'beta@test.com',
        phone: '',
        billingAddress: '',
        notes: '',
        createdAt: '',
        updatedAt: ''
      }
    ];

    await storage.saveClients(batchClients);
    const clients = await storage.getAllClients();
    expect(clients).toHaveLength(2);

    // 2. Multi-store atomic transaction (saveInvoiceWithBusinessProfile)
    const testInvoice: Invoice = {
      id: 'inv_dual_store_1',
      invoiceNumber: 'INV-8888',
      status: 'draft',
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      clientId: 'cli_batch_1',
      clientSnapshot: batchClients[0],
      lineItems: [],
      currency: 'CAD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: 'GST',
      taxRate: 5.0,
      taxAmount: 0,
      subtotal: 0,
      grandTotal: 0,
      notes: '',
      paymentInstructions: '',
      template: DEFAULT_TEMPLATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedProfile: BusinessProfile = {
      ...DEFAULT_BUSINESS_PROFILE,
      name: 'Dual Store Corporation',
      nextInvoiceNumber: 8889
    };

    await storage.saveInvoiceWithBusinessProfile(testInvoice, updatedProfile);

    // Both stores should be atomically committed
    const savedInv = await storage.getInvoiceById('inv_dual_store_1');
    const savedProf = await storage.getBusinessProfile();

    expect(savedInv).toBeDefined();
    expect(savedInv?.invoiceNumber).toBe('INV-8888');
    expect(savedProf.name).toBe('Dual Store Corporation');
    expect(savedProf.nextInvoiceNumber).toBe(8889);
  });
});
