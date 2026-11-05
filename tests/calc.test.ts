import { describe, it, expect } from 'vitest';
import { calculateLineTotal, calculateInvoiceTotals, formatCurrency, roundToTwo } from '../src/utils/calc';
import { InvoiceLineItem } from '../src/types';

describe('Financial Calculation Engine', () => {
  it('correctly calculates line item totals with exact round-to-two behavior', () => {
    expect(calculateLineTotal(3, 33.33)).toBe(99.99);
    expect(calculateLineTotal(0, 50)).toBe(0);
    expect(calculateLineTotal(-5, 50)).toBe(0); // Negative safeguard
    expect(calculateLineTotal(2.5, 100)).toBe(250.0);
    expect(calculateLineTotal(1, 0.004)).toBe(0);
    expect(calculateLineTotal(1, 0.005)).toBe(0.01);
  });

  it('safely rounds floating point numbers to two decimal places', () => {
    expect(roundToTwo(10.005)).toBe(10.01);
    expect(roundToTwo(10.004)).toBe(10.0);
    expect(roundToTwo(NaN)).toBe(0);
    expect(roundToTwo(Infinity)).toBe(0);
  });

  it('calculates subtotal, percentage discount, and proportional tax correctly', () => {
    const items: InvoiceLineItem[] = [
      { id: '1', description: 'Design Services', quantity: 10, unit: 'hrs', unitRate: 100, taxable: true, lineTotal: 1000 },
      { id: '2', description: 'Web Hosting License', quantity: 1, unit: 'yr', unitRate: 200, taxable: false, lineTotal: 200 }
    ];

    // Subtotal = 1200
    // Taxable portion = 1000
    // 10% discount = 120 total discount
    // Proportional taxable discount = 1000 * 0.9 = 900
    // 10% Tax on 900 = 90
    // Grand Total = 1200 - 120 + 90 = 1170
    const result = calculateInvoiceTotals({
      lineItems: items,
      discountType: 'percentage',
      discountValue: 10,
      taxRate: 10
    });

    expect(result.subtotal).toBe(1200);
    expect(result.discountAmount).toBe(120);
    expect(result.taxableSubtotal).toBe(900);
    expect(result.taxAmount).toBe(90);
    expect(result.grandTotal).toBe(1170);
  });

  it('calculates fixed discount without reducing grand total below zero', () => {
    const items: InvoiceLineItem[] = [
      { id: '1', description: 'Consulting', quantity: 1, unit: 'hr', unitRate: 50, taxable: true, lineTotal: 50 }
    ];

    const result = calculateInvoiceTotals({
      lineItems: items,
      discountType: 'fixed',
      discountValue: 100, // exceeds subtotal
      taxRate: 10
    });

    expect(result.subtotal).toBe(50);
    expect(result.discountAmount).toBe(50); // Capped at subtotal
    expect(result.taxAmount).toBe(0);
    expect(result.grandTotal).toBe(0);
  });

  it('formats currency with international fallback', () => {
    const usd = formatCurrency(1234.5, 'USD');
    expect(usd).toContain('1,234.50');

    const eur = formatCurrency(50, 'EUR');
    expect(eur).toContain('50.00');
  });
});
