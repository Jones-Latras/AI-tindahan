# TindaHan AI — Step-by-Step Build Plan

> **Your complete guide to building TindaHan AI from zero to Play Store.**
> Follow each step in order. Don't skip ahead — each step builds on the last.

---

## Before You Start — What You Need

| Tool | Purpose | Download |
|---|---|---|
| Node.js (v18+) | Runs JavaScript on your computer | nodejs.org |
| VS Code | Code editor | code.visualstudio.com |
| Expo Go app | Test app on your phone instantly | Google Play Store |
| Git | Save and track your code | git-scm.com |
| GitHub account | Store your code online (free) | github.com |
| Gemini API key | Powers the AI features | aistudio.google.com |

---

## Phase 1 — Foundation & Core POS (Weeks 1–4)

> Goal: A working app where you can sell products, compute sukli, and track utang. No AI yet — just the core store features.

---

### Step 1 — Set Up Your Project

**What you're doing:** Creating the Expo project and installing all the tools you need.

```bash
# Install Expo CLI globally
npm install -g expo-cli eas-cli

# Create your project
npx create-expo-app TindaHanAI --template blank
cd TindaHanAI

# Install all core dependencies
npx expo install expo-sqlite expo-router expo-camera expo-barcode-scanner expo-sharing expo-notifications
npm install nativewind zustand
npm install --save-dev tailwindcss
```

**Folder structure to create:**
```
TindaHanAI/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          ← Home screen
│   │   ├── benta.tsx          ← POS / checkout screen
│   │   ├── produkto.tsx       ← Products screen
│   │   └── palista.tsx        ← Utang tracker screen
│   └── _layout.tsx            ← Root layout
├── components/
│   ├── CartItem.tsx
│   ├── ProductCard.tsx
│   └── StatCard.tsx
├── db/
│   └── database.ts            ← SQLite setup
├── store/
│   └── useCartStore.ts        ← Zustand cart state
├── constants/
│   └── colors.ts              ← TindaHan color palette
└── .env                       ← API keys (never commit this!)
```

**Checklist:**
- [ ] Project created and opens without errors
- [ ] Expo Go installed on your phone
- [ ] You can scan the QR code and see the app on your phone

---

### Step 2 — Set Up the Database (SQLite)

**What you're doing:** Creating the local database that stores all your products, sales, and utang. This runs on the phone — no internet needed.

**File: `db/database.ts`**

```typescript
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('tindahan.db');

export function initDatabase() {
  db.transaction(tx => {

    // Products table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        category TEXT,
        barcode TEXT,
        min_stock INTEGER DEFAULT 5,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Sales table (one row per transaction)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL NOT NULL,
        cash_paid REAL NOT NULL,
        change_given REAL NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Sale items table (individual items in each sale)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
    `);

    // Customers table (for utang)
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        trust_score TEXT DEFAULT 'Bago',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // Utang table
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS utang (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        is_paid INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        paid_at TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

  });
}

export default db;
```

**Checklist:**
- [x] Database file created in `db/database.ts`
- [x] `initDatabase()` called in `app/_layout.tsx` on app start
- [ ] No errors when app loads on phone

---

### Step 3 — Build the Color Theme & Constants

**What you're doing:** Defining TindaHan AI's Filipino-inspired color palette so every screen looks consistent.

**File: `constants/colors.ts`**

```typescript
export const Colors = {
  // Primary — Tindahan Green
  green: {
    50:  '#E1F5EE',
    100: '#9FE1CB',
    400: '#1D9E75',   // ← main brand color
    600: '#0F6E56',
    900: '#04342C',
  },
  // Utang / Warning — Coral
  coral: {
    50:  '#FAECE7',
    400: '#D85A30',
    600: '#993C1D',
  },
  // Inventory — Purple
  purple: {
    50:  '#EEEDFE',
    400: '#534AB7',
    600: '#3C3489',
  },
  // Alerts — Amber
  amber: {
    50:  '#FAEEDA',
    400: '#BA7517',
    600: '#854F0B',
  },
  // Background — Warm off-white (feels like papel)
  bg: '#F5F0E8',
  card: '#FFFFFF',
  border: '#E0DBD0',
  textPrimary: '#2C2C2A',
  textSecondary: '#5F5E5A',
  textMuted: '#888780',
};
```

**Checklist:**
- [x] Colors file created
- [x] Import and use `Colors.green[400]` in at least one component to test

---

### Step 4 — Build the Bottom Navigation

**What you're doing:** Creating the 4-tab navigation bar at the bottom of the screen.

**File: `app/(tabs)/_layout.tsx`**

```typescript
import { Tabs } from 'expo-router';
import { Colors } from '../../constants/colors';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: Colors.green[400],
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarStyle: { backgroundColor: Colors.card, borderTopColor: Colors.border },
      headerShown: false,
    }}>
      <Tabs.Screen name="index"     options={{ title: 'Home',     tabBarIcon: () => '🏠' }} />
      <Tabs.Screen name="benta"     options={{ title: 'Benta',    tabBarIcon: () => '🛒' }} />
      <Tabs.Screen name="produkto"  options={{ title: 'Produkto', tabBarIcon: () => '🏷️' }} />
      <Tabs.Screen name="palista"   options={{ title: 'Palista',  tabBarIcon: () => '📋' }} />
    </Tabs>
  );
}
```

**Checklist:**
- [x] 4 tabs visible at the bottom
- [x] Active tab highlights in green
- [x] Tapping each tab switches the screen

---

### Step 5 — Build the Products Screen (CRUD)

**What you're doing:** The screen where you add, edit, and delete products. This is the foundation — the POS needs products to exist first.

**Features to build in this screen:**
1. List all products with name, price, and stock level
2. "Magdagdag ng Produkto" button that opens a form
3. Form fields: Product name, Price, Stock quantity, Category
4. Edit existing products by tapping them
5. Delete product with a confirmation prompt
6. Low stock warning (amber color) when stock is below `min_stock`

**Key functions to write:**

```typescript
// Get all products from DB
function getAllProducts(callback) {
  db.transaction(tx => {
    tx.executeSql('SELECT * FROM products ORDER BY name ASC', [], 
      (_, result) => callback(result.rows._array)
    );
  });
}

// Add a new product
function addProduct(name, price, stock, category) {
  db.transaction(tx => {
    tx.executeSql(
      'INSERT INTO products (name, price, stock, category) VALUES (?, ?, ?, ?)',
      [name, price, stock, category]
    );
  });
}

// Update product stock after a sale
function deductStock(productId, quantitySold) {
  db.transaction(tx => {
    tx.executeSql(
      'UPDATE products SET stock = stock - ? WHERE id = ?',
      [quantitySold, productId]
    );
  });
}
```

**Checklist:**
- [x] Products list loads from database
- [x] Can add a new product and it appears in the list
- [x] Can edit a product's price or stock
- [x] Can delete a product
- [x] Low stock products show in amber color

---

### Step 6 — Build the Cart State (Zustand)

**What you're doing:** Creating the global cart state so items added on the Benta screen persist while you're shopping.

**File: `store/useCartStore.ts`**

```typescript
import { create } from 'zustand';

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

type CartStore = {
  items: CartItem[];
  addItem: (product: CartItem) => void;
  removeItem: (id: number) => void;
  updateQty: (id: number, qty: number) => void;
  clearCart: () => void;
  getTotal: () => number;
};

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem: (product) => set(state => {
    const existing = state.items.find(i => i.id === product.id);
    if (existing) {
      return { items: state.items.map(i =>
        i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
      )};
    }
    return { items: [...state.items, { ...product, quantity: 1 }] };
  }),

  removeItem: (id) => set(state => ({
    items: state.items.filter(i => i.id !== id)
  })),

  updateQty: (id, qty) => set(state => ({
    items: qty <= 0
      ? state.items.filter(i => i.id !== id)
      : state.items.map(i => i.id === id ? { ...i, quantity: qty } : i)
  })),

  clearCart: () => set({ items: [] }),

  getTotal: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
}));
```

**Checklist:**
- [x] Cart store created
- [x] Adding a product increases quantity if it already exists
- [x] `getTotal()` returns the correct sum
- [x] `clearCart()` empties the cart after checkout

---

### Step 7 — Build the Benta (POS / Checkout) Screen

**What you're doing:** The main selling screen — the most important screen in the app.

**Features to build:**
1. Grid of product cards (pulled from database)
2. Search bar to find products quickly
3. Tap a product card to add it to cart
4. Cart section at the bottom showing all added items
5. Qty +/− buttons on each cart item
6. Total amount displayed prominently
7. Cash input field
8. Sukli (change) auto-computed and shown in green
9. Red warning if cash entered is less than total
10. Quick-pay buttons (₱50, ₱100, ₱200, ₱500)
11. "I-checkout" button completes the sale

**Sukli logic (keep this simple):**

```typescript
const total = useCartStore(state => state.getTotal());
const [cashPaid, setCashPaid] = useState('');

const sukli = parseFloat(cashPaid) - total;
const isEnough = parseFloat(cashPaid) >= total;
```

**On checkout — what to save to the database:**

```typescript
async function completeSale() {
  // 1. Insert into sales table
  // 2. Insert each cart item into sale_items table
  // 3. Deduct stock for each product
  // 4. Clear the cart
  // 5. Show success animation
}
```

**Checklist:**
- [x] Products appear as tappable cards
- [x] Cart updates live as items are added
- [x] Sukli shows correctly in green
- [x] "Kulang pa" warning shows in red when cash is not enough
- [x] Checkout saves to database and clears cart
- [x] Stock is deducted after every completed sale

---

### Step 8 — Build the Home Dashboard

**What you're doing:** The first screen the store owner sees — a summary of today's performance.

**Data to show:**
- Today's total kita (income) — query `sales` table for today
- Number of transactions today
- Estimated tubo (profit) — needs a cost price field on products (add this to DB)
- Total utang balance — query unpaid utang
- Low stock alerts — products where `stock <= min_stock`
- Quick shortcut buttons to each main screen

**Key database queries:**

```typescript
// Today's sales total
SELECT SUM(total) as kita, COUNT(*) as transactions 
FROM sales 
WHERE DATE(created_at) = DATE('now');

// Total unpaid utang
SELECT SUM(amount) as total_utang 
FROM utang 
WHERE is_paid = 0;

// Low stock products
SELECT * FROM products 
WHERE stock <= min_stock 
ORDER BY stock ASC;
```

**Checklist:**
- [x] Today's kita shows correctly
- [x] Transaction count is accurate
- [x] Utang total is displayed
- [x] Low stock products show as alerts
- [x] All shortcut buttons navigate to correct screens

---

### Step 9 — Build the Palista (Utang Tracker)

**What you're doing:** The digital replacement for the handwritten utang notebook.

**Features to build:**
1. List of all customers with their total outstanding balance
2. Tap a customer to see their individual utang history
3. "Bagong Utang" button — log a new credit purchase
4. "Bayad" button — record a full or partial payment
5. Days since last utang shown per customer
6. Visual indicator: green (paid up), amber (1 week), red (2+ weeks)

**Key database queries:**

```typescript
// Get all customers with their utang balance
SELECT c.id, c.name, c.trust_score,
  SUM(CASE WHEN u.is_paid = 0 THEN u.amount ELSE 0 END) as balance,
  MAX(u.created_at) as last_utang_date
FROM customers c
LEFT JOIN utang u ON c.id = u.customer_id
GROUP BY c.id
ORDER BY balance DESC;
```

**Checklist:**
- [x] Customer list shows with balances
- [x] Can add a new customer
- [x] Can log new utang for a customer
- [x] Can settle (mark as paid) a customer's balance
- [x] Days elapsed shows correctly
- [x] Color coding works (green/amber/red)

---

### Step 10 — Test Phase 1 with a Real Store

**What you're doing:** Before moving to AI features, test the app in a real sari-sari store setting.

**Testing checklist:**
- [ ] Add 10–20 real products from an actual sari-sari store
- [ ] Complete 5 test transactions end-to-end
- [ ] Verify sukli is always correct
- [ ] Add 3 test customers and log utang for each
- [ ] Settle one customer's utang and verify balance clears
- [ ] Check that stock deducts correctly after each sale
- [ ] Verify all data persists after closing and reopening the app
- [ ] Ask a real store owner (or a family member) to try using it — watch what confuses them

**Fix any issues found before moving to Phase 2.**

---

## Phase 2 — AI Features & Smart Tools (Weeks 5–8)

> Goal: Integrate Gemini Flash AI, add the smart features that make TindaHan unique, and polish the UX.

---

### Step 11 — Set Up Gemini Flash API

**What you're doing:** Connecting the app to Google's Gemini AI.

**Get your API key:**
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click "Get API Key" → Create API key
3. Copy the key

**Store it safely:**

```bash
# .env file (NEVER commit this to GitHub)
EXPO_PUBLIC_GEMINI_KEY=your_api_key_here
```

**Create a reusable AI helper:**

**File: `utils/gemini.ts`**

```typescript
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY;

export async function askGemini(prompt: string): Promise<string> {
  try {
    const response = await fetch(`${GEMINI_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    return 'Hindi ako makakonekta ngayon. Subukan ulit mamaya.';
  }
}
```

**Checklist:**
- [ ] API key stored in `.env`
- [x] `.env` added to `.gitignore`
- [ ] `askGemini('Kumusta?')` returns a response in Taglish
- [x] Error message shows gracefully when offline

---

### Step 12 — Build AI Sales Insights

**What you're doing:** Gemini reads your sales data and gives you weekly business tips in plain Taglish.

**Where it shows:** Home screen — the "Aling AI" bubble at the top.

**How to build it:**

```typescript
async function getDailySalesInsight() {
  // 1. Get last 7 days of sales from SQLite
  const salesData = await getLast7DaysSales();
  const topProducts = await getTopProductsThisWeek();

  // 2. Build the prompt
  const prompt = `
    Ikaw ay isang matalinong business assistant para sa isang sari-sari store sa Pilipinas.
    Narito ang sales data ng store ngayong linggo:
    - Total sales: ₱${salesData.total}
    - Number of transactions: ${salesData.count}
    - Best selling products: ${topProducts.map(p => p.name).join(', ')}
    
    Magbigay ng 2 maikling business tips sa Taglish (Filipino-English mix).
    Maging friendly at encouraging. Maximum 3 sentences lang.
  `;

  // 3. Call Gemini
  return await askGemini(prompt);
}
```

**Checklist:**
- [x] AI insight loads on Home screen every morning
- [ ] Response is in Taglish
- [x] Shows a loading skeleton while waiting for AI
- [x] Cached for the day — doesn't call API every time screen loads

---

### Step 13 — Build the Aling AI Chat

**What you're doing:** A chat interface where the store owner can ask the AI anything about their store.

**Where it shows:** A floating chat button on the Home screen, or a dedicated tab.

**Sample questions it should handle:**
- "Bakit mababa benta ko ngayong lunes?"
- "Anong produkto ang dapat ko i-restock?"
- "Magkano ang tubo ko ngayong buwan?"
- "Sino ang customer na may pinakamalaking utang?"

**How to build it:**

```typescript
// Always include store context in every message
async function chatWithAling(userMessage: string) {
  const storeContext = await getStoreContext(); // sales, stock, utang summary

  const systemPrompt = `
    Ikaw ay si "Aling AI", ang matalinong assistant ng TindaHan AI app.
    Tinutulungan mo ang sari-sari store owner na pangasiwaan ang kanilang tindahan.
    
    Store data ngayon:
    - Kita ngayon: ₱${storeContext.todaySales}
    - Produkto na mauubos na: ${storeContext.lowStock.join(', ')}
    - Total utang: ₱${storeContext.totalUtang}
    
    Sagutin ang tanong sa Taglish. Maging makulit at masaya!
    Tanong ng owner: ${userMessage}
  `;

  return await askGemini(systemPrompt);
}
```

**Checklist:**
- [x] Chat bubble opens a conversation interface
- [ ] AI responds in Taglish with store-specific answers
- [x] Conversation history visible in the chat
- [x] Loading indicator shows while AI is thinking

---

### Step 14 — Build Utang Trust Score

**What you're doing:** Gemini analyzes each customer's payment history and assigns a trust score.

**Trust score levels:**
- 🟢 **Maaasahan** — pays on time, small balance
- 🟡 **Bantayan** — sometimes late, moderate balance
- 🔴 **Delikado** — long overdue, large balance

```typescript
async function getCustomerTrustScore(customerId: number): Promise<string> {
  const history = await getCustomerUtangHistory(customerId);

  const prompt = `
    Ikaw ay nagtatasa ng creditworthiness ng isang sari-sari store customer.
    
    History ni customer:
    - Total na utang na naibayad: ₱${history.totalPaid}
    - Total na utang na hindi pa nabayad: ₱${history.totalUnpaid}
    - Average na araw bago magbayad: ${history.avgDaysToPay} araw
    - Pinakamtagal na hindi nagbayad: ${history.maxDaysUnpaid} araw
    
    Alin ang tamang trust score?
    Sagutin ng isang salita lang: "Maaasahan", "Bantayan", o "Delikado"
  `;

  const score = await askGemini(prompt);
  return score.trim();
}
```

**Checklist:**
- [x] Trust score appears as a colored pill on each customer card
- [x] Score updates after each payment
- [x] "Delikado" customers show a warning on the Home screen

---

### Step 15 — Build AI Restock Suggestions

**What you're doing:** The AI tells you how much to order for each product based on how fast it sells.

```typescript
async function getRestockSuggestions() {
  const salesVelocity = await getProductSalesVelocity(); // units sold per day

  const prompt = `
    Ikaw ay isang inventory expert para sa sari-sari store.
    
    Narito ang bilis ng pagbebenta ng mga produkto (units per day):
    ${salesVelocity.map(p => `- ${p.name}: ${p.unitsPerDay} units/day, ${p.currentStock} stocks na lang`).join('\n')}
    
    Para sa bawat produkto na mauubos sa susunod na 3 araw, 
    sabihin kung ilang units ang dapat i-order.
    Format: "Mag-order ng [quantity] [product name]"
    Taglish lang, maximum 5 suggestions.
  `;

  return await askGemini(prompt);
}
```

**Checklist:**
- [x] Restock suggestions appear in the Home screen alerts section
- [x] Shows estimated days until out of stock per product
- [ ] Suggestions are actionable and in Taglish

---

### Step 16 — Add Barcode Scanner

**What you're doing:** Let the store owner scan a product's barcode using the phone camera instead of searching manually.

```typescript
import { BarCodeScanner } from 'expo-barcode-scanner';

// In your product search screen:
function BarcodeButton() {
  const [scanning, setScanning] = useState(false);

  async function handleScan({ data }) {
    setScanning(false);
    // Look up product by barcode in SQLite
    const product = await getProductByBarcode(data);
    if (product) {
      addToCart(product); // Add directly to cart
    } else {
      alert('Hindi nahanap ang produkto. I-add mo muna sa listahan.');
    }
  }

  return scanning
    ? <BarCodeScanner onBarCodeScanned={handleScan} style={{ flex: 1 }} />
    : <Button title="I-scan" onPress={() => setScanning(true)} />;
}
```

**Checklist:**
- [x] Camera permission requested on first use
- [x] Barcode scan adds product to cart instantly
- [x] "Product not found" message shows clearly when barcode isn't in DB
- [x] Scanner closes automatically after a successful scan

---

### Step 17 — Add Tubo (Profit) Calculator

**What you're doing:** Add a "cost price" field to products so the app can compute your actual profit margin.

**Database change — add cost_price column:**

```sql
ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0;
```

**Tubo calculation:**

```typescript
// Per product
const tuboPerUnit = product.price - product.cost_price;
const tuboPercent = ((tuboPerUnit / product.price) * 100).toFixed(1);

// Overall today
const todayTubo = todaySales.reduce((sum, item) => {
  return sum + ((item.price - item.cost_price) * item.quantity);
}, 0);
```

**Where to show it:**
- Home screen stat card: "Tubo ngayon: ₱310"
- Products screen: profit margin % next to each product
- Reports screen: tubo chart by week

**Checklist:**
- [x] Cost price field added to product form
- [x] Today's profit shows on Home screen
- [x] Each product shows its profit margin %

---

### Step 18 — Add GCash / Maya Payment Tracking

**What you're doing:** Log when customers pay digitally (GCash or Maya) instead of cash.

**Database change — add to sales table:**

```sql
-- payment_method already exists from Step 2
-- Values: 'cash', 'gcash', 'maya', 'utang'
```

**On the checkout screen, add payment method selector:**

```typescript
const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash' | 'maya' | 'utang'>('cash');

// Payment method buttons:
// [Cash] [GCash] [Maya] [Utang]
// When 'gcash' or 'maya' selected, no need to enter cash amount
// When 'utang' selected, link to a customer in the Palista
```

**Checklist:**
- [x] Payment method selector on checkout screen
- [x] GCash/Maya transactions saved with correct payment type
- [ ] Reports screen shows breakdown: Cash vs GCash vs Maya

---

## Phase 3 — Polish & Launch (Weeks 9–12)

> Goal: Make the app feel polished, fix all bugs, get real user feedback, and publish to Google Play.

---

### Step 19 — Add Tawad Mode (Discounts)

**What you're doing:** Let the store owner give a discount during checkout — either per item or on the total.

```typescript
const [discount, setDiscount] = useState(0);
const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');

const discountAmount = discountType === 'percent'
  ? (total * discount) / 100
  : discount;

const finalTotal = Math.max(0, total - discountAmount);
```

**Checklist:**
- [ ] Tawad button visible on checkout screen
- [ ] Can enter fixed amount (e.g. ₱5 off) or percentage (e.g. 10% off)
- [ ] Discounted total shown clearly
- [ ] Discount amount recorded in the sale for reporting

---

### Step 20 — Add Receipt Sharing

**What you're doing:** Generate a receipt image after checkout that can be shared via Messenger, Viber, or SMS.

```typescript
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

async function shareReceipt(saleId: number) {
  // 1. Render a receipt component off-screen
  // 2. Capture it as an image
  const imageUri = await captureRef(receiptRef, { format: 'png', quality: 0.9 });
  // 3. Share it
  await Sharing.shareAsync(imageUri);
}
```

**Receipt should include:**
- TindaHan AI logo and store name
- Date and time
- List of items with quantities and prices
- Total, cash paid, sukli
- "Salamat sa inyong pagbili!" message

**Checklist:**
- [ ] Share button appears on the checkout success screen
- [ ] Receipt image looks clean and professional
- [ ] Works with Messenger, Viber, and SMS
- [ ] Install `react-native-view-shot`: `npx expo install react-native-view-shot`

---

### Step 21 — Implement Supabase Cloud Backup

**What you're doing:** Automatically back up the store's data to the cloud so it's safe even if the phone is lost.

```bash
npm install @supabase/supabase-js
```

**Sync strategy:**
- Local SQLite is the source of truth (works offline always)
- When WiFi is detected, sync new records to Supabase in the background
- On first install, check if there's existing data in Supabase to restore

**Tables to create in Supabase:** Same structure as your SQLite tables.

**File: `utils/sync.ts`**

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
);

export async function syncToCloud() {
  // Get all unsynced records (add a 'synced' column to each table)
  const unsyncedSales = await getUnsyncedSales();
  if (unsyncedSales.length > 0) {
    await supabase.from('sales').upsert(unsyncedSales);
    await markSalesAsSynced(unsyncedSales.map(s => s.id));
  }
}
```

**Checklist:**
- [ ] Supabase project created (free tier)
- [ ] Tables created in Supabase matching SQLite schema
- [ ] Auto-sync runs when app detects WiFi
- [ ] Manual "I-backup ngayon" button in Settings screen
- [ ] Restore from backup works on a new device

---

### Step 22 — Add Sale Milestone Celebrations

**What you're doing:** Show a confetti animation when the store hits a daily sales milestone — makes the app feel fun and rewarding.

```bash
npm install react-native-confetti-cannon
```

```typescript
import ConfettiCannon from 'react-native-confetti-cannon';

// Trigger confetti when daily sales crosses ₱500, ₱1000, ₱2000
function checkMilestone(newTotal: number, previousTotal: number) {
  const milestones = [500, 1000, 2000, 5000];
  for (const milestone of milestones) {
    if (previousTotal < milestone && newTotal >= milestone) {
      triggerCelebration(milestone);
      break;
    }
  }
}

// Show celebration modal with confetti + message
// "Grabe! ₱1,000 na kita mo ngayon! Ikaw na!"
```

**Checklist:**
- [ ] Confetti fires when milestone is crossed
- [ ] Celebration message is in Taglish and encouraging
- [ ] Only triggers once per milestone per day

---

### Step 23 — Add Gabi Mode (Dark Theme)

**What you're doing:** A dark theme for nighttime use, with a Filipino-named toggle ("Gabi / Umaga").

```typescript
// In your settings screen:
const [isGabiMode, setIsGabiMode] = useState(false);

// Toggle label: "Gabi Mode" / "Umaga Mode"
// Store preference in AsyncStorage
```

**Dark mode colors:**

```typescript
export const DarkColors = {
  bg: '#1C1C1A',
  card: '#2C2C2A',
  border: '#3D3D3A',
  textPrimary: '#F5F0E8',
  textSecondary: '#B4B2A9',
  green: { 400: '#1D9E75' }, // keep the same green
};
```

**Checklist:**
- [ ] Toggle in Settings screen labeled "Gabi Mode"
- [x] All 4 screens look correct in dark mode
- [x] Preference saved — remembered after app restart

---

### Step 24 — Add Onboarding Flow

**What you're doing:** A simple 3-screen tutorial for first-time users.

**3 onboarding screens:**
1. "Maligayang pagdating sa TindaHan AI!" — What the app does
2. "I-setup ang iyong tindahan" — Enter store name, owner name
3. "Mag-dagdag ng produkto" — Add first 3 products to get started

**Checklist:**
- [ ] Onboarding shows only on first launch (check AsyncStorage)
- [ ] Store name saved and shown on Home screen header
- [ ] Skip button available for users who want to start immediately

---

### Step 25 — Final Testing & Bug Fixes

**What you're doing:** Comprehensive testing before publishing.

**Testing checklist:**

**Core functionality:**
- [ ] Complete 20 test transactions — verify every sukli is correct
- [ ] Test with ₱0.50 prices (coins) — no floating point errors
- [ ] Add 50+ products — verify search still works fast
- [ ] Test offline mode — turn off WiFi, verify all core features work
- [ ] Kill the app mid-transaction — verify no data loss

**AI features:**
- [ ] Test Aling AI chat with 10 different questions
- [ ] Verify AI responses are always in Taglish
- [ ] Test AI when offline — verify graceful error message
- [ ] Verify API key is never visible in the app code

**Devices:**
- [ ] Test on Android 10, 11, 12, and 13
- [ ] Test on a low-end phone (2GB RAM)
- [ ] Test screen sizes: small (5"), medium (6"), large (6.7")

**User testing:**
- [ ] Have 3 real store owners use the app for 1 week
- [ ] Collect feedback and fix the top 5 pain points

---

### Step 26 — Publish to Google Play Store

**What you're doing:** Making your app available for anyone in the Philippines to download.

**Step-by-step:**

```bash
# 1. Build your production app
eas build --platform android --profile production

# 2. This generates an .aab file (Android App Bundle)
```

**Google Play setup:**
1. Create a Google Play Developer account (one-time ₱1,200 fee)
2. Go to play.google.com/console
3. Create a new app → "TindaHan AI"
4. Fill in the store listing:
   - App name: TindaHan AI
   - Short description: "Ang smart POS para sa iyong sari-sari store"
   - Category: Business
   - Screenshots: Take screenshots of all 4 main screens
5. Upload the `.aab` file from EAS Build
6. Submit for review (takes 1–3 days)

**Required before submission:**
- [ ] App icon (1024x1024px) — green background, "TA" letters
- [ ] Feature graphic (1024x500px)
- [ ] At least 4 screenshots
- [ ] Privacy policy page (required — can use a free generator)
- [ ] All placeholder text removed
- [ ] No crashes on any tested device

---

## After Launch — What to Do Next

Once the app is live and real store owners are using it, these are the next features to consider:

| Feature | Why it matters |
|---|---|
| Multi-store support | Store owners who expand to 2nd branch |
| Employee accounts | Let a helper use the app without seeing reports |
| Barangay price board | Compare your prices with nearby stores |
| Demand forecast by day | "Fridays sell 3x more softdrinks" |
| Voice input (Bisaya/Tagalog) | For owners who type slowly |
| iOS version | Reach iPhone users |
| BIR receipt compliance | For stores that need official receipts |

---

## Quick Reference — Useful Commands

```bash
# Start dev server
npx expo start

# Test on Android device (with Expo Go)
npx expo start --android

# Build for Play Store
eas build --platform android --profile production

# Check for outdated packages
npx expo-doctor

# Clear cache if something breaks
npx expo start --clear
```

---

## Resources

| Resource | Link |
|---|---|
| Expo documentation | docs.expo.dev |
| React Native docs | reactnative.dev |
| Gemini API docs | ai.google.dev/docs |
| Supabase docs | supabase.com/docs |
| NativeWind docs | nativewind.dev |
| EAS Build guide | docs.expo.dev/eas |
| Google Play Console | play.google.com/console |

---

*TindaHan AI — Para sa bawat tindero at tindera ng Pilipinas.* 🇵🇭
