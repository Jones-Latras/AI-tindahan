import { forwardRef } from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/contexts/ThemeContext";
import { formatWeightKg } from "@/utils/pricing";

type ReceiptItem = {
  name: string;
  quantity: number;
  weightKg?: number | null;
  priceCents: number;
  lineTotalCents?: number;
  isWeightBased?: boolean;
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

  const fmt = (cents: number) => `PHP ${(cents / 100).toFixed(2)}`;

  return (
    <View
      ref={ref}
      style={{
        backgroundColor: "#FFFFFF",
        padding: 24,
        width: 320,
      }}
    >
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

      <View style={{ borderBottomColor: "#CCC", borderBottomWidth: 1, borderStyle: "dashed", marginBottom: 12 }} />

      {items.map((item, index) => {
        const lineTotalCents = item.lineTotalCents ?? Math.round(item.priceCents * (item.weightKg ?? item.quantity));

        return (
          <View key={`${item.name}-${index}`} style={{ gap: 2, marginBottom: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: "#222", flex: 1, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {item.name}
              </Text>
              <Text style={{ color: "#222", fontFamily: theme.typography.body, fontSize: 13 }}>
                {fmt(lineTotalCents)}
              </Text>
            </View>
            <Text style={{ color: "#666", fontFamily: theme.typography.body, fontSize: 11 }}>
              {item.isWeightBased
                ? `${formatWeightKg(item.weightKg ?? 0)} kg x ${fmt(item.priceCents)}/kg`
                : `${item.quantity}x ${fmt(item.priceCents)}`}
            </Text>
          </View>
        );
      })}

      <View style={{ borderBottomColor: "#CCC", borderBottomWidth: 1, borderStyle: "dashed", marginVertical: 12 }} />

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

      <View style={{ borderBottomColor: "#CCC", borderBottomWidth: 1, borderStyle: "dashed", marginVertical: 12 }} />
      <Text
        style={{
          color: "#888",
          fontFamily: theme.typography.body,
          fontSize: 11,
          textAlign: "center",
        }}
      >
        Salamat sa inyong pagbili!
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
