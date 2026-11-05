import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DEFAULT_TEMPLATE } from '../src/services/storage';
import { Invoice } from '../src/types';

describe('Invoice Lifecycle State Machine & Database Persistence', () => {
  let storage: StorageService;

  beforeEach(async () => {
    storage = new StorageService();
    await storage.clearAllData();
  });

  it('persists draft -> sent -> overdue -> paid -> cancelled transitions in IndexedDB', async () => {
    const initialInvoice: Invoice = {
      id: 'inv_lifecycle_1',
      invoiceNumber: 'INV-1001',
      status: 'draft',
      issueDate: '2026-11-01',
      dueDate: '2026-11-15',
      clientId: 'cli_1',
      clientSnapshot: {
        id: 'cli_1',
        name: 'Sarah Jenkins',
        email: 'sarah@jenkins.com.au',
        phone: '0412 345 678',
        billingAddress: '14 Coastal Way, Manly NSW 2095',
        notes: '',
        createdAt: '2026-11-01',
        updatedAt: '2026-11-01'
      },
      lineItems: [
        {
          id: 'l_1',
          description: 'Garden Maintenance',
          quantity: 4.5,
          unit: 'hours',
          unitRate: 65,
          taxable: true,
          lineTotal: 292.5
        },
        {
          id: 'l_2',
          description: 'Waste Disposal',
          quantity: 1,
          unit: 'trip',
          unitRate: 90,
          taxable: true,
          lineTotal: 90
        }
      ],
      currency: 'AUD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: 'GST',
      taxRate: 10,
      taxAmount: 38.25,
      subtotal: 382.5,
      grandTotal: 420.75,
      notes: 'Terms net 14',
      paymentInstructions: 'Direct deposit',
      template: DEFAULT_TEMPLATE,
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z'
    };

    // 1. Save draft
    await storage.saveInvoice(initialInvoice);
    let stored = await storage.getInvoiceById('inv_lifecycle_1');
    expect(stored?.status).toBe('draft');
    expect(stored?.amountReceived).toBeUndefined();

    // 2. Mark as sent and persist
    const sentInvoice: Invoice = {
      ...stored!,
      status: 'sent',
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(sentInvoice);
    stored = await storage.getInvoiceById('inv_lifecycle_1');
    expect(stored?.status).toBe('sent');

    // 3. Mark as overdue and persist
    const overdueInvoice: Invoice = {
      ...stored!,
      status: 'overdue',
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(overdueInvoice);
    stored = await storage.getInvoiceById('inv_lifecycle_1');
    expect(stored?.status).toBe('overdue');

    // 4. Record payment received and persist
    const paidInvoice: Invoice = {
      ...stored!,
      status: 'paid',
      paymentDate: '2026-11-10',
      amountReceived: 420.75,
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(paidInvoice);
    stored = await storage.getInvoiceById('inv_lifecycle_1');
    expect(stored?.status).toBe('paid');
    expect(stored?.paymentDate).toBe('2026-11-10');
    expect(stored?.amountReceived).toBe(420.75);

    // 5. Cancel invoice
    const cancelledInvoice: Invoice = {
      ...stored!,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(cancelledInvoice);
    stored = await storage.getInvoiceById('inv_lifecycle_1');
    expect(stored?.status).toBe('cancelled');
  });
});
