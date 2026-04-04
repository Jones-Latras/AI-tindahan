import { View, Text } from "react-native";

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
  containerReturns?: Array<{
    containerLabelSnapshot: string;
    quantityOut: number;
    quantityReturned: number;
    status: "open" | "partial" | "returned";
  }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  cashPaidCents: number;
  changeCents: number;
  paymentMethod: string;
  date: string;
};

function formatPaymentLabel(paymentMethod: string) {
  if (paymentMethod === "gcash") {
    return "GCash";
  }

  if (paymentMethod === "maya") {
    return "Maya";
  }

  if (paymentMethod === "utang") {
    return "Utang";
  }

  return "Cash";
}

export function ReceiptView({
  storeName,
  saleId,
  items,
  containerReturns = [],
  subtotalCents,
  discountCents,
  totalCents,
  cashPaidCents,
  changeCents,
  paymentMethod,
  date,
}: Props) {
  const { theme } = useAppTheme();

  const fmt = (cents: number) => `PHP ${(cents / 100).toFixed(2)}`;
  const paymentLabel = formatPaymentLabel(paymentMethod);

  return (
    <View
      style={{
        alignSelf: "center",
        backgroundColor: "#FFFFFF",
        borderColor: "#D8E2DC",
        borderRadius: 28,
        borderWidth: 1,
        overflow: "hidden",
        width: 344,
      }}
    >
      <View style={{ backgroundColor: theme.colors.primary, height: 12 }} />

      <View style={{ gap: 18, padding: 22 }}>
        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text
              style={{
                color: "#667085",
                fontFamily: theme.typography.body,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Custom Store Receipt
            </Text>
            <Text
              style={{
                color: "#101828",
                fontFamily: theme.typography.display,
                fontSize: 28,
                fontWeight: "600",
              }}
            >
              {storeName || "TindaHan AI"}
            </Text>
            <Text
              style={{
                color: "#667085",
                fontFamily: theme.typography.body,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Freshly generated from your POS after checkout.
            </Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                backgroundColor: "#E8F5EF",
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.typography.body,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                Transaction #{saleId}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: "#F2F4F7",
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  color: "#344054",
                  fontFamily: theme.typography.body,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                {paymentLabel}
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: "#F8FAFC",
              borderColor: "#E5E7EB",
              borderRadius: 18,
              borderWidth: 1,
              gap: 8,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#667085", fontFamily: theme.typography.body, fontSize: 12 }}>Date</Text>
              <Text
                style={{
                  color: "#101828",
                  flexShrink: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                  textAlign: "right",
                }}
              >
                {date}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#667085", fontFamily: theme.typography.body, fontSize: 12 }}>Items</Text>
              <Text
                style={{
                  color: "#101828",
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {items.length}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text
              style={{
                color: "#667085",
                fontFamily: theme.typography.body,
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              Item
            </Text>
            <Text
              style={{
                color: "#667085",
                fontFamily: theme.typography.body,
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              Amount
            </Text>
          </View>

          {items.map((item, index) => {
            const lineTotalCents = item.lineTotalCents ?? Math.round(item.priceCents * (item.weightKg ?? item.quantity));

            return (
              <View
                key={`${item.name}-${index}`}
                style={{
                  backgroundColor: index % 2 === 0 ? "#FCFCFD" : "#F8FAFC",
                  borderRadius: 16,
                  gap: 6,
                  padding: 14,
                }}
              >
                <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
                  <Text
                    style={{
                      color: "#101828",
                      flex: 1,
                      fontFamily: theme.typography.body,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      color: "#101828",
                      fontFamily: theme.typography.body,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {fmt(lineTotalCents)}
                  </Text>
                </View>

                <Text
                  style={{
                    color: "#667085",
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                >
                  {item.isWeightBased
                    ? `${formatWeightKg(item.weightKg ?? 0)} kg x ${fmt(item.priceCents)}/kg`
                    : `${item.quantity}x ${fmt(item.priceCents)}`}
                </Text>
              </View>
            );
          })}
        </View>

        {containerReturns.length > 0 ? (
          <View
            style={{
              backgroundColor: "#FFF7ED",
              borderColor: "#FED7AA",
              borderRadius: 18,
              borderWidth: 1,
              gap: 10,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: "#9A3412",
                fontFamily: theme.typography.body,
                fontSize: 11,
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              Bottle Return Tracking
            </Text>

            {containerReturns.map((containerReturn, index) => {
              const outstanding = Math.max(0, containerReturn.quantityOut - containerReturn.quantityReturned);
              const statusLabel =
                containerReturn.status === "returned"
                  ? "Returned"
                  : outstanding === containerReturn.quantityOut
                    ? `${outstanding} outstanding`
                    : `${outstanding} left to return`;

              return (
                <View
                  key={`${containerReturn.containerLabelSnapshot}-${index}`}
                  style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}
                >
                  <Text
                    style={{
                      color: "#7C2D12",
                      flex: 1,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {containerReturn.quantityOut} {containerReturn.containerLabelSnapshot}
                  </Text>
                  <Text
                    style={{
                      color: outstanding > 0 ? "#C2410C" : theme.colors.success,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                      fontWeight: "600",
                      textAlign: "right",
                    }}
                  >
                    {statusLabel}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: "#ECFDF3",
            borderColor: "#ABEFC6",
            borderRadius: 22,
            borderWidth: 1,
            gap: 10,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ color: "#344054", fontFamily: theme.typography.body, fontSize: 13 }}>Subtotal</Text>
            <Text style={{ color: "#101828", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
              {fmt(subtotalCents)}
            </Text>
          </View>

          {discountCents > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: theme.colors.success, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                Tawad
              </Text>
              <Text style={{ color: theme.colors.success, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                -{fmt(discountCents)}
              </Text>
            </View>
          ) : null}

          <View style={{ borderTopColor: "#ABEFC6", borderTopWidth: 1, marginTop: 2, paddingTop: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text
                style={{
                  color: "#101828",
                  fontFamily: theme.typography.display,
                  fontSize: 18,
                  fontWeight: "600",
                }}
              >
                Total
              </Text>
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.typography.display,
                  fontSize: 24,
                  fontWeight: "600",
                }}
              >
                {fmt(totalCents)}
              </Text>
            </View>
          </View>
        </View>

        {paymentMethod === "cash" ? (
          <View
            style={{
              backgroundColor: "#101828",
              borderRadius: 20,
              gap: 10,
              padding: 16,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text style={{ color: "#D0D5DD", fontFamily: theme.typography.body, fontSize: 13 }}>Cash received</Text>
              <Text style={{ color: "#FFFFFF", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {fmt(cashPaidCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <Text
                style={{
                  color: "#86EFAC",
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "600",
                  textTransform: "uppercase",
                }}
              >
                Sukli
              </Text>
              <Text
                style={{
                  color: "#86EFAC",
                  fontFamily: theme.typography.display,
                  fontSize: 22,
                  fontWeight: "600",
                }}
              >
                {fmt(changeCents)}
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: "#F8FAFC",
              borderColor: "#E5E7EB",
              borderRadius: 18,
              borderWidth: 1,
              flexDirection: "row",
              justifyContent: "space-between",
              padding: 14,
            }}
          >
            <Text style={{ color: "#667085", fontFamily: theme.typography.body, fontSize: 13 }}>Paid via</Text>
            <Text style={{ color: "#101828", fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
              {paymentLabel}
            </Text>
          </View>
        )}

        <View
          style={{
            alignItems: "center",
            borderTopColor: "#E4E7EC",
            borderTopWidth: 1,
            gap: 6,
            paddingTop: 18,
          }}
        >
          <Text
            style={{
              color: "#101828",
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            Salamat sa inyong pagbili!
          </Text>
          <Text
            style={{
              color: "#667085",
              fontFamily: theme.typography.body,
              fontSize: 11,
              textAlign: "center",
            }}
          >
            Keep this custom receipt for your records.
          </Text>
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.typography.body,
              fontSize: 11,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            Powered by TindaHan AI
          </Text>
        </View>
      </View>
    </View>
  );
}

