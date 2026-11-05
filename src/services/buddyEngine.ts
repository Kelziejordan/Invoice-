import {
  Client,
  Item,
  InvoiceLineItem,
  BuddyExtractedCustomer,
  BuddyInvoiceDraft,
  LLMChangeProposal,
  LLMProposedLineItem
} from '../types';
import { calculateInvoiceTotals } from '../utils/calc';

export interface ProcessBuddyTurnParams {
  userMessage: string;
  previousDraft?: BuddyInvoiceDraft | null;
  existingClients: Client[];
  existingItems: Item[];
  businessDefaults: {
    currency: string;
    taxLabel: string;
    taxRate: number;
    paymentInstructions: string;
  };
  modelProposal?: LLMChangeProposal | null;
}

export interface BuddyTurnResult {
  assistantResponse: string;
  draft: BuddyInvoiceDraft;
  readyToApply: boolean;
  provenance: 'local-model' | 'deterministic-fallback';
  modelContributionUsed: boolean;
  requestId?: string;
  modelIdentifier?: string;
  runtime?: string;
  rawModelOutput?: string;
}

/**
 * Validates that a local LLM proposal conforms to the required structured schema
 * and originated from an actual model execution with non-empty output.
 */
export function validateModelProposalSchema(proposal: unknown): LLMChangeProposal | null {
  if (!proposal || typeof proposal !== 'object') {
    return null;
  }

  const cand = proposal as Partial<LLMChangeProposal>;

  if (cand.provenance !== 'local-model') {
    return null;
  }

  if (typeof cand.rawModelOutput !== 'string' || cand.rawModelOutput.trim().length === 0) {
    return null;
  }

  if (typeof cand.requestId !== 'string' || cand.requestId.trim().length === 0) {
    return null;
  }

  if (typeof cand.summary !== 'string' || cand.summary.trim().length === 0) {
    return null;
  }

  if (!Array.isArray(cand.proposedLineItems)) {
    return null;
  }

  const validItems: LLMProposedLineItem[] = [];
  for (const item of cand.proposedLineItems) {
    if (!item || typeof item !== 'object') return null;
    if (typeof item.description !== 'string' || item.description.trim().length < 2) return null;
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity <= 0) return null;
    if (typeof item.unit !== 'string' || item.unit.trim().length === 0) return null;
    if (typeof item.unitRate !== 'number' || !Number.isFinite(item.unitRate) || item.unitRate < 0) return null;
    if (typeof item.taxable !== 'boolean') return null;

    validItems.push({
      description: item.description.trim(),
      quantity: item.quantity,
      unit: item.unit.trim(),
      unitRate: item.unitRate,
      taxable: item.taxable,
      rateRequiresConfirmation: Boolean(item.rateRequiresConfirmation)
    });
  }

  const hasCustomer =
    cand.extractedCustomer &&
    typeof cand.extractedCustomer === 'object' &&
    Boolean(
      cand.extractedCustomer.name?.trim() ||
        cand.extractedCustomer.email?.trim() ||
        cand.extractedCustomer.phone?.trim() ||
        cand.extractedCustomer.billingAddress?.trim()
    );
  const hasTermsOrDates = Boolean(
    cand.extractedTerms?.trim() || cand.extractedIssueDate?.trim() || cand.extractedDueDate?.trim()
  );
  const hasNotes = Boolean(cand.proposedNotes?.trim());

  if (validItems.length === 0 && !hasCustomer && !hasTermsOrDates && !hasNotes) {
    return null;
  }

  return {
    summary: cand.summary.trim(),
    proposedLineItems: validItems,
    extractedCustomer: cand.extractedCustomer,
    extractedTerms: cand.extractedTerms?.trim(),
    extractedIssueDate: cand.extractedIssueDate?.trim(),
    extractedDueDate: cand.extractedDueDate?.trim(),
    proposedNotes: cand.proposedNotes?.trim(),
    originalPrompt: typeof cand.originalPrompt === 'string' ? cand.originalPrompt : '',
    provenance: 'local-model',
    requestId: cand.requestId.trim(),
    modelIdentifier: cand.modelIdentifier || 'Xenova/flan-t5-small',
    runtime: cand.runtime || 'WebAssembly (On-Device)',
    rawModelOutput: cand.rawModelOutput.trim()
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function getDaysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Calculates payment due date with timezone-safe UTC math.
 * Supports: Due on receipt, 7/14/30/60 days, Net X, End of Month (EOM) with leap-year handling, and custom dates.
 */
export function calculateDueDate(issueDateStr: string, termsText: string): string {
  const parts = (issueDateStr || '').split('-').map(Number);
  let year = parts[0] || new Date().getUTCFullYear();
  let month = parts[1] || new Date().getUTCMonth() + 1;
  let day = parts[2] || new Date().getUTCDate();

  if (month < 1 || month > 12) month = 1;
  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) day = Math.min(day, maxDay);

  const cleanTerms = (termsText || '').trim();

  // 1. Explicit ISO date: YYYY-MM-DD
  const explicitDate = cleanTerms.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (explicitDate) {
    const ey = parseInt(explicitDate[1], 10);
    const em = parseInt(explicitDate[2], 10);
    const ed = parseInt(explicitDate[3], 10);
    if (em >= 1 && em <= 12 && ed >= 1 && ed <= getDaysInMonth(ey, em)) {
      return `${ey}-${String(em).padStart(2, '0')}-${String(ed).padStart(2, '0')}`;
    }
  }

  // 2. Due on receipt / immediate
  if (/on\s*receipt|immediately|same\s*day/i.test(cleanTerms)) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 3. End of Month (EOM)
  if (/end\s*of\s*(?:the\s*)?month|\beom\b/i.test(cleanTerms)) {
    let targetYear = year;
    let targetMonth = month;
    const daysInCurrentMonth = getDaysInMonth(year, month);
    if (day >= daysInCurrentMonth) {
      targetMonth += 1;
      if (targetMonth > 12) {
        targetMonth = 1;
        targetYear += 1;
      }
    }
    const lastDay = getDaysInMonth(targetYear, targetMonth);
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // 4. Days / Net X terms (e.g. 7 days, 14 days, 30 days, 60 days, net 30)
  const daysMatch = cleanTerms.match(/(\d+)\s*days?/i) || cleanTerms.match(/net\s*(\d+)/i);
  const daysToAdd = daysMatch ? parseInt(daysMatch[1], 10) : 14;

  const utcTimestamp = Date.UTC(year, month - 1, day) + daysToAdd * 24 * 60 * 60 * 1000;
  const resultDate = new Date(utcTimestamp);
  const ry = resultDate.getUTCFullYear();
  const rm = String(resultDate.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(resultDate.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

interface DeterministicClauseAnalysis {
  rawClause: string;
  item: InvoiceLineItem;
  hasExplicitQty: boolean;
  hasExplicitRate: boolean;
  matchedCatalogItem?: Item;
  isTaxExempt: boolean;
  isExplicitTaxable: boolean;
}

/**
 * High-precision conversational invoice interpreter & validator.
 * Pipeline:
 * User conversation -> Local LLM structured proposal -> Schema validation
 * -> Deterministic entity & business-rule validation -> Missing-info check
 * -> Authoritative calculation engine.
 */
export function processBuddyTurn({
  userMessage,
  previousDraft,
  existingClients,
  existingItems,
  businessDefaults,
  modelProposal
}: ProcessBuddyTurnParams): BuddyTurnResult {
  const text = userMessage.trim();
  const todayStr = new Date().toISOString().split('T')[0];

  // Validate model proposal schema if provided
  const validModelProposal = validateModelProposalSchema(modelProposal);
  let modelContributionUsed = false;

  // Initialize accumulated draft from previous turn or defaults
  const customer: BuddyExtractedCustomer = {
    ...(previousDraft?.customer || {})
  };

  let lineItems: InvoiceLineItem[] = previousDraft?.lineItems ? [...previousDraft.lineItems] : [];
  let issueDate = previousDraft?.issueDate || todayStr;
  let dueDate = previousDraft?.dueDate || calculateDueDate(todayStr, '14 days');
  let notes = previousDraft?.notes || '';
  const missingFields: string[] = [];
  const uncertainFields: string[] = [];

  // ==========================================
  // 1. Customer Identification & Extraction
  // ==========================================
  // Apply model-extracted customer fields first when present
  if (validModelProposal?.extractedCustomer) {
    const mc = validModelProposal.extractedCustomer;
    if (mc.name && mc.name.trim().length > 0 && !customer.name) {
      customer.name = mc.name.trim();
      customer.isExisting = false;
      modelContributionUsed = true;
    }
    if (mc.email && mc.email.trim().length > 0) {
      customer.email = mc.email.trim();
      modelContributionUsed = true;
    }
    if (mc.phone && mc.phone.trim().length > 0) {
      customer.phone = mc.phone.trim();
      modelContributionUsed = true;
    }
    if (mc.billingAddress && mc.billingAddress.trim().length > 0) {
      customer.billingAddress = mc.billingAddress.trim();
      modelContributionUsed = true;
    }
  }

  // Deterministic authority: check if user or model customer matches an existing client in directory
  for (const client of existingClients) {
    const escaped = client.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const clientRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (clientRegex.test(text) || (customer.name && clientRegex.test(customer.name))) {
      customer.name = client.name;
      customer.email = client.email;
      customer.phone = client.phone;
      customer.billingAddress = client.billingAddress;
      customer.matchedClientId = client.id;
      customer.isExisting = true;
      break;
    }
  }

  // If no customer name yet, run deterministic extraction patterns on user text
  if (!customer.name) {
    const customerPatterns = [
      /(?:invoice|bill)\s+(?:for|to)\s+([A-Z0-9][A-Za-z0-9\s.,'&\\-]{2,40}?)(?:,\s*address|,\s*email|\s+for|\s+with|\s+did|\s+done|\.|$)/i,
      /(?:customer|client|bill to|billed to)(?:\s+is)?[:\s]+([A-Za-z0-9\s.,'&\\-]{2,40}?)(?:,\s*address|,\s*email|\s+for|\s+add|,|\.|$)/i,
      /(?:for|to)\s+([A-Z][A-Za-z0-9\s.'&\\-]{2,30}?)(?:\s+(?:who|whose|at|with|\.|$))/i
    ];

    for (const pat of customerPatterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const potentialName = match[1].trim().replace(/\s+(?:and|who|with|did)$/i, '');
        if (!/^\d+\s*(?:hours|hrs|days|units|items)/i.test(potentialName)) {
          customer.name = potentialName;
          customer.isExisting = false;
          break;
        }
      }
    }
  }

  // Deterministic contact details validation
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    customer.email = emailMatch[1];
  }

  const phoneMatch = text.match(/(?:phone|tel|ph|mobile)?[:\s]*(\+?\d{1,4}?[-.\s]?\(?\d{1,4}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/i);
  if (phoneMatch && phoneMatch[1].replace(/\D/g, '').length >= 8) {
    const digits = phoneMatch[1].replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      customer.phone = phoneMatch[1].trim();
    }
  }

  const addressMatch = text.match(/(?:address|located at|billing address)[:\s]+([^.\n,]+(?:,\s*[^.\n,]+){1,3})/i);
  if (addressMatch) {
    customer.billingAddress = addressMatch[1].trim();
  }

  // ==========================================
  // 2. Dates & Payment Terms Extraction
  // ==========================================
  if (validModelProposal?.extractedIssueDate) {
    issueDate = validModelProposal.extractedIssueDate;
    modelContributionUsed = true;
  }

  const issueDateMatch = text.match(/(?:issue|issued|invoice)\s+date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (issueDateMatch) {
    issueDate = issueDateMatch[1];
  }

  if (validModelProposal?.extractedTerms) {
    dueDate = calculateDueDate(issueDate, validModelProposal.extractedTerms);
    modelContributionUsed = true;
  }

  if (validModelProposal?.extractedDueDate) {
    dueDate = validModelProposal.extractedDueDate;
    modelContributionUsed = true;
  }

  const termsMatch = text.match(/(?:due\s+(?:in|within|on)|terms?:?\s*(?:of|are)?|net\s*)\s*(\d+\s*days?|\d{4}-\d{2}-\d{2}|eom|receipt|[^.,\n]+)/i);
  if (termsMatch) {
    dueDate = calculateDueDate(issueDate, termsMatch[1]);
  }

  const explicitDueMatch = text.match(/due(?:\s+date)?[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (explicitDueMatch) {
    dueDate = explicitDueMatch[1];
  }

  // ==========================================
  // 3. Notes / Memo Extraction
  // ==========================================
  if (validModelProposal?.proposedNotes) {
    notes = validModelProposal.proposedNotes;
    modelContributionUsed = true;
  }

  const notesMatch = text.match(/(?:notes?|memo|po(?:\s*number)?|reference)[:\s]+([^.\n]+)/i);
  if (notesMatch && !validModelProposal?.proposedNotes) {
    notes = notesMatch[1].trim();
  }

  // ==========================================
  // 4. Line Items & Services Extraction
  // ==========================================
  let itemText = text;
  itemText = itemText.replace(/(?:due\s+(?:in|within|on)|terms?:?\s*(?:of|are)?|net\s*)\s*(\d+\s*days?|\d{4}-\d{2}-\d{2}|eom|receipt|[^.,\n;]+)/gi, ' ');
  itemText = itemText.replace(/due(?:\s+date)?[:\s]+\d{4}-\d{2}-\d{2}/gi, ' ');
  itemText = itemText.replace(/(?:issue|issued|invoice)\s+date[:\s]+\d{4}-\d{2}-\d{2}/gi, ' ');

  if (customer.name) {
    const escapedName = customer.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    itemText = itemText.replace(new RegExp(`(?:invoice|bill|quote)\\s+(?:for|to)\\s+${escapedName}\\s*(?:for|with|doing|did|done|:|,)?`, 'i'), ' ');
    itemText = itemText.replace(new RegExp(`(?:client|customer|billed to)(?:\\s+is)?[:\\s]+${escapedName}\\s*(?:for|with|doing|did|done|:|,)?`, 'i'), ' ');
  } else {
    itemText = itemText.replace(/(?:invoice|bill)\s+(?:for|to)\s+[A-Za-z0-9\s.,'&\\-]{2,30}?(?=\s+for\s+\d|\s+with|\s+doing|\s+did|\.|$)/i, ' ');
  }

  if (customer.email) itemText = itemText.replace(customer.email, ' ');
  if (customer.phone) itemText = itemText.replace(customer.phone, ' ');
  if (customer.billingAddress) itemText = itemText.replace(customer.billingAddress, ' ');

  const clauses = itemText
    .split(/;\s*|\s+and\s+(?:also\s+)?|\s+plus\s+|\n+|\.\s+(?=[A-Z0-9])/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 3);

  const deterministicAnalyses: DeterministicClauseAnalysis[] = [];

  for (const clause of clauses) {
    const qtyWithUnitMatch = clause.match(/(\d+(?:\.\d+)?)\s*(hours|hrs|hr|units|unit|items|item|days|day|sqm|trips|trip|licenses|license|m|km)\b/i);
    const bareQtyMatch = clause.match(/^(?:also\s+)?(?:add\s+)?(\d+(?:\.\d+)?)\s+([a-zA-Z][a-zA-Z0-9\s-]{2,40})/i);

    const hasRate = clause.match(/\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)(?:hr|hour|item|unit|day|sqm|mo|month)/i)
      || clause.match(/(?:at|rate of|for)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i)
      || clause.match(/\$\s*(\d+(?:\.\d{1,2})?)/i);

    let matchedCatalogItem: Item | undefined;
    for (const item of existingItems) {
      if (item.name.length >= 3 && new RegExp(`\\b${item.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'i').test(clause)) {
        matchedCatalogItem = item;
        break;
      }
    }

    if (qtyWithUnitMatch || bareQtyMatch || hasRate || matchedCatalogItem) {
      let qty = 1;
      let unit = matchedCatalogItem?.unit || 'items';
      const hasExplicitQty = Boolean(qtyWithUnitMatch || bareQtyMatch);

      if (qtyWithUnitMatch) {
        qty = parseFloat(qtyWithUnitMatch[1]);
        const rawUnit = qtyWithUnitMatch[2].toLowerCase();
        unit = /hour|hr/i.test(rawUnit) ? 'hours' : /day/i.test(rawUnit) ? 'days' : /sqm/i.test(rawUnit) ? 'sqm' : /trip/i.test(rawUnit) ? 'trips' : /unit/i.test(rawUnit) ? 'units' : 'items';
      } else if (bareQtyMatch) {
        qty = parseFloat(bareQtyMatch[1]);
        unit = matchedCatalogItem?.unit || 'units';
      }

      const hasExplicitRate = Boolean(hasRate);
      let unitRate = hasRate ? parseFloat(hasRate[1]) : (matchedCatalogItem?.defaultRate ?? 0);
      let rateRequiresConfirmation = false;

      if (!hasRate && !matchedCatalogItem) {
        unitRate = 0;
        rateRequiresConfirmation = true;
      }

      let desc = clause;
      if (hasRate && hasRate[0]) {
        desc = desc.replace(hasRate[0], ' ');
      }
      desc = desc
        .replace(/^(?:also\s+|add\s+|did\s+|performed\s+|completed\s+)?\s*\d+(?:\.\d+)?\s*(?:hours|hrs|hr|units|unit|items|item|days|day|sqm|trips|trip|licenses|license|m|km|x)?\s*(?:of\s+)?/i, ' ')
        .replace(/^(?:for|at|with|and|also|plus|performed|did)\s+/i, '')
        .replace(/\s+(?:for|at|with)\s*$/i, '')
        .trim();

      if (desc.length < 3 && matchedCatalogItem) {
        desc = matchedCatalogItem.name;
      }

      const isTaxExempt = /tax[- ]?free|gst[- ]?free|no tax|exempt|zero[- ]?rated/i.test(clause);
      const isExplicitTaxable = /\bwith tax\b|\btaxable\b|\bplus gst\b/i.test(clause);
      let taxable = true;
      if (isTaxExempt) {
        taxable = false;
      } else if (isExplicitTaxable) {
        taxable = true;
      } else if (matchedCatalogItem !== undefined) {
        taxable = matchedCatalogItem.taxable;
      } else {
        taxable = true;
      }

      if (desc.length >= 3) {
        const lineTotal = Math.round((qty * unitRate + Number.EPSILON) * 100) / 100;
        deterministicAnalyses.push({
          rawClause: clause,
          hasExplicitQty,
          hasExplicitRate,
          matchedCatalogItem,
          isTaxExempt,
          isExplicitTaxable,
          item: {
            id: 'line_' + Math.random().toString(36).substring(2, 8),
            itemId: matchedCatalogItem?.id,
            description: desc,
            quantity: qty,
            unit,
            unitRate,
            taxable,
            lineTotal,
            rateRequiresConfirmation
          }
        });
      }
    }
  }

  const newlyParsedItems: InvoiceLineItem[] = [];

  if (validModelProposal && validModelProposal.proposedLineItems.length > 0) {
    // Integrate local LLM structured line items with deterministic entity and business-rule validation
    for (let i = 0; i < validModelProposal.proposedLineItems.length; i++) {
      const mItem = validModelProposal.proposedLineItems[i];
      const detAnalysis = deterministicAnalyses[i];

      // Check catalogue match against model item description or deterministic clause
      let matchedCatalogItem = detAnalysis?.matchedCatalogItem;
      if (!matchedCatalogItem) {
        for (const catItem of existingItems) {
          if (
            catItem.name.length >= 3 &&
            new RegExp(`\\b${catItem.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'i').test(mItem.description)
          ) {
            matchedCatalogItem = catItem;
            break;
          }
        }
      }

      // Preserve confirmed user quantity if deterministic parser found an explicit quantity in user text
      const verifiedQty =
        detAnalysis?.hasExplicitQty && detAnalysis.item.quantity > 0
          ? detAnalysis.item.quantity
          : mItem.quantity > 0
          ? mItem.quantity
          : 1;

      const verifiedUnit = mItem.unit || detAnalysis?.item.unit || matchedCatalogItem?.unit || 'items';

      // Enforce deterministic rate authority: never allow the model to invent a rate when neither user text nor catalogue supplied one
      let verifiedRate = 0;
      let rateRequiresConfirmation = false;

      if (detAnalysis?.hasExplicitRate) {
        verifiedRate = detAnalysis.item.unitRate;
        rateRequiresConfirmation = false;
      } else if (matchedCatalogItem) {
        verifiedRate = matchedCatalogItem.defaultRate;
        rateRequiresConfirmation = false;
      } else {
        verifiedRate = 0;
        rateRequiresConfirmation = true;
      }

      // Enforce deterministic taxability authority when catalogue or explicit tax instruction applies
      let verifiedTaxable = mItem.taxable;
      if (detAnalysis?.isTaxExempt) {
        verifiedTaxable = false;
      } else if (detAnalysis?.isExplicitTaxable) {
        verifiedTaxable = true;
      } else if (matchedCatalogItem !== undefined) {
        verifiedTaxable = matchedCatalogItem.taxable;
      }

      const verifiedDesc = mItem.description.trim();
      const lineTotal = Math.round((verifiedQty * verifiedRate + Number.EPSILON) * 100) / 100;

      newlyParsedItems.push({
        id: 'line_' + Math.random().toString(36).substring(2, 8),
        itemId: matchedCatalogItem?.id,
        description: verifiedDesc,
        quantity: verifiedQty,
        unit: verifiedUnit,
        unitRate: verifiedRate,
        taxable: verifiedTaxable,
        lineTotal,
        rateRequiresConfirmation
      });

      modelContributionUsed = true;
    }

    // If the user specified additional clauses beyond the model's item array, preserve them
    if (deterministicAnalyses.length > validModelProposal.proposedLineItems.length) {
      for (let j = validModelProposal.proposedLineItems.length; j < deterministicAnalyses.length; j++) {
        newlyParsedItems.push(deterministicAnalyses[j].item);
      }
    }
  } else {
    for (const det of deterministicAnalyses) {
      newlyParsedItems.push(det.item);
    }
  }

  // Check if user is directly answering an unpriced item rate (e.g. "Rate is $95/hr" or "$75")
  const unconfirmedItems = lineItems.filter((it) => it.rateRequiresConfirmation || it.unitRate === 0);
  const answeringRateMatch = text.match(/(?:rate(?:\s+is)?|charge|use|make it|price is)?\s*\$?\s*(\d+(?:\.\d{1,2})?)(?:\s*(?:\/|\s*per\s*)(?:hr|hour|item|unit))?/i);
  if (unconfirmedItems.length > 0 && answeringRateMatch && deterministicAnalyses.length === 0) {
    const rateVal = parseFloat(answeringRateMatch[1]);
    if (rateVal > 0) {
      for (const item of unconfirmedItems) {
        item.unitRate = rateVal;
        item.rateRequiresConfirmation = false;
        item.lineTotal = Math.round((item.quantity * rateVal + Number.EPSILON) * 100) / 100;
      }
    }
  }

  // Handle newly parsed items: update existing items if correction, else append
  const isCorrection = /change|update|correct|make (?:that|it)|instead of|actually/i.test(text);

  if (newlyParsedItems.length > 0) {
    if (lineItems.length === 0) {
      lineItems = newlyParsedItems;
    } else {
      for (const newItem of newlyParsedItems) {
        let matchIdx = lineItems.findIndex((existing) => {
          if (newItem.itemId && existing.itemId && newItem.itemId === existing.itemId) return true;
          const eWords = existing.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const nWords = newItem.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const commonWords = eWords.filter((w) => nWords.includes(w));
          return (
            commonWords.length > 0 ||
            newItem.description.toLowerCase().includes(existing.description.toLowerCase()) ||
            existing.description.toLowerCase().includes(newItem.description.toLowerCase())
          );
        });

        if (matchIdx === -1 && isCorrection && lineItems.length === 1 && newlyParsedItems.length === 1) {
          matchIdx = 0;
        }

        if (matchIdx !== -1 && (isCorrection || !/also|plus|add\s+(?:another|1|\d)/i.test(text))) {
          const existing = lineItems[matchIdx];
          const updatedQty = newItem.quantity > 0 ? newItem.quantity : existing.quantity;
          const updatedRate = newItem.unitRate > 0 ? newItem.unitRate : existing.unitRate;
          lineItems[matchIdx] = {
            ...existing,
            quantity: updatedQty,
            unitRate: updatedRate,
            unit: newItem.unit || existing.unit,
            taxable: newItem.taxable,
            lineTotal: Math.round((updatedQty * updatedRate + Number.EPSILON) * 100) / 100,
            rateRequiresConfirmation: updatedRate === 0
          };
        } else {
          lineItems.push(newItem);
        }
      }
    }
  }

  // ==========================================
  // 5. Authoritative Calculations & Totals
  // ==========================================
  const totals = calculateInvoiceTotals({
    lineItems,
    discountType: 'percentage',
    discountValue: 0,
    taxRate: businessDefaults.taxRate
  });

  // ==========================================
  // 6. Missing Fields & Uncertainty Check
  // ==========================================
  if (!customer.name || customer.name.trim().length === 0) {
    missingFields.push('Customer Name');
  }

  if (lineItems.length === 0) {
    missingFields.push('Services or Line Items');
  } else {
    lineItems.forEach((item) => {
      if (item.rateRequiresConfirmation || item.unitRate === 0) {
        missingFields.push(`Rate for "${item.description.slice(0, 25)}" (currently $0.00)`);
      }
    });
  }

  // ==========================================
  // 7. Provenance Resolution
  // ==========================================
  // 'local-model' is ONLY assigned when a valid modelProposal was received from actual inference AND contributed to the resulting interpretation
  const provenance: 'local-model' | 'deterministic-fallback' =
    validModelProposal && modelContributionUsed ? 'local-model' : 'deterministic-fallback';

  // ==========================================
  // 8. Formulate Natural Conversational Reply
  // ==========================================
  let assistantResponse = '';
  let readyToApply = false;

  if (missingFields.length === 0) {
    readyToApply = true;
    const itemsSummary = lineItems
      .map((it) => `• ${it.description}: ${it.quantity} ${it.unit} @ $${it.unitRate.toFixed(2)} = $${it.lineTotal.toFixed(2)}`)
      .join('\n');

    assistantResponse = `I've assembled the complete invoice draft for **${customer.name}**:\n\n${itemsSummary}\n\n` +
      `• **Subtotal:** $${totals.subtotal.toFixed(2)}\n` +
      `• **${businessDefaults.taxLabel} (${businessDefaults.taxRate}%):** $${totals.taxAmount.toFixed(2)}\n` +
      `• **Grand Total:** $${totals.grandTotal.toFixed(2)} ${businessDefaults.currency}\n` +
      `• **Due Date:** ${dueDate}\n\n` +
      `Click **"Apply to Invoice Builder"** below to load this invoice for final review and saving!`;
  } else if (!customer.name && lineItems.length > 0) {
    assistantResponse = `I have noted ${lineItems.length} service item(s):\n` +
      lineItems.map((it) => `• ${it.description} (${it.quantity} ${it.unit} @ $${it.unitRate.toFixed(2)})`).join('\n') +
      `\n\nWho is the **customer** for this invoice? (Provide a name, email, or company name).`;
  } else if (customer.name && lineItems.length === 0) {
    assistantResponse = `I've set the client to **${customer.name}**. What jobs, items, or services did you perform for them? You can specify hours, rates, or tasks.`;
  } else if (lineItems.some((it) => it.rateRequiresConfirmation || it.unitRate === 0)) {
    const zeroRateItems = lineItems.filter((it) => it.rateRequiresConfirmation || it.unitRate === 0);
    assistantResponse = `I have set client **${customer.name}** and added ${lineItems.length} item(s). However, I need to confirm the rate for:\n` +
      zeroRateItems.map((it) => `• "${it.description}"`).join('\n') +
      `\nWhat rate should I charge for this, or should it remain $0?`;
  } else {
    assistantResponse = `Tell me about the work: who is the client, and what services, hours, or rates would you like to invoice?`;
  }

  const draft: BuddyInvoiceDraft = {
    customer,
    lineItems,
    issueDate,
    dueDate,
    notes,
    currency: businessDefaults.currency,
    taxLabel: businessDefaults.taxLabel,
    taxRate: businessDefaults.taxRate,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    grandTotal: totals.grandTotal,
    missingFields,
    uncertainFields,
    summary: `${customer.name || 'Unnamed Client'} - ${lineItems.length} items - Total: $${totals.grandTotal.toFixed(2)}`,
    provenance,
    requestId: provenance === 'local-model' ? validModelProposal?.requestId : undefined,
    modelIdentifier: provenance === 'local-model' ? validModelProposal?.modelIdentifier : undefined,
    runtime: provenance === 'local-model' ? validModelProposal?.runtime : undefined,
    rawModelOutput: provenance === 'local-model' ? validModelProposal?.rawModelOutput : undefined
  };

  return {
    assistantResponse,
    draft,
    readyToApply,
    provenance,
    modelContributionUsed: provenance === 'local-model',
    requestId: draft.requestId,
    modelIdentifier: draft.modelIdentifier,
    runtime: draft.runtime,
    rawModelOutput: draft.rawModelOutput
  };
}

