import { describe, it, expect } from 'vitest';
import { processBuddyTurn } from '../src/services/buddyEngine';
import { Client, Item } from '../src/types';

describe('Conversational Invoice Buddy Engine Integration', () => {
  const existingClients: Client[] = [
    {
      id: 'cli_sarah',
      name: 'Sarah Jenkins',
      email: 'sarah@jenkins.com.au',
      phone: '0412 345 678',
      billingAddress: '14 Coastal Way, Manly NSW 2095',
      notes: '',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    }
  ];

  const existingItems: Item[] = [
    {
      id: 'itm_lawn',
      name: 'Lawn Mowing',
      description: 'Standard residential lawn mowing',
      unit: 'service',
      defaultRate: 75.0,
      taxable: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    }
  ];

  const businessDefaults = {
    currency: 'AUD',
    taxLabel: 'GST',
    taxRate: 10.0,
    paymentInstructions: 'Bank: 062-000 Acc: 12345678'
  };

  it('completes an entire multi-turn invoice conversational workflow', () => {
    // Turn 1: User specifies client and work
    const turn1 = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr',
      existingClients,
      existingItems,
      businessDefaults
    });

    expect(turn1.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turn1.draft.customer?.isExisting).toBe(true);
    expect(turn1.draft.customer?.matchedClientId).toBe('cli_sarah');
    expect(turn1.draft.lineItems).toHaveLength(1);
    expect(turn1.draft.lineItems[0].quantity).toBe(4.5);
    expect(turn1.draft.lineItems[0].unitRate).toBe(65);
    expect(turn1.draft.subtotal).toBe(292.5);
    expect(turn1.draft.taxAmount).toBe(29.25);
    expect(turn1.draft.grandTotal).toBe(321.75);

    // Turn 2: User adds additional service and specifies payment terms
    const turn2 = processBuddyTurn({
      userMessage: 'Also add 1 waste disposal at $90, due in 14 days',
      previousDraft: turn1.draft,
      existingClients,
      existingItems,
      businessDefaults
    });

    expect(turn2.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turn2.draft.lineItems).toHaveLength(2);
    expect(turn2.draft.lineItems[1].quantity).toBe(1);
    expect(turn2.draft.lineItems[1].unitRate).toBe(90);
    // Subtotal: 292.5 + 90 = 382.50
    expect(turn2.draft.subtotal).toBe(382.5);
    // 10% GST on 382.50 = 38.25
    expect(turn2.draft.taxAmount).toBe(38.25);
    // Grand total: 420.75
    expect(turn2.draft.grandTotal).toBe(420.75);
    expect(turn2.readyToApply).toBe(true);
    expect(turn2.draft.missingFields).toHaveLength(0);
  });

  it('detects missing customer and asks clarifying question', () => {
    const turn = processBuddyTurn({
      userMessage: 'Did 3 hours of electrical fault diagnosis at $95/hr',
      existingClients,
      existingItems,
      businessDefaults
    });

    expect(turn.draft.lineItems).toHaveLength(1);
    expect(turn.draft.missingFields).toContain('Customer Name');
    expect(turn.readyToApply).toBe(false);
    expect(turn.assistantResponse.toLowerCase()).toContain('customer');
  });

  it('detects missing rate, marks rateRequiresConfirmation, and prompts user', () => {
    const turn = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins for 2 hours emergency pipe repair',
      existingClients,
      existingItems,
      businessDefaults
    });

    expect(turn.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turn.draft.lineItems).toHaveLength(1);
    expect(turn.draft.lineItems[0].unitRate).toBe(0);
    expect(turn.draft.lineItems[0].rateRequiresConfirmation).toBe(true);
    expect(turn.draft.missingFields.some((f) => f.includes('Rate'))).toBe(true);
    expect(turn.readyToApply).toBe(false);
    expect(turn.assistantResponse.toLowerCase()).toContain('rate');
  });

  it('matches service against existing catalog item and uses its default rate', () => {
    const turn = processBuddyTurn({
      userMessage: 'Invoice for Sarah Jenkins: performed Lawn Mowing today',
      existingClients,
      existingItems,
      businessDefaults
    });

    expect(turn.draft.customer?.name).toBe('Sarah Jenkins');
    expect(turn.draft.lineItems).toHaveLength(1);
    expect(turn.draft.lineItems[0].unitRate).toBe(75.0); // loaded from catalog
    expect(turn.draft.lineItems[0].itemId).toBe('itm_lawn');
    expect(turn.readyToApply).toBe(true);
  });
});
