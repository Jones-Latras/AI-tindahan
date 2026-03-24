/**
 * Seed script — inserts realistic sari-sari store products, customers,
 * and sample utang entries.  Designed to be called from inside the
 * React Native runtime where expo-sqlite is available.
 *
 * Usage:  Import `seedStoreData` and call it with the SQLiteDatabase instance.
 *         A `__DEV__`-only button on the Home screen does exactly this.
 */

import type { SQLiteDatabase } from "expo-sqlite";

import { addUtangEntry, saveCustomer, saveProduct } from "@/db/repositories";
import type { ProductInput, CustomerInput, UtangInput } from "@/db/repositories";

// ---------- helpers ----------

/** Convert PHP pesos to centavos for storage. */
function pesos(amount: number) {
  return Math.round(amount * 100);
}

// ---------- product catalog ----------

const PRODUCTS: ProductInput[] = [
  // Drinks
  { name: "Coca-Cola Mismo",     priceCents: pesos(15),   costPriceCents: pesos(11),  stock: 48,  category: "Drinks",    barcode: "", minStock: 12 },
  { name: "RC Cola 240ml",       priceCents: pesos(10),   costPriceCents: pesos(7),   stock: 36,  category: "Drinks",    barcode: "", minStock: 10 },
  { name: "Cobra Energy Drink",  priceCents: pesos(15),   costPriceCents: pesos(11),  stock: 24,  category: "Drinks",    barcode: "", minStock: 8  },
  { name: "C2 Green Tea (Apple)",priceCents: pesos(20),   costPriceCents: pesos(15),  stock: 20,  category: "Drinks",    barcode: "", minStock: 6  },
  { name: "Zesto Juice Pack",    priceCents: pesos(7),    costPriceCents: pesos(5),   stock: 60,  category: "Drinks",    barcode: "", minStock: 15 },

  // Snacks
  { name: "Boy Bawang Cornick",  priceCents: pesos(10),   costPriceCents: pesos(7),   stock: 40,  category: "Snacks",    barcode: "", minStock: 10 },
  { name: "Piattos Cheese",      priceCents: pesos(12),   costPriceCents: pesos(9),   stock: 30,  category: "Snacks",    barcode: "", minStock: 8  },
  { name: "SkyFlakes Crackers",  priceCents: pesos(8),    costPriceCents: pesos(5.5), stock: 50,  category: "Snacks",    barcode: "", minStock: 12 },
  { name: "Chicharon Bituka",    priceCents: pesos(15),   costPriceCents: pesos(10),  stock: 20,  category: "Snacks",    barcode: "", minStock: 5  },

  // Canned goods
  { name: "Century Tuna Flakes", priceCents: pesos(28),   costPriceCents: pesos(22),  stock: 18,  category: "Canned",    barcode: "", minStock: 5  },
  { name: "Argentina Corned Beef",priceCents: pesos(32),  costPriceCents: pesos(26),  stock: 15,  category: "Canned",    barcode: "", minStock: 5  },
  { name: "555 Sardines Tomato", priceCents: pesos(18),   costPriceCents: pesos(14),  stock: 22,  category: "Canned",    barcode: "", minStock: 6  },

  // Noodles
  { name: "Lucky Me Pancit Canton",priceCents: pesos(10), costPriceCents: pesos(7.5), stock: 60,  category: "Noodles",   barcode: "", minStock: 15 },
  { name: "Nissin Cup Noodles",  priceCents: pesos(25),   costPriceCents: pesos(19),  stock: 24,  category: "Noodles",   barcode: "", minStock: 6  },

  // Household / sachets
  { name: "Surf Powder Sachet",  priceCents: pesos(8),    costPriceCents: pesos(6),   stock: 80,  category: "Household", barcode: "", minStock: 20 },
  { name: "Safeguard Soap Bar",  priceCents: pesos(35),   costPriceCents: pesos(28),  stock: 16,  category: "Household", barcode: "", minStock: 5  },
  { name: "Downy Sachet",        priceCents: pesos(6),    costPriceCents: pesos(4),   stock: 90,  category: "Household", barcode: "", minStock: 20 },
  { name: "Colgate Sachet",      priceCents: pesos(8),    costPriceCents: pesos(5.5), stock: 50,  category: "Household", barcode: "", minStock: 12 },

  // Rice & eggs
  { name: "Bigas (1 kilo)",      priceCents: pesos(52),   costPriceCents: pesos(46),  stock: 30,  category: "Staples",   barcode: "", minStock: 10 },
  { name: "Itlog (1 pc)",        priceCents: pesos(9),    costPriceCents: pesos(7),   stock: 60,  category: "Staples",   barcode: "", minStock: 15 },
];

// ---------- customers ----------

const CUSTOMERS: CustomerInput[] = [
  { name: "Aling Nena",   phone: "09171234567" },
  { name: "Mang Bert",    phone: "09281234567" },
  { name: "Karen Santos",  phone: "" },
];

// ---------- seed function ----------

export async function seedStoreData(db: SQLiteDatabase) {
  // Check if products already exist to avoid duplicates
  const existing = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM products",
  );

  if ((existing?.count ?? 0) > 0) {
    return { skipped: true, message: "Products already exist — seed skipped to avoid duplicates." };
  }

  // Insert products
  for (const product of PRODUCTS) {
    await saveProduct(db, product);
  }

  // Insert customers
  const customerIds: number[] = [];
  for (const customer of CUSTOMERS) {
    const id = await saveCustomer(db, customer);
    customerIds.push(id);
  }

  // Insert sample utang for 2 customers
  const utangEntries: UtangInput[] = [
    { customerId: customerIds[0], amountCents: pesos(150),  description: "Bigas at ulam para bukas" },
    { customerId: customerIds[0], amountCents: pesos(45),   description: "Lucky Me at itlog" },
    { customerId: customerIds[1], amountCents: pesos(280),  description: "Groceries para sa fiesta" },
  ];

  for (const entry of utangEntries) {
    await addUtangEntry(db, entry);
  }

  return {
    skipped: false,
    message: `Seeded ${PRODUCTS.length} products, ${CUSTOMERS.length} customers, and ${utangEntries.length} utang entries.`,
  };
}
