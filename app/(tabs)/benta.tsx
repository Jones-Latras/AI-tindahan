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
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  checkoutSale,
  getStoreName,
  getHomeMetrics,
  getProductByBarcode,
  listCustomersWithBalances,
  listProductCategories,
  listProducts,
  saveStoreName,
  saveProduct,
} from "@/db/repositories";
import { useCartStore } from "@/store/useCartStore";
import type { CustomerSummary, PaymentMethod, Product } from "@/types/models";
import { centsToDisplayValue, formatCurrencyFromCents, parseCurrencyToCents } from "@/utils/money";
import {
  computeProfitMargin,
  computeTransactionTotal,
  formatMarginPercent,
  formatProductMinStockLabel,
  formatProductPriceLabel,
  formatProductStockLabel,
  formatWeightKg,
} from "@/utils/pricing";

const QUICK_DISCOUNT_PERCENTS = [5, 10, 15, 20];
const STORE_NAME_KEY = "tindahan.store-name";
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

function parseDecimalInput(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "").trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export default function BentaScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [cashInput, setCashInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentMethodExpanded, setPaymentMethodExpanded] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingCatalog, setRefreshingCatalog] = useState(false);
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
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [selectedWeightProduct, setSelectedWeightProduct] = useState<Product | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditProduct, setQuickEditProduct] = useState<Product | null>(null);
  const [quickEditValue, setQuickEditValue] = useState("");
  const [savingQuickEdit, setSavingQuickEdit] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [sharingReceipt, setSharingReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    saleId: number;
    items: Array<{
      name: string;
      quantity: number;
      weightKg: number | null;
      priceCents: number;
      lineTotalCents: number;
      isWeightBased: boolean;
    }>;
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    cashPaidCents: number;
    changeCents: number;
    paymentMethod: string;
    date: string;
  } | null>(null);
  const [storeName, setStoreName] = useState("");
  const receiptCaptureRef = useRef<View>(null);
  const cartPulseScale = useRef(new Animated.Value(1)).current;
  const cartPulseLift = useRef(new Animated.Value(0)).current;
  const cartFeedbackOpacity = useRef(new Animated.Value(0)).current;
  const cartFeedbackTranslateY = useRef(new Animated.Value(10)).current;
  const cartFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedCatalogRef = useRef(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const cartItems = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const removeItem = useCartStore((state) => state.removeItem);
  const setItem = useCartStore((state) => state.setItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const totalCents = useCartStore((state) =>
    state.items.reduce((runningTotal, item) => runningTotal + item.priceCents * item.quantity, 0),
  );
  const compactCardStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
  } as const;

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartSelectionCountByProductId = useMemo(() => {
    const selectionCount = new Map<number, number>();

    for (const item of cartItems) {
      selectionCount.set(item.id, item.isWeightBased ? 1 : Math.max(1, Math.trunc(item.quantity)));
    }

    return selectionCount;
  }, [cartItems]);
  const reservedQuantityByProductId = useMemo(() => {
    const reservedQuantity = new Map<number, number>();

    for (const item of cartItems) {
      reservedQuantity.set(item.id, (reservedQuantity.get(item.id) ?? 0) + item.quantity);
    }

    return reservedQuantity;
  }, [cartItems]);
  const visibleProducts = useMemo(
    () =>
      selectedCategory
        ? products.filter(
            (product) =>
              normalizeCategoryName(product.category ?? "").toLocaleLowerCase() === selectedCategory.toLocaleLowerCase(),
          )
        : products,
    [products, selectedCategory],
  );
  const selectedWeightValue = parseDecimalInput(weightInput);
  const weightLineTotalCents =
    selectedWeightProduct && Number.isFinite(selectedWeightValue) && selectedWeightValue > 0
      ? computeTransactionTotal(selectedWeightValue, selectedWeightProduct.priceCents)
      : 0;
  const quickEditNumericValue =
    quickEditProduct?.pricingStrategy === "margin_based"
      ? parseDecimalInput(quickEditValue)
      : parseCurrencyToCents(quickEditValue);
  const selectedPaymentMethodOption =
    PAYMENT_METHODS.find((method) => method.key === paymentMethod) ?? PAYMENT_METHODS[0];

  const loadStoreName = useCallback(async () => {
    const [dbStoreName, legacyStoreName] = await Promise.all([
      getStoreName(db),
      Storage.getItem(STORE_NAME_KEY),
    ]);
    const normalizedLegacyStoreName = legacyStoreName?.trim() ?? "";
    const nextStoreName = dbStoreName ?? normalizedLegacyStoreName;

    if (!dbStoreName && normalizedLegacyStoreName.length >= 2) {
      await saveStoreName(db, normalizedLegacyStoreName);
    }

    setStoreName(nextStoreName);
  }, [db]);

  const getRemainingProductStock = useCallback(
    (product: Product) => {
      const totalAvailable = product.isWeightBased ? product.totalKgAvailable ?? 0 : product.stock;
      const reservedQuantity = reservedQuantityByProductId.get(product.id) ?? 0;
      const remainingQuantity = Math.max(0, totalAvailable - reservedQuantity);

      return product.isWeightBased ? Number(remainingQuantity.toFixed(3)) : Math.trunc(remainingQuantity);
    },
    [reservedQuantityByProductId],
  );

  const loadScreenData = useCallback(async (mode: "foreground" | "background" = "background") => {
    const showSkeleton = mode === "foreground" && !hasLoadedCatalogRef.current;

    if (showSkeleton) {
      setLoading(true);
    } else {
      setRefreshingCatalog(true);
    }

    try {
      const [nextProducts, nextCustomers, nextCategories] = await Promise.all([
        listProducts(db, searchTerm),
        listCustomersWithBalances(db),
        listProductCategories(db),
      ]);
      setProducts(nextProducts);
      setCustomers(nextCustomers);
      setCategories(nextCategories);
      setSelectedCustomer((currentSelected) =>
        currentSelected
          ? nextCustomers.find((customer) => customer.id === currentSelected.id) ?? null
          : currentSelected,
      );
      hasLoadedCatalogRef.current = true;
    } finally {
      if (showSkeleton) {
        setLoading(false);
      } else {
        setRefreshingCatalog(false);
      }
    }
  }, [db, searchTerm]);

  useFocusEffect(
    useCallback(() => {
      void loadScreenData(hasLoadedCatalogRef.current ? "background" : "foreground");
      void loadStoreName();
    }, [loadScreenData, loadStoreName]),
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadScreenData(hasLoadedCatalogRef.current ? "background" : "foreground");
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
  const cartUnitCount = cartItems.reduce(
    (runningTotal, item) => runningTotal + (item.isWeightBased ? 1 : Math.max(1, Math.trunc(item.quantity))),
    0,
  );

  const changeCents = paymentMethod === "cash" && hasValidCash ? cashPaidCents - finalTotalCents : 0;
  const cartCountLabel =
    cartUnitCount === 1 ? t("benta.cartCount.single") : t("benta.cartCount.plural", { count: cartUnitCount });
  const cartSummaryLabel = `${cartCountLabel} - ${formatCurrencyFromCents(finalTotalCents)}`;
  const categoryCountLabel = categories.length === 1 ? "1 category" : `${categories.length} categories`;
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

  const openWeightModal = useCallback(
    (product: Product) => {
      const existingItem = cartItems.find((item) => item.id === product.id);
      setSelectedWeightProduct(product);
      setWeightInput(existingItem && existingItem.isWeightBased ? formatWeightKg(existingItem.quantity) : "");
      setWeightModalVisible(true);
    },
    [cartItems],
  );

  const handleAddToCart = useCallback(
    (product: Product) => {
      const totalStock = product.isWeightBased ? product.totalKgAvailable ?? 0 : product.stock;
      const availableStock = getRemainingProductStock(product);

      if (availableStock <= 0) {
        const reservedQuantity = reservedQuantityByProductId.get(product.id) ?? 0;

        if (reservedQuantity > 0) {
          triggerCartFeedback({
            icon: "alert-triangle",
            message: `${product.name} is already fully reserved in the cart.`,
            title: "Cart already has all available stock",
            tone: "warning",
          });
          return;
        }

        Alert.alert("Out of stock", `${product.name} is currently out of stock.`);
        return;
      }

      if (product.isWeightBased) {
        openWeightModal(product);
        return;
      }

      const existingItem = cartItems.find((item) => item.id === product.id);

      addItem({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        stock: totalStock,
        isWeightBased: false,
      });

      const nextQuantity = existingItem ? Math.min(existingItem.quantity + 1, totalStock) : 1;

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
    [addItem, cartItems, getRemainingProductStock, openWeightModal, reservedQuantityByProductId, triggerCartFeedback],
  );

  const handleConfirmWeightItem = useCallback(() => {
    if (!selectedWeightProduct) {
      return;
    }

    if (!Number.isFinite(selectedWeightValue) || selectedWeightValue <= 0) {
      Alert.alert("Invalid weight", "Enter a valid weight in kilograms.");
      return;
    }

    const availableKg = selectedWeightProduct.totalKgAvailable ?? 0;

    if (selectedWeightValue > availableKg) {
      Alert.alert("Weight too high", `Only ${formatWeightKg(availableKg)} kg is available right now.`);
      return;
    }

    setItem({
      id: selectedWeightProduct.id,
      name: selectedWeightProduct.name,
      priceCents: selectedWeightProduct.priceCents,
      stock: availableKg,
      quantity: selectedWeightValue,
      isWeightBased: true,
    });

    setWeightModalVisible(false);
    setSelectedWeightProduct(null);
    setWeightInput("");

    triggerCartFeedback({
      icon: "check-circle",
      message: `${formatWeightKg(selectedWeightValue)} kg of ${selectedWeightProduct.name} is ready in the cart.`,
      title: "Weight added",
      tone: "success",
    });
  }, [selectedWeightProduct, selectedWeightValue, setItem, triggerCartFeedback]);

  const openQuickEditModal = useCallback(
    (product: Product) => {
      if (!product.isWeightBased) {
        return;
      }

      setQuickEditProduct(product);
      setQuickEditValue(
        product.pricingStrategy === "margin_based"
          ? String(product.targetMarginPercent ?? computeProfitMargin(product.costPriceCents, product.priceCents))
          : centsToDisplayValue(product.priceCents),
      );
      setQuickEditVisible(true);
    },
    [],
  );

  const handleQuickEditSave = useCallback(async () => {
    if (!quickEditProduct) {
      return;
    }

    if (quickEditProduct.pricingStrategy === "margin_based") {
      if (!Number.isFinite(quickEditNumericValue) || quickEditNumericValue <= 0 || quickEditNumericValue >= 100) {
        Alert.alert("Invalid margin", "Enter a target margin greater than 0 and less than 100.");
        return;
      }
    } else if (!Number.isFinite(quickEditNumericValue) || quickEditNumericValue <= 0) {
      Alert.alert("Invalid price", "Enter a valid selling price per kilogram.");
      return;
    }

    setSavingQuickEdit(true);

    try {
      await saveProduct(
        db,
        {
          name: quickEditProduct.name,
          priceCents:
            quickEditProduct.pricingStrategy === "manual"
              ? (quickEditNumericValue as number)
              : quickEditProduct.priceCents,
          costPriceCents: quickEditProduct.costPriceCents,
          stock: quickEditProduct.stock,
          category: quickEditProduct.category ?? "",
          barcode: quickEditProduct.barcode ?? "",
          imageUri: quickEditProduct.imageUri ?? "",
          minStock: quickEditProduct.minStock,
          isWeightBased: true,
          pricingMode: quickEditProduct.pricingMode,
          pricingStrategy: quickEditProduct.pricingStrategy,
          totalKgAvailable: quickEditProduct.totalKgAvailable ?? 0,
          costPriceTotalCents: quickEditProduct.costPriceTotalCents,
          sellingPriceTotalCents: quickEditProduct.pricingMode === "derived" ? undefined : quickEditProduct.sellingPriceTotalCents,
          costPricePerKgCents: quickEditProduct.costPricePerKgCents ?? quickEditProduct.costPriceCents,
          sellingPricePerKgCents:
            quickEditProduct.pricingStrategy === "manual" ? (quickEditNumericValue as number) : undefined,
          targetMarginPercent:
            quickEditProduct.pricingStrategy === "margin_based" ? parseDecimalInput(quickEditValue) : undefined,
        },
        quickEditProduct.id,
      );

      setQuickEditVisible(false);
      setQuickEditProduct(null);
      setQuickEditValue("");
      await loadScreenData("background");
    } catch (error) {
      Alert.alert("Quick edit failed", error instanceof Error ? error.message : "Could not update the product.");
    } finally {
      setSavingQuickEdit(false);
    }
  }, [db, loadScreenData, quickEditNumericValue, quickEditProduct, quickEditValue]);

  const handleSelectPaymentMethod = useCallback((method: PaymentMethod) => {
    setPaymentMethod(method);
    setPaymentMethodExpanded(false);

    if (method !== "utang") {
      setSelectedCustomer(null);
    }
  }, []);

  const handleShareReceipt = useCallback(async () => {
    if (!lastReceipt || !receiptCaptureRef.current) {
      Alert.alert("Receipt unavailable", "The receipt is not ready yet. Please try again in a moment.");
      return;
    }

    setSharingReceipt(true);

    try {
      const sharingAvailable = await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        throw new Error("Sharing is not available on this device.");
      }

      await new Promise((resolve) => setTimeout(resolve, 180));

      const uri = await captureRef(receiptCaptureRef.current, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle: `${storeName || "TindaHan AI"} Receipt`,
        UTI: "public.png",
      });
    } catch (error) {
      Alert.alert("Share failed", error instanceof Error ? error.message : "Could not share the receipt.");
    } finally {
      setSharingReceipt(false);
    }
  }, [lastReceipt, storeName]);

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

      const lineTotalCents = Math.round(item.priceCents * item.quantity);
      const lineCostTotalCents = Math.round(product.costPriceCents * item.quantity);

      return {
        id: item.id,
        name: item.name,
        priceCents: item.priceCents,
        costPriceCents: product.costPriceCents,
        quantity: item.isWeightBased ? 1 : item.quantity,
        isWeightBased: item.isWeightBased,
        weightKg: item.isWeightBased ? item.quantity : null,
        lineTotalCents,
        lineCostTotalCents,
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
      });

      const receiptData = {
        saleId,
        items: payloadItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          weightKg: item.weightKg,
          priceCents: item.priceCents,
          lineTotalCents: item.lineTotalCents,
          isWeightBased: item.isWeightBased,
        })),
        subtotalCents: totalCents,
        discountCents,
        totalCents: finalTotalCents,
        cashPaidCents: paymentMethod === "cash" && hasValidCash ? cashPaidCents : 0,
        changeCents: paymentMethod === "cash" ? changeCents : 0,
        paymentMethod,
        date: new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }),
      };
      setLastReceipt(receiptData);
      setReceiptVisible(true);

      clearCart();
      setCartSheetVisible(false);
      setCashInput("");
      setPaymentMethod("cash");
      setPaymentMethodExpanded(false);
      setSelectedCustomer(null);
      setTawadActive(false);
      setTawadInput("");
      setTawadType("fixed");
      await loadScreenData("background");

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
                  backgroundColor: cartItems.length > 0 ? theme.colors.primary : theme.colors.card,
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
                      backgroundColor: cartItems.length > 0 ? "rgba(255, 255, 255, 0.14)" : theme.colors.surfaceMuted,
                      borderRadius: theme.radius.pill,
                      height: 42,
                      justifyContent: "center",
                      width: 42,
                    }}
                  >
                    <Feather
                      color={cartItems.length > 0 ? theme.colors.primaryText : theme.colors.textSoft}
                      name="shopping-cart"
                      size={18}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: cartItems.length > 0 ? theme.colors.primaryText : theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {cartItems.length > 0 ? cartSummaryLabel : t("benta.cartBar.emptyTitle")}
                    </Text>
                    <Text
                      style={{
                        color: cartItems.length > 0 ? theme.colors.primaryText : theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        opacity: cartItems.length > 0 ? 0.86 : 1,
                      }}
                    >
                      {cartItems.length > 0
                        ? t("benta.cartBar.activeSubtitle")
                        : t("benta.cartBar.emptySubtitle")}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: cartItems.length > 0 ? theme.colors.primaryText : theme.colors.primary,
                      borderRadius: theme.radius.pill,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: cartItems.length > 0 ? theme.colors.primary : theme.colors.primaryText,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        fontWeight: "700",
                      }}
                    >
                      {t("benta.cartBar.view")}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          </>
        }
        title={t("benta.title")}
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
                {loading
                  ? "Loading catalog..."
                  : refreshingCatalog
                    ? "Refreshing catalog in the background..."
                    : `${visibleProducts.length} products ready to add.`}
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
          <View style={{ gap: theme.spacing.sm }}>
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: theme.spacing.sm,
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  Categories
                </Text>
                <Text
                  style={{
                    color: theme.colors.textSoft,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                  }}
                >
                  {selectedCategory ? `Showing ${selectedCategory}` : `Showing all products - ${categoryCountLabel}`}
                </Text>
              </View>
              <Pressable
                onPress={() => setCategoriesExpanded((current) => !current)}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  flexDirection: "row",
                  gap: theme.spacing.xs,
                  opacity: pressed ? 0.88 : 1,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: 10,
                })}
              >
                <Feather
                  color={theme.colors.textMuted}
                  name={categoriesExpanded ? "chevron-up" : "chevron-down"}
                  size={14}
                />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {categoriesExpanded ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>
            {categoriesExpanded ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {[
                  { label: "All", value: null as string | null },
                  ...categories.map((category) => ({ label: category, value: category })),
                ].map((option) => {
                  const active = selectedCategory === option.value;

                  return (
                    <Pressable
                      key={option.label}
                      onPress={() => setSelectedCategory(option.value)}
                      style={({ pressed }) => ({
                        backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        opacity: pressed ? 0.9 : 1,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: 10,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.primaryText : theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
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
            visibleProducts.length > 0 ? (
              visibleProducts.map((product) => {
                const availableStock = getRemainingProductStock(product);

                return (
                  <ProductCard
                    barcode={product.barcode}
                    category={product.category}
                    compact
                    disabled={availableStock <= 0}
                    enablePrimaryTapFeedback
                    imageUri={product.imageUri}
                    isWeightBased={product.isWeightBased}
                    key={product.id}
                    marginPercent={formatMarginPercent(computeProfitMargin(product.costPriceCents, product.priceCents))}
                    minStock={product.minStock}
                    name={product.name}
                    onLongPress={product.isWeightBased ? () => openQuickEditModal(product) : undefined}
                    onPress={() => handleAddToCart(product)}
                    priceCents={product.priceCents}
                    priceLabel={formatProductPriceLabel(product)}
                    quantityBadgeCount={cartSelectionCountByProductId.get(product.id) ?? 0}
                    showInfoFlip
                    stock={availableStock}
                    useRegularImageSizing
                    useRegularTextSizing
                  />
                );
              })
            ) : (
              <SurfaceCard style={[compactCardStyle, { width: "100%" }]}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  No products match this search or category yet.
                </Text>
              </SurfaceCard>
            )
          ) : (
            <View style={{ width: "100%" }}>
              <EmptyState
                icon="package"
                message="Add products first in the Produkto tab to start selling from the POS screen."
                title={t("benta.noProductsTitle")}
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
                isWeightBased={item.isWeightBased}
                lineTotalCents={Math.round(item.priceCents * item.quantity)}
                maxQuantity={item.stock}
                name={item.name}
                onDecrease={item.isWeightBased ? undefined : () => updateQuantity(item.id, item.quantity - 1)}
                onEdit={
                  item.isWeightBased
                    ? () => {
                        const product = productById.get(item.id);
                        if (product) {
                          openWeightModal(product);
                        }
                      }
                    : undefined
                }
                onIncrease={item.isWeightBased ? undefined : () => updateQuantity(item.id, item.quantity + 1)}
                onRemove={() => removeItem(item.id)}
                priceCents={item.priceCents}
                quantity={item.quantity}
              />
            ))
          ) : (
            <EmptyState
              icon="shopping-cart"
              message="Tap any product card above and it will appear here instantly."
              title={t("benta.cartEmptyTitle")}
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
              <Pressable
                onPress={() => setPaymentMethodExpanded((current) => !current)}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  opacity: pressed ? 0.9 : 1,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: 14,
                })}
              >
                <View style={{ gap: 2 }}>
                  <Text
                    style={{
                      color: theme.colors.textSoft,
                      fontFamily: theme.typography.body,
                      fontSize: 11,
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    Selected
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 15,
                      fontWeight: "700",
                    }}
                  >
                    {selectedPaymentMethodOption.label}
                  </Text>
                </View>
                <Feather
                  color={theme.colors.textMuted}
                  name={paymentMethodExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                />
              </Pressable>
              {paymentMethodExpanded ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                  {PAYMENT_METHODS.map((method) => (
                    <ActionButton
                      key={method.key}
                      label={method.label}
                      onPress={() => handleSelectPaymentMethod(method.key)}
                      style={{ flex: 1, minWidth: 120 }}
                      variant={paymentMethod === method.key ? "primary" : "ghost"}
                    />
                  ))}
                </View>
              ) : null}
            </View>

            {paymentMethod === "cash" ? (
              <InputField
                keyboardType="decimal-pad"
                label="Cash received"
                onChangeText={setCashInput}
                placeholder="0.00"
                value={cashInput}
              />
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
              {paymentMethod === "cash" && isEnoughCash ? (
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.success,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                      fontWeight: "700",
                      textTransform: "uppercase",
                    }}
                  >
                    Sukli
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.success,
                      fontFamily: theme.typography.display,
                      fontSize: 30,
                      fontWeight: "700",
                    }}
                  >
                    {formatCurrencyFromCents(changeCents)}
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    color:
                      paymentMethod === "cash"
                        ? theme.colors.danger
                        : paymentMethod === "utang" && !selectedCustomer
                          ? theme.colors.warning
                          : theme.colors.success,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {paymentMethod === "cash"
                    ? "Kulang pa ang cash para ma-checkout."
                    : paymentMethod === "utang"
                      ? selectedCustomer
                        ? "This sale will be added to the selected customer's utang ledger."
                        : "Pick a customer before saving this utang sale."
                      : `Digital payment ready via ${paymentMethod.toUpperCase()}.`}
                </Text>
              )}
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
        subtitle={cartItems.length > 0 ? t("benta.cartSubtitle.ready", { count: cartCountLabel }) : t("benta.cartSubtitle.empty")}
        title={t("benta.cartTitle")}
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
                isWeightBased={item.isWeightBased}
                lineTotalCents={Math.round(item.priceCents * item.quantity)}
                maxQuantity={item.stock}
                name={item.name}
                onDecrease={item.isWeightBased ? undefined : () => updateQuantity(item.id, item.quantity - 1)}
                onEdit={
                  item.isWeightBased
                    ? () => {
                        const product = productById.get(item.id);
                        if (product) {
                          openWeightModal(product);
                        }
                      }
                    : undefined
                }
                onIncrease={item.isWeightBased ? undefined : () => updateQuantity(item.id, item.quantity + 1)}
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
                <Pressable
                  onPress={() => setPaymentMethodExpanded((current) => !current)}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.sm,
                    borderWidth: 1,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    opacity: pressed ? 0.9 : 1,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 14,
                  })}
                >
                  <View style={{ gap: 2 }}>
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontFamily: theme.typography.body,
                        fontSize: 11,
                        fontWeight: "700",
                        textTransform: "uppercase",
                      }}
                    >
                      Selected
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 15,
                        fontWeight: "700",
                      }}
                    >
                      {selectedPaymentMethodOption.label}
                    </Text>
                  </View>
                  <Feather
                    color={theme.colors.textMuted}
                    name={paymentMethodExpanded ? "chevron-up" : "chevron-down"}
                    size={18}
                  />
                </Pressable>
                {paymentMethodExpanded ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                    {PAYMENT_METHODS.map((method) => (
                      <ActionButton
                        key={method.key}
                        label={method.label}
                        onPress={() => handleSelectPaymentMethod(method.key)}
                        style={{ flex: 1, minWidth: 120 }}
                        variant={paymentMethod === method.key ? "primary" : "ghost"}
                      />
                    ))}
                  </View>
                ) : null}
              </View>

              {paymentMethod === "cash" ? (
                <InputField
                  keyboardType="decimal-pad"
                  label="Cash received"
                  onChangeText={setCashInput}
                  placeholder="0.00"
                  value={cashInput}
                />
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
                {paymentMethod === "cash" && isEnoughCash ? (
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        color: theme.colors.success,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        fontWeight: "700",
                        textTransform: "uppercase",
                      }}
                    >
                      Sukli
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.success,
                        fontFamily: theme.typography.display,
                        fontSize: 30,
                        fontWeight: "700",
                      }}
                    >
                      {formatCurrencyFromCents(changeCents)}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={{
                      color:
                        paymentMethod === "cash"
                          ? theme.colors.danger
                          : paymentMethod === "utang" && !selectedCustomer
                            ? theme.colors.warning
                            : theme.colors.success,
                      fontFamily: theme.typography.body,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    {paymentMethod === "cash"
                      ? "Kulang pa ang cash para ma-checkout."
                      : paymentMethod === "utang"
                        ? selectedCustomer
                          ? "This sale will be added to the selected customer's utang ledger."
                          : "Pick a customer before saving this utang sale."
                        : `Digital payment ready via ${paymentMethod.toUpperCase()}.`}
                  </Text>
                )}
              </View>
            </View>
          </>
        ) : (
          <EmptyState
            icon="shopping-cart"
            message="Tap any product card and your active sale will appear here instantly."
            title={t("benta.cartEmptyTitle")}
          />
        )}
      </ModalSheet>

      <ModalSheet
        footer={
          <ActionButton
            disabled={
              !selectedWeightProduct ||
              !Number.isFinite(selectedWeightValue) ||
              selectedWeightValue <= 0 ||
              selectedWeightValue > (selectedWeightProduct?.totalKgAvailable ?? 0)
            }
            label="Add Weighed Item"
            onPress={handleConfirmWeightItem}
          />
        }
        onClose={() => {
          setWeightModalVisible(false);
          setSelectedWeightProduct(null);
          setWeightInput("");
        }}
        subtitle={
          selectedWeightProduct
            ? `Available: ${formatProductStockLabel(selectedWeightProduct)} at ${formatProductPriceLabel(selectedWeightProduct)}`
            : "Enter the weight to add."
        }
        title={selectedWeightProduct ? `Weigh ${selectedWeightProduct.name}` : "Weigh Product"}
        visible={weightModalVisible}
      >
        {selectedWeightProduct ? (
          <>
            <InputField
              keyboardType="decimal-pad"
              label="Weight (kg)"
              onChangeText={setWeightInput}
              placeholder="0.000"
              error={
                weightInput.length > 0 &&
                (!Number.isFinite(selectedWeightValue) || selectedWeightValue <= 0)
                  ? "Enter a valid weight greater than zero."
                  : Number.isFinite(selectedWeightValue) &&
                      selectedWeightValue > (selectedWeightProduct.totalKgAvailable ?? 0)
                    ? "Weight cannot be higher than the available stock."
                    : null
              }
              value={weightInput}
            />
            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  Price per kg
                </Text>
                <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                  {formatProductPriceLabel(selectedWeightProduct)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  Preview total
                </Text>
                <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                  {formatCurrencyFromCents(weightLineTotalCents)}
                </Text>
              </View>
            </SurfaceCard>
          </>
        ) : null}
      </ModalSheet>

      <ModalSheet
        footer={
          <ActionButton
            disabled={savingQuickEdit || !quickEditProduct}
            label={savingQuickEdit ? "Saving..." : "Save Quick Edit"}
            onPress={() => void handleQuickEditSave()}
          />
        }
        onClose={() => {
          setQuickEditVisible(false);
          setQuickEditProduct(null);
          setQuickEditValue("");
        }}
        subtitle={
          quickEditProduct
            ? quickEditProduct.pricingStrategy === "margin_based"
              ? `Current margin ${formatMarginPercent(quickEditProduct.targetMarginPercent ?? computeProfitMargin(quickEditProduct.costPriceCents, quickEditProduct.priceCents))}`
              : `Current price ${formatProductPriceLabel(quickEditProduct)}`
            : "Adjust price quickly."
        }
        title={quickEditProduct ? `Quick Edit ${quickEditProduct.name}` : "Quick Edit"}
        visible={quickEditVisible}
      >
        {quickEditProduct ? (
          <>
            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  Available stock
                </Text>
                <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                  {formatProductStockLabel(quickEditProduct)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  Low-stock threshold
                </Text>
                <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                  {formatProductMinStockLabel(quickEditProduct)}
                </Text>
              </View>
            </SurfaceCard>

            <InputField
              keyboardType="decimal-pad"
              label={quickEditProduct.pricingStrategy === "margin_based" ? "Target margin (%)" : "Selling price per kg"}
              onChangeText={setQuickEditValue}
              placeholder={quickEditProduct.pricingStrategy === "margin_based" ? "25" : "0.00"}
              value={quickEditValue}
            />
          </>
        ) : null}
      </ModalSheet>

      <ModalSheet
        footer={<ActionButton label="Close" onPress={() => setCustomerPickerVisible(false)} variant="ghost" />}
        onClose={() => setCustomerPickerVisible(false)}
        subtitle={t("benta.customerPickerSubtitle")}
        title={t("benta.customerPickerTitle")}
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
            title={t("benta.noCustomersTitle")}
          />
        )}
      </ModalSheet>

      <ModalSheet
        footer={<ActionButton label="Close Scanner" onPress={() => setScannerVisible(false)} variant="ghost" />}
        onClose={() => setScannerVisible(false)}
        subtitle={t("benta.barcodeSubtitle")}
        title={t("benta.barcodeTitle")}
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

      <ModalSheet
        fullHeight
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={!lastReceipt || sharingReceipt}
              label={sharingReceipt ? "Sharing..." : "Share Receipt"}
              onPress={() => void handleShareReceipt()}
            />
            <ActionButton label="Close" onPress={() => setReceiptVisible(false)} variant="ghost" />
          </View>
        }
        onClose={() => setReceiptVisible(false)}
        subtitle={
          lastReceipt
            ? `Transaction #${lastReceipt.saleId} is ready with your custom receipt design.`
            : "Your receipt will appear here after checkout."
        }
        title="Your Receipt"
        visible={receiptVisible}
      >
        {lastReceipt ? (
          <View
            collapsable={false}
            ref={receiptCaptureRef}
            style={{
              alignItems: "center",
              paddingBottom: theme.spacing.md,
            }}
          >
            <ReceiptView
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
        ) : (
          <EmptyState
            icon="file-text"
            message="Finish a sale and your custom receipt will be ready to share here."
            title="No receipt yet"
          />
        )}
      </ModalSheet>
    </>
  );
}
