# Invoice Studio 2 (v1.5 Release)

A complete, production-grade, mobile-first, offline-first web application with a built-in on-device small language model ("Invoice Buddy") for small businesses, freelancers, and independent service providers.

---

## Executive Overview

**Invoice Studio 2** is engineered to help small businesses create, manage, print, and export professional invoices from mobile phones, tablets, or desktop browsers without requiring external servers, user accounts, subscription fees, or paid cloud AI APIs.

### Core Capabilities:
- **100% Offline-First:** Operating completely from local browser storage (IndexedDB) with Web App Manifest and Service Worker support.
- **Built-in On-Device LLM ("Invoice Buddy"):** Powered by an ONNX-quantized `Xenova/flan-t5-small` model running locally in a Web Worker via WebAssembly. Requires **zero API keys**.
- **Sticky & Floating Save Controls:** Consistent floating action buttons on all setup and invoice creation screens for effortless mobile and desktop scrolling usability.
- **Single-Page Printable Invoice & PDF Engine:** High-fidelity CSS `@media print` rules and compact single-page layout designed so completed invoices automatically fit onto a single A4 page.
- **Precision Financial Calculation Engine:** Floating-point safe rounding (`Math.round((n + Number.EPSILON) * 100) / 100`) handling quantities, unit rates, line totals, tax-exempt items, fixed/percentage discounts, and custom tax labels.
- **Cryptographic Backup & Restoration:** Single-click SHA-256 integrity-verified JSON backup and atomic workspace restoration.

---

## Detailed Feature Breakdown

### 1. Business Profile & Branding
- **Company Identity:** Business name, contact email, phone number, billing address, tax/business registration ID (e.g., GST/HST #), country, and jurisdiction.
- **Offline Logo Storage:** Upload custom business logos (PNG/JPEG/SVG, up to 1MB) stored locally as Base64 data URLs in IndexedDB.
- **Default Currency & Tax Setup:** Pre-configured for Alberta, Canada (`CAD` currency, `GST` tax label, `5.0%` default rate), customizable to any world currency or tax structure (`VAT`, `Sales Tax`, `HST`, `PST`).
- **Default Payment Instructions:** Reusable bank transfer details, wire instructions, Interac e-Transfer notes, or payment terms.
- **Template Customization:** Accent color picker, font family options, and customizable footer notes.

### 2. Client Directory
- **Client Management:** Create, edit, search, and delete client contacts.
- **Saved Details:** Stores client/company name, contact email, phone number, billing address, and internal notes (e.g., account manager or preferred PO format).
- **Snapshot Immutability:** Historical invoices store a full snapshot of client details at the time of issuance, ensuring future updates to a client profile do not alter past legal invoice records.

### 3. Item & Service Catalogue
- **Product & Service Library:** Catalog of standard service offerings or products with name, default description, unit (`hours`, `days`, `units`, `items`, `sqm`, `trips`, `licenses`), default unit rate, and taxability flag.
- **One-Tap Population:** Select saved items during invoice creation to automatically fill line item descriptions, units, unit rates, and tax status.

### 4. Mobile-First Invoice Builder
- **Guided Creation Flow:** Step-by-step selection of clients, dates, line items, discounts, tax, notes, and payment instructions.
- **Auto-Sequence Numbering:** Configurable prefix (`INV-`) with safe number sequence parsing and auto-incrementing.
- **Timezone-Safe Payment Terms:** Instant calculation of due dates for `Due on receipt`, `7 days`, `14 days`, `30 days`, `60 days`, `Net X`, or `End of Month (EOM)` with leap-year protection.
- **Sticky Floating Save UX:** Persistent, accessible floating "Save Invoice" button on the bottom-right of the screen (`fixed bottom-20 right-4 sm:bottom-8 sm:right-8 z-30`), ensuring users can save without scrolling back to top.

### 5. Invoice Lifecycle & Payment Tracking
- **Lifecycle Statuses:** `draft`, `sent`, `paid`, `overdue`, and `cancelled`.
- **Payment Recording:** Modal dialog for recording payments received, capturing payment date and amount received, displayed with status badges.

### 6. Single-Page Print & PDF Export Engine
- **Single-Page Guarantee:** Typography, padding, row heights, and container dimensions are dynamically scaled so that complete invoices fit on **exactly one page** when saved as PDF or printed.
- **Print Optimization (`@media print`):**
  - Page margin: `8mm` on A4 portrait.
  - Hides UI navigation bars, header tabs, and floating action buttons (`.no-print`).
  - Strict page-break prevention (`page-break-inside: avoid; break-inside: avoid; max-height: 275mm`).

### 7. Cryptographic Backup & Restore
- **Export Backup:** Encapsulates business profile, client directory, item library, invoices, template settings, and active drafts into a single JSON file.
- **SHA-256 Integrity Verification:** Includes a `checksumSha256` hash generated over the payload. Modifying backup JSON contents invalidates the checksum and prevents corruption.
- **Atomic Multi-Store Restoration:** Restores data in a single IndexedDB transaction across all stores (`business`, `clients`, `items`, `invoices`, `template`, `buddy_draft`). Automatically aborts and rolls back if an error occurs.

---

## Built-In On-Device LLM ("Invoice Buddy")

**Invoice Buddy** is an offline, multi-turn conversational AI assistant that extracts customer names, line item descriptions, quantities, unit rates, payment terms, and dates from natural language prompts (e.g., *"Invoice Sarah Jenkins for 4.5 hours of garden maintenance at $65/hr plus $90 waste disposal, due in 14 days"*).

### Neural Engine Specifications:
- **Model Identity:** `Xenova/flan-t5-small`
- **Format:** Quantized 8-bit ONNX (`q8`)
- **Model Weight Size:** ~60 MB
- **Runtime:** `@xenova/transformers` / ONNX WebAssembly running inside a dedicated browser Web Worker (`llm.worker.ts`).
- **API Key Requirement:** **Zero API keys required**. Runs entirely on-device.
- **Offline Behavior:** Model weights are fetched once on initial request and stored indefinitely in browser `CacheStorage` / `IndexedDB`. All subsequent prompts execute 100% offline.
- **Automatic Initialization:** Opening the Invoice Buddy modal automatically triggers downloading and model initialization without requiring manual clicks. Progress is displayed in real-time (`Downloading weights: X%`).
- **Structured Guardrails & Provenance:**
  - Assistant messages explicitly record provenance (`local-model` vs `deterministic-fallback`).
  - Model proposals pass through a deterministic entity matcher and tax validator to prevent hallucinated client details or rates.
  - Calculated totals and tax amounts are strictly computed by the authoritative calculation engine.

---

## Architecture & Data Persistence

### Database Schema (IndexedDB `InvoiceStudio2_DB`, Version 2):
- **`business`**: Stores business profile metadata, payment instructions, and Base64 logo.
- **`clients`**: Object store with `id` key path for client directory records.
- **`items`**: Object store with `id` key path for catalog items.
- **`invoices`**: Object store with `id` key path and indexes on `clientId`, `invoiceNumber`, `status`, `issueDate`, and `updatedAt`.
- **`template`**: Object store holding template styling preferences (accent color, font family, footer notes).
- **`buddy_draft`**: Object store persisting unfinished conversational messages and live invoice draft state.

### Transaction-Aware Storage Layer (`src/services/storage.ts`):
All database mutation methods await full completion of `IDBTransaction.oncomplete` before resolving promises, ensuring atomic data commits to disk across unexpected tab or browser closes.

---

## Installation & Development Setup

### System Requirements:
- **Node.js:** >= 18.0.0
- **npm:** >= 9.0.0
- **Supported Browsers:** Chrome >= 95, Safari >= 16.4, Firefox >= 115, Edge >= 95

### 1. Install Dependencies
```bash
npm install
```

### 2. Launch Local Development Server
```bash
npm run dev
```
Open your browser to `http://localhost:3000`.

### 3. Run Automated Tests
```bash
npm run test
```

### 4. Build for Production
```bash
npm run build
```

---

## Automated Test & Verification Suite

The repository includes 10 Vitest test suites comprising **61 automated tests**:

1. `tests/aiIntegration.test.ts` (9 tests): Validates local LLM execution, model output feeding into turn parsing, proposal changes, numeric guardrails, missing info handling, and fallback behavior.
2. `src/tests/invoice-workflow.test.ts` (4 tests): Verifies end-to-end invoice creation, catalog item population, sequence numbering, calculation validation, and storage persistence.
3. `tests/acceptance.test.ts` (18 tests): Tests core acceptance criteria for profile, client, item, invoice creation, and PDF print layout constraints.
4. `tests/storage.test.ts` (7 tests): Validates transaction-aware IndexedDB persistence, atomic multi-store writes, and draft recovery.
5. `tests/calc.test.ts` (5 tests): Verifies floating-point safe line total, subtotal, discount, and tax calculations.
6. `tests/buddyEngine.test.ts` (4 tests): Tests natural language instruction parsing, entity matching, and rule validation.
7. `tests/backup.test.ts` (5 tests): Verifies SHA-256 integrity backup generation, valid parsing, corrupted backup rejection, and atomic restoration rollback.
8. `tests/lifecycle.test.ts` (1 test): Verifies status transitions (`draft` -> `sent` -> `paid` -> `overdue` -> `cancelled`).
9. `tests/llmSafety.test.ts` (4 tests): Validates character length limits (500 chars), timeout enforcement (30s), and error recovery.
10. `tests/numbering.test.ts` (4 tests): Tests invoice prefix formatting, sequence incrementing, and collision prevention.

---

## License

Created for Invoice Studio 2. Built with React, TypeScript, Tailwind CSS, Vite, Vitest, and `@xenova/transformers`.

