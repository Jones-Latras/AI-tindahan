# TindaHan AI — UI Redesign PRD

**Version:** 1.0  
**Type:** Frontend-only redesign  
**Status:** Ready for implementation

---

## ⚠️ CRITICAL INSTRUCTIONS FOR THE CODING AGENT

> Read this section fully before touching any file.

This is a **UI/UX redesign only**. The app's backend, database, business logic, and state management are **complete and working**. Your only job is to restyle the frontend layer.

### What you MUST NOT touch

| Area | Files / Folders | Reason |
|---|---|---|
| Database schema | `db/database.ts`, `*.sql` | All tables are live and working |
| Business logic | Any function that reads/writes to SQLite | Touching this breaks data |
| State management | `store/useCartStore.ts`, all Zustand stores | Cart logic is complete |
| Navigation structure | `app/(tabs)/_layout.tsx` route names | Routes must stay the same |
| AI integration | `utils/gemini.ts`, all Gemini API calls | AI features are already wired |
| Backend functions | `getAllProducts`, `completeSale`, `deductStock`, `addUtang`, `settleUtang`, etc. | Do not rename or modify these |
| Environment variables | `.env`, API keys | Never touch these |
| Package versions | `package.json` dependencies | Do not upgrade or add packages unless specified |

### What you ARE allowed to change

- All JSX/TSX markup inside screen component return statements
- All `StyleSheet.create({})` blocks
- All inline styles
- The bottom tab navigator's visual appearance and FAB button
- Color values, font sizes, border radii, spacing, padding
- Component layout and order within a screen
- Adding new purely visual/presentational sub-components

### Safe edit pattern — follow this every time

```
1. Read the existing file fully before editing
2. Identify which part is UI (JSX + styles) vs logic (functions, hooks, db calls)
3. Only rewrite the JSX return block and StyleSheet
4. Keep all existing function calls, hook calls, and props exactly as they are
5. Test that the screen still reads/writes data correctly after your change
```

---

## 1. Overview

**What this document covers:** A complete visual redesign of TindaHan AI's 4 main screens plus the bottom navigation bar. The new design is inspired by the layout of the Peddlr app — a Filipino POS app — adapted with TindaHan AI's own green brand identity, Nunito font, and Filipino-language UI labels.

**Goal:** Make the app feel more polished, more Filipino, and faster to use — especially for the core selling flow.

---

## 2. Design System

### 2.1 Font

Replace the current font with **Nunito** across the entire app.

```bash
npx expo install @expo-google-fonts/nunito expo-font
```

```typescript
// app/_layout.tsx — load fonts before rendering
import { useFonts, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, Nunito_600SemiBold } from '@expo-google-fonts/nunito';

const [fontsLoaded] = useFonts({
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
});
```

Font weight mapping:

| Usage | Weight | Token |
|---|---|---|
| Screen titles, amounts | 900 | `Nunito_900Black` |
| Card titles, labels | 800 | `Nunito_800ExtraBold` |
| Body text, product names | 700 | `Nunito_700Bold` |
| Subtitles, captions | 600 | `Nunito_600SemiBold` |

### 2.2 Color Palette

Define these in `constants/colors.ts`. **Replace the entire file** — do not merge with old values.

```typescript
export const Colors = {
  // Brand green — used on Home and Benta screens
  green: {
    50:  '#E1F5EE',
    100: '#9FE1CB',
    400: '#1D9E75',   // primary brand color
    600: '#0F6E56',
    900: '#04342C',
  },
  // Utang / Palista — coral orange
  coral: {
    50:  '#FAECE7',
    100: '#F5C4B3',
    400: '#D85A30',
    600: '#993C1D',
  },
  // Inventory / Produkto — purple
  purple: {
    50:  '#EEEDFE',
    100: '#CECBF6',
    400: '#534AB7',
    600: '#3C3489',
  },
  // Warnings / low stock — amber
  amber: {
    50:  '#FAEEDA',
    400: '#BA7517',
    600: '#854F0B',
  },
  // Neutrals
  bg:            '#F0F2F5',   // page background
  card:          '#FFFFFF',   // card background
  border:        '#EBEBEB',   // card borders
  borderStrong:  '#D5D5D5',
  textPrimary:   '#1A1A1A',
  textSecondary: '#5F5E5A',
  textMuted:     '#888780',
};
```

### 2.3 Spacing & Radius

```typescript
export const Radius = {
  sm:   8,
  md:   12,
  lg:   14,
  xl:   16,
  full: 999,
};

export const Spacing = {
  xs:  6,
  sm:  10,
  md:  14,
  lg:  20,
};
```

### 2.4 Screen Header Pattern

Every screen has a **colored header** that matches its section:

| Screen | Header color | Token |
|---|---|---|
| Home | `Colors.green[400]` | `#1D9E75` |
| Benta (POS) | `Colors.green[400]` | `#1D9E75` |
| Palista (Utang) | `Colors.coral[400]` | `#D85A30` |
| Produkto | `Colors.purple[400]` | `#534AB7` |
| Ulat (Reports) | `Colors.amber[400]` | `#BA7517` |

Header structure (same across all screens):

```tsx
<View style={styles.header}>
  <View style={styles.headerTop}>
    <View>
      <Text style={styles.headerTitle}>Screen Title</Text>
      <Text style={styles.headerSub}>Subtitle or count</Text>
    </View>
    {/* back button or account button */}
  </View>
  {/* optional: hero card or search bar */}
</View>
```

---

## 3. Bottom Navigation Bar

This is the most important UI change. The center tab becomes a **floating action button (FAB)** that launches the Benta/POS screen directly.

### 3.1 Layout

```
[ Home ]  [ Produkto ]  [ 🛒 MAGBENTA ]  [ Palista ]  [ Ulat ]
                            ↑ FAB — elevated, green circle
```

### 3.2 FAB Specification

| Property | Value |
|---|---|
| Size | 52 × 52 px |
| Shape | Circle (`borderRadius: 26`) |
| Background | `Colors.green[400]` — `#1D9E75` |
| Icon | Cart icon (from your existing icon library) |
| Border | 3px solid `Colors.bg` (`#F0F2F5`) — creates the floating gap effect |
| Elevation | `marginTop: -20` — lifts the FAB above the nav bar |
| Label | `"Magbenta"` in `Colors.green[400]`, `Nunito_800`, 9px |
| Animation | Pulse ring: fading scale animation on the border, `1.8s infinite` |

### 3.3 React Native Implementation

```tsx
// components/BottomNav.tsx — or inside your Tab.Navigator

// In your Tab.Screen for the Benta/POS tab:
options={{
  tabBarLabel: 'Magbenta',
  tabBarIcon: ({ color }) => <CartIcon color="#fff" size={24} />,
  tabBarButton: (props) => <BentaFAB {...props} />,
}}

// The FAB component:
function BentaFAB(props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <TouchableOpacity
      {...props}
      style={{ alignItems: 'center', justifyContent: 'center', top: -20 }}
    >
      {/* pulse ring */}
      <Animated.View style={{
        position: 'absolute',
        width: 52, height: 52,
        borderRadius: 26,
        borderWidth: 2,
        borderColor: '#1D9E75',
        opacity: 0.5,
        transform: [{ scale: pulseAnim }],
      }} />
      {/* main FAB */}
      <View style={{
        width: 52, height: 52,
        borderRadius: 26,
        backgroundColor: '#1D9E75',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: '#F0F2F5',
      }}>
        <CartIcon color="#fff" size={24} />
      </View>
      <Text style={{
        fontSize: 9,
        fontFamily: 'Nunito_800ExtraBold',
        color: '#1D9E75',
        marginTop: 4,
      }}>
        Magbenta
      </Text>
    </TouchableOpacity>
  );
}
```

### 3.4 Regular Nav Items

```tsx
// Each regular tab item style:
{
  tabBarLabelStyle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 9,
    marginTop: 2,
  },
  tabBarActiveTintColor:   Colors.green[400],
  tabBarInactiveTintColor: Colors.textMuted,
  tabBarStyle: {
    backgroundColor: Colors.card,
    borderTopWidth: 1.5,
    borderTopColor: Colors.border,
    height: 64,
    paddingBottom: 10,
  },
}
```

---

## 4. Screen Redesigns

### 4.1 Home Screen

**File:** `app/(tabs)/index.tsx`

#### Header — hero card layout

```
┌─────────────────────────────────────────┐  ← green bg (#1D9E75)
│  🏠 TindaHan AI          [Account btn]  │
│  ┌─────────────────────────────────┐    │
│  │ Kita Mo Ngayon                  │    │  ← hero card (white 15% opacity)
│  │ ₱1,240        [34]    [₱310]    │    │
│  │ ↑ 18% vs kahapon    Benta Tubo  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

Hero card implementation:

```tsx
<View style={styles.heroCard}>
  <Text style={styles.heroLabel}>Kita Mo Ngayon</Text>
  <View style={styles.heroRow}>
    <View>
      {/* bind to your existing todaySales state */}
      <Text style={styles.heroAmount}>₱{todaySales.toLocaleString()}</Text>
      <Text style={styles.heroSub}>↑ vs kahapon</Text>
    </View>
    <View style={styles.heroBadges}>
      <View style={styles.heroBadge}>
        {/* bind to your existing transactionCount state */}
        <Text style={styles.heroBadgeVal}>{transactionCount}</Text>
        <Text style={styles.heroBadgeLbl}>Benta</Text>
      </View>
      <View style={styles.heroBadge}>
        {/* bind to your existing todayProfit state */}
        <Text style={styles.heroBadgeVal}>₱{todayProfit}</Text>
        <Text style={styles.heroBadgeLbl}>Tubo</Text>
      </View>
    </View>
  </View>
</View>
```

#### Aling AI bubble

Sits directly below the header, above the icon grid:

```tsx
<View style={styles.aiBubble}>
  <View style={styles.aiAvatar}>
    <Text style={styles.aiAvatarText}>A</Text>
  </View>
  <View style={styles.aiContent}>
    <Text style={styles.aiName}>ALING AI</Text>
    {/* bind to your existing aiInsight state */}
    <Text style={styles.aiMsg}>{aiInsight}</Text>
  </View>
</View>
```

#### Alert pills — horizontal scroll

```tsx
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
  {/* bind to your existing lowStockProducts array */}
  {lowStockProducts.map(p => (
    <View key={p.id} style={styles.alertPill}>
      <View style={[styles.alertDot, { backgroundColor: Colors.amber[400] }]} />
      <Text style={styles.alertText}>{p.name} — {p.stock} na lang</Text>
    </View>
  ))}
  {/* bind to your existing overdueUtang array */}
  {overdueUtang.map(u => (
    <View key={u.id} style={styles.alertPill}>
      <View style={[styles.alertDot, { backgroundColor: Colors.coral[400] }]} />
      <Text style={styles.alertText}>{u.customerName} — {u.daysOverdue} araw na</Text>
    </View>
  ))}
</ScrollView>
```

#### Icon grid — 4 columns × 2 rows

```tsx
// Grid items — navigation only, no logic changes
const shortcuts = [
  { icon: '📋', label: 'Palista',  color: Colors.coral[50],   screen: 'palista'  },
  { icon: '📦', label: 'Restock',  color: Colors.purple[50],  screen: 'restock'  },
  { icon: '📊', label: 'Ulat',     color: Colors.amber[50],   screen: 'ulat'     },
  { icon: '💰', label: 'Tubo',     color: Colors.green[50],   screen: 'tubo'     },
  { icon: '🤖', label: 'AI Chat',  color: '#FBEAF0',          screen: 'aichat'   },
  { icon: '💳', label: 'GCash',    color: Colors.amber[50],   screen: 'gcash'    },
  { icon: '🏷️', label: 'Produkto', color: Colors.purple[50],  screen: 'produkto' },
  { icon: '🧾', label: 'Resibo',   color: Colors.blue50,      screen: 'resibo'   },
];

// Render as a 4-column FlatList or map() in a flex-wrap View
```

#### Bottom stats row

```tsx
<View style={styles.statsRow}>
  <View style={styles.statCard}>
    <Text style={styles.statLabel}>Total Utang</Text>
    {/* bind to existing totalUtang state */}
    <Text style={[styles.statVal, { color: Colors.coral[400] }]}>₱{totalUtang}</Text>
    <Text style={[styles.statSub, { color: Colors.coral[400] }]}>{utangCount} customers</Text>
  </View>
  <View style={styles.statCard}>
    <Text style={styles.statLabel}>Pinakabenta</Text>
    {/* bind to existing topProduct state */}
    <Text style={[styles.statVal, { color: Colors.green[400] }]}>{topProduct.name}</Text>
    <Text style={[styles.statSub, { color: Colors.green[400] }]}>{topProduct.soldCount} nabenta</Text>
  </View>
</View>
```

---

### 4.2 Benta / POS Screen

**File:** `app/(tabs)/benta.tsx`

#### Header

Same green header pattern. Includes:
- Title: `"Bagong Benta"` / Subtitle: `"I-tap ang produkto para idagdag"`
- Search bar (white 20% bg, inside the green header area)

#### Category filter pills

Horizontal scroll row of category pills above the product grid:

```tsx
// bind to your existing categories list
const categories = ['Lahat', 'Noodles', 'Gatas', 'Softdrinks', 'Meryenda'];

<ScrollView horizontal showsHorizontalScrollIndicator={false}>
  {categories.map(cat => (
    <TouchableOpacity
      key={cat}
      style={[styles.catPill, selectedCategory === cat && styles.catPillActive]}
      onPress={() => setSelectedCategory(cat)}   // ← your existing filter logic
    >
      <Text style={[styles.catPillText, selectedCategory === cat && styles.catPillTextActive]}>
        {cat}
      </Text>
    </TouchableOpacity>
  ))}
</ScrollView>
```

#### Product grid

2-column grid. Each card:

```tsx
<TouchableOpacity style={styles.prodCard} onPress={() => addItem(product)}>  {/* ← your existing addItem */}
  <Text style={styles.prodEmoji}>{product.emoji ?? '🏷️'}</Text>
  <Text style={styles.prodName}>{product.name}</Text>
  <Text style={styles.prodPrice}>₱{product.price}</Text>
  <Text style={[styles.prodStock, product.stock <= product.minStock && styles.lowStock]}>
    {product.stock <= product.minStock ? `⚠ ${product.stock} na lang` : `${product.stock} stocks`}
  </Text>
  <View style={styles.addButton}>
    <Text style={styles.addButtonText}>+</Text>
  </View>
</TouchableOpacity>
```

#### Cart sheet

Sits at the bottom of the screen, above the nav bar. Not a modal — it's a static bottom section:

```tsx
<View style={styles.cartSheet}>
  <View style={styles.cartHandle} />
  <View style={styles.cartHeader}>
    <Text style={styles.cartTitle}>Cart</Text>
    {/* bind to existing cartItemCount */}
    <View style={styles.cartBadge}>
      <Text style={styles.cartBadgeText}>{cartItems.length} items</Text>
    </View>
  </View>

  {/* bind to existing cartItems — keep your existing FlatList or map */}
  {cartItems.map(item => (
    <View key={item.id} style={styles.cartRow}>
      <Text style={styles.cartItemName}>{item.name}</Text>
      <Text style={styles.cartItemQty}>x{item.quantity}</Text>
      <Text style={styles.cartItemPrice}>₱{(item.price * item.quantity).toFixed(2)}</Text>
    </View>
  ))}

  <View style={styles.cartTotalRow}>
    <Text style={styles.cartTotalLabel}>Kabuuan</Text>
    {/* bind to existing getTotal() */}
    <Text style={styles.cartTotalVal}>₱{getTotal().toFixed(2)}</Text>
  </View>

  {/* bind to existing checkout function */}
  <TouchableOpacity style={styles.checkoutBtn} onPress={handleCheckout}>
    <Text style={styles.checkoutBtnText}>I-checkout →</Text>
  </TouchableOpacity>
</View>
```

---

### 4.3 Palista / Utang Screen

**File:** `app/(tabs)/palista.tsx`

#### Header

Coral/orange header (`#D85A30`):
- Title: `"Palista ng Utang"`
- Subtitle: bind to `"Total: ₱${totalUtang} · ${customerCount} customers"`

#### Customer list

Replace existing list rows with this card style:

```tsx
{/* bind to your existing customers array from SQLite */}
{customers.map(customer => (
  <TouchableOpacity key={customer.id} style={styles.customerCard} onPress={() => openCustomer(customer.id)}>
    <View style={[styles.custAvatar, { backgroundColor: getTrustBg(customer.trustScore) }]}>
      <Text style={styles.custAvatarText}>{getInitials(customer.name)}</Text>
    </View>
    <View style={styles.custInfo}>
      <Text style={styles.custName}>{customer.name}</Text>
      <Text style={styles.custDays}>{customer.daysOverdue} araw na hindi nagbabayad</Text>
    </View>
    <View style={styles.custRight}>
      <Text style={styles.custAmount}>₱{customer.balance.toFixed(2)}</Text>
      <View style={[styles.trustTag, { backgroundColor: getTrustBg(customer.trustScore) }]}>
        <Text style={[styles.trustTagText, { color: getTrustColor(customer.trustScore) }]}>
          {customer.trustScore}
        </Text>
      </View>
    </View>
  </TouchableOpacity>
))}
```

Trust score color helper — add this to your existing logic, do not replace it:

```typescript
// Pure UI helper — no db calls, safe to add
function getTrustBg(score: string): string {
  if (score === 'Delikado')   return '#FAECE7';
  if (score === 'Bantayan')   return '#FAEEDA';
  return '#E1F5EE'; // Maaasahan
}

function getTrustColor(score: string): string {
  if (score === 'Delikado')   return '#993C1D';
  if (score === 'Bantayan')   return '#854F0B';
  return '#0F6E56';
}
```

---

### 4.4 Produkto Screen

**File:** `app/(tabs)/produkto.tsx`

#### Header

Purple header (`#534AB7`):
- Title: `"Mga Produkto"`
- Subtitle: bind to `"${productCount} produkto sa stock"`

#### Product list rows

Replace existing rows with this style:

```tsx
{/* bind to your existing products array */}
{products.map(product => (
  <TouchableOpacity key={product.id} style={styles.prodRow} onPress={() => editProduct(product.id)}>
    <View style={[styles.prodIcon, { backgroundColor: getCategoryColor(product.category) }]}>
      <Text style={{ fontSize: 18 }}>{product.emoji ?? '🏷️'}</Text>
    </View>
    <View style={styles.prodInfo}>
      <Text style={styles.prodRowName}>{product.name}</Text>
      <Text style={styles.prodRowCat}>{product.category} · Barcode: {product.barcode ?? '—'}</Text>
    </View>
    <View style={styles.prodRowRight}>
      <Text style={styles.prodRowPrice}>₱{product.price}</Text>
      <Text style={[styles.prodRowStock, product.stock <= product.minStock && styles.lowStock]}>
        {product.stock <= product.minStock ? `⚠ ${product.stock} na lang` : `${product.stock} stocks`}
      </Text>
    </View>
  </TouchableOpacity>
))}

{/* bind to your existing addProduct navigation/modal */}
<TouchableOpacity style={styles.addProdBtn} onPress={openAddProduct}>
  <Text style={styles.addProdBtnText}>+ Magdagdag ng Produkto</Text>
</TouchableOpacity>
```

---

## 5. Shared Style Reference

Add this to a new file `constants/styles.ts` and import where needed. These are purely visual — no logic.

```typescript
import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from './colors';

export const SharedStyles = StyleSheet.create({

  // ── Cards ──────────────────────────────────
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.md,
  },

  // ── Headers ────────────────────────────────
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  headerTitle: {
    fontFamily: 'Nunito_900Black',
    fontSize: 17,
    color: '#fff',
  },
  headerSub: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.70)',
    marginTop: 1,
  },

  // ── Hero card ──────────────────────────────
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: Radius.xl,
    padding: 14,
  },
  heroLabel: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 2,
  },
  heroAmount: {
    fontFamily: 'Nunito_900Black',
    fontSize: 30,
    color: '#fff',
    letterSpacing: -1,
    lineHeight: 34,
  },
  heroBadge: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderRadius: Radius.sm,
    padding: 6,
    alignItems: 'center',
    minWidth: 52,
  },
  heroBadgeVal: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 14,
    color: '#fff',
  },
  heroBadgeLbl: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 9,
    color: 'rgba(255,255,255,0.70)',
  },

  // ── Section labels ─────────────────────────
  sectionTitle: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 13,
    color: Colors.textPrimary,
  },
  sectionLink: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 11,
    color: Colors.green[400],
  },

  // ── Icon grid card ─────────────────────────
  iconCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 7,
  },
  iconLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 10,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 13,
  },

  // ── Alert pill ─────────────────────────────
  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.card,
    borderRadius: Radius.full,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginRight: 8,
  },
  alertDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertText: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 11,
    color: Colors.textPrimary,
  },

  // ── Stat card ──────────────────────────────
  statCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    flex: 1,
  },
  statLabel: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 10,
    color: Colors.textMuted,
    marginBottom: 3,
  },
  statValue: {
    fontFamily: 'Nunito_900Black',
    fontSize: 18,
    lineHeight: 22,
  },
  statSub: {
    fontFamily: 'Nunito_700Bold',
    fontSize: 10,
    marginTop: 3,
  },

  // ── AI bubble ──────────────────────────────
  aiBubble: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 13,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.green[400],
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiAvatarText: {
    fontFamily: 'Nunito_900Black',
    fontSize: 14,
    color: '#fff',
  },
  aiName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 10,
    color: Colors.green[400],
    marginBottom: 3,
  },
  aiMsg: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 12,
    color: '#444',
    lineHeight: 18,
  },

  // ── Cart sheet ─────────────────────────────
  cartSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 14,
    borderTopWidth: 2,
    borderTopColor: Colors.border,
  },
  cartHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  cartTitle: {
    fontFamily: 'Nunito_900Black',
    fontSize: 14,
    color: Colors.textPrimary,
  },
  cartBadge: {
    backgroundColor: Colors.green[400],
    borderRadius: Radius.full,
    paddingVertical: 2,
    paddingHorizontal: 10,
  },
  cartBadgeText: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 11,
    color: '#fff',
  },
  checkoutBtn: {
    backgroundColor: Colors.green[400],
    borderRadius: Radius.lg,
    padding: 13,
    alignItems: 'center',
  },
  checkoutBtnText: {
    fontFamily: 'Nunito_900Black',
    fontSize: 15,
    color: '#fff',
  },

  // ── Customer card (Palista) ─────────────────
  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 9,
  },
  custAvatar: {
    width: 42,
    height: 42,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  custName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 13,
    color: Colors.textPrimary,
  },
  custDays: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  custAmount: {
    fontFamily: 'Nunito_900Black',
    fontSize: 16,
    color: Colors.coral[400],
  },
  trustTag: {
    borderRadius: Radius.full,
    paddingVertical: 3,
    paddingHorizontal: 9,
    alignSelf: 'flex-end',
    marginTop: 3,
  },
  trustTagText: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 9,
  },

  // ── Product row (Produkto) ─────────────────
  prodRow: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  prodDot: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prodRowName: {
    fontFamily: 'Nunito_800ExtraBold',
    fontSize: 13,
    color: Colors.textPrimary,
  },
  prodRowCat: {
    fontFamily: 'Nunito_600SemiBold',
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },
  prodRowPrice: {
    fontFamily: 'Nunito_900Black',
    fontSize: 15,
    color: Colors.purple[400],
  },
  lowStock: {
    color: Colors.amber[400],
    fontFamily: 'Nunito_700Bold',
  },

});
```

---

## 6. Page Background

Set the root background color on every screen's container view:

```tsx
<View style={{ flex: 1, backgroundColor: Colors.bg }}>
  {/* screen content */}
</View>
```

Also update `app/_layout.tsx`:

```tsx
<Stack screenOptions={{
  contentStyle: { backgroundColor: Colors.bg },
  headerShown: false,
}} />
```

---

## 7. Implementation Checklist

Work through this in order. Check each item off before moving to the next.

### Setup
- [ ] Install `@expo-google-fonts/nunito` and `expo-font`
- [ ] Load all 4 Nunito weights in `app/_layout.tsx`
- [ ] Replace `constants/colors.ts` with the new palette
- [ ] Create `constants/styles.ts` with `SharedStyles`
- [ ] Set `backgroundColor: Colors.bg` on the root layout

### Bottom navigation
- [ ] Replace the center tab with the `BentaFAB` component
- [ ] Tapping FAB navigates to the Benta/POS screen
- [ ] Pulse animation plays on the FAB
- [ ] All 4 regular nav items styled with Nunito font
- [ ] Active tab highlights in `Colors.green[400]`
- [ ] Nav bar background is white with a 1.5px top border

### Home screen
- [ ] Green header with brand name and Account button
- [ ] Hero card shows live kita, benta count, tubo — bound to existing state
- [ ] Aling AI bubble shows below header — bound to existing aiInsight
- [ ] Alert pills scroll horizontally — bound to existing low stock and utang data
- [ ] Icon grid renders 4 × 2 with correct colors
- [ ] Bottom stats row shows utang total and top product — bound to existing state

### Benta / POS screen
- [ ] Green header with search bar
- [ ] Category filter pills scroll horizontally
- [ ] Product grid is 2 columns — addItem() still works
- [ ] Cart sheet at bottom — all existing cart logic still works
- [ ] Checkout button calls existing handleCheckout()
- [ ] Sukli calculation unchanged

### Palista screen
- [ ] Coral/orange header with live totals
- [ ] Customer cards show avatar, name, days, amount, trust tag
- [ ] Trust tag color uses getTrustBg() / getTrustColor() helpers
- [ ] Tapping a customer still opens the existing detail view
- [ ] "Bagong Utang" button still calls existing addUtang logic

### Produkto screen
- [ ] Purple header with live product count
- [ ] Product rows show emoji/icon, name, category, price, stock
- [ ] Low stock still highlights in amber
- [ ] Tapping a row still opens existing edit flow
- [ ] "Magdagdag" button still calls existing addProduct flow

### Final checks
- [ ] All screens use `Colors.bg` (`#F0F2F5`) as background
- [ ] All text uses Nunito font — no system fonts remaining
- [ ] No existing function has been renamed or removed
- [ ] No database queries have been modified
- [ ] App runs without errors on Android
- [ ] All data still loads correctly from SQLite after redesign

---

## 8. What NOT to Do — Common Mistakes

> These are the most common ways a UI-only redesign accidentally breaks a working app. Avoid all of these.

```
❌ Do NOT rename or move screen files
❌ Do NOT change the route names in _layout.tsx
❌ Do NOT modify function signatures (parameters or return types)
❌ Do NOT remove or rename state variables — only change how they are displayed
❌ Do NOT replace FlatList with a new data source — only restyle the renderItem
❌ Do NOT change how useCartStore is called — only change how cart items are rendered
❌ Do NOT add new npm packages without checking they are compatible with the current Expo SDK version
❌ Do NOT change the SQLite table or column names anywhere
❌ Do NOT modify the Gemini prompt logic — only restyle the component that displays the result
❌ Do NOT delete any existing StyleSheet — create a new one alongside it and migrate gradually
```

---

*This redesign should make TindaHan AI look and feel like a premium Filipino app — without breaking a single line of working logic.*
