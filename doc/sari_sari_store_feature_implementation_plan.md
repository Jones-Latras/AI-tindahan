# TindaHan AI Sari-Sari Feature Implementation Plan

## Purpose

This document is a grounded, step-by-step roadmap for adding the following sari-sari-store features to the current TindaHan AI codebase:

1. Tingi / repacking inventory logic
2. Better partial utang payment tracking
3. A palengke restock shopping list
4. Bottle deposit / empty bottle tracking
5. Expense tracking with a dedicated Expenses tab

The goal is not just to add UI. The goal is to make these features reliable across:

- local SQLite storage
- cloud sync / restore
- sales checkout
- product management
- customer ledger history
- home analytics
- Aling AI Daily Brief

---

## Progress Tracker

- [x] Phase 1 core slice: payment-event audit trail for utang
- [x] Phase 2: Expenses tab and true net profit
- [x] Phase 3: Restock shopping list
- [x] Phase 4: Tingi / linked inventory
- [x] Phase 5: Bottle deposit tracker
- [x] Phase 6: AI, sync, analytics, receipts, and rollout hardening

---

## Current Codebase Snapshot

The plan below is based on the current repo structure and behavior:

- `app/(tabs)/benta.tsx`
  Current POS / checkout flow.
- `app/(tabs)/produkto.tsx`
  Current product catalog, product create/edit modal, category management, image handling.
- `app/(tabs)/palista.tsx`
  Current customer ledger flow, utang entries, and payment modal.
- `app/(tabs)/index.tsx`
  Current Home / analytics / receipts / AI brief screens.
- `app/(tabs)/_layout.tsx`
  Current bottom-tab navigation with 5 tabs.
- `db/repositories.ts`
  Main database access layer and business logic.
- `types/models.ts`
  Shared domain types.
- `utils/sync.ts`
  Manual Supabase sync / restore.
- `services/ai.ts`
  Aling AI prompt context and fallback brief logic.
- `scripts/supabase-setup.sql`
  Cloud schema bootstrap that will need new tables/columns.

### Important observations from the current implementation

1. Partial utang payments already exist technically.
   - `applyUtangPayment()` already exists in `db/repositories.ts`.
   - `palista.tsx` already opens a payment modal and applies a partial payment amount.
   - What is still missing is a proper payment-event history and a more visible "Log Payment" entry point.

2. Profit is currently incomplete.
   - `getHomeMetrics()` computes `todayProfitCents` from `sale_items.line_total_cents - line_cost_total_cents`.
   - There is no expense table yet, so current profit is closer to gross item margin than true net profit.

3. The app already has weight-based product logic.
   - Products already support `isWeightBased`, `totalKgAvailable`, and price-per-kg modes.
   - That is useful for rice/sugar repacking, but it is not enough for general "Tingi" because cigarettes, canned drinks, eggs, sachets, and repacked items require conversion rules and linked stock.

4. Sync currently covers only these local tables:
   - `products`
   - `customers`
   - `app_settings`
   - `sales`
   - `sale_items`
   - `utang`

5. Navigation is already crowded.
   - The bottom tab bar currently has 5 tabs: Home, Stock, Sales, Customers, Settings.
   - Adding an Expenses tab directly will force a navigation decision.

---

## Recommended Implementation Order

This is the recommended delivery order based on impact, risk, and current code reuse.

### Phase 0: Foundation decisions and schema preparation

Do first before shipping any of the new features.

### Phase 1: Partial utang payment history and UI polish

Do first because most of the backend is already present, and it immediately solves a real owner pain point.

Current implementation progress:

- [x] Local SQLite payment-event table planned and implemented
- [x] Existing utang paid amounts migrated into payment history
- [x] Partial payments now write audit rows transactionally
- [x] Customer detail now shows payment history with timestamps
- [x] Payment modal now has quick amount chips
- [x] Sync / restore and Supabase schema updated for payment events

### Phase 2: Expenses tab and real net profit

Do second because it unlocks more accurate analytics and improves the AI daily brief.

### Phase 3: Restock shopping list

Do third because it reuses low-stock data that already exists and gives quick operational value.

### Phase 4: Tingi / linked inventory

Do fourth because it is high-value but the most complex inventory architecture change.

### Phase 5: Bottle deposit tracker

Do fifth because it depends on better sale-linked obligations and customer follow-up patterns.

### Phase 6: AI, sync, analytics, receipts, and rollout hardening

Do last after the feature-specific flows are stable.

---

## Phase 0: Foundation Decisions and Shared Architecture

Current implementation progress:

- [x] Step 0.1 navigation strategy has been decided and implemented
- [x] Step 0.2 migration / sync planning has been applied for the shipped Phase 1 and Phase 2 slices
- [x] Step 0.3 slice-based rollout is active, with slices 1 and 2 completed

### Step 0.1: Decide the navigation strategy for Expenses

Current issue:

- The bottom tab bar already has 5 tabs.
- A 6th bottom tab will feel cramped on smaller phones.

Recommended approach:

1. [x] Replace the current `Settings` bottom tab with a new `Expenses` tab.
2. [x] Move `Settings` into one of these locations:
   - [x] a header gear button from Home
   - [ ] Home screen overflow / utility shortcut
   - [ ] a nested route outside the bottom tab bar

Why this is recommended:

- Sales, Stock, Customers, Home, and Expenses are daily-use operational screens.
- Settings is lower-frequency and does not need permanent bottom-tab priority.

Files affected:

- `app/(tabs)/_layout.tsx`
- `app/(tabs)/index.tsx`
- `constants/translations.ts`
- add new route such as `app/settings.tsx` or convert `app/(tabs)/settings.tsx` into a non-tab route

### Step 0.2: Add migration planning for local SQLite and Supabase

Before adding UI, define:

- [x] every new table for the shipped slices
- [x] every new column / metric field for the shipped slices
- [x] default values
- [x] migration behavior for existing users
- [x] sync / restore behavior

This must happen in:

- local SQLite bootstrap / migration logic inside `db/repositories.ts`
- `scripts/supabase-setup.sql`
- `utils/sync.ts`

### Step 0.3: Add a "feature slices" rollout rule

Do not implement all five features in one giant branch.

Recommended slices:

1. [x] Payment-event tracking for utang
2. [x] Expenses tab + net profit math
3. [x] Restock list
4. [x] Tingi count-based linking
5. [x] Tingi repack sessions
6. [x] Bottle deposit tracker
7. [x] AI + sync + analytics polish

---

## Phase 1: Partial Utang Payments That Preserve Exact Payment History

### Problem

The app currently stores:

- `utang.amount_cents`
- `utang.amount_paid_cents`
- `utang.paid_at`

This is enough to know the remaining balance, but not enough to preserve each separate partial payment event.

That means the owner cannot reliably prove:

- "Mang Bert paid ₱300 last payday"
- "Aling Bebang gave ₱100 last Tuesday"
- "How many separate payments did this customer already make?"

### Current status

- [x] `applyUtangPayment()` in `db/repositories.ts`
- [x] payment modal in `app/(tabs)/palista.tsx`
- [x] payment-event audit trail
- [x] clearer timeline that mixes credit entries and payment events
- [x] more visible `Log Payment` action on unpaid ledger entries
- [ ] top action row `Log Payment` entry point in the customer detail sheet
- [ ] receipt-like confirmation summary after saving a payment

### Recommended data model

Keep the current `utang` table as the balance summary table, but add a new `utang_payments` table.

#### New table: `utang_payments`

Columns:

- `id`
- `utang_id`
- `customer_id`
- `amount_cents`
- `created_at`
- `note`
- `source`
  Suggested values:
  - `manual`
  - `migration`
  - `sale_adjustment` (optional future use)
- `synced`

Why this design is better:

- `utang` remains fast for balance queries.
- `utang_payments` gives exact audit history.
- future reporting becomes possible:
  - total payments this week
  - payment habits by customer
  - "last payment made"

### Migration plan

Existing paid amounts need special handling.

Recommended migration rule:

1. [x] Add the new `utang_payments` table.
2. [x] For every `utang` row where `amount_paid_cents > 0`:
   - [x] create one synthetic `utang_payments` row
   - [x] amount = current `amount_paid_cents`
   - [x] created_at = `paid_at` if available, otherwise `created_at`
   - [x] source = `migration`
3. [x] Keep `amount_paid_cents` on the parent `utang` row for fast calculations.

This does not recreate the true historical splits, but it preserves the already-recorded amount instead of losing it.

### Repository changes

Update `db/repositories.ts`:

1. [x] Add migration / table creation for `utang_payments`.
2. [x] Update `applyUtangPayment()` to:
   - [x] insert a new payment-event row
   - [x] then update the parent `utang.amount_paid_cents`
   - [x] set `paid_at` only when the balance reaches zero
3. [ ] Add repository helpers:
   - [ ] `listUtangPayments(utangId)`
   - [ ] `listCustomerPaymentHistory(customerId)`
   - [ ] `getCustomerLastPayment(customerId)`
4. [x] Extend ledger queries to optionally join payment-event info.

### UI changes

Update `app/(tabs)/palista.tsx`:

1. [x] Make `Log Payment` more visible.
   Recommended placements:
   - [ ] top action row in the customer detail sheet
   - [x] on every unpaid ledger card
   - [ ] optional floating primary action inside the detail sheet

2. [x] Add a payment history timeline below each utang entry.
   Example:
   - Credit logged: Mar 10, 8:13 PM, ₱820
   - Payment received: Mar 15, 7:02 PM, ₱300
   - Payment received: Mar 22, 6:11 PM, ₱100
   - Remaining: ₱420

3. [x] Add quick amount chips inside the payment modal.
   Suggested chips:
   - [x] implemented in the current UI, including a `Full` shortcut
   - `₱50`
   - `₱100`
   - `₱200`
   - [x] `Full`

4. [ ] Add a receipt-like confirmation summary after saving.
   Recommended:
   - [ ] applied amount
   - [ ] remaining balance
   - [ ] exact timestamp

### Analytics impact

Use the new payment-event table to improve:

- [ ] customer activity labels
- [ ] risk scoring inputs
- [ ] weekly collection tracking
- [ ] future "who pays regularly" insights

### Sync impact

Update `utils/sync.ts` and Supabase schema to include:

- [x] `utang_payments`

### Definition of done

- [x] A partial payment creates a separate payment-event row.
- [x] The customer detail screen shows payment history clearly.
- [x] The running balance remains correct.
- [x] Sync / restore preserves payment events.

---

## Phase 2: Expenses Tab and True Net Profit

Current implementation progress:

- [x] Added local SQLite `expenses` table and migration
- [x] Added Supabase schema plus sync / restore support for expenses
- [x] Added repository helpers for add / update / delete / list / summary / category breakdown
- [x] Added shared expense types and net-profit metric fields
- [x] Added a new `app/(tabs)/gastos.tsx` screen
- [x] Replaced the bottom-tab `Settings` slot with the new `Gastos` tab
- [x] Kept `Settings` reachable from the Home header instead of the bottom tab bar
- [x] Updated Home analytics to show gross profit, expenses, and net profit
- [x] Added expense context into Aling AI chat and daily brief generation

### Problem

The app tracks:

- money coming in from sales
- money still owed in utang

But it does not track:

- rent
- electricity
- pamasahe for restocking
- plastic bags
- ice, load, delivery fees, snacks for helpers, and other store expenses

So the current "profit" is incomplete.

### Recommendation

Add a dedicated `Expenses` tab, but keep navigation usable by moving `Settings` out of the bottom tab bar.

Implementation status:

- [x] Added a dedicated `Expenses` tab
- [x] Moved `Settings` out of the bottom tab bar

### Recommended route / naming

Because the app uses Taglish route names, the recommended file is:

- [x] `app/(tabs)/gastos.tsx`

Suggested tab label:

- [x] English: `Expenses`
- [x] Taglish: `Gastos`

### Recommended data model

#### New table: `expenses`

Columns:

- [x] `id`
- [x] `category`
- [x] `amount_cents`
- [x] `description`
- [x] `expense_date`
- [x] `created_at`
- [x] `updated_at`
- [x] `synced`

Suggested starter categories:

- Rent
- Electricity
- Pamasahe
- Plastic Bags
- Ice
- Restock Transport
- Supplies
- Other

Optional Phase 2.1 table:

#### `expense_categories`

Only add this if custom categories are needed soon. For v1, a fixed list plus "Other" is enough.

- [ ] `expense_categories`

### Repository changes

Update `db/repositories.ts` with:

- [x] `addExpense()`
- [x] `updateExpense()`
- [x] `deleteExpense()`
- [x] `listExpenses()`
- [x] `getExpenseSummary()`
- [x] `getTodayExpenseTotal()`
- [x] `getExpenseBreakdownByCategory()`

### Metrics changes

Current `todayProfitCents` is gross item-margin profit.

Recommended new metrics:

- [x] `todayGrossProfitCents`
- [x] `todayExpenseCents`
- [x] `todayNetProfitCents`

Do not silently reuse `todayProfitCents` without a plan, because current screens may be assuming that it means gross profit.

Recommended migration path:

1. [x] Add new fields first.
2. [x] Update Home UI labels explicitly.
3. [ ] Later decide whether `todayProfitCents` should be retired or aliased.

### Type changes

Update `types/models.ts`:

- [x] add `Expense`
- [x] add expense-related summary types
- [x] extend `HomeMetrics`
- [x] extend `StoreAiContext`

### UI plan for the Expenses tab

#### Top-level tab

New screen: `app/(tabs)/gastos.tsx`

Recommended layout:

1. [x] Search / filter bar
2. [x] Category chips
3. [x] Today / This Week / This Month summary cards
4. [x] Expense list
5. [x] Primary add-expense button

#### Add expense modal

Fields:

- [x] amount
- [x] category
- [x] description
- [ ] editable date/time

Speed features:

- [x] quick amount chips
- [x] recent categories
- [x] default date = now

### Home / analytics updates

Update `app/(tabs)/index.tsx`:

1. [x] Change profit cards to clearly distinguish:
   - [x] Gross Profit
   - [x] Expenses
   - [x] Net Profit

2. [x] Update the analytics detail panel to include:
   - [x] today expenses
   - [x] weekly expenses
   - [x] top expense categories

3. [ ] Update charts if needed:
   - [ ] revenue vs expenses vs net

### AI daily brief updates

Update `services/ai.ts`:

1. [x] Add expenses into `StoreAiContext`.
2. [x] Update `buildStoreAiPromptContext()` so Aling AI can reason about:
   - [x] today expenses
   - [x] net profit
   - [x] biggest expense categories
3. [x] Update fallback brief logic to mention:
   - [x] "Net profit is lower today because..."
   - [x] "Pamasahe and plastic bag costs are eating into margin..."

### Sync impact

Add sync + restore support for:

- [x] `expenses`
- [ ] optional `expense_categories` if created

### Definition of done

- [x] Store owner can log expenses quickly.
- [x] Home metrics show net profit, not just gross margin.
- [x] AI brief uses expense data.
- [x] Expense records survive backup and restore.

---

## Phase 3: Palengke Restock Shopping List

Current implementation progress:

- [x] SQLite schema added for `restock_lists` and `restock_list_items`
- [x] Shared TypeScript models added for restock list summaries, items, and statuses
- [x] Snapshot-based repository flow added for create, load, toggle, note-save, and archive
- [x] Hidden in-app restock screen added with persistent checklist UI
- [x] Home low-stock card can generate and open restock lists
- [x] Stock screen can open the restock screen directly
- [x] Sync / restore and Supabase schema updated for restock data

### Problem

Owners already know which items are low or out of stock, but they still need to:

- remember them
- write them down
- estimate how much to buy
- keep track while walking around the wholesaler

### Current status

The app already has:

- `minStock` on products
- low-stock queries in `getHomeMetrics()`
- product-velocity context for AI

So the restock list can reuse real data that already exists.

### Recommended scope for v1

Create a generated checklist that includes:

- out-of-stock items
- low-stock items
- current stock
- minimum stock
- suggested restock quantity

### Recommended data model

If the user needs a persistent checklist they can tick off while shopping, do not make it purely derived UI.

#### New tables

##### `restock_lists`

- [x] `id`
- [x] `title`
- [x] `status`
  Suggested:
  - [x] `open`
  - [x] `completed`
  - [x] `archived`
- [x] `created_at`
- [x] `completed_at`
- [x] `synced`

##### `restock_list_items`

- [x] `id`
- [x] `restock_list_id`
- [x] `product_id`
- [x] `product_name_snapshot`
- [x] `current_stock_snapshot`
- [x] `min_stock_snapshot`
- [x] `suggested_quantity`
- [x] `is_checked`
- [x] `checked_at`
- [x] `note`
- [x] `synced`

Why snapshot fields matter:

- Product names and stock may change after the list is generated.
- The shopping list should still preserve what the owner saw at creation time.

### Suggested quantity logic

Start simple in v1.

Suggested quantity can be:

- for normal products:
  - [x] `max(minStock * 2 - currentStock, minStock - currentStock)`
- for weight-based products:
  - [x] recommended target kg above threshold
- later, use product velocity for smarter reorder suggestions

### UI plan

Recommended entry points:

- [x] Home `Restock` shortcut / inventory modal
- [x] Stock screen action button
- [x] Low-stock summary card action row

Recommended screen behavior:

1. [x] Tap `Generate Restock List`
2. [x] App creates a snapshot list from current low / out-of-stock products
3. [x] User sees a checklist view
4. [x] User checks off items while shopping
5. [x] User can reopen unfinished lists later

Recommended checklist row contents:

- [x] product name
- [x] category
- [x] current stock / min stock
- [x] suggested buy quantity
- [x] note field
- [x] checkbox

### Linked-inventory consideration

When Tingi is introduced, the restock list must not list every child item separately.

Examples:

- If Marlboro Stick is low, the list should recommend buying the parent pack/carton.
- If repacked rice pouches are low, the list should recommend bulk rice stock, not just more pouches.

So the restock list should eventually become inventory-pool aware.

### Repository changes

Add:

- [x] `createRestockListFromThresholds()`
- [x] `listRestockLists()`
- [x] `getRestockListById()`
- [x] `toggleRestockListItem()`
- [x] `archiveRestockList()`
- [x] `updateRestockListItemNote()`

### Sync impact

Add:

- [x] `restock_lists`
- [x] `restock_list_items`

### Definition of done

- [x] One tap generates a shopping checklist from low-stock items.
- [x] The checklist is persistent, checkable, and reusable during the trip.
- [x] Later product edits do not corrupt the checklist snapshot.

---

## Phase 4: Tingi and Repacking Logic

Current implementation progress:

- [x] Added shared `inventory_pools` local schema and migration
- [x] Added `product_inventory_links` local schema and migration
- [x] Added `repack_sessions` local schema and migration
- [x] Extended shared product / AI types for linked inventory metadata
- [x] Updated product queries to expose linked inventory stock, thresholds, and pool metadata
- [x] Updated save-product logic to create or reuse pools and preserve primary restock products
- [x] Updated checkout logic so linked sales deduct from shared pools instead of isolated product stock
- [x] Updated low-stock / restock logic to use the shared inventory source and only surface the primary restock item
- [x] Added linked-inventory setup controls to the Stock product modal
- [x] Added repack-session logging UI and recent session history to the Stock screen
- [x] Preserved linked inventory metadata in Sales quick-edit for weight-based products
- [x] Added sync / restore and Supabase schema support for inventory pools, links, and repack sessions

## Why this needs special care

"Tingi" is not one single feature. There are at least two different inventory behaviors:

1. Count-based breakdown
   Example:
   - 1 Marlboro pack = 20 sticks
   - 1 tray of eggs = 30 eggs
   - 1 case of softdrinks = 24 bottles

2. Repacking / bagging
   Example:
   - 50kg rice sack repacked into 1kg bags
   - 1kg sugar bag repacked into 250g bags

These should not be forced into the same simplistic stock field.

### Recommended architecture: inventory pools

The current product model stores stock directly on each product row.

That works for standalone products, but it breaks for linked inventory because:

- selling one child unit should reduce the parent inventory
- multiple sellable products may consume from the same stock source
- integer `stock` is not enough for fraction-based parent consumption

#### Recommended new table: `inventory_pools`

This becomes the source-of-truth stock bucket.

Columns:

- `id`
- `name`
- `base_unit_label`
  Examples:
  - `stick`
  - `gram`
  - `ml`
  - `piece`
- `quantity_available`
- `reorder_threshold`
- `created_at`
- `updated_at`
- `synced`

#### Recommended new table: `product_inventory_links`

Defines how a sellable product consumes from an inventory pool.

Columns:

- `id`
- `product_id`
- `inventory_pool_id`
- `units_per_sale`
  Examples:
  - stick product = `1`
  - pack product = `20`
  - 250g sugar bag = `250`
- `display_unit_label`
  Examples:
  - `stick`
  - `pack`
  - `250g bag`
- `is_primary_restock_product`
- `created_at`
- `synced`

### Why this architecture is recommended

It supports:

- pack and stick sharing the same inventory source
- repacked rice bag and bulk rice sharing the same inventory source
- clean future restock logic
- cleaner analytics and stock accuracy

### Do not do this

Avoid these shortcuts:

- subtracting random decimals from `products.stock`
- reusing `category` for parent-child linking
- treating all repacked items as "weight-based" without a shared stock source

### Sub-phase 4A: Count-based Tingi links

Current implementation progress:

- [x] Count-based shared-pool data model implemented
- [x] Product management UI can switch between standalone and linked inventory
- [x] Product management UI can create or attach to a shared inventory pool
- [x] Products can choose a primary restock parent inside a linked pool
- [x] Linked products now display stock and low-stock state from the shared pool
- [x] Sales checkout now deducts linked inventory using `units_per_sale`

This is the first deliverable.

#### Example behavior

Setup:

- Parent/bulk item: Marlboro Pack
- Child/tingi item: Marlboro Stick
- Conversion: 1 pack = 20 sticks

Behavior:

- selling 1 stick deducts `1` base unit from the shared pool
- selling 1 pack deducts `20` base units
- displayed stock for pack can be shown as:
  - full packs remaining
  - loose sticks remaining

#### Product-management UI changes

In `app/(tabs)/produkto.tsx` add:

1. "Inventory setup" area in product create/edit
2. Option: `Standalone product` or `Linked Tingi item`
3. If linked:
   - choose or create inventory pool
   - choose units per sale
   - choose which product is the restock parent

Status:

- [x] Inventory setup area added
- [x] Standalone vs linked toggle added
- [x] Pool create / attach flow added
- [x] Units-per-sale and display-unit inputs added
- [x] Restock parent selector added

#### Sales UI changes

In `app/(tabs)/benta.tsx`:

- child and parent can both appear as sellable products
- checkout must deduct from the shared inventory pool, not from isolated product rows

Status:

- [x] Parent and child products remain sellable in Sales
- [x] Checkout now deducts from `inventory_pools.quantity_available`
- [x] Quick-edit now preserves linked inventory metadata instead of stripping it

#### Repository changes

Update `checkoutSale()` to:

- detect linked products
- deduct `units_per_sale * quantity_sold` from `inventory_pools.quantity_available`
- still preserve product sale snapshots in `sale_items`

### Sub-phase 4B: Repacking sessions

Current implementation progress:

- [x] Repack session table and repository flow added
- [x] Repack validation prevents invalid source/output combinations
- [x] Stock screen can log a repack session for linked products
- [x] Recent repack history is visible in the repack sheet
- [x] Repack sessions are synced and restorable from Supabase

This is the second deliverable and should come after 4A is stable.

#### Recommended new table: `repack_sessions`

Columns:

- `id`
- `source_product_id`
- `output_product_id`
- `source_quantity_used`
- `output_units_created`
- `wastage_units`
- `created_at`
- `note`
- `synced`

Why repack sessions are important:

- Repacking is not just a sale.
- It is an internal stock transformation.
- The owner needs to log:
  - how much bulk stock was consumed
  - how many smaller units were created
  - any wastage / spoilage / handling loss

#### Repack workflow

Example:

1. Owner opens Rice product
2. Taps `Repack`
3. Inputs:
   - source used: 5kg
   - bag size: 500g
   - output created: 10 bags
   - wastage: 0g or 50g
4. App:
   - deducts source quantity from bulk pool
   - adds new output stock to the child product / shared pool
   - logs the repack session

Status:

- [x] Source and output products are selected from the same shared inventory pool
- [x] Repack sessions log source quantity, output quantity, wastage, timestamp, and note
- [x] Shared-pool quantity is updated during repack logging
- [x] Repack history stays available after backup / restore

### Reporting impact

Tingi and repacking must affect:

- [x] stock visibility
- [x] low-stock alerts
- [x] restock list generation
- [x] cost of goods tracking
- [ ] AI brief explanations

### Sync impact

Add:

- [x] `inventory_pools`
- [x] `product_inventory_links`
- [x] `repack_sessions`

### Definition of done

- [x] A linked child sale automatically deducts from the shared bulk inventory.
- [x] Repacking can be recorded as an internal stock event.
- [x] Stock counts remain correct after mixed parent and child sales.

---

## Phase 5: Bottle Deposit / Empty Bottle Tracker

Current implementation progress:

- [x] Added product-level bottle-return settings
- [x] Added `container_return_events` local schema and migration
- [x] Added checkout support for bottle-return obligations tied to a sale
- [x] Added Sales checkout decision flow for in-store vs take-out bottles
- [x] Added customer-linked bottle obligation list with partial return actions
- [x] Added receipt / sales-history visibility for bottle-return obligations
- [x] Added sync / restore and Supabase schema support for bottle-return data

### Problem

Glass bottle sales have two separate things:

1. the drink sale itself
2. the bottle-return obligation

If the bottle is not returned, the store owner loses value.

### Recommendation

Treat bottle-return tracking as an obligation system, not just a product note.

### Recommended data model

#### Product-level bottle settings

Add new product fields or a separate settings table:

- [x] `has_container_return`
- `container_label`
  Examples:
  - `Coke Empty`
  - `Beer Bottle`
- [x] `container_deposit_cents`
- [x] `default_container_quantity_per_sale`

For simplicity, these can be added to the `products` table in v1.

#### New table: `container_return_events`

Columns:

- [x] `id`
- [x] `sale_id`
- [x] `customer_id` nullable
- [x] `product_id`
- [x] `container_label_snapshot`
- [x] `quantity_out`
- [x] `quantity_returned`
- [x] `created_at`
- [x] `last_returned_at`
- [x] `status`
  Suggested:
  - [x] `open`
  - [x] `returned`
  - [x] `partial`
- [x] `synced`

### Scope recommendation

#### MVP scope

Track bottle obligations for:

- [x] utang sales
- [x] named customer sales

Why:

- anonymous walk-in bottle returns are harder to reconcile later
- customer-linked tracking gives immediate real value without complex matching

#### Phase 5.1 scope

Later add support for:

- walk-in deposit tracking
- manual "walk-in bottle returned" clearing

### Sales flow changes

In `app/(tabs)/benta.tsx`:

When the cart contains a bottle-tracked item:

1. [x] ask whether the container is consumed in-store or taken out
2. if taken out:
   - [x] create a `container_return_events` record
   - [x] if customer is selected, attach to that customer
3. optionally add deposit amount to the sale total
   - this should be a business-rule toggle

Status:

- [x] Bottle-tracked items open a dedicated decision sheet before checkout
- [x] Cash / digital sales can link a customer when bottle tracking is needed
- [ ] Deposit amount is stored on the product but not yet added automatically to the sale total

### Customer screen changes

In `app/(tabs)/palista.tsx`:

Add a visible bottle obligations block inside customer detail:

- [x] `1 Coke Empty`
- [x] `2 SMB Bottles`

Each entry should support:

- [x] `Mark Returned`
- [x] optional partial return counts

### Receipt / sales history impact

The sale detail view should show:

- [x] whether bottle return was expected
- [x] whether it is still outstanding

### Sync impact

Add:

- [x] new bottle-related fields on `products`
- [x] `container_return_events`

### Definition of done

- [x] Bottle-tracked products can create customer-linked container obligations.
- [x] The owner can clear returned empties.
- [x] Outstanding container obligations are easy to see in the customer profile.

---

## Phase 6: Rest of System Updates After Feature Work

Current implementation progress:

- [x] Step 6.1 shared types extended across shipped feature slices
- [x] Step 6.2 repository queries updated for metrics, AI context, history, checkout, and ledger follow-up
- [x] Step 6.3 sync / restore support added for every shipped Phase 1-5 table and product field
- [x] Step 6.4 translation coverage expanded for expenses, restock, linked inventory / repack labels, bottle-return flow, and payment-history flow
- [x] Step 6.5 Home now surfaces net profit, expenses, restock urgency, payment activity, and bottle-return obligations
- [x] Step 6.6 Aling AI now receives expense totals, utang payment history, linked inventory context, and open bottle-return obligations

## Step 6.1: Update shared types

Update `types/models.ts` with all new entities:

- `Expense`
- `ExpenseSummary`
- `UtangPayment`
- `InventoryPool`
- `ProductInventoryLink`
- `RepackSession`
- `RestockList`
- `RestockListItem`
- `ContainerReturnEvent`

Also extend:

- [x] `Product`
- [x] `HomeMetrics`
- [x] `StoreAiContext`
- [x] related AI and analytics summaries

## Step 6.2: Update repository queries

After adding new tables, update:

- [x] home metrics
- [x] AI context generation
- [x] product save / load
- [x] checkout sale flow
- [x] customer ledger queries
- [x] sales history

## Step 6.3: Update sync / restore

Extend `utils/sync.ts` and Supabase schema for every new table and field.

Required additions:

- [x] `expenses`
- [x] `utang_payments`
- [x] `restock_lists`
- [x] `restock_list_items`
- [x] `inventory_pools`
- [x] `product_inventory_links`
- [x] `repack_sessions`
- [x] `container_return_events`
- [x] new product columns used by the shipped slices

## Step 6.4: Update translations

Add new labels for:

- [x] Expenses / Gastos
- [x] restock list flow
- [x] Tingi setup
- [x] repack session flow
- [x] bottle deposit flow
- [x] payment history flow

## Step 6.5: Update Home analytics

Home should reflect the new reality:

- [x] net profit
- [x] today expenses
- [x] restock urgency
- [x] customer payment activity
- [x] bottle-return obligations if relevant

## Step 6.6: Update Aling AI

The AI prompt context should include:

- [x] expense totals
- [x] payment-event history
- [x] better restock context
- [x] linked inventory / repack awareness
- [x] bottle-return obligations

So Aling AI can say things like:

- "Net profit is lower today because pamasahe and plastic bag expenses were high."
- "You still have open bottle returns from three customers."
- "Restock Marlboro packs, not just sticks, because the linked stock pool is nearly empty."

---

## Testing Plan

## 1. Database migration tests

Verify:

- existing users do not lose products, sales, or utang
- new tables are created cleanly
- legacy partial payments migrate into `utang_payments`

## 2. Checkout tests

Verify:

- standalone product sale still works
- linked Tingi sale deducts correctly
- weight-based sale still works
- bottle-tracked sale creates obligations correctly

## 3. Customer ledger tests

Verify:

- partial payment logs a new payment event
- outstanding balance updates correctly
- overpayment handling stays correct
- bottle-return obligations appear correctly

## 4. Expense tests

Verify:

- expense add/edit/delete
- today expense totals
- gross vs net profit math
- AI context includes expenses

## 5. Restock list tests

Verify:

- generated list includes only low / out-of-stock items
- checked state persists
- linked inventory products collapse to the correct restock parent

## 6. Sync / restore tests

Verify:

- every new table syncs to Supabase
- restore rebuilds the full local state
- foreign-key order is safe during restore

## 7. UX tests on device

Verify:

- tab bar still feels usable after adding Expenses
- modals do not become too tall
- checkout stays fast
- customer detail remains readable even with more history data

---

## Recommended Development Sequence in Real Work Terms

If this were implemented in the repo right now, the safest order would be:

1. Add schema support for `utang_payments` and ship visible partial payment history.
2. Add `expenses` plus Home metric changes and AI context updates.
3. Add the Expenses tab and move Settings out of the bottom tab bar.
4. Add persistent restock lists using current low-stock data.
5. Add the shared `inventory_pools` foundation.
6. Ship count-based Tingi linking first.
7. Ship repack sessions second.
8. Add bottle-return obligations for customer-linked sales.
9. Expand sync, restore, analytics, and AI summaries across all new entities.

This order gives the store owner value quickly while protecting the riskiest inventory work until the supporting data model is ready.

---

## Final Recommendation

If only one guiding principle is followed during implementation, it should be this:

> Do not build these as isolated UI features.
> Build them as connected store operations that share inventory, ledger, analytics, sync, and AI context.

That is what will make the app feel like it truly understands sari-sari store life instead of acting like a generic POS with a few extra buttons.
