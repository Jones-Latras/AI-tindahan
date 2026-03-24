import { forwardRef } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";

type ReceiptItem = {
  name: string;
  quantity: number;
  priceCents: number;
};

type Props = {
  storeName: string;
  saleId: number;
  items: ReceiptItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  cashPaidCents: number;
  changeCents: number;
  paymentMethod: string;
  date: string;
};

export const ReceiptView = forwardRef<View, Props>(function ReceiptView(
  {
    storeName,
    saleId,
    items,
    subtotalCents,
    discountCents,
    totalCents,
    cashPaidCents,
    changeCents,
    paymentMethod,
    date,
  },
  ref,
) {
  const { theme } = useAppTheme();

  const fmt = (cents: number) =>
    `₱${(cents / 100).toFixed(2)}`;

  return (
    <View
      ref={ref}
      style={{
        backgroundColor: "#FFFFFF",
        padding: 24,
        width: 320,
      }}
    >
      {/* Header */}
      <View style={{ alignItems: "center", gap: 4, marginBottom: 16 }}>
        <Text style={{ color: "#111", fontFamily: theme.typography.display, fontSize: 18, fontWeight: "700" }}>
          {storeName || "TindaHan AI"}
        </Text>
        <Text style={{ color: "#666", fontFamily: theme.typography.body, fontSize: 11 }}>
          Transaction #{saleId}
        </Text>
        <Text style={{ color: "#666", fontFamily: theme.typography.body, fontSize: 11 }}>
          {date}
        </Text>
      </View>

      {/* Divider */}
      <View style={{ borderBottomColor: "#CCC", borderBottomWidth: 1, borderStyle: "dashed", marginBottom: 12 }} />

      {/* Items */}
      {items.map((item, index) => (
        <View
          key={`${item.name}-${index}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <Text style={{ color: "#222", flex: 1, fontFamily: theme.typography.body, fontSize: 13 }}>
            {item.quantity}x {item.name}
          </Text>
          <Text style={{ color: "#222", fontFamily: theme.typography.body, fontSize: 13 }}>
            {fmt(item.priceCents * item.quantity)}
          </Text>
        </View>
      ))}

      {/* Divider */}
      <View style={{ borderBottomColor: "#CCC", borderBottomWidth: 1, borderStyle: "dashed", marginVertical: 12 }} />

      {/* Totals */}
      {discountCents > 0 ? (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13 }}>Subtotal</Text>
            <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13 }}>{fmt(subtotalCents)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: "#16a34a", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>Tawad</Text>
            <Text style={{ color: "#16a34a", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>-{fmt(discountCents)}</Text>
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ color: "#111", fontFamily: theme.typography.display, fontSize: 16, fontWeight: "700" }}>Total</Text>
        <Text style={{ color: "#111", fontFamily: theme.typography.display, fontSize: 16, fontWeight: "700" }}>{fmt(totalCents)}</Text>
      </View>

      {paymentMethod === "cash" ? (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13 }}>Cash</Text>
            <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13 }}>{fmt(cashPaidCents)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>Sukli</Text>
            <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>{fmt(changeCents)}</Text>
          </View>
        </>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13 }}>Paid via</Text>
          <Text style={{ color: "#444", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
            {paymentMethod.toUpperCase()}
          </Text>
        </View>
      )}

      {/* Footer */}
      <View style={{ borderBottomColor: "#CCC", borderBottomWidth: 1, borderStyle: "dashed", marginVertical: 12 }} />
      <Text
        style={{
          color: "#888",
          fontFamily: theme.typography.body,
          fontSize: 11,
          textAlign: "center",
        }}
      >
        Salamat sa inyong pagbili! 🇵🇭
      </Text>
      <Text
        style={{
          color: "#AAA",
          fontFamily: theme.typography.body,
          fontSize: 9,
          marginTop: 4,
          textAlign: "center",
        }}
      >
        Powered by TindaHan AI
      </Text>
    </View>
  );
});
