# Vinchurkar Jewellers Billing Software

A modern, fast, and secure desktop web billing and invoicing system designed specifically for **Vinchurkar Jewellers**.

---

## Features

- **Automated Jewellery Billing**:
  - Live calculation for Gold & Silver jewellery with Gross weight, Net weight, and Stone weight deductions.
  - Flexible Making Charges: Fixed (₹), Percentage (% of gold value), or Per Gram (₹/g).
  - GST Calculation: Supports Intra-state (CGST + SGST split) and Inter-state (IGST).
  - Automatic rounding to the nearest rupee.
  - Amount in words generated in Indian numbering format (Lakhs, Crores).
- **Official Golden Logo Integration**:
  - Embedded golden medallion logo printed on top of every receipt and displayed in the application header.
- **Embedded In-Page PDF Bill Viewer & Instant Printing**:
  - Live preview and generation of professional PDF retail tax invoices.
  - Embedded direct PDF viewer that bypasses browser popup blockers.
- **Owner Security**:
  - Fixed credential owner authentication to prevent unauthorized access.
  - Automatic session timeout locking after 5 minutes of inactivity.
- **Dashboard & Analytics**:
  - Sales summary, today's sales, monthly trends, and customer invoice history.
  - Invoice search, cancellation with audit trail, and CSV reports export.

---

## Tech Stack

- **Backend**: Node.js, Express, SQLite (`node:sqlite`)
- **PDF Generation**: PDFKit
- **Frontend**: Vanilla JavaScript, Responsive CSS

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your credentials and port (default `3000`) are set.

### 3. Run the Application
```bash
npm start
```
Open your browser at `http://localhost:3000`.

### 4. Run Tests
```bash
npm test
```
All unit and financial calculation tests are covered.
