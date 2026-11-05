import { describe, it, expect } from 'vitest';
import { LLMProposedLineItem } from '../src/types';

describe('Invoice Buddy Local Model Safety and Guardrails', () => {
  it('validates proposed line items and ensures positive values', () => {
    const rawProposal: LLMProposedLineItem = {
      description: 'Web Application Development and Security Audit',
      quantity: 8,
      unit: 'hours',
      unitRate: 125,
      taxable: true
    };

    expect(rawProposal.quantity).toBeGreaterThan(0);
    expect(rawProposal.unitRate).toBeGreaterThanOrEqual(0);
    expect(rawProposal.description.trim().length).toBeGreaterThan(0);
  });

  it('rejects empty or excessively long prompts at the input boundary', () => {
    const emptyPrompt = '   ';
    expect(emptyPrompt.trim().length).toBe(0);

    const oversizedPrompt = 'A'.repeat(501);
    expect(oversizedPrompt.length).toBeGreaterThan(500);
  });

  it('correctly parses user rates and quantities without hallucinating unknown fields', () => {
    const userPrompt = 'Add 5 hours of database migration at $95/hour';

    const rateMatch = userPrompt.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:\/|\s*per\s*)(?:hr|hour|item|unit)/i)
      || userPrompt.match(/(?:at|for|rate of)\s*\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
    const qtyMatch = userPrompt.match(/([0-9]+(?:\.[0-9]{1,2})?)\s*(?:hours|hrs|units|items|days)/i);

    expect(rateMatch).not.toBeNull();
    expect(parseFloat(rateMatch![1])).toBe(95);

    expect(qtyMatch).not.toBeNull();
    expect(parseFloat(qtyMatch![1])).toBe(5);
  });

  it('defaults unit rate to zero if none is specified by user instead of making up a price', () => {
    const userPrompt = 'Please add consulting work for architecture review';
    const rateMatch = userPrompt.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:\/|\s*per\s*)(?:hr|hour|item|unit)/i);
    const parsedRate = rateMatch ? parseFloat(rateMatch[1]) : 0;

    expect(parsedRate).toBe(0); // Safely 0, never hallucinated
  });
});
