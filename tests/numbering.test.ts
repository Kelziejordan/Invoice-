import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber, parseNextSequence } from '../src/utils/numbering';

describe('Invoice Numbering & Prefix Utilities', () => {
  it('formats invoice numbers with default 4-digit zero padding', () => {
    expect(formatInvoiceNumber('INV-', 1)).toBe('INV-0001');
    expect(formatInvoiceNumber('INV-', 42)).toBe('INV-0042');
    expect(formatInvoiceNumber('ACME-', 1005)).toBe('ACME-1005');
    expect(formatInvoiceNumber('', 7)).toBe('INV-0007');
  });

  it('detects highest existing sequence and increments accurately', () => {
    const existing = ['INV-0001', 'INV-0002', 'INV-0099', 'INV-0005'];
    const next = parseNextSequence('INV-', existing);
    expect(next).toBe(100);
  });

  it('ignores malformed numbers or mismatched prefixes', () => {
    const existing = ['OTHER-9999', 'MALFORMED', 'INV-abc'];
    const next = parseNextSequence('INV-', existing);
    expect(next).toBe(1);
  });

  it('handles custom prefixes with special regex characters safely', () => {
    const existing = ['BILL[2025]-001', 'BILL[2025]-002'];
    const next = parseNextSequence('BILL[2025]-', existing);
    expect(next).toBe(3);
  });
});
