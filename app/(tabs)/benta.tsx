import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { captureRef } from "react-native-view-shot";

import { ActionButton } from "@/components/ActionButton";
import { CartItem } from "@/components/CartItem";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { MilestoneCelebration } from "@/components/MilestoneCelebration";
import { ModalSheet } from "@/components/ModalSheet";
import { ReceiptView } from "@/components/ReceiptView";
import { Screen } from "@/components/Screen";
import { StatusBadge } from "@/components/StatusBadge";
import { SurfaceCard } from "@/components/SurfaceCard";
import { getFloatingCartBottomOffset } from "@/constants/navigation";
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
const CATALOG_GRID_GAP = 10;
const MONO_FONT_FAMILY = Platform.select({
  android: "monospace",
  default: "monospace",
  ios: "Menlo",
});
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "gcash", label: "GCash" },
  { key: "maya", label: "Maya" },
  { key: "utang", label: "Utang" },
];

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

type ContainerDecision = {
  productId: number;
  productName: string;
  containerLabel: string;
  quantityOut: number;
  takeOut: boolean;
};

export default function BentaScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [selectedWeightProduct, setSelectedWeightProduct] = useState<Product | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditProduct, setQuickEditProduct] = useState<Product | null>(null);
  const [quickEditValue, setQuickEditValue] = useState("");
  const [savingQuickEdit, setSavingQuickEdit] = useState(false);
  const [catalogInfoProduct, setCatalogInfoProduct] = useState<Product | null>(null);
  const [containerDecisionVisible, setContainerDecisionVisible] = useState(false);
  const [containerDecisions, setContainerDecisions] = useState<ContainerDecision[]>([]);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [sharingReceipt, setSharingReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{
    saleId: number;
    items: {
      name: string;
      quantity: number;
      weightKg: number | null;
      priceCents: number;
      lineTotalCents: number;
      isWeightBased: boolean;
    }[];
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
    cashPaidCents: number;
    changeCents: number;
    paymentMethod: string;
    date: string;
    containerReturns: {
      containerLabelSnapshot: string;
      quantityOut: number;
      quantityReturned: number;
      status: "open" | "partial" | "returned";
    }[];
  } | null>(null);
  const [storeName, setStoreName] = useState("");
  const receiptCaptureRef = useRef<View>(null);
  const cartPulseScale = useRef(new Animated.Value(1)).current;
  const cartPulseLift = useRef(new Animated.Value(0)).current;
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
  const compactCatalogControlsStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  } as const;
  const catalogCardWidth = useMemo(
    () => Math.max(96, Math.floor((windowWidth - 44 - CATALOG_GRID_GAP * 2) / 3)),
    [windowWidth],
  );

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
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
  const trackedContainerItems = useMemo(
    () =>
      cartItems.flatMap((item) => {
        const product = productById.get(item.id);

        if (!product?.hasContainerReturn || !product.containerLabel) {
          return [];
        }

        const quantityMultiplier = item.isWeightBased ? 1 : Math.max(1, Math.trunc(item.quantity));
        const quantityOut = Math.max(1, quantityMultiplier * product.defaultContainerQuantityPerSale);

        return [
          {
            productId: item.id,
            productName: product.name,
            containerLabel: product.containerLabel,
            quantityOut,
          },
        ];
      }),
    [cartItems, productById],
  );
  const hasTrackedContainers = trackedContainerItems.length > 0;
  const hasActiveCart = cartItems.length > 0;

  const changeCents = paymentMethod === "cash" && hasValidCash ? cashPaidCents - finalTotalCents : 0;
  const cartCountLabel =
    cartUnitCount === 1 ? t("benta.cartCount.single") : t("benta.cartCount.plural", { count: cartUnitCount });
  const catalogCountLabel =
    visibleProducts.length === 1
      ? t("benta.catalogCount.single", { count: visibleProducts.length })
      : t("benta.catalogCount.plural", { count: visibleProducts.length });
  const selectedCustomerName = selectedCustomer?.name ?? "";
  const selectedCustomerBalanceText = selectedCustomer ? formatCurrencyFromCents(selectedCustomer.balanceCents) : "";
  const isEnoughCash = paymentMethod === "cash" ? hasValidCash && cashPaidCents >= finalTotalCents : true;
  const requiresCustomer = paymentMethod === "utang";
  const shouldOfferCustomerSelection = requiresCustomer || hasTrackedContainers;
  const isCheckoutReady =
    cartItems.length > 0 && isEnoughCash && (!requiresCustomer || Boolean(selectedCustomer));
  const floatingCartBottomOffset = getFloatingCartBottomOffset(insets.bottom);
  const screenBottomPadding = floatingCartBottomOffset + 82;

  const triggerCartPulse = useCallback(() => {
    cartPulseScale.stopAnimation();
    cartPulseLift.stopAnimation();

    cartPulseScale.setValue(1);
    cartPulseLift.setValue(0);

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
    ]).start();
  }, [cartPulseLift, cartPulseScale]);

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
          triggerCartPulse();
          return;
        }

        Alert.alert("Out of stock", `${product.name} is currently out of stock.`);
        return;
      }

      if (product.isWeightBased) {
        openWeightModal(product);
        return;
      }

      addItem({
        id: product.id,
        name: product.name,
        priceCents: product.priceCents,
        stock: totalStock,
        isWeightBased: false,
      });

      triggerCartPulse();
    },
    [addItem, getRemainingProductStock, openWeightModal, reservedQuantityByProductId, triggerCartPulse],
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

    triggerCartPulse();
  }, [selectedWeightProduct, selectedWeightValue, setItem, triggerCartPulse]);

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
          inventoryMode: quickEditProduct.inventoryMode,
          inventoryPoolId: quickEditProduct.inventoryPoolId,
          inventoryPoolName: quickEditProduct.inventoryPoolName ?? "",
          inventoryPoolBaseUnitLabel: quickEditProduct.inventoryBaseUnitLabel ?? "gram",
          inventoryPoolQuantityAvailable: quickEditProduct.inventoryQuantityAvailable,
          inventoryPoolReorderThreshold: quickEditProduct.inventoryReorderThreshold,
          linkedUnitsPerSale: quickEditProduct.linkedUnitsPerSale,
          linkedDisplayUnitLabel: quickEditProduct.linkedDisplayUnitLabel ?? "kg",
          isPrimaryRestockProduct: quickEditProduct.isPrimaryRestockProduct,
          hasContainerReturn: quickEditProduct.hasContainerReturn,
          containerLabel: quickEditProduct.containerLabel ?? "",
          containerDepositCents: quickEditProduct.containerDepositCents,
          defaultContainerQuantityPerSale: quickEditProduct.defaultContainerQuantityPerSale,
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

    if (method !== "utang" && !hasTrackedContainers) {
      setSelectedCustomer(null);
    }
  }, [hasTrackedContainers]);

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

  const buildPayloadItems = useCallback(() => {
    return cartItems.map((item) => {
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
  }, [cartItems, productById]);

  const performCheckout = useCallback(
    async (containerSelections: ContainerDecision[] = []) => {
      const takeOutSelections = containerSelections.filter((selection) => selection.takeOut);

      if (takeOutSelections.length > 0 && !selectedCustomer) {
        setContainerDecisionVisible(false);
        Alert.alert(
          "Customer needed",
          "Select a customer first so the empty bottle obligations can be tracked and cleared later.",
        );
        setCustomerPickerVisible(true);
        return;
      }

      const payloadItems = buildPayloadItems();

      setProcessingCheckout(true);

      try {
        const checkoutResult = await checkoutSale(db, {
          items: payloadItems,
          totalCents: finalTotalCents,
          discountCents,
          cashPaidCents: paymentMethod === "cash" && hasValidCash ? cashPaidCents : 0,
          paymentMethod,
          customerId: selectedCustomer?.id ?? null,
          containerReturns: takeOutSelections.map((selection) => ({
            productId: selection.productId,
            containerLabel: selection.containerLabel,
            quantityOut: selection.quantityOut,
          })),
        });

        const receiptData = {
          saleId: checkoutResult.saleId,
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
          containerReturns: checkoutResult.containerReturns.map((event) => ({
            containerLabelSnapshot: event.containerLabelSnapshot,
            quantityOut: event.quantityOut,
            quantityReturned: event.quantityReturned,
            status: event.status,
          })),
        };
        setLastReceipt(receiptData);
        setReceiptVisible(true);

        clearCart();
        setCartSheetVisible(false);
        setCashInput("");
        setPaymentMethod("cash");
        setPaymentMethodExpanded(false);
        setSelectedCustomer(null);
        setContainerDecisions([]);
        setContainerDecisionVisible(false);
        setTawadActive(false);
        setTawadInput("");
        setTawadType("fixed");
        await loadScreenData("background");

        const MILESTONES = [500000, 200000, 100000, 50000];
        const todayKey = new Date().toISOString().slice(0, 10);
        const triggeredRaw = await Storage.getItem(`tindahan.milestones.${todayKey}`);
        const triggered = new Set<number>(triggeredRaw ? (JSON.parse(triggeredRaw) as number[]) : []);

        const homeMetrics = await getHomeMetrics(db);
        const dailyTotal = homeMetrics.todaySalesCents;

        for (const milestone of MILESTONES) {
          if (dailyTotal >= milestone && !triggered.has(milestone)) {
            triggered.add(milestone);
            await Storage.setItem(`tindahan.milestones.${todayKey}`, JSON.stringify([...triggered]));
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
    },
    [
      buildPayloadItems,
      cashPaidCents,
      changeCents,
      clearCart,
      db,
      discountCents,
      finalTotalCents,
      hasValidCash,
      loadScreenData,
      paymentMethod,
      selectedCustomer,
      totalCents,
    ],
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

    if (trackedContainerItems.length > 0) {
      setContainerDecisions(
        trackedContainerItems.map((item) => ({
          ...item,
          takeOut: true,
        })),
      );
      setContainerDecisionVisible(true);
      return;
    }

    await performCheckout([]);
  }, [
    cartItems.length,
    hasValidCash,
    isEnoughCash,
    paymentMethod,
    performCheckout,
    selectedCustomer,
    trackedContainerItems,
  ]);

  const handleClearCart = useCallback(() => {
    if (cartItems.length === 0) {
      return;
    }

    Alert.alert(t("benta.cartBar.clearTitle"), t("benta.cartBar.clearMessage"), [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: t("benta.cartBar.clearConfirm"),
        style: "destructive",
        onPress: () => {
          clearCart();
          setCartSheetVisible(false);
          setCashInput("");
          setPaymentMethod("cash");
          setPaymentMethodExpanded(false);
          setSelectedCustomer(null);
          setContainerDecisions([]);
          setContainerDecisionVisible(false);
          setTawadActive(false);
          setTawadInput("");
          setTawadType("fixed");
        },
      },
    ]);
  }, [cartItems.length, clearCart, t]);

  const renderCatalogCard = useCallback(
    (product: Product) => {
      const availableStock = getRemainingProductStock(product);
      const canAdd = availableStock > 0;

      return (
        <Pressable
          key={product.id}
          onLongPress={product.isWeightBased ? () => openQuickEditModal(product) : undefined}
          onPress={() => handleAddToCart(product)}
          style={({ pressed }) => ({
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            gap: theme.spacing.sm,
            opacity: pressed ? 0.92 : canAdd ? 1 : 0.72,
            overflow: "hidden",
            padding: theme.spacing.sm,
            width: catalogCardWidth,
          })}
        >
          <View
            style={{
              aspectRatio: 1,
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.sm,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <Pressable
              accessibilityLabel={t("productCard.accessibility.showDetails")}
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation();
                setCatalogInfoProduct(product);
              }}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                height: 22,
                justifyContent: "center",
                opacity: pressed ? 0.84 : 1,
                position: "absolute",
                right: 8,
                top: 8,
                width: 22,
                zIndex: 2,
              })}
            >
              <Feather color={theme.colors.textMuted} name="info" size={12} />
            </Pressable>

            {product.imageUri ? (
              <Image
                resizeMode="contain"
                source={{ uri: product.imageUri }}
                style={{
                  alignSelf: "center",
                  height: "85%",
                  marginTop: "7.5%",
                  width: "85%",
                }}
              />
            ) : (
              <View
                style={{
                  alignItems: "center",
                  height: "100%",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                <Feather color={theme.colors.textSoft} name="package" size={20} />
              </View>
            )}
          </View>

          <View
            style={{
              alignItems: "flex-start",
              backgroundColor: theme.colors.accentMuted,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 8,
              paddingVertical: 5,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: theme.colors.accent,
                fontFamily: theme.typography.label,
                fontSize: 9,
                fontWeight: "600",
              }}
            >
              {product.category || t("productCard.value.general")}
            </Text>
          </View>

          <View
            style={{
              alignItems: "flex-end",
              flexDirection: "row",
              gap: theme.spacing.xs,
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                {product.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.primary,
                  fontFamily: MONO_FONT_FAMILY,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {formatProductPriceLabel(product)}
              </Text>
            </View>

            <Pressable
              accessibilityLabel={`Add ${product.name}`}
              disabled={!canAdd}
              hitSlop={6}
              onPress={(event) => {
                event.stopPropagation();
                handleAddToCart(product);
              }}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: canAdd ? theme.colors.primary : theme.colors.surfaceMuted,
                borderRadius: 8,
                height: 24,
                justifyContent: "center",
                opacity: pressed ? 0.88 : 1,
                width: 24,
              })}
            >
              <Feather
                color={canAdd ? theme.colors.primaryText : theme.colors.textSoft}
                name="plus"
                size={14}
              />
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [catalogCardWidth, getRemainingProductStock, handleAddToCart, openQuickEditModal, t, theme],
  );

  return (
    <>
      <Screen
        contentContainerStyle={{
          gap: theme.spacing.md,
          paddingBottom: screenBottomPadding,
          paddingTop: theme.spacing.md,
        }}
        overlay={
          <Animated.View
            style={{
              bottom: floatingCartBottomOffset,
              position: "absolute",
              right: theme.spacing.lg,
              transform: [{ translateY: cartPulseLift }, { scale: cartPulseScale }],
            }}
          >
            <Pressable
              accessibilityLabel={
                hasActiveCart
                  ? t("benta.cartBar.activeSummary", {
                      count: cartCountLabel,
                      total: formatCurrencyFromCents(finalTotalCents),
                    })
                  : t("benta.cartBar.emptyTitle")
              }
              onLongPress={hasActiveCart ? handleClearCart : undefined}
              onPress={() => setCartSheetVisible(true)}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: hasActiveCart ? theme.colors.primary : theme.colors.card,
                borderColor: hasActiveCart ? theme.colors.primary : theme.colors.border,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                height: 58,
                justifyContent: "center",
                opacity: pressed ? 0.92 : 1,
                shadowColor: theme.colors.shadow,
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 1,
                shadowRadius: 24,
                width: 58,
              })}
            >
              <Feather
                color={hasActiveCart ? theme.colors.primaryText : theme.colors.textMuted}
                name="shopping-cart"
                size={20}
              />

              {cartUnitCount > 0 ? (
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: theme.colors.warning,
                    borderColor: theme.colors.card,
                    borderRadius: theme.radius.pill,
                    borderWidth: 2,
                    justifyContent: "center",
                    minWidth: 22,
                    paddingHorizontal: 5,
                    position: "absolute",
                    right: -3,
                    top: -3,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.primaryText,
                      fontFamily: theme.typography.label,
                      fontSize: 11,
                      fontWeight: "600",
                      lineHeight: 18,
                    }}
                  >
                    {cartUnitCount > 99 ? "99+" : cartUnitCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        }
        title={t("benta.title")}
      >
        <SurfaceCard style={compactCatalogControlsStyle}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              flexDirection: "row",
              gap: theme.spacing.sm,
              minHeight: 52,
              paddingLeft: theme.spacing.md,
              paddingRight: theme.spacing.xs,
            }}
          >
            <Feather color={theme.colors.textSoft} name="search" size={16} />
            <TextInput
              allowFontScaling={false}
              onChangeText={setSearchTerm}
              placeholder={t("benta.searchPlaceholder")}
              placeholderTextColor={theme.colors.textSoft}
              style={{
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body,
                fontSize: 14,
                minHeight: 50,
              }}
              value={searchTerm}
            />
            <Pressable
              accessibilityLabel={t("benta.scanButton")}
              hitSlop={6}
              onPress={() => void handleOpenScanner()}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: pressed ? theme.colors.primaryMuted : "transparent",
                borderRadius: theme.radius.pill,
                height: 40,
                justifyContent: "center",
                width: 40,
              })}
            >
              <Feather color={theme.colors.primary} name="camera" size={18} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingRight: theme.spacing.sm,
            }}
          >
            {[
              { label: t("benta.category.all"), value: null as string | null },
              ...categories.map((category) => ({ label: category, value: category })),
            ].map((option) => {
              const active = selectedCategory === option.value;

              return (
                <Pressable
                  key={option.label}
                  onPress={() => setSelectedCategory(option.value)}
                  style={({ pressed }) => ({
                    backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
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
                      color: active ? theme.colors.primary : theme.colors.text,
                      fontFamily: theme.typography.label,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </SurfaceCard>

        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              color: theme.colors.textSoft,
              fontFamily: theme.typography.label,
              fontSize: 11,
              fontWeight: "600",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {catalogCountLabel}
          </Text>

          {refreshingCatalog && !loading ? <ActivityIndicator color={theme.colors.primary} size="small" /> : null}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: CATALOG_GRID_GAP }}>
          {loading ? (
            <SurfaceCard style={[compactCardStyle, { width: "100%" }]}>
              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  gap: theme.spacing.sm,
                }}
              >
                <ActivityIndicator color={theme.colors.primary} />
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  {t("benta.catalog.loading")}
                </Text>
              </View>
            </SurfaceCard>
          ) : products.length > 0 ? (
            visibleProducts.length > 0 ? (
              <>
                {visibleProducts.map(renderCatalogCard)}
                <Pressable
                  onPress={() => router.navigate("/produkto")}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.borderStrong,
                    borderRadius: theme.radius.md,
                    borderStyle: "dashed",
                    borderWidth: 1,
                    gap: theme.spacing.xs,
                    justifyContent: "center",
                    minHeight: catalogCardWidth + 74,
                    opacity: pressed ? 0.86 : 1,
                    padding: theme.spacing.md,
                    width: catalogCardWidth,
                  })}
                >
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: theme.colors.surfaceMuted,
                      borderRadius: theme.radius.pill,
                      height: 28,
                      justifyContent: "center",
                      width: 28,
                    }}
                  >
                    <Feather color={theme.colors.textMuted} name="plus" size={16} />
                  </View>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.label,
                      fontSize: 12,
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    {t("benta.catalog.addProduct")}
                  </Text>
                </Pressable>
              </>
            ) : (
              <SurfaceCard style={[compactCardStyle, { width: "100%" }]}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                  }}
                >
                  {t("benta.catalog.noMatches")}
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
                fontWeight: "600",
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
                  fontWeight: "600",
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
                    fontWeight: "600",
                  }}
                >
                  Tawad ({tawadType === "percent" ? `${tawadInput}%` : formatCurrencyFromCents(discountCents)} off)
                </Text>
                <Text
                  style={{
                    color: theme.colors.success,
                    fontFamily: theme.typography.display,
                    fontSize: 28,
                    fontWeight: "600",
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
                    fontWeight: "600",
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
                  fontWeight: "600",
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
                      fontWeight: "600",
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
                      fontWeight: "600",
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
            ) : shouldOfferCustomerSelection ? (
              <View style={{ gap: theme.spacing.sm }}>
                {selectedCustomer ? (
                  <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
                    <StatusBadge label={paymentMethod === "utang" ? "Linked Customer" : "Bottle Tracker"} tone="warning" />
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 15,
                        fontWeight: "600",
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
                      {paymentMethod === "utang"
                        ? `Current balance: ${selectedCustomerBalanceText}`
                        : "Empty-bottle returns can be cleared later from this customer profile."}
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
                    Add a customer in Palista first before tracking empty bottles or saving an utang sale.
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
                    fontWeight: "600",
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
                    : shouldOfferCustomerSelection && !selectedCustomer
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
                      fontWeight: "600",
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
                      fontWeight: "600",
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
                        : shouldOfferCustomerSelection && !selectedCustomer
                            ? theme.colors.warning
                            : theme.colors.success,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {paymentMethod === "cash"
                    ? "Kulang pa ang cash para ma-checkout."
                    : paymentMethod === "utang"
                      ? selectedCustomer
                        ? "This sale will be added to the selected customer's utang ledger."
                        : "Pick a customer before saving this utang sale."
                      : hasTrackedContainers
                        ? selectedCustomer
                          ? "Bottle-tracked items will ask in-store or take-out before checkout."
                          : "Select a customer now if any bottled items will be taken out."
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
        footer={<ActionButton label="Close" onPress={() => setCatalogInfoProduct(null)} variant="ghost" />}
        onClose={() => setCatalogInfoProduct(null)}
        subtitle={catalogInfoProduct?.category || t("productCard.value.general")}
        title={catalogInfoProduct?.name ?? "Product"}
        visible={Boolean(catalogInfoProduct)}
      >
        {catalogInfoProduct ? (
          <View style={{ gap: theme.spacing.sm }}>
            <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  {t("productCard.detail.price")}
                </Text>
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontFamily: MONO_FONT_FAMILY,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {formatProductPriceLabel(catalogInfoProduct)}
                </Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  {t("productCard.detail.stock")}
                </Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "right",
                  }}
                >
                  {formatProductStockLabel(catalogInfoProduct)}
                </Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  {t("productCard.detail.minStock")}
                </Text>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "right",
                  }}
                >
                  {formatProductMinStockLabel(catalogInfoProduct)}
                </Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  {t("productCard.detail.margin")}
                </Text>
                <Text
                  style={{
                    color: theme.colors.success,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "right",
                  }}
                >
                  {formatMarginPercent(computeProfitMargin(catalogInfoProduct.costPriceCents, catalogInfoProduct.priceCents))}
                </Text>
              </View>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  {t("productCard.detail.barcode")}
                </Text>
                <Text
                  style={{
                    color: catalogInfoProduct.barcode ? theme.colors.text : theme.colors.textSoft,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "right",
                  }}
                >
                  {catalogInfoProduct.barcode || t("productCard.value.noBarcode")}
                </Text>
              </View>
            </SurfaceCard>
          </View>
        ) : null}
      </ModalSheet>

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
                    fontWeight: "600",
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
                      fontWeight: "600",
                    }}
                  >
                    Tawad ({tawadType === "percent" ? `${tawadInput}%` : formatCurrencyFromCents(discountCents)} off)
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.success,
                      fontFamily: theme.typography.display,
                      fontSize: 26,
                      fontWeight: "600",
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
                      fontWeight: "600",
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
                    fontWeight: "600",
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
                        fontWeight: "600",
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
                        fontWeight: "600",
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
              ) : shouldOfferCustomerSelection ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {selectedCustomer ? (
                    <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
                      <StatusBadge label={paymentMethod === "utang" ? "Linked Customer" : "Bottle Tracker"} tone="warning" />
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 15,
                          fontWeight: "600",
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
                        {paymentMethod === "utang"
                          ? `Current balance: ${formatCurrencyFromCents(selectedCustomer.balanceCents)}`
                          : "Empty-bottle returns can be cleared later from this customer profile."}
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
                      Add a customer in Palista first before tracking empty bottles or saving an utang sale.
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
                      fontWeight: "600",
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
                      : shouldOfferCustomerSelection && !selectedCustomer
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
                        fontWeight: "600",
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
                        fontWeight: "600",
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
                            : shouldOfferCustomerSelection && !selectedCustomer
                              ? theme.colors.warning
                              : theme.colors.success,
                      fontFamily: theme.typography.body,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {paymentMethod === "cash"
                      ? "Kulang pa ang cash para ma-checkout."
                      : paymentMethod === "utang"
                        ? selectedCustomer
                          ? "This sale will be added to the selected customer's utang ledger."
                          : "Pick a customer before saving this utang sale."
                        : hasTrackedContainers
                          ? selectedCustomer
                            ? "Bottle-tracked items will ask in-store or take-out before checkout."
                            : "Select a customer now if any bottled items will be taken out."
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
                <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                  {formatProductPriceLabel(selectedWeightProduct)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  Preview total
                </Text>
                <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
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
                <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                  {formatProductStockLabel(quickEditProduct)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                  Low-stock threshold
                </Text>
                <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
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
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={containerDecisions.length === 0}
              label={t("benta.containerCheck.continue")}
              onPress={() => void performCheckout(containerDecisions)}
            />
            <ActionButton
              label={t("benta.containerCheck.back")}
              onPress={() => setContainerDecisionVisible(false)}
              variant="ghost"
            />
          </View>
        }
        onClose={() => setContainerDecisionVisible(false)}
        subtitle={t("benta.containerCheckSubtitle")}
        title={t("benta.containerCheckTitle")}
        visible={containerDecisionVisible}
      >
        <View style={{ gap: theme.spacing.sm }}>
          {containerDecisions.map((decision) => (
            <SurfaceCard key={decision.productId} style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: theme.spacing.md }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {decision.productName}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                    }}
                  >
                    {decision.quantityOut} {decision.containerLabel}
                  </Text>
                </View>
                <StatusBadge
                  label={decision.takeOut ? t("benta.containerCheck.takeOut") : t("benta.containerCheck.inStore")}
                  tone={decision.takeOut ? "warning" : "success"}
                />
              </View>

              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                {[
                  { label: t("benta.containerCheck.inStore"), value: false },
                  { label: t("benta.containerCheck.takeOut"), value: true },
                ].map((option) => {
                  const active = decision.takeOut === option.value;

                  return (
                    <Pressable
                      key={`${decision.productId}-${option.label}`}
                      onPress={() =>
                        setContainerDecisions((current) =>
                          current.map((entry) =>
                            entry.productId === decision.productId ? { ...entry, takeOut: option.value } : entry,
                          ),
                        )
                      }
                      style={({ pressed }) => ({
                        backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        borderRadius: theme.radius.pill,
                        borderWidth: 1,
                        flex: 1,
                        opacity: pressed ? 0.9 : 1,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: 12,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.primaryText : theme.colors.text,
                          fontFamily: theme.typography.body,
                          fontSize: 13,
                          fontWeight: "600",
                          textAlign: "center",
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </SurfaceCard>
          ))}

          {containerDecisions.some((decision) => decision.takeOut) ? (
            selectedCustomer ? (
              <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
                <StatusBadge label={t("benta.containerCheck.linkedCustomer")} tone="warning" />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 15,
                    fontWeight: "600",
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
                  {t("benta.containerCheck.customerHint")}
                </Text>
              </SurfaceCard>
            ) : (
              <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
                <Text
                  style={{
                    color: theme.colors.warning,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {t("benta.containerCheck.customerRequired")}
                </Text>
                <ActionButton
                  label={t("benta.containerCheck.selectCustomer")}
                  onPress={() => {
                    setContainerDecisionVisible(false);
                    setCustomerPickerVisible(true);
                  }}
                  variant="secondary"
                />
              </SurfaceCard>
            )
          ) : null}
        </View>
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
                      fontWeight: "600",
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
            message="Create a customer in Palista first, then return here to link utang sales or empty-bottle tracking."
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
              containerReturns={lastReceipt.containerReturns}
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

