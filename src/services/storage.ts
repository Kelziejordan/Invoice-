import { BusinessProfile, Client, Item, Invoice, TemplateSettings, ConversationMessage, BuddyInvoiceDraft } from '../types';

const DB_NAME = 'InvoiceStudio2_DB';
const DB_VERSION = 2;

/**
 * Production initial default profile.
 * Intended initial business configuration: Alberta, Canada.
 * Configured: Currency: CAD, Country: Canada, Jurisdiction: Alberta, Tax label: GST, Rate: 5%.
 */
export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  name: '',
  contactEmail: '',
  phone: '',
  address: '',
  website: '',
  taxId: '',
  logoDataUrl: '',
  paymentInstructions: '',
  defaultCurrency: 'CAD',
  defaultTaxLabel: 'GST',
  defaultTaxRate: 5.0,
  country: 'Canada',
  jurisdiction: 'Alberta',
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1001
};

export const DEFAULT_TEMPLATE: TemplateSettings = {
  accentColor: '#2563eb',
  fontFamily: 'Inter, sans-serif',
  logoPosition: 'left',
  footerNote: 'Thank you for your business. Please remit payment by the due date.'
};

export function isProfileConfigured(profile: BusinessProfile | null | undefined): boolean {
  if (!profile) return false;
  return Boolean(profile.name && profile.name.trim().length > 0);
}

export class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  public async openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported in this browser environment.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('business')) {
          db.createObjectStore('business', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('clients')) {
          const clientStore = db.createObjectStore('clients', { keyPath: 'id' });
          clientStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('name', 'name', { unique: false });
        }
        if (!db.objectStoreNames.contains('invoices')) {
          const invStore = db.createObjectStore('invoices', { keyPath: 'id' });
          invStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
          invStore.createIndex('status', 'status', { unique: false });
          invStore.createIndex('createdAt', 'createdAt', { unique: false });
          invStore.createIndex('clientId', 'clientId', { unique: false });
        }
        if (!db.objectStoreNames.contains('template')) {
          db.createObjectStore('template', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('buddy_draft')) {
          db.createObjectStore('buddy_draft', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message || 'Unknown database error'}`));
      };

      request.onblocked = () => {
        console.warn('IndexedDB blocked: please close other active tabs running Invoice Studio 2.');
      };
    });

    return this.dbPromise;
  }

  /**
   * Executes an operation inside a durable, transaction-aware IndexedDB transaction.
   * Guarantees atomic persistence: the returned Promise resolves ONLY when
   * `IDBTransaction.oncomplete` fires, ensuring all changes are committed to disk.
   * If any request errors, the transaction aborts, or quota is exceeded,
   * the Promise rejects and all uncommitted changes roll back.
   */
  public async runTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore, tx: IDBTransaction) => IDBRequest<T> | IDBRequest | void | unknown
  ): Promise<T>;
  public async runTransaction<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    operation: (stores: Record<string, IDBObjectStore>, tx: IDBTransaction) => IDBRequest<T> | IDBRequest | void | unknown
  ): Promise<T>;
  public async runTransaction<T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    operation: (stores: any, tx: IDBTransaction) => IDBRequest<T> | IDBRequest | void | unknown
  ): Promise<T> {
    const db = await this.openDB();
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];

    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = db.transaction(names, mode);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          reject(new Error('Local storage quota exceeded. Please export a backup and delete older items.'));
        } else {
          reject(err);
        }
        return;
      }

      let result: T;
      let requestError: DOMException | Error | null = null;
      let settled = false;

      const safeReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        const finalErr =
          err instanceof Error
            ? err
            : new Error(typeof err === 'string' ? err : 'IndexedDB operation failed.');
        reject(finalErr);
      };

      const safeResolve = (val: T) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };

      // 1. tx.oncomplete: Resolves ONLY when the full transaction commits to disk
      tx.oncomplete = () => {
        if (requestError) {
          safeReject(requestError);
        } else {
          safeResolve(result);
        }
      };

      // 2. tx.onabort: Transaction aborted; changes rolled back
      tx.onabort = () => {
        const abortErr =
          tx.error ||
          requestError ||
          new Error(`IndexedDB transaction on [${names.join(', ')}] was aborted.`);
        safeReject(abortErr);
      };

      // 3. tx.onerror: Transaction level failure
      tx.onerror = () => {
        if (tx.error && tx.error.name === 'QuotaExceededError') {
          safeReject(new Error('Local storage quota exceeded. Please export a backup and delete older items.'));
        } else {
          safeReject(
            tx.error ||
              requestError ||
              new Error(`IndexedDB transaction on [${names.join(', ')}] failed.`)
          );
        }
      };

      try {
        let targetParam: IDBObjectStore | Record<string, IDBObjectStore>;
        if (Array.isArray(storeNames)) {
          const map: Record<string, IDBObjectStore> = {};
          for (const name of names) {
            map[name] = tx.objectStore(name);
          }
          targetParam = map;
        } else {
          targetParam = tx.objectStore(storeNames);
        }

        const opResult = operation(targetParam, tx);

        // If an IDBRequest is returned, capture its result and error
        if (opResult && typeof opResult === 'object' && 'onsuccess' in opResult) {
          const req = opResult as IDBRequest<T>;
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => {
            requestError =
              req.error ||
              new Error(`IndexedDB request on [${names.join(', ')}] failed.`);
          };
        }
      } catch (err: unknown) {
        try {
          tx.abort();
        } catch {
          // tx may already be closing or aborted
        }
        safeReject(err);
      }
    });
  }

  // --- Business Profile ---
  async getBusinessProfile(): Promise<BusinessProfile> {
    const row = await this.runTransaction<{ key: string; value: BusinessProfile } | undefined>(
      'business',
      'readonly',
      (store) => store.get('profile')
    );
    return row ? row.value : DEFAULT_BUSINESS_PROFILE;
  }

  async saveBusinessProfile(profile: BusinessProfile): Promise<void> {
    await this.runTransaction<void>('business', 'readwrite', (store) => {
      store.put({ key: 'profile', value: profile });
    });
  }

  // --- Template Settings ---
  async getTemplateSettings(): Promise<TemplateSettings> {
    const row = await this.runTransaction<{ key: string; value: TemplateSettings } | undefined>(
      'template',
      'readonly',
      (store) => store.get('settings')
    );
    return row ? row.value : DEFAULT_TEMPLATE;
  }

  async saveTemplateSettings(settings: TemplateSettings): Promise<void> {
    await this.runTransaction<void>('template', 'readwrite', (store) => {
      store.put({ key: 'settings', value: settings });
    });
  }

  // --- Clients ---
  async getAllClients(): Promise<Client[]> {
    return this.runTransaction<Client[]>('clients', 'readonly', (store) => store.getAll());
  }

  async getClientById(id: string): Promise<Client | undefined> {
    return this.runTransaction<Client | undefined>('clients', 'readonly', (store) => store.get(id));
  }

  async saveClient(client: Client): Promise<void> {
    await this.runTransaction<void>('clients', 'readwrite', (store) => {
      store.put(client);
    });
  }

  async saveClients(clients: Client[]): Promise<void> {
    await this.runTransaction<void>('clients', 'readwrite', (store) => {
      for (const client of clients) {
        store.put(client);
      }
    });
  }

  async deleteClient(id: string): Promise<void> {
    await this.runTransaction<void>('clients', 'readwrite', (store) => {
      store.delete(id);
    });
  }

  // --- Items ---
  async getAllItems(): Promise<Item[]> {
    return this.runTransaction<Item[]>('items', 'readonly', (store) => store.getAll());
  }

  async getItemById(id: string): Promise<Item | undefined> {
    return this.runTransaction<Item | undefined>('items', 'readonly', (store) => store.get(id));
  }

  async saveItem(item: Item): Promise<void> {
    await this.runTransaction<void>('items', 'readwrite', (store) => {
      store.put(item);
    });
  }

  async saveItems(items: Item[]): Promise<void> {
    await this.runTransaction<void>('items', 'readwrite', (store) => {
      for (const item of items) {
        store.put(item);
      }
    });
  }

  async deleteItem(id: string): Promise<void> {
    await this.runTransaction<void>('items', 'readwrite', (store) => {
      store.delete(id);
    });
  }

  // --- Invoices ---
  async getAllInvoices(): Promise<Invoice[]> {
    return this.runTransaction<Invoice[]>('invoices', 'readonly', (store) => store.getAll());
  }

  async getInvoiceById(id: string): Promise<Invoice | undefined> {
    return this.runTransaction<Invoice | undefined>('invoices', 'readonly', (store) => store.get(id));
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    await this.runTransaction<void>('invoices', 'readwrite', (store) => {
      store.put(invoice);
    });
  }

  async saveInvoices(invoices: Invoice[]): Promise<void> {
    await this.runTransaction<void>('invoices', 'readwrite', (store) => {
      for (const inv of invoices) {
        store.put(inv);
      }
    });
  }

  async deleteInvoice(id: string): Promise<void> {
    await this.runTransaction<void>('invoices', 'readwrite', (store) => {
      store.delete(id);
    });
  }

  /**
   * Atomically persists an invoice and updates the business profile in a single transaction.
   * Guarantees both stores commit together when tx.oncomplete fires.
   */
  async saveInvoiceWithBusinessProfile(invoice: Invoice, business: BusinessProfile): Promise<void> {
    await this.runTransaction<void>(['invoices', 'business'], 'readwrite', (stores) => {
      stores.invoices.put(invoice);
      stores.business.put({ key: 'profile', value: business });
    });
  }

  // --- Buddy Draft Recovery ---
  async getBuddyDraft(): Promise<{ messages: ConversationMessage[]; currentDraft: BuddyInvoiceDraft | null } | null> {
    const row = await this.runTransaction<{ key: string; messages: ConversationMessage[]; currentDraft: BuddyInvoiceDraft | null } | undefined>(
      'buddy_draft',
      'readonly',
      (store) => store.get('active_draft')
    );
    return row ? { messages: row.messages, currentDraft: row.currentDraft } : null;
  }

  async saveBuddyDraft(messages: ConversationMessage[], currentDraft: BuddyInvoiceDraft | null): Promise<void> {
    await this.runTransaction<void>('buddy_draft', 'readwrite', (store) => {
      store.put({ key: 'active_draft', messages, currentDraft, updatedAt: new Date().toISOString() });
    });
  }

  async clearBuddyDraft(): Promise<void> {
    await this.runTransaction<void>('buddy_draft', 'readwrite', (store) => {
      store.delete('active_draft');
    });
  }

  // --- Atomic Restore Operation ---
  async restoreWorkspaceData(data: {
    business: BusinessProfile;
    clients: Client[];
    items: Item[];
    invoices: Invoice[];
    template: TemplateSettings;
  }): Promise<void> {
    const storeNames = ['business', 'clients', 'items', 'invoices', 'template', 'buddy_draft'];
    await this.runTransaction<void>(storeNames, 'readwrite', (stores) => {
      // 1. Clear stores
      for (const name of storeNames) {
        stores[name].clear();
      }

      // 2. Repopulate all stores within the same atomic transaction
      stores.business.put({ key: 'profile', value: data.business });
      stores.template.put({ key: 'settings', value: data.template });

      for (const c of data.clients) {
        stores.clients.put(c);
      }

      for (const it of data.items) {
        stores.items.put(it);
      }

      for (const inv of data.invoices) {
        stores.invoices.put(inv);
      }
    });
  }

  // --- Full Wipe ---
  async clearAllData(): Promise<void> {
    const storeNames = ['business', 'clients', 'items', 'invoices', 'template', 'buddy_draft'];
    await this.runTransaction<void>(storeNames, 'readwrite', (stores) => {
      for (const name of storeNames) {
        stores[name].clear();
      }
    });
  }
}

export const storage = new StorageService();
