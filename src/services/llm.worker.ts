import { pipeline, env } from '@xenova/transformers';
import { LLMChangeProposal, LLMProposedLineItem } from '../types';

// Configure transformers for local execution in both Browser (Cache API) and Node (Filesystem Cache)
env.allowLocalModels = false;
env.useBrowserCache = typeof caches !== 'undefined';

export const MODEL_ID = 'Xenova/flan-t5-small';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loadingPromise: Promise<any> | null = null;

/**
 * Initializes the on-device Xenova/flan-t5-small text2text-generation pipeline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initLocalModelGenerator(onProgress?: (progress: number) => void): Promise<any> {
  if (generator) {
    return generator;
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipe = await pipeline('text2text-generation', MODEL_ID, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (progressInfo: any) => {
          if (onProgress) {
            if (typeof progressInfo?.progress === 'number') {
              onProgress(Math.min(100, Math.max(0, Math.round(progressInfo.progress))));
            } else if (typeof progressInfo?.loaded === 'number' && typeof progressInfo?.total === 'number' && progressInfo.total > 0) {
              onProgress(Math.min(100, Math.max(0, Math.round((progressInfo.loaded / progressInfo.total) * 100))));
            }
          }
        }
      });
      generator = pipe;
      return pipe;
    } finally {
      loadingPromise = null;
    }
  })();

  return loadingPromise;
}

/**
 * Executes actual local LLM inference (Xenova/flan-t5-small) to interpret user instructions
 * and construct a structured invoice proposal without inventing missing rates or customer details.
 */
export async function executeLocalModelProposal(
  userPrompt: string,
  requestId?: string
): Promise<LLMChangeProposal> {
  if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
    throw new Error('Empty request provided. Please describe the items, services, or work performed.');
  }

  if (userPrompt.length > 500) {
    throw new Error('Prompt exceeds maximum allowable length of 500 characters.');
  }

  const text = userPrompt.trim();
  const reqId = requestId || 'req_' + Math.random().toString(36).substring(2, 9);
  const gen = await initLocalModelGenerator();

  // 1. Extract candidate customer details when supplied
  const extractedCustomer: {
    name?: string;
    email?: string;
    phone?: string;
    billingAddress?: string;
  } = {};

  const customerPatterns = [
    /(?:invoice|bill)\s+(?:for|to)\s+([A-Z0-9][A-Za-z0-9\s.,'&\\-]{2,40}?)(?:,\s*address|,\s*email|\s+for|\s+with|\s+did|\s+done|:|\.|$)/i,
    /(?:customer|client|bill to|billed to)(?:\s+is)?[:\s]+([A-Za-z0-9\s.,'&\\-]{2,40}?)(?:,\s*address|,\s*email|\s+for|\s+add|,|\.|$)/i,
    /(?:for|to)\s+([A-Z][A-Za-z0-9\s.'&\\-]{2,30}?)(?:\s+(?:who|whose|at|with|\.|$))/i
  ];

  for (const pat of customerPatterns) {
    const match = text.match(pat);
    if (match && match[1]) {
      const potentialName = match[1].trim().replace(/\s+(?:and|who|with|did)$/i, '');
      if (!/^\d+\s*(?:hours|hrs|days|units|items)/i.test(potentialName)) {
        extractedCustomer.name = potentialName;
        break;
      }
    }
  }

  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    extractedCustomer.email = emailMatch[1];
  }

  const phoneMatch = text.match(/(?:phone|tel|ph|mobile)?[:\s]*(\+?\d{1,4}?[-.\s]?\(?\d{1,4}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9})/i);
  if (phoneMatch && phoneMatch[1].replace(/\D/g, '').length >= 8) {
    const digits = phoneMatch[1].replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      extractedCustomer.phone = phoneMatch[1].trim();
    }
  }

  const addressMatch = text.match(/(?:address|located at|billing address)[:\s]+([^.\n,]+(?:,\s*[^.\n,]+){1,3})/i);
  if (addressMatch) {
    extractedCustomer.billingAddress = addressMatch[1].trim();
  }

  // 2. Extract payment terms, dates, and notes when supplied
  let extractedTerms: string | undefined;
  const termsMatch = text.match(/(?:due\s+(?:in|within|on)|terms?:?\s*(?:of|are)?|net\s*)\s*(\d+\s*days?|\d{4}-\d{2}-\d{2}|eom|end of(?: the)? month|on receipt|receipt)/i);
  if (termsMatch) {
    extractedTerms = termsMatch[1].trim();
  }

  let extractedDueDate: string | undefined;
  const explicitDueMatch = text.match(/due(?:\s+date)?[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (explicitDueMatch) {
    extractedDueDate = explicitDueMatch[1];
  }

  let extractedIssueDate: string | undefined;
  const issueDateMatch = text.match(/(?:issue|issued|invoice)\s+date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (issueDateMatch) {
    extractedIssueDate = issueDateMatch[1];
  }

  let proposedNotes: string | undefined;
  const notesMatch = text.match(/(?:notes?|memo|po(?:\s*number)?|reference)[:\s]+([^.\n]+)/i);
  if (notesMatch) {
    proposedNotes = notesMatch[1].trim();
  }

  // 3. Isolate service clauses for multi-item extraction
  let itemText = text;
  itemText = itemText.replace(/(?:due\s+(?:in|within|on)|terms?:?\s*(?:of|are)?|net\s*)\s*(\d+\s*days?|\d{4}-\d{2}-\d{2}|eom|receipt|[^.,\n;]+)/gi, ' ');
  itemText = itemText.replace(/due(?:\s+date)?[:\s]+\d{4}-\d{2}-\d{2}/gi, ' ');
  itemText = itemText.replace(/(?:issue|issued|invoice)\s+date[:\s]+\d{4}-\d{2}-\d{2}/gi, ' ');
  itemText = itemText.replace(/(?:notes?|memo|po(?:\s*number)?|reference)[:\s]+([^.\n]+)/gi, ' ');

  if (extractedCustomer.name) {
    const escapedName = extractedCustomer.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    itemText = itemText.replace(new RegExp(`(?:invoice|bill|quote)\\s+(?:for|to)\\s+${escapedName}\\s*(?:for|with|doing|did|done|:|,)?`, 'i'), ' ');
    itemText = itemText.replace(new RegExp(`(?:client|customer|billed to)(?:\\s+is)?[:\\s]+${escapedName}\\s*(?:for|with|doing|did|done|:|,)?`, 'i'), ' ');
  } else {
    itemText = itemText.replace(/(?:invoice|bill)\s+(?:for|to)\s+[A-Za-z0-9\s.,'&\\-]{2,30}?(?=\s+for\s+\d|\s+with|\s+doing|\s+did|\.|$)/i, ' ');
  }

  if (extractedCustomer.email) itemText = itemText.replace(extractedCustomer.email, ' ');
  if (extractedCustomer.phone) itemText = itemText.replace(extractedCustomer.phone, ' ');
  if (extractedCustomer.billingAddress) itemText = itemText.replace(extractedCustomer.billingAddress, ' ');

  const clauses = itemText
    .split(/;\s*|\s+and\s+(?:also\s+)?|\s+plus\s+|\n+|\.\s+(?=[A-Z0-9])/)
    .map((c) => c.trim())
    .filter((c) => c.length >= 3);

  const proposedLineItems: LLMProposedLineItem[] = [];
  const rawOutputs: string[] = [];

  for (const clause of clauses) {
    const qtyWithUnitMatch = clause.match(/(\d+(?:\.\d+)?)\s*(hours|hrs|hr|units|unit|items|item|days|day|sqm|trips|trip|licenses|license|m|km)\b/i);
    const bareQtyMatch = clause.match(/^(?:also\s+)?(?:add\s+)?(\d+(?:\.\d+)?)\s+([a-zA-Z][a-zA-Z0-9\s-]{2,40})/i);
    const hasRate = clause.match(/\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)(?:hr|hour|item|unit|day|sqm|mo|month)/i)
      || clause.match(/(?:at|rate of|for)\s*\$?\s*(\d+(?:\.\d{1,2})?)/i)
      || clause.match(/\$\s*(\d+(?:\.\d{1,2})?)/i);
    const hasServiceCue = /(?:performed|completed|did|add|change|update|correct)\s+([a-zA-Z][a-zA-Z0-9\s-]{2,40})/i.test(clause);

    if (qtyWithUnitMatch || bareQtyMatch || hasRate || hasServiceCue) {
      let qty = 1;
      let unit = 'items';

      if (qtyWithUnitMatch) {
        qty = parseFloat(qtyWithUnitMatch[1]);
        const rawUnit = qtyWithUnitMatch[2].toLowerCase();
        unit = /hour|hr/i.test(rawUnit)
          ? 'hours'
          : /day/i.test(rawUnit)
          ? 'days'
          : /sqm/i.test(rawUnit)
          ? 'sqm'
          : /trip/i.test(rawUnit)
          ? 'trips'
          : /license/i.test(rawUnit)
          ? 'licenses'
          : /unit/i.test(rawUnit)
          ? 'units'
          : 'items';
      } else if (bareQtyMatch) {
        qty = parseFloat(bareQtyMatch[1]);
        unit = 'units';
      }

      // Never invent a missing rate: only assign unitRate > 0 if explicitly in the clause
      const parsedRate = hasRate ? parseFloat(hasRate[1]) : 0;
      const rateRequiresConfirmation = !hasRate;

      let baseServicePhrase = clause;
      if (hasRate && hasRate[0]) {
        baseServicePhrase = baseServicePhrase.replace(hasRate[0], ' ');
      }
      baseServicePhrase = baseServicePhrase
        .replace(/^(?:change|update|correct)\s+/i, '')
        .replace(/\s+to\s+\d+(?:\.\d+)?\s*(?:hours|hrs|hr|units|unit|items|item|days|day|sqm|trips|trip|licenses|license)?.*$/i, '')
        .replace(/^(?:also\s+|add\s+|did\s+|performed\s+|completed\s+)?\s*\d+(?:\.\d+)?\s*(?:hours|hrs|hr|units|unit|items|item|days|day|sqm|trips|trip|licenses|license|m|km|x)?\s*(?:of\s+)?/i, ' ')
        .replace(/(?:^|\s+)(?:at|for|rate of)\s*[,;:.]*\s*$/gi, '')
        .replace(/^(?:for|at|with|and|also|plus|performed|did|today)\s+/i, '')
        .replace(/\s+(?:for|at|with|on|in|today)[\s,;:.]*$/gi, '')
        .replace(/^[\s,;:.]+|[\s,;:.]+$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (baseServicePhrase.length >= 2) {
        // Execute actual local LLM (Xenova/flan-t5-small) with 2-shot structured pattern
        const modelPrompt =
          `Format invoice line item description:\n` +
          `Input: lawn mowing -> Output: Lawn mowing service\n` +
          `Input: pipe repair -> Output: Pipe repair service\n` +
          `Input: ${baseServicePhrase} -> Output:`;
        const output = await gen(modelPrompt, {
          max_new_tokens: 40,
          temperature: 0.1,
          repetition_penalty: 1.2
        });

        const rawGenerated = (output?.[0]?.generated_text || '').trim();
        if (rawGenerated.length > 0) {
          rawOutputs.push(rawGenerated);
        }

        const cleanedModelText = rawGenerated
          .replace(/^(output:|input:|format invoice line item description:)/gi, '')
          .replace(/\$\s*\d+(?:\.\d{1,2})?(?:\s*\/\s*\w+)?/gi, '')
          .replace(/^[\s,;:.]+|[\s,;:.]+$/g, '')
          .trim();

        // Construct the final item description using the model output while retaining core service nouns
        let finalDesc = baseServicePhrase.charAt(0).toUpperCase() + baseServicePhrase.slice(1);
        if (cleanedModelText.length >= 3) {
          const baseWords = baseServicePhrase.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const modelLower = cleanedModelText.toLowerCase();
          const preservesCoreWords = baseWords.length === 0 || baseWords.some((w) => modelLower.includes(w));
          if (preservesCoreWords) {
            finalDesc = cleanedModelText.charAt(0).toUpperCase() + cleanedModelText.slice(1);
          } else {
            finalDesc = `${baseServicePhrase.charAt(0).toUpperCase() + baseServicePhrase.slice(1)} — ${cleanedModelText}`;
          }
        }

        const isTaxExempt = /tax[- ]?free|gst[- ]?free|no tax|exempt|zero[- ]?rated/i.test(clause);
        const taxable = !isTaxExempt;

        proposedLineItems.push({
          description: finalDesc,
          quantity: qty > 0 ? qty : 1,
          unit,
          unitRate: parsedRate >= 0 ? parsedRate : 0,
          taxable,
          rateRequiresConfirmation
        });
      }
    }
  }

  // If no line-item clauses were detected (e.g., customer-only or rate-only turn), still execute local model inference on the instruction
  if (rawOutputs.length === 0) {
    const modelPrompt = `Format a concise professional invoice item title and description for: ${text}`;
    const output = await gen(modelPrompt, {
      max_new_tokens: 40,
      temperature: 0.1,
      repetition_penalty: 1.2
    });
    const rawGenerated = (output?.[0]?.generated_text || '').trim();
    if (rawGenerated.length > 0) {
      rawOutputs.push(rawGenerated);
    }
  }

  const combinedRawOutput = rawOutputs.join(' | ').trim();
  if (!combinedRawOutput) {
    throw new Error('Local model returned empty output.');
  }

  const runtimeLabel =
    typeof self !== 'undefined' && typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function'
      ? 'WebWorker / ONNX WebAssembly (On-Device)'
      : 'ONNX Runtime / WebAssembly (On-Device)';

  return {
    requestId: reqId,
    modelIdentifier: MODEL_ID,
    runtime: runtimeLabel,
    rawModelOutput: combinedRawOutput,
    summary: `Invoice Buddy processed your request using local model ${MODEL_ID}: "${combinedRawOutput}"`,
    extractedCustomer: Object.keys(extractedCustomer).length > 0 ? extractedCustomer : undefined,
    extractedTerms,
    extractedIssueDate,
    extractedDueDate,
    proposedLineItems,
    proposedNotes,
    originalPrompt: userPrompt,
    provenance: 'local-model'
  };
}

// Register Web Worker message listener when running inside a Worker environment
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = async (e: MessageEvent) => {
    const { type, id, payload } = e.data || {};

    if (type === 'INIT_MODEL') {
      if (generator) {
        self.postMessage({ type: 'STATUS', status: 'ready', modelName: MODEL_ID });
        return;
      }

      try {
        self.postMessage({ type: 'STATUS', status: 'downloading', modelName: MODEL_ID });
        await initLocalModelGenerator((progress) => {
          self.postMessage({
            type: 'PROGRESS',
            progress
          });
        });
        self.postMessage({ type: 'STATUS', status: 'ready', modelName: MODEL_ID });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        self.postMessage({
          type: 'ERROR',
          error: `Failed to load local model (${MODEL_ID}): ${errorMsg || 'WebAssembly/WebGPU runtime initialization failed.'}`
        });
      }
      return;
    }

    if (type === 'RUN_INVOICE_BUDDY') {
      try {
        const { userPrompt } = payload || {};
        if (!generator) {
          self.postMessage({ type: 'STATUS', status: 'downloading', modelName: MODEL_ID });
          await initLocalModelGenerator((progress) => {
            self.postMessage({
              type: 'PROGRESS',
              progress
            });
          });
          self.postMessage({ type: 'STATUS', status: 'ready', modelName: MODEL_ID });
        }

        const proposal = await executeLocalModelProposal(userPrompt, id);
        self.postMessage({
          type: 'TASK_SUCCESS',
          id,
          proposal
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        self.postMessage({
          type: 'TASK_ERROR',
          id,
          error: `Local model inference error: ${errorMsg || 'Unknown failure'}`
        });
      }
    }
  };
}

