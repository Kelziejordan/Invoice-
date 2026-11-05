import { InvoiceLineItem } from '../types';

export function roundToTwo(num: number): number {
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function calculateLineTotal(quantity: number, rate: number): number {
  const safeQty = Math.max(0, Number.isFinite(quantity) ? quantity : 0);
  const safeRate = Math.max(0, Number.isFinite(rate) ? rate : 0);
  return roundToTwo(safeQty * safeRate);
}

export interface InvoiceTotals {
  subtotal: number;
  discountAmount: number;
  taxableSubtotal: number;
  taxAmount: number;
  grandTotal: number;
}

export function calculateInvoiceTotals(params: {
  lineItems: InvoiceLineItem[];
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  taxRate: number;
}): InvoiceTotals {
  const { lineItems, discountType, discountValue, taxRate } = params;

  // 1. Calculate raw subtotal and total taxable amount
  let subtotal = 0;
  let rawTaxableAmount = 0;

  for (const item of lineItems) {
    const lineTotal = calculateLineTotal(item.quantity, item.unitRate);
    subtotal += lineTotal;
    if (item.taxable) {
      rawTaxableAmount += lineTotal;
    }
  }

  subtotal = roundToTwo(subtotal);
  rawTaxableAmount = roundToTwo(rawTaxableAmount);

  // 2. Calculate discount
  let discountAmount = 0;
  const safeDiscountVal = Math.max(0, Number.isFinite(discountValue) ? discountValue : 0);

  if (discountType === 'percentage') {
    const pct = Math.min(100, safeDiscountVal);
    discountAmount = roundToTwo((subtotal * pct) / 100);
  } else {
    discountAmount = roundToTwo(Math.min(subtotal, safeDiscountVal));
  }

  // 3. Apply discount proportionally to taxable subtotal
  let taxableSubtotal = rawTaxableAmount;
  if (subtotal > 0 && discountAmount > 0) {
    const discountRatio = discountAmount / subtotal;
    taxableSubtotal = roundToTwo(rawTaxableAmount * (1 - discountRatio));
  }

  // 4. Calculate Tax
  const safeTaxRate = Math.max(0, Number.isFinite(taxRate) ? taxRate : 0);
  const taxAmount = roundToTwo((taxableSubtotal * safeTaxRate) / 100);

  // 5. Grand total
  const grandTotal = roundToTwo(Math.max(0, subtotal - discountAmount + taxAmount));

  return {
    subtotal,
    discountAmount,
    taxableSubtotal,
    taxAmount,
    grandTotal
  };
}

export function formatCurrency(amount: number, currencyCode: string = 'CAD'): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const code = (currencyCode || 'CAD').trim().toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(safeAmount);
  } catch {
    return `${code} ${safeAmount.toFixed(2)}`;
  }
}
