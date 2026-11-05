import React, { useState, useEffect, useRef } from 'react';
import { llmClient } from '../services/llmClient';
import { processBuddyTurn } from '../services/buddyEngine';
import { storage } from '../services/storage';
import {
  LLMStatus,
  LLMChangeProposal,
  Client,
  Item,
  BusinessProfile,
  BuddyInvoiceDraft,
  ConversationMessage
} from '../types';
import { formatCurrency } from '../utils/calc';
import {
  Sparkles,
  Send,
  AlertCircle,
  X,
  Loader2,
  Cpu,
  User,
  Calendar,
  Layers,
  RotateCcw,
  CheckCircle2,
  FileCheck2
} from 'lucide-react';

interface InvoiceBuddyModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: Client[];
  items: Item[];
  business: BusinessProfile;
  onApplyCompleteInvoice: (draft: BuddyInvoiceDraft) => void;
}

export const InvoiceBuddyModal: React.FC<InvoiceBuddyModalProps> = ({
  isOpen,
  onClose,
  clients,
  items,
  business,
  onApplyCompleteInvoice
}) => {
  const [inputText, setInputText] = useState('');
  const [llmStatus, setLlmStatus] = useState<LLMStatus>({
    state: 'idle',
    statusMessage: '',
    modelName: 'Xenova/flan-t5-small',
    device: 'WebAssembly (On-Device)'
  });

  const [messages, setMessages] = useState<ConversationMessage[]>(() => [
    {
      id: 'msg_init',
      role: 'assistant',
      content:
        `Hello! I'm your conversational **Invoice Buddy**.\n\nTell me about your customer and the work performed. For example:\n*"Invoice for Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr plus $90 waste disposal, due in 14 days."*\n\nI will extract the customer, line items, rates, and dates, check for missing details, and build your complete invoice draft.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      provenance: 'deterministic-fallback'
    }
  ]);

  const [currentDraft, setCurrentDraft] = useState<BuddyInvoiceDraft | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to LLM Worker status
  useEffect(() => {
    const unsub = llmClient.subscribeStatus((st) => setLlmStatus(st));
    return () => unsub();
  }, []);

  // Automatically trigger local LLM model loading/downloading when Invoice Buddy opens
  useEffect(() => {
    if (isOpen && (llmStatus.state === 'idle' || llmStatus.state === 'error')) {
      llmClient.initializeModel();
    }
  }, [isOpen, llmStatus.state]);

  // Recover unfinished conversation & draft from IndexedDB
  useEffect(() => {
    let isMounted = true;
    const loadSavedDraft = async () => {
      try {
        const saved = await storage.getBuddyDraft();
        if (saved && isMounted && saved.messages && saved.messages.length > 0) {
          setMessages(saved.messages);
          setCurrentDraft(saved.currentDraft);
        }
      } catch (err) {
        console.warn('Could not load saved buddy draft from IndexedDB:', err);
      }
    };
    loadSavedDraft();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleWarmup = () => {
    setErrorMessage('');
    llmClient.initializeModel();
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || isProcessing) return;

    setErrorMessage('');
    setInputText('');
    setIsProcessing(true);

    const userMessage: ConversationMessage = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      provenance: 'user'
    };

    setMessages((prev) => [...prev, userMessage]);

    let modelProposal: LLMChangeProposal | null = null;

    // 1. Attempt actual local model inference when worker/runtime is available
    try {
      if (llmStatus.state !== 'error') {
        modelProposal = await llmClient.requestProposal(text);
      }
    } catch (modelErr) {
      console.warn('Local model execution bypassed or failed, using deterministic engine:', modelErr);
      modelProposal = null;
    }

    try {
      // 2. Structured proposal extraction, schema validation & deterministic calculation
      const turnResult = processBuddyTurn({
        userMessage: text,
        previousDraft: currentDraft,
        existingClients: clients,
        existingItems: items,
        businessDefaults: {
          currency: business.defaultCurrency || 'CAD',
          taxLabel: business.defaultTaxLabel || 'GST',
          taxRate: business.defaultTaxRate ?? 5.0,
          paymentInstructions: business.paymentInstructions || ''
        },
        modelProposal
      });

      setCurrentDraft(turnResult.draft);

      const assistantMessage: ConversationMessage = {
        id: 'ast_' + Date.now(),
        role: 'assistant',
        content: turnResult.assistantResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        draftSnapshot: turnResult.draft,
        provenance: turnResult.provenance,
        modelName:
          turnResult.provenance === 'local-model'
            ? turnResult.modelIdentifier || llmStatus.modelName
            : undefined,
        runtime:
          turnResult.provenance === 'local-model'
            ? turnResult.runtime || llmStatus.device
            : undefined,
        requestId: turnResult.requestId
      };

      const updatedMessages = [...messages, userMessage, assistantMessage];
      setMessages(updatedMessages);

      // Persist draft immediately in IndexedDB to survive restarts
      await storage.saveBuddyDraft(updatedMessages, turnResult.draft);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Invoice Buddy error: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetConversation = async () => {
    await storage.clearBuddyDraft();
    setCurrentDraft(null);
    setErrorMessage('');
    const freshMessages: ConversationMessage[] = [
      {
        id: 'msg_init_' + Date.now(),
        role: 'assistant',
        content:
          `Starting fresh! Tell me about the customer and work performed. Mention hours, rates, dates, or tasks.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provenance: 'deterministic-fallback'
      }
    ];
    setMessages(freshMessages);
  };

  const handleApplyToInvoiceBuilder = () => {
    if (!currentDraft) return;

    // Safety check: ensure user is explicitly aware if missing fields exist
    if (currentDraft.missingFields.length > 0) {
      const confirmProceed = window.confirm(
        `Note: The following fields are still missing or require confirmation:\n• ${currentDraft.missingFields.join('\n• ')}\n\nDo you want to proceed and populate the invoice builder now?`
      );
      if (!confirmProceed) return;
    }

    onApplyCompleteInvoice(currentDraft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="buddy-modal-title"
    >
      <div className="flex h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
              <Sparkles size={18} aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="buddy-modal-title" className="text-sm sm:text-base font-bold text-slate-900">
                  Invoice Buddy
                </h3>
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  Conversational Assistant
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                100% On-Device, Offline, Multi-turn Invoice Extractor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResetConversation}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              title="Reset conversation and start new draft"
            >
              <RotateCcw size={12} aria-hidden="true" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              aria-label="Close dialog"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Neural Engine Status Bar */}
        <div className="border-b border-purple-100 bg-purple-50/50 px-4 py-2 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-purple-800">
            <Cpu size={13} className="text-purple-600" aria-hidden="true" />
            <span className="font-semibold">Local AI Model:</span>
            <span>{llmStatus.modelName}</span>
            <span className="text-[11px] text-purple-600">({llmStatus.state})</span>
          </div>

          {llmStatus.state === 'idle' && (
            <button
              type="button"
              onClick={handleWarmup}
              className="text-[11px] font-semibold text-purple-700 hover:underline"
            >
              Pre-load neural model (~60MB)
            </button>
          )}

          {llmStatus.state === 'downloading' && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700">
              <Loader2 size={12} className="animate-spin text-purple-600" aria-hidden="true" />
              <span>Downloading weights: {llmStatus.progress ?? 0}%</span>
            </div>
          )}

          {llmStatus.state === 'ready' && (
            <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-600" aria-hidden="true" /> Ready (Offline)
            </span>
          )}

          {llmStatus.state === 'error' && (
            <button
              type="button"
              onClick={handleWarmup}
              className="text-[11px] font-semibold text-red-700 hover:underline"
            >
              Retry loading model
            </button>
          )}
        </div>

        {/* Main Split Layout: Messages (Left) & Accumulated Draft (Right on desktop) */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
          {/* Left Column: Chat Conversation Thread */}
          <div className="flex flex-1 flex-col overflow-hidden border-b md:border-b-0 md:border-r border-slate-200">
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-2xs ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-xs'
                        : 'bg-slate-100 text-slate-800 rounded-bl-xs border border-slate-200/60'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-slate-400">
                    <span>{msg.timestamp}</span>
                    {msg.role === 'assistant' && (
                      <>
                        <span>•</span>
                        {msg.provenance === 'local-model' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700">
                            <Cpu size={9} aria-hidden="true" /> Local Model ({msg.modelName || 'Xenova/flan-t5-small'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                            Deterministic Engine
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-purple-700 bg-purple-50 p-2.5 rounded-lg border border-purple-200 w-fit">
                  <Loader2 size={14} className="animate-spin text-purple-600" aria-hidden="true" />
                  <span>Invoice Buddy is analyzing and compiling invoice details...</span>
                </div>
              )}

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="border-t border-slate-200 p-3 bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. 'Customer is Wayne Enterprises, add 3 hrs security audit at $120/hr, net 14'"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={isProcessing}
                  className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:border-purple-500 focus:outline-hidden"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !inputText.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm hover:bg-purple-700 disabled:opacity-40"
                  aria-label="Send message to Invoice Buddy"
                >
                  <Send size={15} aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Live Accumulated Invoice Draft */}
          <div className="w-full md:w-80 lg:w-96 overflow-y-auto bg-slate-50 p-4 border-t md:border-t-0 border-slate-200 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                <FileCheck2 size={15} className="text-purple-600" aria-hidden="true" />
                <span>Live Invoice Draft</span>
              </div>
              {currentDraft && (
                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold uppercase">
                  {currentDraft.missingFields.length === 0 ? 'Ready' : 'In Progress'}
                </span>
              )}
            </div>

            {!currentDraft ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-400">
                <p>No draft data yet.</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Send a message describing customer and work to build your draft in real-time.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {/* Customer Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 text-[11px] uppercase tracking-wide">
                      <User size={12} className="text-slate-400" aria-hidden="true" />
                      Client
                    </span>
                    {currentDraft.customer?.isExisting ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        Directory Match
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        New Contact
                      </span>
                    )}
                  </div>

                  <div className="font-bold text-slate-900 text-sm">
                    {currentDraft.customer?.name || (
                      <span className="text-amber-600 italic">Missing client name</span>
                    )}
                  </div>
                  {currentDraft.customer?.email && (
                    <div className="text-slate-500 text-[11px] mt-0.5">{currentDraft.customer.email}</div>
                  )}
                  {currentDraft.customer?.billingAddress && (
                    <div className="text-slate-500 text-[11px] mt-0.5 line-clamp-2">
                      {currentDraft.customer.billingAddress}
                    </div>
                  )}
                </div>

                {/* Dates Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="flex items-center gap-1 text-slate-400 mb-0.5">
                      <Calendar size={11} aria-hidden="true" /> Issue Date
                    </span>
                    <span className="font-semibold text-slate-800">{currentDraft.issueDate}</span>
                  </div>
                  <div>
                    <span className="flex items-center gap-1 text-slate-400 mb-0.5">
                      <Calendar size={11} aria-hidden="true" /> Due Date
                    </span>
                    <span className="font-semibold text-slate-800">{currentDraft.dueDate}</span>
                  </div>
                </div>

                {/* Line Items Card */}
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="flex items-center gap-1 font-semibold text-slate-700 text-[11px] uppercase tracking-wide">
                      <Layers size={12} className="text-slate-400" aria-hidden="true" />
                      Line Items ({currentDraft.lineItems.length})
                    </span>
                  </div>

                  {currentDraft.lineItems.length === 0 ? (
                    <p className="text-amber-600 text-xs italic">No line items extracted yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {currentDraft.lineItems.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs"
                        >
                          <div className="font-semibold text-slate-800">{item.description}</div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                            <span>
                              {item.quantity} {item.unit} @ ${item.unitRate.toFixed(2)}
                            </span>
                            <span className="font-bold text-slate-900">
                              {formatCurrency(item.lineTotal, business.defaultCurrency)}
                            </span>
                          </div>
                          {item.rateRequiresConfirmation && (
                            <div className="mt-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                              Requires rate confirmation
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Totals Summary */}
                  <div className="mt-3 border-t border-slate-100 pt-2 space-y-1 text-xs">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(currentDraft.subtotal, business.defaultCurrency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>{business.defaultTaxLabel || 'GST'} ({business.defaultTaxRate || 10}%):</span>
                      <span>{formatCurrency(currentDraft.taxAmount, business.defaultCurrency)}</span>
                    </div>
                    <div className="flex justify-between font-extrabold text-blue-700 text-sm border-t border-slate-200 pt-1">
                      <span>Grand Total:</span>
                      <span>{formatCurrency(currentDraft.grandTotal, business.defaultCurrency)}</span>
                    </div>
                  </div>
                </div>

                {/* Missing / Uncertain Fields Feedback */}
                {currentDraft.missingFields.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="flex items-center gap-1 font-bold text-amber-800 mb-1">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>Missing Information</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                      {currentDraft.missingFields.map((field, i) => (
                        <li key={i}>{field}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Apply Button */}
                <button
                  type="button"
                  onClick={handleApplyToInvoiceBuilder}
                  disabled={currentDraft.lineItems.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-98 disabled:opacity-40"
                >
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Apply to Invoice Builder</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
