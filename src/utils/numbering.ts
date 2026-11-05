export function formatInvoiceNumber(prefix: string, sequenceNumber: number, padLength: number = 4): string {
  const cleanPrefix = (prefix || 'INV-').trim();
  const safeSeq = Math.max(1, Math.floor(Number.isFinite(sequenceNumber) ? sequenceNumber : 1));
  const padded = safeSeq.toString().padStart(padLength, '0');
  return `${cleanPrefix}${padded}`;
}

export function parseNextSequence(prefix: string, existingInvoiceNumbers: string[]): number {
  let highest = 0;
  const escaped = (prefix || 'INV-').trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const regex = new RegExp(`^${escaped}(\\d+)$`, 'i');

  for (const numStr of existingInvoiceNumbers) {
    if (!numStr || typeof numStr !== 'string') continue;
    const match = numStr.trim().match(regex);
    if (match && match[1]) {
      const val = parseInt(match[1], 10);
      if (Number.isFinite(val) && val > highest) {
        highest = val;
      }
    }
  }

  return highest + 1;
}
