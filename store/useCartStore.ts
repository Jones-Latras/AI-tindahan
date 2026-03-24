import { create } from "zustand";

import type { CartItem } from "@/types/models";

type CartStore = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  setItem: (item: CartItem) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, quantity: number) => void;
  clearCart: () => void;
  getTotalCents: () => number;
};

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const existing = state.items.find((current) => current.id === item.id);

      if (existing) {
        const nextQuantity = Math.min(existing.quantity + 1, item.stock);
        return {
          items: state.items.map((current) =>
            current.id === item.id ? { ...current, quantity: nextQuantity, stock: item.stock } : current,
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            ...item,
            quantity: item.stock > 0 ? 1 : 0,
          },
        ].filter((cartItem) => cartItem.quantity > 0),
      };
    }),

  setItem: (item) =>
    set((state) => ({
      items:
        item.quantity <= 0
          ? state.items.filter((current) => current.id !== item.id)
          : [
              ...state.items.filter((current) => current.id !== item.id),
              {
                ...item,
                quantity: Math.min(item.quantity, item.stock),
              },
            ],
    })),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  updateQuantity: (id, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((item) => item.id !== id)
          : state.items.map((item) =>
              item.id === id ? { ...item, quantity: Math.min(quantity, item.stock) } : item,
            ),
    })),

  clearCart: () => set({ items: [] }),

  getTotalCents: () =>
    get().items.reduce((runningTotal, item) => runningTotal + item.priceCents * item.quantity, 0),
}));
