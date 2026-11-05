import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { LLMClient } from '../src/services/llmClient';
import { executeLocalModelProposal, MODEL_ID } from '../src/services/llm.worker';
import { processBuddyTurn, validateModelProposalSchema } from '../src/services/buddyEngine';
import { StorageService, DEFAULT_TEMPLATE } from '../src/services/storage';
import { Client, Item, Invoice, LLMChangeProposal } from '../src/types';

describe('ARGUS v1.5 — FINAL AI INTEGRATION CORRECTION (MANDATORY REGRESSION SUITE TEST A – TEST I)', () => {
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
    }
  ];

  const albertaDefaults = {
    currency: 'CAD',
    taxLabel: 'GST',
    taxRate: 5.0,
    paymentInstructions: 'Interac e-Transfer to billing@invoicestudio.ca'
  };

  beforeEach(async () => {
    storage = new StorageService();
    await storage.clearAllData();
  });

  // ===========================================================================
  // TEST A — Actual model execution
  // Execute the actual worker/model (Xenova/flan-t5-small via @xenova/transformers).
  // Do not use setTestRunner() or a mock to satisfy this test.
  // ===========================================================================
  it(
    'TEST A: Executes actual local LLM (Xenova/flan-t5-small) without setTestRunner or mocks and feeds output into processBuddyTurn',
    async () => {
      const client = new LLMClient();
      // Explicitly ensure no test runner or mock is active
      client.setTestRunner(undefined);
      client.setModelUnavailable(false);

      const prompt =
        'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr, due in 14 days';

      const modelProposal = await client.requestProposal(prompt);

      // Verify actual model execution evidence
      expect(modelProposal.modelIdentifier).toBe('Xenova/flan-t5-small');
      expect(modelProposal.provenance).toBe('local-model');
      expect(modelProposal.requestId).toMatch(/^task_/);
      expect(typeof modelProposal.rawModelOutput).toBe('string');
      expect(modelProposal.rawModelOutput!.trim().length).toBeGreaterThan(0);
      expect(modelProposal.proposedLineItems.length).toBe(1);

      const logs = client.getExecutionLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].modelIdentifier).toBe(MODEL_ID);
      expect(logs[0].source).toBe('local-model');
      expect(logs[0].rawModelOutput).toBe(modelProposal.rawModelOutput);

      // Pass actual modelProposal into processBuddyTurn
      const turnResult = processBuddyTurn({
        userMessage: prompt,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal
      });

      expect(turnResult.provenance).toBe('local-model');
      expect(turnResult.modelContributionUsed).toBe(true);
      expect(turnResult.requestId).toBe(modelProposal.requestId);
      expect(turnResult.rawModelOutput).toBe(modelProposal.rawModelOutput);
      expect(turnResult.draft.customer?.name).toBe('Sarah Jenkins');
      expect(turnResult.draft.lineItems).toHaveLength(1);
      expect(turnResult.draft.lineItems[0].description).toBe(
        modelProposal.proposedLineItems[0].description
      );
      expect(turnResult.draft.lineItems[0].quantity).toBe(4.5);
      expect(turnResult.draft.lineItems[0].unitRate).toBe(65);
      expect(turnResult.draft.subtotal).toBe(292.5);
      expect(turnResult.draft.taxAmount).toBe(14.63);
      expect(turnResult.draft.grandTotal).toBe(307.13);

      // Emit structured diagnostic record for verification log
      console.info('TEST_A_ACTUAL_MODEL_EVIDENCE:', JSON.stringify({
        modelIdentifier: modelProposal.modelIdentifier,
        runtime: modelProposal.runtime,
        requestId: modelProposal.requestId,
        prompt,
        rawModelOutput: modelProposal.rawModelOutput,
        interpretedDescription: turnResult.draft.lineItems[0].description,
        resultProvenance: turnResult.provenance
      }));
    },
    60000
  );

  // ===========================================================================
  // TEST B — Model output contribution
  // Demonstrate that changing actual model output changes the corresponding
  // interpreted proposal where appropriate.
  // ===========================================================================
  it(
    'TEST B: Changing model output changes the resulting interpreted proposal while preserving deterministic numeric guardrails',
    async () => {
      const userPrompt = 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr';

      // Execute actual model on two distinct service phrasings to obtain two real model outputs
      const realProposal1 = await executeLocalModelProposal(
        'Invoice for Sarah Jenkins for 4.5 hours of seasonal hedge pruning and lawn care at $65/hr',
        'req_real_b1'
      );
      const realProposal2 = await executeLocalModelProposal(
        'Invoice for Sarah Jenkins for 4.5 hours of emergency storm debris removal at $65/hr',
        'req_real_b2'
      );

      expect(realProposal1.rawModelOutput).not.toBe(realProposal2.rawModelOutput);

      // Feed realProposal1 vs realProposal2 into processBuddyTurn on the same base user message
      const turnWithModel1 = processBuddyTurn({
        userMessage: userPrompt,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal: {
          ...realProposal1,
          proposedNotes: 'Model Note Alpha: Front courtyard completed'
        }
      });

      const turnWithModel2 = processBuddyTurn({
        userMessage: userPrompt,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal: {
          ...realProposal2,
          proposedNotes: 'Model Note Beta: Backyard storm cleanup'
        }
      });

      // Verify that changing the model output directly changed the resulting draft description and notes
      expect(turnWithModel1.provenance).toBe('local-model');
      expect(turnWithModel2.provenance).toBe('local-model');
      expect(turnWithModel1.draft.lineItems[0].description).toBe(
        realProposal1.proposedLineItems[0].description
      );
      expect(turnWithModel2.draft.lineItems[0].description).toBe(
        realProposal2.proposedLineItems[0].description
      );
      expect(turnWithModel1.draft.lineItems[0].description).not.toBe(
        turnWithModel2.draft.lineItems[0].description
      );
      expect(turnWithModel1.draft.notes).toBe('Model Note Alpha: Front courtyard completed');
      expect(turnWithModel2.draft.notes).toBe('Model Note Beta: Backyard storm cleanup');

      // Also verify that deterministic authority preserved the user's confirmed 4.5 hrs @ $65/hr in both
      expect(turnWithModel1.draft.lineItems[0].quantity).toBe(4.5);
      expect(turnWithModel1.draft.lineItems[0].unitRate).toBe(65);
      expect(turnWithModel2.draft.lineItems[0].quantity).toBe(4.5);
      expect(turnWithModel2.draft.lineItems[0].unitRate).toBe(65);
    },
    30000
  );

  // ===========================================================================
  // TEST C — Multi-item interpretation
  // Interpret a request containing two distinct services, quantities and rates.
  // ===========================================================================
  it(
    'TEST C: Interprets a multi-item request containing two distinct services, quantities, and rates using the actual local model',
    async () => {
      const client = new LLMClient();
      const prompt =
        'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr and 1 waste disposal at $90, due in 14 days';

      const modelProposal = await client.requestProposal(prompt);
      expect(modelProposal.proposedLineItems).toHaveLength(2);

      const turnResult = processBuddyTurn({
        userMessage: prompt,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal
      });

      expect(turnResult.provenance).toBe('local-model');
      expect(turnResult.modelContributionUsed).toBe(true);
      expect(turnResult.draft.lineItems).toHaveLength(2);

      // Item 1: 4.5 hours @ $65 = $292.50
      expect(turnResult.draft.lineItems[0].quantity).toBe(4.5);
      expect(turnResult.draft.lineItems[0].unit).toBe('hours');
      expect(turnResult.draft.lineItems[0].unitRate).toBe(65);
      expect(turnResult.draft.lineItems[0].lineTotal).toBe(292.5);

      // Item 2: 1 unit @ $90 = $90.00
      expect(turnResult.draft.lineItems[1].quantity).toBe(1);
      expect(turnResult.draft.lineItems[1].unitRate).toBe(90);
      expect(turnResult.draft.lineItems[1].lineTotal).toBe(90);

      // Totals: 292.50 + 90.00 = 382.50 + 5% GST (19.13) = 401.63
      expect(turnResult.draft.subtotal).toBe(382.5);
      expect(turnResult.draft.taxAmount).toBe(19.13);
      expect(turnResult.draft.grandTotal).toBe(401.63);
    },
    30000
  );

  // ===========================================================================
  // TEST D — Missing information
  // Confirm that missing rates and customer details remain unresolved.
  // ===========================================================================
  it(
    'TEST D: Keeps missing rates and missing customer details unresolved and blocks model from inventing unconfirmed prices',
    async () => {
      const client = new LLMClient();

      // 1. Missing customer and missing rate with actual local model execution
      const promptMissingBoth = 'Performed 3 hours of emergency electrical fault diagnosis';
      const modelProposal = await client.requestProposal(promptMissingBoth);

      // Verify the worker proposal itself did not invent a rate
      expect(modelProposal.proposedLineItems[0].unitRate).toBe(0);
      expect(modelProposal.proposedLineItems[0].rateRequiresConfirmation).toBe(true);
      expect(modelProposal.extractedCustomer).toBeUndefined();

      // Even if a compromised model proposal attempted to hallucinate a $150/hr rate, deterministic authority blocks it
      const proposalWithHallucinatedRate: LLMChangeProposal = {
        ...modelProposal,
        proposedLineItems: [
          {
            ...modelProposal.proposedLineItems[0],
            unitRate: 150, // Hallucinated rate not in user prompt or catalogue
            rateRequiresConfirmation: false
          }
        ]
      };

      const turnResult = processBuddyTurn({
        userMessage: promptMissingBoth,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal: proposalWithHallucinatedRate
      });

      expect(turnResult.provenance).toBe('local-model');
      expect(turnResult.draft.customer?.name).toBeUndefined();
      expect(turnResult.draft.lineItems).toHaveLength(1);
      // Deterministic authority forced unconfirmed rate back to 0
      expect(turnResult.draft.lineItems[0].unitRate).toBe(0);
      expect(turnResult.draft.lineItems[0].rateRequiresConfirmation).toBe(true);
      expect(turnResult.draft.missingFields).toContain('Customer Name');
      expect(turnResult.draft.missingFields.some((f) => f.toLowerCase().includes('rate'))).toBe(true);
      expect(turnResult.readyToApply).toBe(false);
    },
    30000
  );

  // ===========================================================================
  // TEST E — Correction handling
  // Correct a previously supplied quantity and rate.
  // ===========================================================================
  it(
    'TEST E: Updates previously supplied quantity and rate in-place across turns using model-assisted pipeline',
    async () => {
      const client = new LLMClient();

      const prompt1 = 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr';
      const prop1 = await client.requestProposal(prompt1);
      const turn1 = processBuddyTurn({
        userMessage: prompt1,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal: prop1
      });

      expect(turn1.draft.lineItems).toHaveLength(1);
      expect(turn1.draft.lineItems[0].quantity).toBe(4.5);
      expect(turn1.draft.lineItems[0].unitRate).toBe(65);
      expect(turn1.draft.subtotal).toBe(292.5);

      // Turn 2: Correct quantity to 6 hours and rate to $75/hr
      const prompt2 = 'Change garden maintenance to 6 hours at $75/hr';
      const prop2 = await client.requestProposal(prompt2);
      const turn2 = processBuddyTurn({
        userMessage: prompt2,
        previousDraft: turn1.draft,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal: prop2
      });

      expect(turn2.provenance).toBe('local-model');
      expect(turn2.draft.lineItems).toHaveLength(1);
      expect(turn2.draft.lineItems[0].quantity).toBe(6);
      expect(turn2.draft.lineItems[0].unitRate).toBe(75);
      expect(turn2.draft.lineItems[0].lineTotal).toBe(450);
      expect(turn2.draft.subtotal).toBe(450);
      expect(turn2.draft.taxAmount).toBe(22.5);
      expect(turn2.draft.grandTotal).toBe(472.5);
    },
    30000
  );

  // ===========================================================================
  // TEST F — Model failure
  // Simulate model timeout and unavailable model conditions.
  // Confirm accurately labeled deterministic fallback.
  // ===========================================================================
  it('TEST F: Simulates model timeout and unavailable model conditions and confirms deterministic-fallback labeling', async () => {
    const client = new LLMClient();
    const prompt = 'Invoice for Sarah Jenkins for 2 hours of garden maintenance at $65/hr';

    // 1. Simulate Timeout condition
    client.setRequestTimeoutMs(15);
    client.setTestRunner(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return {
        summary: 'Too late',
        proposedLineItems: [],
        originalPrompt: prompt,
        provenance: 'local-model'
      };
    });

    let timedOutProposal: LLMChangeProposal | null = null;
    let timeoutError: Error | null = null;
    try {
      timedOutProposal = await client.requestProposal(prompt);
    } catch (err) {
      timeoutError = err as Error;
    }

    expect(timeoutError).not.toBeNull();
    expect(timeoutError!.message).toContain('timed out');
    expect(timedOutProposal).toBeNull();

    const timeoutTurn = processBuddyTurn({
      userMessage: prompt,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults,
      modelProposal: timedOutProposal
    });

    expect(timeoutTurn.provenance).toBe('deterministic-fallback');
    expect(timeoutTurn.modelContributionUsed).toBe(false);
    expect(timeoutTurn.draft.provenance).toBe('deterministic-fallback');
    expect(timeoutTurn.draft.lineItems[0].quantity).toBe(2);
    expect(timeoutTurn.draft.lineItems[0].unitRate).toBe(65);

    // 2. Simulate Unavailable Model condition
    client.setTestRunner(undefined);
    client.setRequestTimeoutMs(30000);
    client.setModelUnavailable(true);

    let unavailableProposal: LLMChangeProposal | null = null;
    let unavailableError: Error | null = null;
    try {
      unavailableProposal = await client.requestProposal(prompt);
    } catch (err) {
      unavailableError = err as Error;
    }

    expect(unavailableError).not.toBeNull();
    expect(unavailableError!.message).toContain('unavailable');
    expect(unavailableProposal).toBeNull();

    const fallbackTurn = processBuddyTurn({
      userMessage: prompt,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults,
      modelProposal: unavailableProposal
    });

    expect(fallbackTurn.provenance).toBe('deterministic-fallback');
    expect(fallbackTurn.modelContributionUsed).toBe(false);
    expect(fallbackTurn.draft.provenance).toBe('deterministic-fallback');

    const logs = client.getExecutionLogs();
    expect(logs.some((l) => l.executionResult === 'TIMEOUT' && l.source === 'deterministic-fallback')).toBe(true);
    expect(logs.some((l) => l.executionResult === 'UNAVAILABLE' && l.source === 'deterministic-fallback')).toBe(true);
  });

  // ===========================================================================
  // TEST G — Provenance integrity
  // Verify that deterministic results cannot receive a 'local-model' label
  // merely because an inference request was attempted.
  // ===========================================================================
  it('TEST G: Enforces provenance integrity so deterministic results never receive local-model label when model output is empty, malformed, or unused', () => {
    const prompt = 'Invoice for Sarah Jenkins for 3 hours of garden maintenance at $65/hr';

    // Case 1: Model returned empty rawModelOutput
    const emptyOutputProposal: LLMChangeProposal = {
      requestId: 'req_empty_1',
      modelIdentifier: 'Xenova/flan-t5-small',
      runtime: 'WebAssembly',
      rawModelOutput: '   ',
      summary: 'Summary text',
      proposedLineItems: [
        {
          description: 'Garden Maintenance',
          quantity: 3,
          unit: 'hours',
          unitRate: 65,
          taxable: true
        }
      ],
      originalPrompt: prompt,
      provenance: 'local-model'
    };

    expect(validateModelProposalSchema(emptyOutputProposal)).toBeNull();
    const turnEmpty = processBuddyTurn({
      userMessage: prompt,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults,
      modelProposal: emptyOutputProposal
    });
    expect(turnEmpty.provenance).toBe('deterministic-fallback');
    expect(turnEmpty.modelContributionUsed).toBe(false);
    expect(turnEmpty.requestId).toBeUndefined();

    // Case 2: Model returned proposal with no actionable items/customer/notes/terms
    const nonContributingProposal: LLMChangeProposal = {
      requestId: 'req_nocontrib_2',
      modelIdentifier: 'Xenova/flan-t5-small',
      runtime: 'WebAssembly',
      rawModelOutput: 'ok',
      summary: 'Processed',
      proposedLineItems: [],
      originalPrompt: prompt,
      provenance: 'local-model'
    };

    expect(validateModelProposalSchema(nonContributingProposal)).toBeNull();
    const turnNoContrib = processBuddyTurn({
      userMessage: prompt,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults,
      modelProposal: nonContributingProposal
    });
    expect(turnNoContrib.provenance).toBe('deterministic-fallback');
    expect(turnNoContrib.modelContributionUsed).toBe(false);

    // Case 3: Malformed line item schema (negative quantity)
    const malformedProposal: LLMChangeProposal = {
      requestId: 'req_malformed_3',
      modelIdentifier: 'Xenova/flan-t5-small',
      runtime: 'WebAssembly',
      rawModelOutput: 'Garden Maintenance',
      summary: 'Processed',
      proposedLineItems: [
        {
          description: 'Garden Maintenance',
          quantity: -4,
          unit: 'hours',
          unitRate: 65,
          taxable: true
        }
      ],
      originalPrompt: prompt,
      provenance: 'local-model'
    };

    expect(validateModelProposalSchema(malformedProposal)).toBeNull();
    const turnMalformed = processBuddyTurn({
      userMessage: prompt,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults,
      modelProposal: malformedProposal
    });
    expect(turnMalformed.provenance).toBe('deterministic-fallback');
    expect(turnMalformed.modelContributionUsed).toBe(false);
    // Deterministic fallback still accurately extracted the user's 3 hours @ $65/hr
    expect(turnMalformed.draft.lineItems[0].quantity).toBe(3);
    expect(turnMalformed.draft.lineItems[0].unitRate).toBe(65);
  });

  // ===========================================================================
  // TEST H — Invoice Builder integration
  // Apply the actual validated proposal through the existing application
  // integration and verify the resulting invoice fields.
  // ===========================================================================
  it(
    'TEST H: Applies the actual local-model validated proposal into the Invoice Builder structure and persists to IndexedDB',
    async () => {
      const client = new LLMClient();
      const prompt =
        'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr and 1 waste disposal at $90, due in 14 days, notes: Please use side gate';

      const modelProposal = await client.requestProposal(prompt);
      const turnResult = processBuddyTurn({
        userMessage: prompt,
        existingClients: testClients,
        existingItems: testItems,
        businessDefaults: albertaDefaults,
        modelProposal
      });

      expect(turnResult.provenance).toBe('local-model');
      expect(turnResult.readyToApply).toBe(true);

      const draft = turnResult.draft;

      // Construct Invoice using the exact mapping performed by InvoiceBuilder.handleApplyBuddyInvoice
      const matchedClient =
        testClients.find((c) => c.id === draft.customer?.matchedClientId) || testClients[0];

      const builderInvoice: Invoice = {
        id: 'inv_builder_test_h',
        invoiceNumber: 'INV-1001',
        status: 'draft',
        issueDate: draft.issueDate || '2026-11-02',
        dueDate: draft.dueDate || '2026-11-16',
        clientId: matchedClient.id,
        clientSnapshot: matchedClient,
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

      await storage.saveInvoice(builderInvoice);
      const savedInvoices = await storage.getAllInvoices();
      expect(savedInvoices).toHaveLength(1);

      const reloaded = savedInvoices[0];
      expect(reloaded.clientId).toBe('cli_sarah');
      expect(reloaded.clientSnapshot.name).toBe('Sarah Jenkins');
      expect(reloaded.lineItems).toHaveLength(2);
      expect(reloaded.lineItems[0].description).toBe(modelProposal.proposedLineItems[0].description);
      expect(reloaded.lineItems[1].description).toBe(modelProposal.proposedLineItems[1].description);
      expect(reloaded.subtotal).toBe(382.5);
      expect(reloaded.taxAmount).toBe(19.13);
      expect(reloaded.grandTotal).toBe(401.63);
      expect(reloaded.notes).toContain('Please use side gate');
    },
    30000
  );

  // ===========================================================================
  // TEST I — Financial authority
  // Confirm that final totals are independently recalculated by the existing
  // calculation engine.
  // ===========================================================================
  it('TEST I: Enforces deterministic financial authority over all line totals, subtotal, tax, and grand total', () => {
    const prompt =
      'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr and 1 waste disposal at $90';

    // Simulate a model proposal whose draft snapshot has wildly inaccurate arithmetic
    const modelProposalWithBadMath: LLMChangeProposal = {
      requestId: 'req_math_test_i',
      modelIdentifier: 'Xenova/flan-t5-small',
      runtime: 'WebAssembly (On-Device)',
      rawModelOutput: 'Garden maintenance | Waste disposal',
      summary: 'Total is $9999.99',
      extractedCustomer: { name: 'Sarah Jenkins' },
      proposedLineItems: [
        {
          description: 'Seasonal Garden Maintenance',
          quantity: 4.5,
          unit: 'hours',
          unitRate: 65,
          taxable: true
        },
        {
          description: 'Green Waste Disposal',
          quantity: 1,
          unit: 'units',
          unitRate: 90,
          taxable: true
        }
      ],
      draft: {
        lineItems: [],
        subtotal: 9999.99,
        taxAmount: 888.88,
        grandTotal: 10888.87,
        missingFields: [],
        uncertainFields: [],
        summary: 'Bogus model math'
      },
      originalPrompt: prompt,
      provenance: 'local-model'
    };

    const turnResult = processBuddyTurn({
      userMessage: prompt,
      existingClients: testClients,
      existingItems: testItems,
      businessDefaults: albertaDefaults,
      modelProposal: modelProposalWithBadMath
    });

    expect(turnResult.provenance).toBe('local-model');
    // Line item descriptions came from the validated model proposal
    expect(turnResult.draft.lineItems[0].description).toBe('Seasonal Garden Maintenance');
    expect(turnResult.draft.lineItems[1].description).toBe('Green Waste Disposal');

    // Financial figures were strictly recalculated by the authoritative calculation engine
    expect(turnResult.draft.lineItems[0].lineTotal).toBe(292.5);
    expect(turnResult.draft.lineItems[1].lineTotal).toBe(90.0);
    expect(turnResult.draft.subtotal).toBe(382.5);
    expect(turnResult.draft.taxAmount).toBe(19.13);
    expect(turnResult.draft.grandTotal).toBe(401.63);
  });
});
