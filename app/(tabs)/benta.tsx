import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Pressable, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { ActionButton } from "@/components/ActionButton";
import { CartItem } from "@/components/CartItem";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import { ModalSheet } from "@/components/ModalSheet";
import { ProductCard } from "@/components/ProductCard";
import { ReceiptView } from "@/components/ReceiptView";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import { useAppTheme } from "@/contexts/ThemeContext";
import { checkoutSale, getHomeMetrics, getProductByBarcode, listCustomersWithBalances, listProducts } from "@/db/repositories";
import { useCartStore } from "@/store/useCartStore";
import type { CustomerSummary, PaymentMethod, Product } from "@/types/models";
import { centsToDisplayValue, formatCurrencyFromCents, parseCurrencyToCents } from "@/utils/money";

const QUICK_PAY_VALUES = [5000, 10000, 20000, 50000];
const QUICK_DISCOUNT_PERCENTS = [5, 10, 15, 20];
const PAYMENT_METHODS: Array<{ key: PaymentMethod; label: string }> = [
  { key: "cash", label: "Cash" },
  { key: "gcash", label: "GCash" },
  { key: "maya", label: "Maya" },
  { key: "utang", label: "Utang" },
];

type CartFeedback = {
  title: string;
  message: string;
  tone: "success" | "warning";
  icon: "check-circle" | "alert-triangle";
};

export default function BentaScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cashInput, setCashInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingCheckout, setProcessingCheckout] = useState(false);
  const [cartSheetVisible, setCartSheetVisible] = useState(false);
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [tawadActive, setTawadActive] = useState(false);
  const [tawadInput, setTawadInput] = useState("");
  const [tawadType, setTawadType] = useState<"fixed" | "percent">("fixed");
  const [milestoneAmount, setMilestoneAmount] = useState(0);
  const [milestoneVisible, setMilestoneVisible] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<CartFeedback | null>(null);
  const [lastReceipt, setLastReceipt] = useState<{
    saleId: number;
    items: Array<{ name: string; quantity: number; priceCents: number }>;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    cashPaidCents: number;
    changeCents: number;
    paymentMethod: string;
    date: string;
  } | null>(null);
  const [storeName, setStoreName] = useState("");
  const receiptRef = useRef<View>(null);
  const cartPulseScale = useRef(new Animated.Value(1)).current;
  const cartPulseLift = useRef(new Animated.Value(0)).current;
  const cartFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const cartFeedbackTranslateY = useRef(new Animated.Value(10)).current;
  const cartFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const totalCents = useCartStore((state) =>
    state.items.reduce((runningTotal, item) => runningTotal + item.priceCents * item.quantity, 0),
  );
  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const loadScreenData = useCallback(async () => {
    setLoading(true);

    try {
      const [nextProducts, nextCustomers] = await Promise.all([
        listProducts(db, searchTerm),
        listCustomersWithBalances(db),
      ]);
      setProducts(nextProducts);
      setCustomers(nextCustomers);

      if (selectedCustomer) {
        const refreshedCustomer = nextCustomers.find((customer) => customer.id === selectedCustomer.id) ?? null;
        setSelectedCustomer(refreshedCustomer);
      }
    } finally {
      setLoading(false);
    }
  }, [db, searchTerm, selectedCustomer]);

  useFocusEffect(
    useCallback(() => {
      void loadScreenData();
      void Storage.getItem("tindahan.store-name").then((name) => {
        if (name) setStoreName(name);
      });
    }, [loadScreenData]),
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadScreenData();
    }, 180);

    return () => clearTimeout(timeout);
  }, [loadScreenData]);

  useEffect(() => {
    return () => {
      if (cartFeedbackTimeoutRef.current) {
        clearTimeout(cartFeedbackTimeoutRef.current);
      }
    };
  }, []);

  const cashPaidCents = parseCurrencyToCents(cashInput);
  const hasValidCash = Number.isFinite(cashPaidCents);

  const discountCents = tawadActive
    ? tawadType === "percent"
      ? Math.round((totalCents * Math.min(Number.parseFloat(tawadInput) || 0, 100)) / 100)
      : parseCurrencyToCents(tawadInput) || 0
    : 0;
  const finalTotalCents = Math.max(0, totalCents - discountCents);

  const changeCents = paymentMethod === "cash" && hasValidCash ? cashPaidCents - finalTotalCents : 0;
  const cartCountLabel = cartItems.length === 1 ? "1 item" : `${cartItems.length} items`;
  const selectedCustomerName = selectedCustomer?.name ?? "";
  const selectedCustomerBalanceText = selectedCustomer ? formatCurrencyFromCents(selectedCustomer.balanceCents) : "";
  const isEnoughCash = paymentMethod === "cash" ? hasValidCash && cashPaidCents >= finalTotalCents : true;
  const requiresCustomer = paymentMethod === "utang";
  const isCheckoutReady =
    cartItems.length > 0 && isEnoughCash && (!requiresCustomer || Boolean(selectedCustomer));

  const triggerCartFeedback = useCallback((feedback: CartFeedback) => {
    if (cartFeedbackTimeoutRef.current) {
      clearTimeout(cartFeedbackTimeoutRef.current);
    }

    setCartFeedback(feedback);

    cartPulseScale.stopAnimation();
    cartPulseLift.stopAnimation();
    cartFeedbackOpacity.stopAnimation();
    cartFeedbackTranslateY.stopAnimation();

    cartPulseScale.setValue(1);
    cartPulseLift.setValue(0);
    cartFeedbackOpacity.setValue(0);
    cartFeedbackTranslateY.setValue(10);

    Animated.parallel([
      Animated.sequence([
        Animated.parallel([
          Animated.spring(cartPulseScale, {
            damping: 10,
            mass: 0.7,
            stiffness: 220,
            toValue: 1.035,
            useNativeDriver: true,
          }),
          Animated.timing(cartPulseLift, {
            duration: 140,
            easing: Easing.out(Easing.cubic),
            toValue: -4,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(cartPulseScale, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(cartPulseLift, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(cartFeedbackOpacity, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(cartFeedbackTranslateY, {
          duration: 180,
          easing: Easing.out(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    cartFeedbackTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cartFeedbackOpacity, {
          duration: 180,
          easing: Easing.in(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(cartFeedbackTranslateY, {
          duration: 180,
          easing: Easing.in(Easing.cubic),
          toValue: 8,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setCartFeedback(null);
        }
      });
    }, 1500);
  }, [cartFeedbackOpacity, cartFeedbackTranslateY, cartPulseLift, cartPulseScale]);

  const handleAddToCart = useCallback(
    (product: Product) => {
      if (product.stock <= 0) {
        Alert.alert("Out of stock", `${product.name} is currently out of stock.`);
        return;
      }

      const existingItem = cartItems.find((item) => item.id === product.id);

      if (existingItem && existingItem.quantity >= product.stock) {
        triggerCartFeedback({
          icon: "alert-triangle",
          message: `${product.name} is already at the max available quantity.`,
          title: "Cart is full for this item",
          tone: "warning",
        });
        return;
      }

      addItem({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        stock: product.stock,
      });

      const nextQuantity = existingItem ? Math.min(existingItem.quantity + 1, product.stock) : 1;

      triggerCartFeedback({
        icon: "check-circle",
        message:
          nextQuantity > 1
            ? `${product.name} is now x${nextQuantity} in the cart.`
            : `${product.name} is ready in the cart.`,
        title: existingItem ? "Cart updated" : "Added to cart",
        tone: "success",
      });
    },
    [addItem, cartItems, triggerCartFeedback],
  );

  const handleOpenScanner = useCallback(async () => {
    if (!cameraPermission || !cameraPermission.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert("Camera needed", "Please allow camera access so TindaHan AI can scan product barcodes.");
        return;
      }
    }

    setScannerBusy(false);
    setScannerVisible(true);
  }, [cameraPermission, requestCameraPermission]);

  const handleBarcodeScanned = useCallback(
    async (result: BarcodeScanningResult) => {
      if (scannerBusy) {
        return;
      }

      setScannerBusy(true);
      setScannerVisible(false);

      try {
        const product = await getProductByBarcode(db, result.data);

        if (!product) {
          Alert.alert("Product not found", "Hindi nahanap ang barcode. I-add mo muna ang product sa catalog.");
          return;
        }

        handleAddToCart(product);
      } finally {
        setScannerBusy(false);
      }
    },
    [db, handleAddToCart, scannerBusy],
  );

  const handleCheckout = useCallback(async () => {
    if (cartItems.length === 0) {
      Alert.alert("Cart is empty", "Add products before checking out.");
      return;
    }

    if (paymentMethod === "cash" && (!hasValidCash || !isEnoughCash)) {
      Alert.alert("Cash not enough", "Enter a valid amount that covers the full total.");
      return;
    }

    if (paymentMethod === "utang" && !selectedCustomer) {
      Alert.alert("Customer required", "Select a customer before saving this utang transaction.");
      return;
    }

    const payloadItems = cartItems.map((item) => {
      const product = productById.get(item.id);

      if (!product) {
        throw new Error(`Product ${item.name} could not be refreshed.`);
      }

      return {
        id: item.id,
        name: item.name,
        priceCents: item.priceCents,
        costPriceCents: product.costPriceCents,
        quantity: item.quantity,
      };
    });

    setProcessingCheckout(true);

    try {
      const saleId = await checkoutSale(db, {
        items: payloadItems,
        totalCents: finalTotalCents,
        discountCents,
        cashPaidCents: paymentMethod === "cash" && hasValidCash ? cashPaidCents : 0,
        paymentMethod,
        customerId: selectedCustomer?.id ?? null,
        utangDescription: selectedCustomer ? `POS sale for ${selectedCustomer.name}` : undefined,
      });

      const receiptData = {
        saleId,
        items: payloadItems.map((item) => ({ name: item.name, quantity: item.quantity, priceCents: item.priceCents })),
        subtotalCents: totalCents,
        discountCents,
        totalCents: finalTotalCents,
        cashPaidCents: paymentMethod === "cash" && hasValidCash ? cashPaidCents : 0,
        changeCents: paymentMethod === "cash" ? changeCents : 0,
        paymentMethod,
        date: new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }),
      };
      setLastReceipt(receiptData);

      clearCart();
      setCartSheetVisible(false);
      setCashInput("");
      setPaymentMethod("cash");
      setSelectedCustomer(null);
      setTawadActive(false);
      setTawadInput("");
      setTawadType("fixed");
      await loadScreenData();

      const successSuffix =
        paymentMethod === "cash"
          ? `Change: ${formatCurrencyFromCents(changeCents)}.`
          : paymentMethod === "utang"
            ? `Linked to ${selectedCustomer?.name}'s utang ledger.`
            : `Saved as ${paymentMethod.toUpperCase()} payment.`;

      Alert.alert(
        "Sale completed",
        `Transaction #${saleId} saved successfully. ${successSuffix}`,
        [
          { text: "OK", style: "cancel" },
          {
            text: "Share Receipt",
            onPress: async () => {
              try {
                // Small delay to let the hidden receipt render
                await new Promise((r) => setTimeout(r, 200));
                const uri = await captureRef(receiptRef, { format: "png", quality: 1 });
                await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Receipt" });
              } catch (err) {
                Alert.alert("Share failed", String(err));
              }
            },
          },
        ],
      );

      // Check for daily sales milestones
      const MILESTONES = [500000, 200000, 100000, 50000];
      const todayKey = new Date().toISOString().slice(0, 10);
      const triggeredRaw = await Storage.getItem(`tindahan.milestones.${todayKey}`);
      const triggered = new Set<number>(triggeredRaw ? JSON.parse(triggeredRaw) as number[] : []);

      const homeMetrics = await getHomeMetrics(db);
      const dailyTotal = homeMetrics.todaySalesCents;

      for (const milestone of MILESTONES) {
        if (dailyTotal >= milestone && !triggered.has(milestone)) {
          triggered.add(milestone);
          await Storage.setItem(
            `tindahan.milestones.${todayKey}`,
            JSON.stringify([...triggered]),
          );
          setMilestoneAmount(milestone);
          setMilestoneVisible(true);
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Checkout failed. Please try again.";
      Alert.alert("Checkout failed", message);
    } finally {
      setProcessingCheckout(false);
    }
  }, [
    cartItems,
    cashPaidCents,
    changeCents,
    clearCart,
    db,
    hasValidCash,
    isEnoughCash,
    loadScreenData,
    paymentMethod,
    productById,
    selectedCustomer,
    totalCents,
  ]);

  return (
    <>
      <Screen
        contentContainerStyle={{
          gap: theme.spacing.md,
          paddingBottom: 104,
          paddingTop: theme.spacing.md,
        }}
        overlay={
          <>
            {cartFeedback ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  bottom: 88,
                  left: theme.spacing.lg,
                  opacity: cartFeedbackOpacity,
                  position: "absolute",
                  right: theme.spacing.lg,
                  transform: [{ translateY: cartFeedbackTranslateY }],
                }}
              >
                <View
                  style={{
                    backgroundColor: theme.colors.card,
                    borderColor:
                      cartFeedback.tone === "success" ? theme.colors.success : theme.colors.warning,
                    borderRadius: theme.radius.md,
                    borderWidth: 1,
                    flexDirection: "row",
                    gap: theme.spacing.md,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                    shadowColor: theme.colors.shadow,
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 1,
                    shadowRadius: 14,
                    elevation: 3,
                  }}
                >
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor:
                        cartFeedback.tone === "success"
                          ? theme.colors.successMuted
                          : theme.colors.warningMuted,
                      borderRadius: theme.radius.pill,
                      height: 36,
                      justifyContent: "center",
                      width: 36,
                    }}
                  >
                    <Feather
                      color={
                        cartFeedback.tone === "success"
                          ? theme.colors.success
                          : theme.colors.warning
                      }
                      name={cartFeedback.icon}
                      size={16}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                        fontWeight: "700",
                      }}
                    >
                      {cartFeedback.title}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        lineHeight: 17,
                      }}
                    >
                      {cartFeedback.message}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            ) : null}

            <Animated.View
              style={{
                bottom: theme.spacing.sm,
                left: theme.spacing.lg,
                position: "absolute",
                right: theme.spacing.lg,
                transform: [{ translateY: cartPulseLift }, { scale: cartPulseScale }],
              }}
            >
              <Pressable
                onPress={() => setCartSheetVisible(true)}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.card,
                  borderColor: cartItems.length > 0 ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  opacity: pressed ? 0.96 : 1,
                  padding: theme.spacing.md,
                  shadowColor: theme.colors.shadow,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 1,
                  shadowRadius: 18,
                  elevation: 3,
                })}
              >
                <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.md }}>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: cartItems.length > 0 ? theme.colors.primaryMuted : theme.colors.surfaceMuted,
                      borderRadius: theme.radius.pill,
                      height: 42,
                      justifyContent: "center",
                      width: 42,
                    }}
                  >
                    <Feather
                      color={cartItems.length > 0 ? theme.colors.primary : theme.colors.textSoft}
                      name="shopping-cart"
                      size={18}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {cartItems.length > 0 ? "Cart ready" : "Cart is empty"}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                      }}
                    >
                      {cartItems.length > 0
                        ? `${cartCountLabel} - ${formatCurrencyFromCents(finalTotalCents)}`
                        : "Tap products now, then open cart anytime."}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: theme.colors.primary,
                      borderRadius: theme.radius.pill,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.primaryText,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      View Cart
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          </>
        }
        subtitle="Tap products fast, then open the cart anytime from the sticky bar."
        title="Benta"
      >
        <SurfaceCard style={compactCardStyle}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: 22,
                  fontWeight: "700",
                }}
              >
                Add Products
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                }}
              >
                {loading ? "Refreshing catalog..." : `${products.length} products ready to add.`}
              </Text>
            </View>
            <StatusBadge label={cartItems.length > 0 ? `${cartCountLabel} in cart` : "Cart empty"} tone={cartItems.length > 0 ? "primary" : "neutral"} />
          </View>
          <InputField
            label="Search products"
            onChangeText={setSearchTerm}
            placeholder="Find by name, category, or barcode"
            value={searchTerm}
          />
          <ActionButton
            icon={<Feather color={theme.colors.primaryText} name="camera" size={16} />}
            label="Scan Barcode"
            onPress={() => void handleOpenScanner()}
          />
        </SurfaceCard>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {loading ? (
            <SurfaceCard style={[compactCardStyle, { width: "100%" }]}>
              <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.sm }}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  Loading product catalog...
                </Text>
              </View>
            </SurfaceCard>
          ) : products.length > 0 ? (
            products.map((product) => {
              const marginPercent =
                product.priceCents > 0
                  ? `${(((product.priceCents - product.costPriceCents) / product.priceCents) * 100).toFixed(0)}%`
                  : "0%";

              return (
                <ProductCard
                  barcode={product.barcode}
                  category={product.category}
                  compact
                  disabled={product.stock <= 0}
                  imageUri={product.imageUri}
                  key={product.id}
                  marginPercent={marginPercent}
                  minStock={product.minStock}
                  name={product.name}
                  onPress={() => handleAddToCart(product)}
                  priceCents={product.priceCents}
                  showInfoFlip
                  stock={product.stock}
                />
              );
            })
          ) : (
            <View style={{ width: "100%" }}>
              <EmptyState
                icon="package"
                message="Add products first in the Produkto tab to start selling from the POS screen."
                title="No Products Yet"
              />
            </View>
          )}
        </View>

        {false ? (
          <SurfaceCard style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.display,
                fontSize: 24,
                fontWeight: "700",
              }}
            >
              Current Cart
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              Update quantities before saving the sale.
            </Text>
          </View>

          {cartItems.length > 0 ? (
            cartItems.map((item) => (
              <CartItem
                key={item.id}
                maxQuantity={item.stock}
                name={item.name}
                onDecrease={() => updateQuantity(item.id, item.quantity - 1)}
                onIncrease={() => updateQuantity(item.id, item.quantity + 1)}
                onRemove={() => removeItem(item.id)}
                priceCents={item.priceCents}
                quantity={item.quantity}
              />
            ))
          ) : (
            <EmptyState
              icon="shopping-cart"
              message="Tap any product card above and it will appear here instantly."
              title="Cart Is Empty"
            />
          )}

          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Subtotal
              </Text>
              <Text
                style={{
                  color: discountCents > 0 ? theme.colors.textMuted : theme.colors.text,
                  fontFamily: theme.typography.display,
                  fontSize: discountCents > 0 ? 18 : 28,
                  fontWeight: "700",
                  textDecorationLine: discountCents > 0 ? "line-through" : "none",
                }}
              >
                {formatCurrencyFromCents(totalCents)}
              </Text>
            </View>

            {discountCents > 0 ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text
                  style={{
                    color: theme.colors.success,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Tawad ({tawadType === "percent" ? `${tawadInput}%` : formatCurrencyFromCents(discountCents)} off)
                </Text>
                <Text
                  style={{
                    color: theme.colors.success,
                    fontFamily: theme.typography.display,
                    fontSize: 28,
                    fontWeight: "700",
                  }}
                >
                  {formatCurrencyFromCents(finalTotalCents)}
                </Text>
              </View>
            ) : null}

            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  Tawad (Discount)
                </Text>
                <ActionButton
                  label={tawadActive ? "Remove" : "Add Tawad"}
                  onPress={() => {
                    setTawadActive(!tawadActive);
                    if (tawadActive) {
                      setTawadInput("");
                      setTawadType("fixed");
                    }
                  }}
                  style={{ paddingHorizontal: 14, paddingVertical: 8 }}
                  variant={tawadActive ? "ghost" : "secondary"}
                />
              </View>

              {tawadActive ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                    <ActionButton
                      label="Fixed ₱"
                      onPress={() => { setTawadType("fixed"); setTawadInput(""); }}
                      style={{ flex: 1 }}
                      variant={tawadType === "fixed" ? "primary" : "ghost"}
                    />
                    <ActionButton
                      label="Percent %"
                      onPress={() => { setTawadType("percent"); setTawadInput(""); }}
                      style={{ flex: 1 }}
                      variant={tawadType === "percent" ? "primary" : "ghost"}
                    />
                  </View>
                  <InputField
                    keyboardType="decimal-pad"
                    label={tawadType === "fixed" ? "Discount amount (₱)" : "Discount percent (%)"}
                    onChangeText={setTawadInput}
                    placeholder={tawadType === "fixed" ? "0.00" : "10"}
                    value={tawadInput}
                  />
                  {tawadType === "percent" ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                      {QUICK_DISCOUNT_PERCENTS.map((pct) => (
                        <ActionButton
                          key={pct}
                          label={`${pct}%`}
                          onPress={() => setTawadInput(String(pct))}
                          style={{ flex: 1, minWidth: 60 }}
                          variant="ghost"
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Payment method
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {PAYMENT_METHODS.map((method) => (
                  <ActionButton
                    key={method.key}
                    label={method.label}
                    onPress={() => {
                      setPaymentMethod(method.key);
                      if (method.key !== "utang") {
                        setSelectedCustomer(null);
                      }
                    }}
                    style={{ flex: 1, minWidth: 120 }}
                    variant={paymentMethod === method.key ? "primary" : "ghost"}
                  />
                ))}
              </View>
            </View>

            {paymentMethod === "cash" ? (
              <>
                <InputField
                  keyboardType="decimal-pad"
                  label="Cash received"
                  onChangeText={setCashInput}
                  placeholder="0.00"
                  value={cashInput}
                />

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                  {QUICK_PAY_VALUES.map((value) => (
                    <ActionButton
                      key={value}
                      label={formatCurrencyFromCents(value)}
                      onPress={() => setCashInput(centsToDisplayValue(value))}
                      style={{ flex: 1, minWidth: 120 }}
                      variant="ghost"
                    />
                  ))}
                </View>
              </>
            ) : paymentMethod === "utang" ? (
              <View style={{ gap: theme.spacing.sm }}>
                {selectedCustomer ? (
                  <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
                    <StatusBadge label="Linked Customer" tone="warning" />
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      {selectedCustomerName}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                      }}
                    >
                      Current balance: {selectedCustomerBalanceText}
                    </Text>
                  </SurfaceCard>
                ) : null}

                <ActionButton
                  label={selectedCustomer ? "Change Customer" : "Select Customer"}
                  onPress={() => setCustomerPickerVisible(true)}
                  variant="secondary"
                />
                {customers.length === 0 ? (
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    Add a customer in Palista first before saving an utang sale.
                  </Text>
                ) : null}
              </View>
            ) : (
              <View
                style={{
                  backgroundColor: theme.colors.primaryMuted,
                  borderRadius: theme.radius.sm,
                  padding: theme.spacing.md,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  No cash input needed. This sale will be saved under {paymentMethod.toUpperCase()}.
                </Text>
              </View>
            )}

            <View
              style={{
                backgroundColor:
                  paymentMethod === "cash"
                    ? isEnoughCash
                      ? theme.colors.successMuted
                      : theme.colors.dangerMuted
                    : paymentMethod === "utang" && !selectedCustomer
                      ? theme.colors.warningMuted
                      : theme.colors.successMuted,
                borderRadius: theme.radius.sm,
                padding: theme.spacing.md,
              }}
            >
              <Text
                style={{
                  color:
                    paymentMethod === "cash"
                      ? isEnoughCash
                        ? theme.colors.success
                        : theme.colors.danger
                      : paymentMethod === "utang" && !selectedCustomer
                        ? theme.colors.warning
                        : theme.colors.success,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {paymentMethod === "cash"
                  ? isEnoughCash
                    ? `Sukli: ${formatCurrencyFromCents(changeCents)}`
                    : "Kulang pa ang cash para ma-checkout."
                  : paymentMethod === "utang"
                    ? selectedCustomer
                      ? "This sale will be added to the selected customer's utang ledger."
                      : "Pick a customer before saving this utang sale."
                    : `Digital payment ready via ${paymentMethod.toUpperCase()}.`}
              </Text>
            </View>

            <ActionButton
              disabled={processingCheckout || !isCheckoutReady}
              label={processingCheckout ? "Saving sale..." : "I-checkout"}
              onPress={() => void handleCheckout()}
            />
          </View>
          </SurfaceCard>
        ) : null}
      </Screen>

      <ModalSheet
        footer={
          <ActionButton
            disabled={processingCheckout || !isCheckoutReady}
            label={processingCheckout ? "Saving sale..." : "I-checkout"}
            onPress={() => void handleCheckout()}
          />
        }
        onClose={() => setCartSheetVisible(false)}
        subtitle={cartItems.length > 0 ? `${cartCountLabel} ready for checkout.` : "Tap products from the catalog to start a sale."}
        title="Cart & Checkout"
        visible={cartSheetVisible}
      >
        {cartItems.length > 0 ? (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              <StatusBadge label={cartCountLabel} tone="primary" />
              <StatusBadge label={`Total ${formatCurrencyFromCents(finalTotalCents)}`} tone="success" />
            </View>

            {cartItems.map((item) => (
              <CartItem
                compact
                key={item.id}
                maxQuantity={item.stock}
                name={item.name}
                onDecrease={() => updateQuantity(item.id, item.quantity - 1)}
                onIncrease={() => updateQuantity(item.id, item.quantity + 1)}
                onRemove={() => removeItem(item.id)}
                priceCents={item.priceCents}
                quantity={item.quantity}
              />
            ))}

            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text
                  style={{
                    color: discountCents > 0 ? theme.colors.textMuted : theme.colors.text,
                    fontFamily: theme.typography.display,
                    fontSize: discountCents > 0 ? 18 : 26,
                    fontWeight: "700",
                    textDecorationLine: discountCents > 0 ? "line-through" : "none",
                  }}
                >
                  {formatCurrencyFromCents(totalCents)}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Subtotal
                </Text>
              </View>

              {discountCents > 0 ? (
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      color: theme.colors.success,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Tawad ({tawadType === "percent" ? `${tawadInput}%` : formatCurrencyFromCents(discountCents)} off)
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.success,
                      fontFamily: theme.typography.display,
                      fontSize: 26,
                      fontWeight: "700",
                    }}
                  >
                    {formatCurrencyFromCents(finalTotalCents)}
                  </Text>
                </View>
              ) : null}

              <View style={{ gap: theme.spacing.sm }}>
                <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Tawad (Discount)
                  </Text>
                  <ActionButton
                    label={tawadActive ? "Remove" : "Add Tawad"}
                    onPress={() => {
                      setTawadActive(!tawadActive);
                      if (tawadActive) {
                        setTawadInput("");
                        setTawadType("fixed");
                      }
                    }}
                    style={{ paddingHorizontal: 14, paddingVertical: 8 }}
                    variant={tawadActive ? "ghost" : "secondary"}
                  />
                </View>

                {tawadActive ? (
                  <View style={{ gap: theme.spacing.sm }}>
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                      <ActionButton
                        label="Fixed PHP"
                        onPress={() => {
                          setTawadType("fixed");
                          setTawadInput("");
                        }}
                        style={{ flex: 1 }}
                        variant={tawadType === "fixed" ? "primary" : "ghost"}
                      />
                      <ActionButton
                        label="Percent %"
                        onPress={() => {
                          setTawadType("percent");
                          setTawadInput("");
                        }}
                        style={{ flex: 1 }}
                        variant={tawadType === "percent" ? "primary" : "ghost"}
                      />
                    </View>
                    <InputField
                      keyboardType="decimal-pad"
                      label={tawadType === "fixed" ? "Discount amount (PHP)" : "Discount percent (%)"}
                      onChangeText={setTawadInput}
                      placeholder={tawadType === "fixed" ? "0.00" : "10"}
                      value={tawadInput}
                    />
                    {tawadType === "percent" ? (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                        {QUICK_DISCOUNT_PERCENTS.map((pct) => (
                          <ActionButton
                            key={pct}
                            label={`${pct}%`}
                            onPress={() => setTawadInput(String(pct))}
                            style={{ flex: 1, minWidth: 60 }}
                            variant="ghost"
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  Payment method
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                  {PAYMENT_METHODS.map((method) => (
                    <ActionButton
                      key={method.key}
                      label={method.label}
                      onPress={() => {
                        setPaymentMethod(method.key);
                        if (method.key !== "utang") {
                          setSelectedCustomer(null);
                        }
                      }}
                      style={{ flex: 1, minWidth: 120 }}
                      variant={paymentMethod === method.key ? "primary" : "ghost"}
                    />
                  ))}
                </View>
              </View>

              {paymentMethod === "cash" ? (
                <>
                  <InputField
                    keyboardType="decimal-pad"
                    label="Cash received"
                    onChangeText={setCashInput}
                    placeholder="0.00"
                    value={cashInput}
                  />

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                    {QUICK_PAY_VALUES.map((value) => (
                      <ActionButton
                        key={value}
                        label={formatCurrencyFromCents(value)}
                        onPress={() => setCashInput(centsToDisplayValue(value))}
                        style={{ flex: 1, minWidth: 120 }}
                        variant="ghost"
                      />
                    ))}
                  </View>
                </>
              ) : paymentMethod === "utang" ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {selectedCustomer ? (
                    <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
                      <StatusBadge label="Linked Customer" tone="warning" />
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 15,
                          fontWeight: "700",
                        }}
                      >
                        {selectedCustomer.name}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 13,
                        }}
                      >
                        Current balance: {formatCurrencyFromCents(selectedCustomer.balanceCents)}
                      </Text>
                    </SurfaceCard>
                  ) : null}

                  <ActionButton
                    label={selectedCustomer ? "Change Customer" : "Select Customer"}
                    onPress={() => setCustomerPickerVisible(true)}
                    variant="secondary"
                  />
                  {customers.length === 0 ? (
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                      }}
                    >
                      Add a customer in Palista first before saving an utang sale.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View
                  style={{
                    backgroundColor: theme.colors.primaryMuted,
                    borderRadius: theme.radius.sm,
                    padding: theme.spacing.md,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontFamily: theme.typography.body,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    No cash input needed. This sale will be saved under {paymentMethod.toUpperCase()}.
                  </Text>
                </View>
              )}

              <View
                style={{
                  backgroundColor:
                    paymentMethod === "cash"
                      ? isEnoughCash
                        ? theme.colors.successMuted
                        : theme.colors.dangerMuted
                      : paymentMethod === "utang" && !selectedCustomer
                        ? theme.colors.warningMuted
                        : theme.colors.successMuted,
                  borderRadius: theme.radius.sm,
                  padding: theme.spacing.md,
                }}
              >
                <Text
                  style={{
                    color:
                      paymentMethod === "cash"
                        ? isEnoughCash
                          ? theme.colors.success
                          : theme.colors.danger
                        : paymentMethod === "utang" && !selectedCustomer
                          ? theme.colors.warning
                          : theme.colors.success,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {paymentMethod === "cash"
                    ? isEnoughCash
                      ? `Sukli: ${formatCurrencyFromCents(changeCents)}`
                      : "Kulang pa ang cash para ma-checkout."
                    : paymentMethod === "utang"
                      ? selectedCustomer
                        ? "This sale will be added to the selected customer's utang ledger."
                        : "Pick a customer before saving this utang sale."
                      : `Digital payment ready via ${paymentMethod.toUpperCase()}.`}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <EmptyState
            icon="shopping-cart"
            message="Tap any product card and your active sale will appear here instantly."
            title="Cart Is Empty"
          />
        )}
      </ModalSheet>

      <ModalSheet
        footer={<ActionButton label="Close" onPress={() => setCustomerPickerVisible(false)} variant="ghost" />}
        onClose={() => setCustomerPickerVisible(false)}
        subtitle="Choose the customer whose utang ledger should receive this sale."
        title="Select Customer"
        visible={customerPickerVisible}
      >
        {customers.length > 0 ? (
          customers.map((customer) => (
            <SurfaceCard key={customer.id} style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1, gap: 4, paddingRight: theme.spacing.md }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    {customer.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    Balance {formatCurrencyFromCents(customer.balanceCents)}
                  </Text>
                </View>
                <StatusBadge
                  label={customer.trustScore}
                  tone={
                    customer.trustScore === "Delikado"
                      ? "danger"
                      : customer.trustScore === "Bantayan"
                        ? "warning"
                        : customer.trustScore === "Maaasahan"
                          ? "success"
                          : "neutral"
                  }
                />
              </View>
              <ActionButton
                label="Use This Customer"
                onPress={() => {
                  setSelectedCustomer(customer);
                  setCustomerPickerVisible(false);
                }}
                variant="secondary"
              />
            </SurfaceCard>
          ))
        ) : (
          <EmptyState
            icon="users"
            message="Create a customer in Palista first, then return here to save utang-based checkout."
            title="No Customers Yet"
          />
        )}
      </ModalSheet>

      <ModalSheet
        footer={<ActionButton label="Close Scanner" onPress={() => setScannerVisible(false)} variant="ghost" />}
        onClose={() => setScannerVisible(false)}
        subtitle="Point the camera at a supported product barcode to add it directly to the cart."
        title="Barcode Scanner"
        visible={scannerVisible}
      >
        <View
          style={{
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          {cameraPermission?.granted ? (
            <CameraView
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
              }}
              onBarcodeScanned={scannerVisible ? handleBarcodeScanned : undefined}
              style={{ height: 340, width: "100%" }}
            />
          ) : (
            <View
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.surface,
                gap: theme.spacing.md,
                justifyContent: "center",
                minHeight: 220,
                padding: theme.spacing.lg,
              }}
            >
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  textAlign: "center",
                }}
              >
                Camera permission is required before barcode scanning can start.
              </Text>
              <ActionButton label="Grant Camera Access" onPress={() => void handleOpenScanner()} />
            </View>
          )}
        </View>
      </ModalSheet>

      <MilestoneCelebration
        amountCents={milestoneAmount}
        onDismiss={() => setMilestoneVisible(false)}
        visible={milestoneVisible}
      />

      {lastReceipt ? (
        <View style={{ left: -9999, position: "absolute", top: -9999 }}>
          <ReceiptView
            ref={receiptRef}
            cashPaidCents={lastReceipt.cashPaidCents}
            changeCents={lastReceipt.changeCents}
            date={lastReceipt.date}
            discountCents={lastReceipt.discountCents}
            items={lastReceipt.items}
            paymentMethod={lastReceipt.paymentMethod}
            saleId={lastReceipt.saleId}
            storeName={storeName}
            subtotalCents={lastReceipt.subtotalCents}
            totalCents={lastReceipt.totalCents}
          />
        </View>
      ) : null}
    </>
  );
}
