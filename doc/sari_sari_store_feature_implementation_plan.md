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

### Step 0.1: Decide the navigation strategy for Expenses

Current issue:

- The bottom tab bar already has 5 tabs.
- A 6th bottom tab will feel cramped on smaller phones.

Recommended approach:

1. Replace the current `Settings` bottom tab with a new `Expenses` tab.
2. Move `Settings` into one of these locations:
   - Home screen overflow / utility shortcut
   - a header gear button from Home
   - a nested route outside the bottom tab bar

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

- every new table
- every new column
- default values
- migration behavior for existing users
- sync / restore behavior

This must happen in:

- local SQLite bootstrap / migration logic inside `db/repositories.ts`
- `scripts/supabase-setup.sql`
- `utils/sync.ts`

### Step 0.3: Add a "feature slices" rollout rule

Do not implement all five features in one giant branch.

Recommended slices:

1. Payment-event tracking for utang
2. Expenses tab + net profit math
3. Restock list
4. Tingi count-based linking
5. Tingi repack sessions
6. Bottle deposit tracker
7. AI + sync + analytics polish

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

Already implemented:

- `applyUtangPayment()` in `db/repositories.ts`
- payment modal in `app/(tabs)/palista.tsx`

Still missing:

- payment-event audit trail
- more visible "Log Payment" button in customer detail
- clearer timeline that mixes credit entries and payment events

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

1. Add the new `utang_payments` table.
2. For every `utang` row where `amount_paid_cents > 0`:
   - create one synthetic `utang_payments` row
   - amount = current `amount_paid_cents`
   - created_at = `paid_at` if available, otherwise `created_at`
   - source = `migration`
3. Keep `amount_paid_cents` on the parent `utang` row for fast calculations.

This does not recreate the true historical splits, but it preserves the already-recorded amount instead of losing it.

### Repository changes

Update `db/repositories.ts`:

1. Add migration / table creation for `utang_payments`.
2. Update `applyUtangPayment()` to:
   - insert a new payment-event row
   - then update the parent `utang.amount_paid_cents`
   - set `paid_at` only when the balance reaches zero
3. Add repository helpers:
   - `listUtangPayments(utangId)`
   - `listCustomerPaymentHistory(customerId)`
   - `getCustomerLastPayment(customerId)`
4. Extend ledger queries to optionally join payment-event info.

### UI changes

Update `app/(tabs)/palista.tsx`:

1. Make `Log Payment` more visible.
   Recommended placements:
   - top action row in the customer detail sheet
   - on every unpaid ledger card
   - optional floating primary action inside the detail sheet

2. Add a payment history timeline below each utang entry.
   Example:
   - Credit logged: Mar 10, 8:13 PM, ₱820
   - Payment received: Mar 15, 7:02 PM, ₱300
   - Payment received: Mar 22, 6:11 PM, ₱100
   - Remaining: ₱420

3. Add quick amount chips inside the payment modal.
   Suggested chips:
   - `₱50`
   - `₱100`
   - `₱200`
   - `Full`

4. Add a receipt-like confirmation summary after saving.
   Recommended:
   - applied amount
   - remaining balance
   - exact timestamp

### Analytics impact

Use the new payment-event table to improve:

- customer activity labels
- risk scoring inputs
- weekly collection tracking
- future "who pays regularly" insights

### Sync impact

Update `utils/sync.ts` and Supabase schema to include:

- `utang_payments`

### Definition of done

- A partial payment creates a separate payment-event row.
- The customer detail screen shows payment history clearly.
- The running balance remains correct.
- Sync / restore preserves payment events.

---

## Phase 2: Expenses Tab and True Net Profit

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

### Recommended route / naming

Because the app uses Taglish route names, the recommended file is:

- `app/(tabs)/gastos.tsx`

Suggested tab label:

- English: `Expenses`
- Taglish: `Gastos`

### Recommended data model

#### New table: `expenses`

Columns:

- `id`
- `category`
- `amount_cents`
- `description`
- `expense_date`
- `created_at`
- `updated_at`
- `synced`

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

### Repository changes

Update `db/repositories.ts` with:

- `addExpense()`
- `updateExpense()`
- `deleteExpense()`
- `listExpenses()`
- `getExpenseSummary()`
- `getTodayExpenseTotal()`
- `getExpenseBreakdownByCategory()`

### Metrics changes

Current `todayProfitCents` is gross item-margin profit.

Recommended new metrics:

- `todayGrossProfitCents`
- `todayExpenseCents`
- `todayNetProfitCents`

Do not silently reuse `todayProfitCents` without a plan, because current screens may be assuming that it means gross profit.

Recommended migration path:

1. Add new fields first.
2. Update Home UI labels explicitly.
3. Later decide whether `todayProfitCents` should be retired or aliased.

### Type changes

Update `types/models.ts`:

- add `Expense`
- add expense-related summary types
- extend `HomeMetrics`
- extend `StoreAiContext`

### UI plan for the Expenses tab

#### Top-level tab

New screen: `app/(tabs)/gastos.tsx`

Recommended layout:

1. Search / filter bar
2. Category chips
3. Today / This Week / This Month summary cards
4. Expense list
5. Primary add-expense button

#### Add expense modal

Fields:

- amount
- category
- description
- date/time

Speed features:

- quick amount chips
- recent categories
- default date = now

### Home / analytics updates

Update `app/(tabs)/index.tsx`:

1. Change profit cards to clearly distinguish:
   - Gross Profit
   - Expenses
   - Net Profit

2. Update the analytics detail panel to include:
   - today expenses
   - weekly expenses
   - top expense categories

3. Update charts if needed:
   - revenue vs expenses vs net

### AI daily brief updates

Update `services/ai.ts`:

1. Add expenses into `StoreAiContext`.
2. Update `buildStoreAiPromptContext()` so Aling AI can reason about:
   - today expenses
   - net profit
   - biggest expense categories
3. Update fallback brief logic to mention:
   - "Net profit is lower today because..."
   - "Pamasahe and plastic bag costs are eating into margin..."

### Sync impact

Add sync + restore support for:

- `expenses`
- optional `expense_categories` if created

### Definition of done

- Store owner can log expenses quickly.
- Home metrics show net profit, not just gross margin.
- AI brief uses expense data.
- Expense records survive backup and restore.

---

## Phase 3: Palengke Restock Shopping List

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

- `id`
- `title`
- `status`
  Suggested:
  - `open`
  - `completed`
  - `archived`
- `created_at`
- `completed_at`
- `synced`

##### `restock_list_items`

- `id`
- `restock_list_id`
- `product_id`
- `product_name_snapshot`
- `current_stock_snapshot`
- `min_stock_snapshot`
- `suggested_quantity`
- `is_checked`
- `checked_at`
- `note`
- `synced`

Why snapshot fields matter:

- Product names and stock may change after the list is generated.
- The shopping list should still preserve what the owner saw at creation time.

### Suggested quantity logic

Start simple in v1.

Suggested quantity can be:

- for normal products:
  - `max(minStock * 2 - currentStock, minStock - currentStock)`
- for weight-based products:
  - recommended target kg above threshold
- later, use product velocity for smarter reorder suggestions

### UI plan

Recommended entry points:

- Home `Restock` shortcut
- Stock screen action button
- Low-stock summary card

Recommended screen behavior:

1. Tap `Generate Restock List`
2. App creates a snapshot list from current low / out-of-stock products
3. User sees a checklist view
4. User checks off items while shopping
5. User can reopen unfinished lists later

Recommended checklist row contents:

- product name
- category
- current stock / min stock
- suggested buy quantity
- note field
- checkbox

### Linked-inventory consideration

When Tingi is introduced, the restock list must not list every child item separately.

Examples:

- If Marlboro Stick is low, the list should recommend buying the parent pack/carton.
- If repacked rice pouches are low, the list should recommend bulk rice stock, not just more pouches.

So the restock list should eventually become inventory-pool aware.

### Repository changes

Add:

- `createRestockListFromThresholds()`
- `listRestockLists()`
- `getRestockListById()`
- `toggleRestockListItem()`
- `archiveRestockList()`

### Sync impact

Add:

- `restock_lists`
- `restock_list_items`

### Definition of done

- One tap generates a shopping checklist from low-stock items.
- The checklist is persistent, checkable, and reusable during the trip.
- Later product edits do not corrupt the checklist snapshot.

---

## Phase 4: Tingi and Repacking Logic

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

#### Sales UI changes

In `app/(tabs)/benta.tsx`:

- child and parent can both appear as sellable products
- checkout must deduct from the shared inventory pool, not from isolated product rows

#### Repository changes

Update `checkoutSale()` to:

- detect linked products
- deduct `units_per_sale * quantity_sold` from `inventory_pools.quantity_available`
- still preserve product sale snapshots in `sale_items`

### Sub-phase 4B: Repacking sessions

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

### Reporting impact

Tingi and repacking must affect:

- stock visibility
- low-stock alerts
- restock list generation
- cost of goods tracking
- AI brief explanations

### Sync impact

Add:

- `inventory_pools`
- `product_inventory_links`
- `repack_sessions`

### Definition of done

- A linked child sale automatically deducts from the shared bulk inventory.
- Repacking can be recorded as an internal stock event.
- Stock counts remain correct after mixed parent and child sales.

---

## Phase 5: Bottle Deposit / Empty Bottle Tracker

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

- `has_container_return`
- `container_label`
  Examples:
  - `Coke Empty`
  - `Beer Bottle`
- `container_deposit_cents`
- `default_container_quantity_per_sale`

For simplicity, these can be added to the `products` table in v1.

#### New table: `container_return_events`

Columns:

- `id`
- `sale_id`
- `customer_id` nullable
- `product_id`
- `container_label_snapshot`
- `quantity_out`
- `quantity_returned`
- `created_at`
- `last_returned_at`
- `status`
  Suggested:
  - `open`
  - `returned`
  - `partial`
- `synced`

### Scope recommendation

#### MVP scope

Track bottle obligations for:

- utang sales
- named customer sales

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

1. ask whether the container is consumed in-store or taken out
2. if taken out:
   - create a `container_return_events` record
   - if customer is selected, attach to that customer
3. optionally add deposit amount to the sale total
   - this should be a business-rule toggle

### Customer screen changes

In `app/(tabs)/palista.tsx`:

Add a visible bottle obligations block inside customer detail:

- `1 Coke Empty`
- `2 SMB Bottles`

Each entry should support:

- `Mark Returned`
- optional partial return counts

### Receipt / sales history impact

The sale detail view should show:

- whether bottle return was expected
- whether it is still outstanding

### Sync impact

Add:

- new bottle-related fields on `products`
- `container_return_events`

### Definition of done

- Bottle-tracked products can create customer-linked container obligations.
- The owner can clear returned empties.
- Outstanding container obligations are easy to see in the customer profile.

---

## Phase 6: Rest of System Updates After Feature Work

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

- `Product`
- `HomeMetrics`
- `StoreAiContext`
- any related AI or analytics summaries

## Step 6.2: Update repository queries

After adding new tables, update:

- home metrics
- AI context generation
- product save / load
- checkout sale flow
- customer ledger queries
- sales history

## Step 6.3: Update sync / restore

Extend `utils/sync.ts` and Supabase schema for every new table and field.

Required additions:

- `expenses`
- `utang_payments`
- `restock_lists`
- `restock_list_items`
- `inventory_pools`
- `product_inventory_links`
- `repack_sessions`
- `container_return_events`
- any new product columns

## Step 6.4: Update translations

Add new labels for:

- Expenses / Gastos
- restock list flow
- Tingi setup
- repack session flow
- bottle deposit flow
- payment history flow

## Step 6.5: Update Home analytics

Home should reflect the new reality:

- net profit
- today expenses
- restock urgency
- customer payment activity
- bottle-return obligations if relevant

## Step 6.6: Update Aling AI

The AI prompt context should include:

- expense totals
- payment-event history
- better restock context
- linked inventory / repack awareness
- bottle-return obligations

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
