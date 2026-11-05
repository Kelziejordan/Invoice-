import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DEFAULT_BUSINESS_PROFILE, DEFAULT_TEMPLATE } from '../services/storage';
import { calculateLineTotal, calculateInvoiceTotals, formatCurrency, roundToTwo } from '../utils/calc';
import { formatInvoiceNumber, parseNextSequence } from '../utils/numbering';
import { createIntegrityBackup, verifyAndParseBackup } from '../utils/backup';
import { processBuddyTurn, calculateDueDate } from '../services/buddyEngine';
import { BusinessProfile, Client, Item, Invoice, InvoiceStatus } from '../types';

describe('Invoice Workflow Complete Integration Tests', () => {
  let storage: StorageService;

  beforeEach(async () => {
    storage = new StorageService();
    await storage.clearAllData();
  });

  it('simulates a complete end-to-end invoice lifecycle: client creation, item catalogue, drafting, calculation, atomic persistence, and status transitions', async () => {
    // 1. Business Profile Setup
    const businessProfile: BusinessProfile = {
      ...DEFAULT_BUSINESS_PROFILE,
      name: 'Summit Engineering Services',
      contactEmail: 'billing@summiteng.ca',
      phone: '403-555-0199',
      address: '100 Calgary Tower Way, Calgary AB T2P 1J9',
      website: 'https://summiteng.ca',
      taxId: 'GST 123456789 RT0001',
      defaultCurrency: 'CAD',
      defaultTaxLabel: 'GST',
      defaultTaxRate: 5.0,
      country: 'Canada',
      jurisdiction: 'Alberta',
      invoicePrefix: 'SUMMIT-',
      nextInvoiceNumber: 1001
    };
    await storage.saveBusinessProfile(businessProfile);

    const savedProfile = await storage.getBusinessProfile();
    expect(savedProfile.name).toBe('Summit Engineering Services');
    expect(savedProfile.defaultTaxRate).toBe(5.0);

    // 2. Client Creation & Persistence Verification
    const newClient: Client = {
      id: 'cli_summit_1',
      name: 'Acme Developments Corp',
      email: 'accounts@acmedevelopments.com',
      phone: '403-555-0144',
      billingAddress: '500 8th Ave SW, Calgary AB T2P 1G1',
      notes: 'Payment terms net 30',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storage.saveClient(newClient);

    const retrievedClient = await storage.getClientById('cli_summit_1');
    expect(retrievedClient).toBeDefined();
    expect(retrievedClient?.name).toBe('Acme Developments Corp');
    expect(retrievedClient?.email).toBe('accounts@acmedevelopments.com');

    // 3. Item Library Creation & Persistence Verification
    const item1: Item = {
      id: 'itm_eng_consult',
      name: 'Structural Engineering Consultation',
      description: 'Senior engineer site inspection and structural analysis',
      unit: 'hours',
      defaultRate: 150.0,
      taxable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const item2: Item = {
      id: 'itm_report_prep',
      name: 'Safety Compliance Report',
      description: 'Detailed compliance documentation and filing',
      unit: 'items',
      defaultRate: 450.0,
      taxable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const itemExempt: Item = {
      id: 'itm_permit_fee',
      name: 'Municipal Filing Fee',
      description: 'Pass-through tax-exempt municipal permit fee',
      unit: 'items',
      defaultRate: 200.0,
      taxable: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await storage.saveItems([item1, item2, itemExempt]);
    const allItems = await storage.getAllItems();
    expect(allItems).toHaveLength(3);

    // 4. Invoice Number Sequence Generation
    const existingInvoices = await storage.getAllInvoices();
    const existingNumbers = existingInvoices.map((inv) => inv.invoiceNumber);
    const nextSeq = parseNextSequence(businessProfile.invoicePrefix, existingNumbers);
    expect(nextSeq).toBe(1);

    const invoiceNumber = formatInvoiceNumber(businessProfile.invoicePrefix, nextSeq);
    expect(invoiceNumber).toBe('SUMMIT-0001');

    // 5. Invoice Drafting & Calculation Validation
    const lineItems = [
      {
        id: 'line_1',
        itemId: item1.id,
        description: item1.name,
        quantity: 10,
        unit: item1.unit,
        unitRate: item1.defaultRate,
        taxable: item1.taxable,
        lineTotal: calculateLineTotal(10, item1.defaultRate) // 10 * 150 = 1500.00
      },
      {
        id: 'line_2',
        itemId: item2.id,
        description: item2.name,
        quantity: 2,
        unit: item2.unit,
        unitRate: item2.defaultRate,
        taxable: item2.taxable,
        lineTotal: calculateLineTotal(2, item2.defaultRate) // 2 * 450 = 900.00
      },
      {
        id: 'line_3',
        itemId: itemExempt.id,
        description: itemExempt.name,
        quantity: 1,
        unit: itemExempt.unit,
        unitRate: itemExempt.defaultRate,
        taxable: itemExempt.taxable,
        lineTotal: calculateLineTotal(1, itemExempt.defaultRate) // 1 * 200 = 200.00
      }
    ];

    expect(lineItems[0].lineTotal).toBe(1500.0);
    expect(lineItems[1].lineTotal).toBe(900.0);
    expect(lineItems[2].lineTotal).toBe(200.0);

    // Execute real calculation validation
    const totals = calculateInvoiceTotals({
      lineItems,
      discountType: 'percentage',
      discountValue: 10, // 10% discount
      taxRate: businessProfile.defaultTaxRate // 5.0% GST
    });

    // Subtotal = 1500 + 900 + 200 = 2600.00
    expect(totals.subtotal).toBe(2600.0);

    // Discount 10% = 260.00
    expect(totals.discountAmount).toBe(260.0);

    // Raw taxable subtotal = 1500 + 900 = 2400.00
    // After 10% discount on taxable portion = 2400 * (1 - 0.10) = 2160.00
    expect(totals.taxableSubtotal).toBe(2160.0);

    // GST (5% of 2160.00) = 108.00
    expect(totals.taxAmount).toBe(108.0);

    // Grand total = 2600 - 260 + 108 = 2448.00
    expect(totals.grandTotal).toBe(2448.0);

    // 6. Invoice Assembly & Dual-Store Atomic Persistence
    const issueDate = '2026-11-04';
    const dueDate = calculateDueDate(issueDate, '30 days');
    expect(dueDate).toBe('2026-12-04');

    const draftInvoice: Invoice = {
      id: 'inv_summit_1001',
      invoiceNumber,
      status: 'draft',
      issueDate,
      dueDate,
      clientId: newClient.id,
      clientSnapshot: newClient,
      lineItems,
      currency: businessProfile.defaultCurrency,
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: totals.discountAmount,
      taxLabel: businessProfile.defaultTaxLabel,
      taxRate: businessProfile.defaultTaxRate,
      taxAmount: totals.taxAmount,
      subtotal: totals.subtotal,
      grandTotal: totals.grandTotal,
      notes: 'Thank you for choosing Summit Engineering.',
      paymentInstructions: 'Electronic funds transfer to billing@summiteng.ca',
      template: DEFAULT_TEMPLATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updatedProfile: BusinessProfile = {
      ...businessProfile,
      nextInvoiceNumber: nextSeq + 1
    };

    // Save invoice and updated nextInvoiceNumber atomically in one IndexedDB transaction
    await storage.saveInvoiceWithBusinessProfile(draftInvoice, updatedProfile);

    // 7. Verify Persistence in IndexedDB
    const persistedInvoice = await storage.getInvoiceById('inv_summit_1001');
    expect(persistedInvoice).toBeDefined();
    expect(persistedInvoice?.invoiceNumber).toBe('SUMMIT-0001');
    expect(persistedInvoice?.clientSnapshot.name).toBe('Acme Developments Corp');
    expect(persistedInvoice?.lineItems).toHaveLength(3);
    expect(persistedInvoice?.subtotal).toBe(2600.0);
    expect(persistedInvoice?.discountAmount).toBe(260.0);
    expect(persistedInvoice?.taxAmount).toBe(108.0);
    expect(persistedInvoice?.grandTotal).toBe(2448.0);
    expect(persistedInvoice?.status).toBe('draft');

    const reloadedProfile = await storage.getBusinessProfile();
    expect(reloadedProfile.nextInvoiceNumber).toBe(2);

    // 8. Lifecycle Transitions: draft -> sent -> overdue -> paid -> cancelled
    // Transition 1: Mark as Sent
    const sentInvoice: Invoice = {
      ...persistedInvoice!,
      status: 'sent',
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(sentInvoice);

    let checkInvoice = await storage.getInvoiceById('inv_summit_1001');
    expect(checkInvoice?.status).toBe('sent');

    // Transition 2: Mark as Overdue
    const overdueInvoice: Invoice = {
      ...checkInvoice!,
      status: 'overdue',
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(overdueInvoice);

    checkInvoice = await storage.getInvoiceById('inv_summit_1001');
    expect(checkInvoice?.status).toBe('overdue');

    // Transition 3: Record Payment Received (Mark as Paid)
    const paymentDate = '2026-11-20';
    const amountReceived = 2448.0;
    const paidInvoice: Invoice = {
      ...checkInvoice!,
      status: 'paid',
      paymentDate,
      amountReceived,
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(paidInvoice);

    checkInvoice = await storage.getInvoiceById('inv_summit_1001');
    expect(checkInvoice?.status).toBe('paid');
    expect(checkInvoice?.paymentDate).toBe('2026-11-20');
    expect(checkInvoice?.amountReceived).toBe(2448.0);

    // Formatted currency output assertion
    const formattedGrandTotal = formatCurrency(checkInvoice!.grandTotal, checkInvoice!.currency);
    expect(formattedGrandTotal).toContain('2,448.00');

    // Transition 4: Cancel Invoice
    const cancelledInvoice: Invoice = {
      ...checkInvoice!,
      status: 'cancelled',
      updatedAt: new Date().toISOString()
    };
    await storage.saveInvoice(cancelledInvoice);

    checkInvoice = await storage.getInvoiceById('inv_summit_1001');
    expect(checkInvoice?.status).toBe('cancelled');
  });

  it('validates financial calculations across fixed discounts, tax exemptions, and fractional quantities', () => {
    // Test Case A: Fixed dollar discount and fractional hours
    const lineItemsA = [
      {
        id: 'l1',
        description: 'Consulting Services',
        quantity: 4.25, // 4 hours 15 mins
        unit: 'hours',
        unitRate: 88.0,
        taxable: true,
        lineTotal: calculateLineTotal(4.25, 88.0) // 374.00
      },
      {
        id: 'l2',
        description: 'On-site mileage',
        quantity: 12.5,
        unit: 'km',
        unitRate: 1.2,
        taxable: true,
        lineTotal: calculateLineTotal(12.5, 1.2) // 15.00
      }
    ];

    expect(lineItemsA[0].lineTotal).toBe(374.0);
    expect(lineItemsA[1].lineTotal).toBe(15.0);

    const totalsA = calculateInvoiceTotals({
      lineItems: lineItemsA,
      discountType: 'fixed',
      discountValue: 50.0, // $50 fixed discount
      taxRate: 5.0 // 5% Alberta GST
    });

    // Subtotal = 374.00 + 15.00 = 389.00
    expect(totalsA.subtotal).toBe(389.0);
    expect(totalsA.discountAmount).toBe(50.0);

    // Taxable subtotal = 389.00 - 50.00 = 339.00
    expect(totalsA.taxableSubtotal).toBe(339.0);

    // Tax (5% of 339.00) = 16.95
    expect(totalsA.taxAmount).toBe(16.95);

    // Grand total = 389.00 - 50.00 + 16.95 = 355.95
    expect(totalsA.grandTotal).toBe(355.95);

    // Test Case B: Rounding precision edge cases
    expect(roundToTwo(12.345)).toBe(12.35);
    expect(roundToTwo(12.344)).toBe(12.34);
    expect(calculateLineTotal(1.333, 30.0)).toBe(39.99);
  });

  it('integrates Invoice Buddy conversational turn parsing with client directory auto-matching and persistence', async () => {
    // Seed client directory in IndexedDB
    const existingClient: Client = {
      id: 'cli_sarah_1',
      name: 'Sarah Jenkins',
      email: 'sarah@jenkins.com.au',
      phone: '0412 345 678',
      billingAddress: '14 Coastal Way, Manly NSW 2095',
      notes: 'Regular client',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storage.saveClient(existingClient);

    const existingItem: Item = {
      id: 'itm_lawn_1',
      name: 'Lawn Mowing',
      description: 'Residential lawn care',
      unit: 'service',
      defaultRate: 75.0,
      taxable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storage.saveItem(existingItem);

    const clients = await storage.getAllClients();
    const items = await storage.getAllItems();

    // Process conversational prompt
    const userPrompt = 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr plus $90 waste disposal, due in 14 days';
    const turnResult = processBuddyTurn({
      userMessage: userPrompt,
      existingClients: clients,
      existingItems: items,
      businessDefaults: {
        currency: 'CAD',
        taxLabel: 'GST',
        taxRate: 5.0,
        paymentInstructions: 'E-transfer to accounts@business.ca'
      }
    });

    expect(turnResult.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turnResult.draft.customer?.matchedClientId).toBe('cli_sarah_1');
    expect(turnResult.draft.customer?.isExisting).toBe(true);
    expect(turnResult.draft.lineItems).toHaveLength(2);

    // Line 1: Garden maintenance 4.5 hrs @ $65/hr = $292.50
    expect(turnResult.draft.lineItems[0].quantity).toBe(4.5);
    expect(turnResult.draft.lineItems[0].unitRate).toBe(65.0);
    expect(turnResult.draft.lineItems[0].lineTotal).toBe(292.5);

    // Line 2: Waste disposal 1 unit @ $90 = $90.00
    expect(turnResult.draft.lineItems[1].quantity).toBe(1);
    expect(turnResult.draft.lineItems[1].unitRate).toBe(90.0);
    expect(turnResult.draft.lineItems[1].lineTotal).toBe(90.0);

    // Subtotal: 292.50 + 90.00 = 382.50
    expect(turnResult.draft.subtotal).toBe(382.5);
    // GST 5%: 19.13 (rounded)
    expect(turnResult.draft.taxAmount).toBe(19.13);
    // Grand Total: 401.63
    expect(turnResult.draft.grandTotal).toBe(401.63);
    expect(turnResult.readyToApply).toBe(true);

    // Save buddy draft state
    await storage.saveBuddyDraft(
      [
        {
          id: 'm1',
          role: 'user',
          content: userPrompt,
          timestamp: '10:00 AM'
        },
        {
          id: 'm2',
          role: 'assistant',
          content: turnResult.assistantResponse,
          timestamp: '10:00 AM',
          draftSnapshot: turnResult.draft
        }
      ],
      turnResult.draft
    );

    const savedBuddyState = await storage.getBuddyDraft();
    expect(savedBuddyState).not.toBeNull();
    expect(savedBuddyState?.messages).toHaveLength(2);
    expect(savedBuddyState?.currentDraft?.grandTotal).toBe(401.63);
  });

  it('performs workspace backup export, integrity verification, and atomic restoration', async () => {
    // 1. Seed workspace data
    const business: BusinessProfile = {
      ...DEFAULT_BUSINESS_PROFILE,
      name: 'Backup Test Enterprise',
      contactEmail: 'backup@test.com'
    };
    await storage.saveBusinessProfile(business);

    const client: Client = {
      id: 'cli_backup_1',
      name: 'Backup Client',
      email: 'client@backup.com',
      phone: '123-456-7890',
      billingAddress: '123 Test St',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storage.saveClient(client);

    const item: Item = {
      id: 'itm_backup_1',
      name: 'Backup Service',
      description: 'Service description',
      unit: 'hrs',
      defaultRate: 100.0,
      taxable: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await storage.saveItem(item);

    // 2. Generate Backup Payload & Verification Envelope
    const backupData = {
      business,
      clients: [client],
      items: [item],
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    const backupJson = await createIntegrityBackup(backupData);
    expect(backupJson).toContain('InvoiceStudio2');
    expect(backupJson).toContain('checksumSha256');

    // 3. Verify Backup Integrity
    const verification = await verifyAndParseBackup(backupJson);
    expect(verification.valid).toBe(true);
    expect(verification.data?.business.name).toBe('Backup Test Enterprise');

    // 4. Test Backup Tamper Protection
    const tamperedJson = backupJson.replace('Backup Test Enterprise', 'Hacked Enterprise');
    const tamperedVerification = await verifyAndParseBackup(tamperedJson);
    expect(tamperedVerification.valid).toBe(false);
    expect(tamperedVerification.error).toContain('Integrity check failed');

    // 5. Restore Workspace Data Atomically
    await storage.clearAllData();
    const emptyClients = await storage.getAllClients();
    expect(emptyClients).toHaveLength(0);

    await storage.restoreWorkspaceData(verification.data!);

    const restoredClients = await storage.getAllClients();
    expect(restoredClients).toHaveLength(1);
    expect(restoredClients[0].name).toBe('Backup Client');

    const restoredBusiness = await storage.getBusinessProfile();
    expect(restoredBusiness.name).toBe('Backup Test Enterprise');
  });
});
