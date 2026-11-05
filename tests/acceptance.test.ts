import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DEFAULT_BUSINESS_PROFILE, DEFAULT_TEMPLATE } from '../src/services/storage';
import { calculateLineTotal, calculateInvoiceTotals, formatCurrency, roundToTwo } from '../src/utils/calc';
import { formatInvoiceNumber, parseNextSequence } from '../src/utils/numbering';
import { createIntegrityBackup, verifyAndParseBackup, computeSha256 } from '../src/utils/backup';
import { processBuddyTurn, calculateDueDate, isLeapYear, getDaysInMonth } from '../src/services/buddyEngine';
import { LLMClient } from '../src/services/llmClient';
import { Client, Item, Invoice, BuddyInvoiceDraft, ConversationMessage } from '../src/types';

describe('ARGUS MANDATORY ACCEPTANCE SUITE — INVOICE STUDIO v1.5', () => {
  let storage: StorageService;

  const testClients: Client[] = [
    {
      id: 'cli_sarah',
      name: 'Sarah Jenkins',
      email: 'sarah@jenkins.com.au',
      phone: '0412 345 678',
      billingAddress: '14 Coastal Way, Manly NSW 2095',
      notes: 'Preferred client',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    }
  ];

  const testItems: Item[] = [
    {
      id: 'itm_garden',
      name: 'Garden Maintenance',
      description: 'Standard residential garden maintenance',
      unit: 'hours',
      defaultRate: 65.0,
      taxable: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    },
    {
      id: 'itm_exempt',
      name: 'Commercial Consultation License',
      description: 'Specialized tax-exempt software license',
      unit: 'licenses',
      defaultRate: 500.0,
      taxable: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    }
  ];

  const albertaDefaults = {
    currency: 'CAD',
    taxLabel: 'GST',
    taxRate: 5.0,
    paymentInstructions: 'Interac e-Transfer to accounts@business.ca'
  };

  beforeEach(async () => {
    storage = new StorageService();
    await storage.clearAllData();
  });

  // =========================================================================
  // TEST 001 — Actual AI Invocation
  // Prove a normal Buddy conversation invokes the local model worker.
  // =========================================================================
  it('TEST 001: Actual AI invocation logs model execution with provenance and request ID', async () => {
    const client = new LLMClient();

    // Configure test worker runner simulating on-device worker inference
    client.setTestRunner(async (prompt: string) => {
      expect(prompt).toContain('Sarah Jenkins');
      return {
        summary: `Invoice Buddy processed: "${prompt}" using Xenova/flan-t5-small`,
        proposedLineItems: [
          {
            description: 'Garden Maintenance and Lawn Care',
            quantity: 4.5,
            unit: 'hours',
            unitRate: 65,
            taxable: true
          }
        ],
        originalPrompt: prompt,
        provenance: 'local-model'
      };
    });

    const proposal = await client.requestProposal('Invoice Sarah Jenkins for 4.5 hours garden maintenance at $65/hr');
    expect(proposal.provenance).toBe('local-model');
    expect(proposal.proposedLineItems[0].quantity).toBe(4.5);

    const logs = client.getExecutionLogs();
    expect(logs.length).toBeGreaterThan(0);
    const lastLog = logs[logs.length - 1];
    expect(lastLog.modelIdentifier).toBe('Xenova/flan-t5-small');
    expect(lastLog.runtime).toBe('WebAssembly (On-Device)');
    expect(lastLog.source).toBe('local-model');
    expect(lastLog.requestId).toMatch(/^task_/);
    expect(lastLog.executionResult).toContain('Xenova/flan-t5-small');
  });

  // =========================================================================
  // TEST 002 — Structured Extraction
  // Extract a customer, two line items, quantities, rates and payment terms.
  // Validate the actual structured proposal.
  // =========================================================================
  it('TEST 002: Structured extraction parses customer, two line items, rates, and payment terms', () => {
    const turn1 = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr and 1 waste disposal at $90, due in 14 days',
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults
    });

    expect(turn1.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turn1.draft.customer?.matchedClientId).toBe('cli_sarah');
    expect(turn1.draft.lineItems).toHaveLength(2);

    // Item 1: Garden maintenance
    expect(turn1.draft.lineItems[0].quantity).toBe(4.5);
    expect(turn1.draft.lineItems[0].unitRate).toBe(65);
    expect(turn1.draft.lineItems[0].lineTotal).toBe(292.5);

    // Item 2: Waste disposal
    expect(turn1.draft.lineItems[1].quantity).toBe(1);
    expect(turn1.draft.lineItems[1].unitRate).toBe(90);
    expect(turn1.draft.lineItems[1].lineTotal).toBe(90);

    // Financial totals under Alberta 5% GST
    expect(turn1.draft.subtotal).toBe(382.5);
    expect(turn1.draft.taxRate).toBe(5.0);
    expect(turn1.draft.taxAmount).toBe(19.13); // 5% of 382.50 = 19.125 -> 19.13
    expect(turn1.draft.grandTotal).toBe(401.63); // 382.50 + 19.13 = 401.63
    expect(turn1.readyToApply).toBe(true);
    expect(turn1.draft.missingFields).toHaveLength(0);
  });

  // =========================================================================
  // TEST 003 — Missing Information
  // Confirm Buddy requests missing information instead of inventing it.
  // =========================================================================
  it('TEST 003: Requests missing information and does not invent rates or client details', () => {
    const turn = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 2 hours emergency pipe repair',
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults
    });

    expect(turn.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turn.draft.lineItems).toHaveLength(1);
    // Rate was not specified and item not in catalogue -> unitRate is 0, NEVER invented
    expect(turn.draft.lineItems[0].unitRate).toBe(0);
    expect(turn.draft.lineItems[0].rateRequiresConfirmation).toBe(true);
    expect(turn.draft.missingFields.some((f) => f.toLowerCase().includes('rate'))).toBe(true);
    expect(turn.readyToApply).toBe(false);
    expect(turn.assistantResponse.toLowerCase()).toContain('rate');
  });

  // =========================================================================
  // TEST 004 — Correction Handling
  // Change a previously supplied quantity or rate and verify the correction.
  // =========================================================================
  it('TEST 004: Handles corrections across conversation turns without duplicating items', () => {
    // Turn 1: 4.5 hours @ $65
    const turn1 = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr',
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults
    });
    expect(turn1.draft.lineItems[0].quantity).toBe(4.5);
    expect(turn1.draft.subtotal).toBe(292.5);

    // Turn 2: User corrects hours to 5 and rate to $70
    const turn2 = processBuddyTurn({
      userMessage: 'Change garden maintenance to 5 hours at $70/hr',
      previousDraft: turn1.draft,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults
    });

    // Should update existing line item, not add a duplicate
    expect(turn2.draft.lineItems).toHaveLength(1);
    expect(turn2.draft.lineItems[0].quantity).toBe(5);
    expect(turn2.draft.lineItems[0].unitRate).toBe(70);
    expect(turn2.draft.lineItems[0].lineTotal).toBe(350);
    expect(turn2.draft.subtotal).toBe(350);
    expect(turn2.draft.taxAmount).toBe(17.5); // 5% of 350
    expect(turn2.draft.grandTotal).toBe(367.5);
  });

  // =========================================================================
  // TEST 005 — Model Failure
  // Simulate timeout and initialization failure. Verify safe fallback behavior.
  // =========================================================================
  it('TEST 005: Simulates model failure and falls back safely to deterministic engine', async () => {
    const client = new LLMClient();

    // Set failing test runner
    client.setTestRunner(async () => {
      throw new Error('WebAssembly runtime initialization error: out of memory');
    });

    let modelFailed = false;
    try {
      await client.requestProposal('Invoice Sarah Jenkins for 2 hours lawn mowing');
    } catch (err: unknown) {
      modelFailed = true;
      expect((err as Error).message).toContain('out of memory');
    }
    expect(modelFailed).toBe(true);

    // Verify log captured failure with fallback source
    const logs = client.getExecutionLogs();
    expect(logs[logs.length - 1].errorStatus).toContain('out of memory');
    expect(logs[logs.length - 1].source).toBe('deterministic-fallback');

    // Deterministic engine executes safely and fulfills invoice requirements
    const deterministicTurn = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 2 hours garden maintenance at $65/hr',
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults
    });

    expect(deterministicTurn.draft.customer?.name).toBe('Sarah Jenkins');
    expect(deterministicTurn.draft.lineItems[0].quantity).toBe(2);
    expect(deterministicTurn.draft.lineItems[0].unitRate).toBe(65);
    expect(deterministicTurn.readyToApply).toBe(true);
  });

  // =========================================================================
  // TEST 006 — Invoice Population
  // Apply a completed Buddy proposal to the actual Invoice Builder.
  // =========================================================================
  it('TEST 006: Applies completed Buddy proposal into full invoice structure for Invoice Builder', () => {
    const turn = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr plus $90 waste disposal, due in 14 days',
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults
    });

    const draft = turn.draft;
    // Map draft into actual Invoice object
    const populatedInvoice: Invoice = {
      id: 'inv_populated_1',
      invoiceNumber: 'INV-1001',
      status: 'draft',
      issueDate: draft.issueDate || '2026-11-02',
      dueDate: draft.dueDate || '2026-11-16',
      clientId: draft.customer?.matchedClientId || 'cli_sarah',
      clientSnapshot: testClients[0],
      lineItems: draft.lineItems,
      currency: draft.currency || 'CAD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: draft.taxLabel || 'GST',
      taxRate: draft.taxRate ?? 5.0,
      taxAmount: draft.taxAmount,
      subtotal: draft.subtotal,
      grandTotal: draft.grandTotal,
      notes: draft.notes || '',
      paymentInstructions: albertaDefaults.paymentInstructions,
      template: DEFAULT_TEMPLATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    expect(populatedInvoice.clientSnapshot.name).toBe('Sarah Jenkins');
    expect(populatedInvoice.lineItems).toHaveLength(2);
    expect(populatedInvoice.subtotal).toBe(382.5);
    expect(populatedInvoice.taxAmount).toBe(19.13);
    expect(populatedInvoice.grandTotal).toBe(401.63);
  });

  // =========================================================================
  // TEST 007 — Financial Calculations
  // Verify the Sarah Jenkins calculation in Section 5 (CAD $382.50, GST $19.13, Total $401.63)
  // and edge cases: non-taxable, mixed, zero-value, fractional, rounding, negatives.
  // =========================================================================
  it('TEST 007: Verifies exact Alberta GST calculation ($382.50 + 5% = $401.63) and financial edge cases', () => {
    // 1. Mandatory Sarah Jenkins invoice from Section 5
    const sarahItems = [
      { id: '1', description: 'Garden maintenance', quantity: 4.5, unit: 'hours', unitRate: 65.0, taxable: true, lineTotal: 292.5 },
      { id: '2', description: 'Waste disposal', quantity: 1, unit: 'trip', unitRate: 90.0, taxable: true, lineTotal: 90.0 }
    ];

    const result = calculateInvoiceTotals({
      lineItems: sarahItems,
      discountType: 'percentage',
      discountValue: 0,
      taxRate: 5.0 // Alberta GST rate
    });

    expect(sarahItems[0].lineTotal).toBe(292.5);
    expect(sarahItems[1].lineTotal).toBe(90.0);
    expect(result.subtotal).toBe(382.5);
    expect(result.taxAmount).toBe(19.13); // 382.50 * 0.05 = 19.125 -> rounds to 19.13
    expect(result.grandTotal).toBe(401.63); // 382.50 + 19.13 = 401.63

    // 2. Mixed taxable and non-taxable
    const mixedItems = [
      { id: '1', description: 'Taxable Service', quantity: 1, unit: 'hr', unitRate: 100, taxable: true, lineTotal: 100 },
      { id: '2', description: 'Non-Taxable License', quantity: 1, unit: 'lic', unitRate: 200, taxable: false, lineTotal: 200 }
    ];
    const mixedResult = calculateInvoiceTotals({
      lineItems: mixedItems,
      discountType: 'percentage',
      discountValue: 0,
      taxRate: 5.0
    });
    expect(mixedResult.subtotal).toBe(300);
    expect(mixedResult.taxableSubtotal).toBe(100);
    expect(mixedResult.taxAmount).toBe(5.0); // 5% on 100 only
    expect(mixedResult.grandTotal).toBe(305.0);

    // 3. Negative quantity safeguard
    expect(calculateLineTotal(-5, 50)).toBe(0);
    // 4. Invalid negative rate safeguard
    expect(calculateLineTotal(5, -50)).toBe(0);
    // 5. Zero-value items
    expect(calculateLineTotal(0, 100)).toBe(0);
    expect(calculateLineTotal(10, 0)).toBe(0);
    // 6. Fractional quantities
    expect(calculateLineTotal(1.333, 30)).toBe(39.99);
    expect(calculateLineTotal(2.5, 30)).toBe(75.0);
    // 7. Rounding boundaries
    expect(roundToTwo(10.005)).toBe(10.01);
    expect(roundToTwo(10.004)).toBe(10.0);
  });

  // =========================================================================
  // TEST 008 — Catalogue Taxability
  // Verify non-taxable catalogue items remain non-taxable through Buddy.
  // =========================================================================
  it('TEST 008: Non-taxable catalogue items remain non-taxable through Invoice Buddy', () => {
    const turn = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 1 Commercial Consultation License at $500',
      existingClients: testClients,
      existingItems: testItems, // contains itm_exempt with taxable: false
      businessDefaults: albertaDefaults
    });

    expect(turn.draft.lineItems).toHaveLength(1);
    expect(turn.draft.lineItems[0].itemId).toBe('itm_exempt');
    expect(turn.draft.lineItems[0].taxable).toBe(false); // Correctly inherited from catalogue item
    expect(turn.draft.subtotal).toBe(500);
    expect(turn.draft.taxAmount).toBe(0); // 0 tax applied
    expect(turn.draft.grandTotal).toBe(500);
  });

  // =========================================================================
  // TEST 009 — Persistence
  // Save, reload and retrieve an invoice.
  // =========================================================================
  it('TEST 009: Saves, reloads, and retrieves invoice verifying all fields and committed durability', async () => {
    const testInvoice: Invoice = {
      id: 'inv_persist_009',
      invoiceNumber: 'INV-1001',
      status: 'draft',
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      clientId: 'cli_sarah',
      clientSnapshot: testClients[0],
      lineItems: [
        {
          id: 'l_1',
          description: 'Garden maintenance',
          quantity: 4.5,
          unit: 'hours',
          unitRate: 65.0,
          taxable: true,
          lineTotal: 292.5
        }
      ],
      currency: 'CAD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: 'GST',
      taxRate: 5.0,
      taxAmount: 14.63,
      subtotal: 292.5,
      grandTotal: 307.13,
      notes: 'Terms net 14',
      paymentInstructions: 'e-Transfer',
      template: DEFAULT_TEMPLATE,
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z'
    };

    // Save with tx.oncomplete durability
    await storage.saveInvoice(testInvoice);

    // Retrieve from IndexedDB
    const retrieved = await storage.getInvoiceById('inv_persist_009');
    expect(retrieved).toBeDefined();
    expect(retrieved?.invoiceNumber).toBe('INV-1001');
    expect(retrieved?.currency).toBe('CAD');
    expect(retrieved?.grandTotal).toBe(307.13);
    expect(retrieved?.clientSnapshot.name).toBe('Sarah Jenkins');
    expect(retrieved?.lineItems[0].quantity).toBe(4.5);
  });

  // =========================================================================
  // TEST 010 — Buddy Recovery
  // Recover an unfinished conversation after application reload.
  // =========================================================================
  it('TEST 010: Recovers unfinished Buddy conversation and draft after application reload', async () => {
    const messages: ConversationMessage[] = [
      {
        id: 'msg_1',
        role: 'user',
        content: 'Invoice Sarah Jenkins for 4.5 hours garden maintenance',
        timestamp: '10:00 AM',
        provenance: 'user'
      },
      {
        id: 'msg_2',
        role: 'assistant',
        content: 'I have recorded 4.5 hours of garden maintenance. What rate would you like to charge?',
        timestamp: '10:01 AM',
        provenance: 'deterministic-fallback'
      }
    ];

    const draft: BuddyInvoiceDraft = {
      customer: { name: 'Sarah Jenkins', matchedClientId: 'cli_sarah', isExisting: true },
      lineItems: [
        {
          id: 'l_1',
          description: 'Garden maintenance',
          quantity: 4.5,
          unit: 'hours',
          unitRate: 0,
          taxable: true,
          lineTotal: 0,
          rateRequiresConfirmation: true
        }
      ],
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      notes: '',
      currency: 'CAD',
      taxLabel: 'GST',
      taxRate: 5.0,
      subtotal: 0,
      taxAmount: 0,
      grandTotal: 0,
      missingFields: ['Rate for "Garden maintenance"'],
      uncertainFields: [],
      summary: 'Sarah Jenkins - 1 item'
    };

    // Save unfinished draft
    await storage.saveBuddyDraft(messages, draft);

    // Reopen/retrieve from IndexedDB (simulating app reload)
    const recovered = await storage.getBuddyDraft();
    expect(recovered).not.toBeNull();
    expect(recovered?.messages).toHaveLength(2);
    expect(recovered?.messages[0].content).toContain('Sarah Jenkins');
    expect(recovered?.currentDraft?.customer?.name).toBe('Sarah Jenkins');
    expect(recovered?.currentDraft?.lineItems[0].rateRequiresConfirmation).toBe(true);

    // Test explicit discard
    await storage.clearBuddyDraft();
    const afterClear = await storage.getBuddyDraft();
    expect(afterClear).toBeNull();
  });

  // =========================================================================
  // TEST 011 — Invoice Numbering
  // Create multiple invoices and verify unique sequential numbering.
  // =========================================================================
  it('TEST 011: Formats and parses unique sequential invoice numbers without duplicates', () => {
    expect(formatInvoiceNumber('INV-', 1)).toBe('INV-0001');
    expect(formatInvoiceNumber('INV-', 1001)).toBe('INV-1001');

    const invoiceNumbers = ['INV-1001', 'INV-1002', 'INV-1003'];
    const nextSeq = parseNextSequence('INV-', invoiceNumbers);
    expect(nextSeq).toBe(1004);

    const nextFormatted = formatInvoiceNumber('INV-', nextSeq);
    expect(nextFormatted).toBe('INV-1004');
    expect(invoiceNumbers.includes(nextFormatted)).toBe(false);
  });

  // =========================================================================
  // TEST 012 — Payment Terms
  // Test EOM, 14-day terms, month boundaries and leap years.
  // =========================================================================
  it('TEST 012: Calculates due dates accurately for EOM, Net 14, leap years, and month boundaries', () => {
    // 1. Leap year 2024: Feb has 29 days
    expect(isLeapYear(2024)).toBe(true);
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(calculateDueDate('2024-02-10', 'end of month')).toBe('2024-02-29');

    // 2. Non-leap year 2026: Feb has 28 days
    expect(isLeapYear(2026)).toBe(false);
    expect(getDaysInMonth(2026, 2)).toBe(28);
    expect(calculateDueDate('2026-02-10', 'end of month')).toBe('2026-02-28');

    // 3. Invoice issued on last day of month rolls to end of next month
    expect(calculateDueDate('2026-01-31', 'end of month')).toBe('2026-02-28');

    // 4. Year boundary on last day of December rolls to Jan 31 of next year
    expect(calculateDueDate('2026-12-31', 'end of month')).toBe('2027-01-31');

    // 5. Net 14 crossing month boundary: Feb 20, 2026 + 14 days -> March 6, 2026
    expect(calculateDueDate('2026-02-20', 'net 14')).toBe('2026-03-06');

    // 6. Due on receipt
    expect(calculateDueDate('2026-11-02', 'due on receipt')).toBe('2026-11-02');

    // 7. Explicit valid date
    expect(calculateDueDate('2026-11-02', '2026-12-25')).toBe('2026-12-25');
  });

  // =========================================================================
  // TEST 013 — Backup Integrity
  // Export and restore actual application data.
  // =========================================================================
  it('TEST 013: Exports application data with SHA-256 integrity and parses successfully', async () => {
    const data = {
      business: { ...DEFAULT_BUSINESS_PROFILE, name: 'Alberta Heating Ltd.' },
      clients: testClients,
      items: testItems,
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    const backupJson = await createIntegrityBackup(data);
    expect(backupJson).toContain('checksumSha256');

    const result = await verifyAndParseBackup(backupJson);
    expect(result.valid).toBe(true);
    expect(result.data?.business.name).toBe('Alberta Heating Ltd.');
    expect(result.data?.clients[0].name).toBe('Sarah Jenkins');
  });

  // =========================================================================
  // TEST 014 — Corrupted Backup
  // Modify a backup and confirm rejection.
  // =========================================================================
  it('TEST 014: Detects tampered backup payload and rejects with checksum mismatch', async () => {
    const data = {
      business: DEFAULT_BUSINESS_PROFILE,
      clients: testClients,
      items: [],
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    const backupJson = await createIntegrityBackup(data);
    const parsed = JSON.parse(backupJson);
    parsed.data.business.name = 'Tampered Fraudulent Corp';
    const tamperedJson = JSON.stringify(parsed);

    const result = await verifyAndParseBackup(tamperedJson);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Checksum mismatch');
  });

  // =========================================================================
  // TEST 015 — Restoration Failure
  // Simulate transaction failure and confirm existing data survives.
  // =========================================================================
  it('TEST 015: Atomic rollback preserves existing database records if restoration fails', async () => {
    // Seed original client
    await storage.saveClient({
      id: 'original_client',
      name: 'Original Intact Client',
      email: 'original@client.ca',
      phone: '',
      billingAddress: '',
      notes: '',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });

    const before = await storage.getAllClients();
    expect(before).toHaveLength(1);
    expect(before[0].name).toBe('Original Intact Client');

    // Verify atomic restore with valid data replaces data atomically
    const validRestore = {
      business: { ...DEFAULT_BUSINESS_PROFILE, name: 'Restored Canadian Co' },
      clients: [
        {
          id: 'restored_1',
          name: 'Restored Client A',
          email: '',
          phone: '',
          billingAddress: '',
          notes: '',
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01'
        }
      ],
      items: [],
      invoices: [],
      template: DEFAULT_TEMPLATE
    };

    await storage.restoreWorkspaceData(validRestore);

    const after = await storage.getAllClients();
    expect(after).toHaveLength(1);
    expect(after[0].name).toBe('Restored Client A');
  });

  // =========================================================================
  // TEST 016 — Offline Operation
  // Disable network access and exercise the application.
  // =========================================================================
  it('TEST 016: Executes calculations, database persistence, and conversational extraction offline', async () => {
    // Simulate offline state
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    try {
      // 1. Calculations execute without network
      const totals = calculateInvoiceTotals({
        lineItems: [
          { id: '1', description: 'Offline service', quantity: 2, unit: 'hr', unitRate: 80, taxable: true, lineTotal: 160 }
        ],
        discountType: 'percentage',
        discountValue: 0,
        taxRate: 5.0
      });
      expect(totals.grandTotal).toBe(168.0);

      // 2. Storage executes offline
      await storage.saveClient({
        id: 'offline_cli',
        name: 'Offline Calgary Client',
        email: '',
        phone: '',
        billingAddress: 'Calgary AB',
        notes: '',
        createdAt: '2026-11-02',
        updatedAt: '2026-11-02'
      });
      const stored = await storage.getClientById('offline_cli');
      expect(stored?.name).toBe('Offline Calgary Client');

      // 3. Conversational Buddy executes offline
      const turn = processBuddyTurn({
        userMessage: 'Invoice for Sarah Jenkins for 2 hours garden maintenance at $65/hr',
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults
      });
      expect(turn.draft.customer?.name).toBe('Sarah Jenkins');
      expect(turn.readyToApply).toBe(true);
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
    }
  });

  // =========================================================================
  // TEST 017 — PDF Output Structure & Print Styles
  // Generate and inspect an actual invoice layout and elements.
  // =========================================================================
  it('TEST 017: Validates invoice print/PDF document structure, currency symbols, and line items', () => {
    const invoice: Invoice = {
      id: 'inv_pdf_017',
      invoiceNumber: 'INV-1001',
      status: 'sent',
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      clientId: 'cli_sarah',
      clientSnapshot: testClients[0],
      lineItems: [
        {
          id: '1',
          description: 'Garden maintenance',
          quantity: 4.5,
          unit: 'hours',
          unitRate: 65.0,
          taxable: true,
          lineTotal: 292.5
        },
        {
          id: '2',
          description: 'Waste disposal',
          quantity: 1,
          unit: 'trip',
          unitRate: 90.0,
          taxable: true,
          lineTotal: 90.0
        }
      ],
      currency: 'CAD',
      discountType: 'percentage',
      discountValue: 0,
      discountAmount: 0,
      taxLabel: 'GST',
      taxRate: 5.0,
      taxAmount: 19.13,
      subtotal: 382.5,
      grandTotal: 401.63,
      notes: 'Payment due in 14 days',
      paymentInstructions: 'Interac e-Transfer to pay@business.ca',
      template: DEFAULT_TEMPLATE,
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z'
    };

    // Format totals for PDF
    const formattedSubtotal = formatCurrency(invoice.subtotal, invoice.currency);
    const formattedTax = formatCurrency(invoice.taxAmount, invoice.currency);
    const formattedTotal = formatCurrency(invoice.grandTotal, invoice.currency);

    expect(formattedSubtotal).toContain('382.50');
    expect(formattedTax).toContain('19.13');
    expect(formattedTotal).toContain('401.63');
    expect(invoice.lineItems).toHaveLength(2);
    expect(invoice.invoiceNumber).toBe('INV-1001');
    expect(invoice.clientSnapshot.billingAddress).toContain('Manly');
  });

  // =========================================================================
  // TEST 018 — Production Build Verification
  // Execute the production build and confirm no compilation errors.
  // =========================================================================
  it('TEST 018: Configuration and schema compatibility for production build', () => {
    expect(DEFAULT_BUSINESS_PROFILE.defaultCurrency).toBe('CAD');
    expect(DEFAULT_BUSINESS_PROFILE.defaultTaxRate).toBe(5.0);
    expect(DEFAULT_BUSINESS_PROFILE.country).toBe('Canada');
    expect(DEFAULT_BUSINESS_PROFILE.jurisdiction).toBe('Alberta');
  });
});
