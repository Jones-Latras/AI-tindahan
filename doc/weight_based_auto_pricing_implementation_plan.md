# Implementation Plan: Weight-Based Auto-Pricing Feature

## Overview
Step-by-step technical and product implementation plan for the MVP feature (updated: simplified derived pricing + margin-based auto pricing).

---

## Phase 1: Foundation Setup

### Step 1 — Database Design
- Add fields to `products` table:
  - `is_weight_based` (boolean)
  - `pricing_mode` (enum: derived | direct)
  - `pricing_strategy` (enum: manual | margin_based) ← NEW
  - `total_kg_available`
  - `cost_price_total`
  - `selling_price_total`
  - `cost_price_per_kg`
  - `selling_price_per_kg`
  - `target_margin_percent` ← NEW
  - `computed_price_per_kg`
- Ensure precision uses DECIMAL(10,4)

### Step 2 — Backend Models & Validation
- Create Product model logic
- Add validation rules:
  - selling price > cost price (if manual)
  - margin > 0 and < 100 (if margin-based)
  - total kg > 0
- Add computed field logic:
  - derived mode → price per kg = selling_price_total ÷ total_kg_available
  - margin-based → auto compute selling price

---

## Phase 2: Core Pricing Engine

### Step 3 — Pricing Computation Functions
- Implement:
  - `computePricePerKg()`
  - `computeTransactionTotal(weight, pricePerKg)`
  - `computeProfitMargin()`
  - `computeSellingPriceFromMargin(cost, margin)` ← NEW

- Margin Formula:
  - selling_price = cost_price ÷ (1 - margin)

- Ensure:
  - internal precision preserved
  - output rounded to 2 decimals

### Step 4 — Unit Testing
- Test cases:
  - derived vs direct
  - manual vs margin-based
  - decimal weights
  - edge cases (0, invalid input)

---

## Phase 3: Product Setup UI

### Step 5 — Weight Toggle UI
- Add toggle: “Sold by Weight”
- Conditional rendering of pricing modes

### Step 6 — Pricing Mode Forms
- Derived Mode:
  - inputs: total kg available, total cost price
- Direct Mode:
  - inputs: cost per kg

### Step 7 — Pricing Strategy Selector (NEW)
- Toggle or dropdown:
  - Manual Pricing
  - Margin-Based Pricing

### Step 8 — Margin-Based Inputs (NEW)
- If margin-based:
  - input: target margin (%)
  - system auto computes selling price

### Step 9 — Live Computation UI
- Display:
  - computed price per kg
  - profit margin
- Recalculate on input change

### Step 10 — Validation UX
- Inline errors
- Disable save if invalid

---

## Phase 4: POS Integration

### Step 11 — Product List UI
- Show ⚖ icon
- Show price per kg
- Add Quick Edit button

### Step 12 — Weight Input Modal
- Input field (decimal supported)
- Live preview calculation
- Confirm / Cancel actions

### Step 13 — Cart Integration
- Store:
  - weight
  - price per kg
  - total

---

## Phase 5: Quick Edit Feature

### Step 14 — Quick Edit Modal
- Input: new price per kg OR margin (configurable)
- Show current values
- Save instantly updates product

### Step 15 — Permission Control
- Only owner/admin can edit

---

## Phase 6: Receipt System

### Step 16 — Receipt Format Update
- Include:
  - product name
  - weight
  - price per kg
  - total

---

## Phase 7: Performance & Offline Support

### Step 17 — Optimization
- Ensure calculations < 100ms

### Step 18 — Offline Handling
- Cache product pricing locally
- Sync when online

---

## Phase 8: Testing & QA

### Step 19 — Manual Testing
- Simulate real store flow

### Step 20 — User Testing
- Measure:
  - checkout time
  - error rate

---

## Phase 9: Deployment

### Step 21 — Rollout Strategy
- Enable feature flag
- Gradual rollout

### Step 22 — Monitoring
- Track:
  - errors
  - usage
  - performance

---

## Phase 10: Post-MVP Enhancements (Optional)

- Scale integration
- Price history
- Inventory tracking

---

## End of Plan

