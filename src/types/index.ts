export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface BusinessProfile {
  name: string;
  contactEmail: string;
  phone: string;
  address: string;
  website: string;
  taxId: string;
  logoDataUrl: string;
  paymentInstructions: string;
  defaultCurrency: string;
  defaultTaxLabel: string;
  defaultTaxRate: number; // e.g. 5 for 5% GST
  country?: string; // e.g. 'Canada'
  jurisdiction?: string; // e.g. 'Alberta'
  invoicePrefix: string;
  nextInvoiceNumber: number;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  billingAddress: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Item {
  id: string;
  name: string;
  description: string;
  unit: string; // e.g. "hrs", "units", "items", "project"
  defaultRate: number;
  taxable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  itemId?: string;
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  taxable: boolean;
  lineTotal: number;
  rateRequiresConfirmation?: boolean; // Highlighted if rate was not specified by user
}

export interface TemplateSettings {
  accentColor: string;
  fontFamily: string;
  logoPosition: 'left' | 'right' | 'center';
  footerNote: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  clientId: string;
  clientSnapshot: Client;
  lineItems: InvoiceLineItem[];
  currency: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  discountAmount: number;
  taxLabel: string;
  taxRate: number;
  taxAmount: number;
  subtotal: number;
  grandTotal: number;
  notes: string;
  paymentInstructions: string;
  paymentDate?: string;
  amountReceived?: number;
  template: TemplateSettings;
  createdAt: string;
  updatedAt: string;
}

export interface ExportBackupEnvelope {
  schemaVersion: 2;
  createdAt: string;
  app: 'InvoiceStudio2';
  data: {
    business: BusinessProfile;
    clients: Client[];
    items: Item[];
    invoices: Invoice[];
    template: TemplateSettings;
  };
  checksumSha256: string;
}

export interface LLMProposedLineItem {
  description: string;
  quantity: number;
  unit: string;
  unitRate: number;
  taxable: boolean;
  rateRequiresConfirmation?: boolean;
}

export interface BuddyExtractedCustomer {
  name?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  matchedClientId?: string;
  isExisting?: boolean;
}

export interface BuddyInvoiceDraft {
  customer?: BuddyExtractedCustomer;
  lineItems: InvoiceLineItem[];
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  currency?: string;
  taxLabel?: string;
  taxRate?: number;
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  missingFields: string[];
  uncertainFields: string[];
  summary: string;
  provenance?: 'local-model' | 'deterministic-fallback';
  requestId?: string;
  modelIdentifier?: string;
  runtime?: string;
  rawModelOutput?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  draftSnapshot?: BuddyInvoiceDraft;
  provenance?: 'local-model' | 'deterministic-fallback' | 'user';
  modelName?: string;
  runtime?: string;
  requestId?: string;
}

export interface BuddyPersistedState {
  key: string;
  messages: ConversationMessage[];
  currentDraft: BuddyInvoiceDraft | null;
  updatedAt: string;
}

export interface LLMChangeProposal {
  summary: string;
  proposedLineItems: LLMProposedLineItem[];
  extractedCustomer?: {
    name?: string;
    email?: string;
    phone?: string;
    billingAddress?: string;
  };
  extractedTerms?: string;
  extractedIssueDate?: string;
  extractedDueDate?: string;
  draft?: BuddyInvoiceDraft;
  proposedNotes?: string;
  originalPrompt: string;
  provenance?: 'local-model' | 'deterministic-fallback';
  requestId?: string;
  modelIdentifier?: string;
  runtime?: string;
  rawModelOutput?: string;
}

export interface LLMStatus {
  state: 'idle' | 'downloading' | 'ready' | 'processing' | 'error';
  progress?: number; // 0 to 100
  statusMessage: string;
  modelName: string;
  device: string;
}
