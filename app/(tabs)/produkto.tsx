import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions as useBarcodeCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { Screen } from "@/components/Screen";
import { SurfaceCard } from "@/components/SurfaceCard";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  deleteProduct,
  listInventoryPools,
  listProductCategories,
  listProducts,
  listProductsByInventoryPool,
  listRepackSessionsForInventoryPool,
  recordRepackSession,
  saveProduct,
  type ProductInput,
} from "@/db/repositories";
import { useCartStore } from "@/store/useCartStore";
import type {
  InventoryPool,
  Product,
  ProductInventoryMode,
  ProductPricingMode,
  ProductPricingStrategy,
  RepackSession,
} from "@/types/models";
import { formatDateTimeLabel } from "@/utils/date";
import { centsToDisplayValue, parseCurrencyToCents } from "@/utils/money";
import {
  computeProfitMargin,
  formatMarginPercent,
  formatProductMinStockLabel,
  formatProductPriceLabel,
  formatWeightKg,
  roundWeightKg,
  resolveWeightBasedPricing,
} from "@/utils/pricing";

const CATALOG_GRID_GAP = 10;
const MONO_FONT_FAMILY = Platform.select({
  android: "monospace",
  default: "monospace",
  ios: "Menlo",
});

type ProductFormState = {
  name: string;
  price: string;
  costPrice: string;
  stock: string;
  category: string;
  barcode: string;
  imageUri: string;
  minStock: string;
  isWeightBased: boolean;
  pricingMode: ProductPricingMode;
  pricingStrategy: ProductPricingStrategy;
  totalKgAvailable: string;
  costPriceTotal: string;
  sellingPriceTotal: string;
  costPricePerKg: string;
  sellingPricePerKg: string;
  targetMarginPercent: string;
  inventoryMode: ProductInventoryMode;
  inventoryPoolId: number | null;
  inventoryPoolName: string;
  inventoryPoolBaseUnitLabel: string;
  inventoryPoolQuantityAvailable: string;
  inventoryPoolReorderThreshold: string;
  inventoryBundleCount: string;
  inventoryBundleReorderCount: string;
  linkedUnitsPerSale: string;
  linkedDisplayUnitLabel: string;
  isPrimaryRestockProduct: boolean;
  hasContainerReturn: boolean;
  containerLabel: string;
  containerDeposit: string;
  defaultContainerQuantityPerSale: string;
};

type ProductFormPreview =
  | { error: string }
  | {
      error: null;
      type: "weight";
      minStock: number;
      totalKgAvailable: number;
      costPriceTotalCents: number;
      sellingPriceTotalCents: number;
      costPricePerKgCents: number;
      sellingPricePerKgCents: number;
      computedPricePerKgCents: number;
      targetMarginPercent: number | null;
      realizedMarginPercent: number;
    }
  | {
      error: null;
      type: "unit";
      priceCents: number;
      costPriceCents: number;
      stock: number;
      minStock: number;
      marginPercent: number;
      sellingPriceTotalCents: number;
    };

const emptyForm: ProductFormState = {
  name: "",
  price: "",
  costPrice: "",
  stock: "0",
  category: "",
  barcode: "",
  imageUri: "",
  minStock: "5",
  isWeightBased: false,
  pricingMode: "direct",
  pricingStrategy: "manual",
  totalKgAvailable: "",
  costPriceTotal: "",
  sellingPriceTotal: "",
  costPricePerKg: "",
  sellingPricePerKg: "",
  targetMarginPercent: "",
  inventoryMode: "standalone",
  inventoryPoolId: null,
  inventoryPoolName: "",
  inventoryPoolBaseUnitLabel: "piece",
  inventoryPoolQuantityAvailable: "",
  inventoryPoolReorderThreshold: "",
  inventoryBundleCount: "",
  inventoryBundleReorderCount: "",
  linkedUnitsPerSale: "",
  linkedDisplayUnitLabel: "piece",
  isPrimaryRestockProduct: false,
  hasContainerReturn: false,
  containerLabel: "",
  containerDeposit: "",
  defaultContainerQuantityPerSale: "1",
};

const PRODUCT_IMAGE_QUALITY = 0.72;
const PRODUCT_CATEGORIES_KEY = "tindahan.product-categories";

type CategoryModalTarget = "catalog" | "product";

function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function mergeCategoryLists(...lists: string[][]) {
  const merged = new Map<string, string>();

  for (const list of lists) {
    for (const rawCategory of list) {
      const category = normalizeCategoryName(rawCategory);

      if (!category) {
        continue;
      }

      const key = category.toLocaleLowerCase();
      if (!merged.has(key)) {
        merged.set(key, category);
      }
    }
  }

  return [...merged.values()].sort((left, right) => left.localeCompare(right));
}

function parseStoredCategories(rawValue: string | null) {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .map((entry) => (typeof entry === "string" ? normalizeCategoryName(entry) : ""))
          .filter((entry) => entry.length > 0)
      : [];
  } catch {
    return [];
  }
}

function parseDecimalInput(value: string) {
  const normalized = value.replace(/[^0-9.]/g, "").trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export default function ProduktoScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const { t } = useAppLanguage();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const microLabelTextStyle = useMemo(
    () => ({
      fontFamily: theme.typography.label,
      fontSize: theme.typography.scale.label.fontSize,
      fontWeight: theme.typography.weight.medium,
      letterSpacing: 0.3,
      lineHeight: theme.typography.scale.label.lineHeight,
    }),
    [theme.typography],
  );
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [inventoryPools, setInventoryPools] = useState<InventoryPool[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [catalogInfoProduct, setCatalogInfoProduct] = useState<Product | null>(null);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [barcodeScannerVisible, setBarcodeScannerVisible] = useState(false);
  const [barcodeScannerBusy, setBarcodeScannerBusy] = useState(false);
  const [repackModalVisible, setRepackModalVisible] = useState(false);
  const [repackProducts, setRepackProducts] = useState<Product[]>([]);
  const [repackSessions, setRepackSessions] = useState<RepackSession[]>([]);
  const [repackSourceProductId, setRepackSourceProductId] = useState<number | null>(null);
  const [repackOutputProductId, setRepackOutputProductId] = useState<number | null>(null);
  const [repackSourceQuantity, setRepackSourceQuantity] = useState("");
  const [repackOutputUnits, setRepackOutputUnits] = useState("");
  const [repackWastage, setRepackWastage] = useState("0");
  const [repackNote, setRepackNote] = useState("");
  const [savingRepack, setSavingRepack] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryModalTarget, setCategoryModalTarget] = useState<CategoryModalTarget>("catalog");
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const [barcodePermission, requestBarcodePermission] = useBarcodeCameraPermissions();
  const removeCartItem = useCartStore((state) => state.removeItem);
  const compactCatalogControlsStyle = {
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
  } as const;
  const catalogCardWidth = useMemo(
    () => Math.max(96, Math.floor((windowWidth - 44 - CATALOG_GRID_GAP * 2) / 3)),
    [windowWidth],
  );
  const resetRepackState = useCallback(() => {
    setRepackModalVisible(false);
    setRepackProducts([]);
    setRepackSessions([]);
    setRepackSourceProductId(null);
    setRepackOutputProductId(null);
    setRepackSourceQuantity("");
    setRepackOutputUnits("");
    setRepackWastage("0");
    setRepackNote("");
  }, []);
  const linkedInventoryHelper = useMemo(() => {
    if (form.inventoryMode !== "linked" || form.isWeightBased) {
      return null;
    }

    const unitsPerSale = roundWeightKg(parseDecimalInput(form.linkedUnitsPerSale));
    const hasUnitsPerSale = form.linkedUnitsPerSale.trim().length > 0;
    const baseUnitLabel = form.inventoryPoolBaseUnitLabel.trim() || "unit";
    const bundleLabel = form.linkedDisplayUnitLabel.trim() || "bundle";
    const hasBundleCount = form.inventoryBundleCount.trim().length > 0;
    const hasBundleReorderCount = form.inventoryBundleReorderCount.trim().length > 0;
    const bundleCount = hasBundleCount ? roundWeightKg(parseDecimalInput(form.inventoryBundleCount)) : null;
    const bundleReorderCount = hasBundleReorderCount
      ? roundWeightKg(parseDecimalInput(form.inventoryBundleReorderCount))
      : null;

    if (!hasUnitsPerSale || !Number.isFinite(unitsPerSale) || unitsPerSale <= 0) {
      return {
        ready: false as const,
        baseUnitLabel,
        bundleLabel,
      };
    }

    return {
      ready: true as const,
      baseUnitLabel,
      bundleLabel,
      unitsPerSale,
      bundleCount,
      bundleReorderCount,
      quantityAvailable:
        bundleCount !== null && Number.isFinite(bundleCount) && bundleCount >= 0
          ? roundWeightKg(bundleCount * unitsPerSale)
          : null,
      reorderThreshold:
        bundleReorderCount !== null && Number.isFinite(bundleReorderCount) && bundleReorderCount >= 0
          ? roundWeightKg(bundleReorderCount * unitsPerSale)
          : null,
    };
  }, [
    form.inventoryBundleCount,
    form.inventoryBundleReorderCount,
    form.inventoryMode,
    form.inventoryPoolBaseUnitLabel,
    form.isWeightBased,
    form.linkedDisplayUnitLabel,
    form.linkedUnitsPerSale,
  ]);
  const resolvedLinkedInventoryValues = useMemo(() => {
    const hasManualQuantity = form.inventoryPoolQuantityAvailable.trim().length > 0;
    const hasManualThreshold = form.inventoryPoolReorderThreshold.trim().length > 0;

    return {
      quantityAvailable:
        !hasManualQuantity && linkedInventoryHelper?.ready && linkedInventoryHelper.quantityAvailable !== null
          ? linkedInventoryHelper.quantityAvailable
          : roundWeightKg(parseDecimalInput(form.inventoryPoolQuantityAvailable)),
      reorderThreshold:
        !hasManualThreshold && linkedInventoryHelper?.ready && linkedInventoryHelper.reorderThreshold !== null
          ? linkedInventoryHelper.reorderThreshold
          : roundWeightKg(parseDecimalInput(form.inventoryPoolReorderThreshold)),
    };
  }, [
    form.inventoryPoolQuantityAvailable,
    form.inventoryPoolReorderThreshold,
    linkedInventoryHelper,
  ]);
  const pricingPreview = useMemo<ProductFormPreview>(() => {
    const name = form.name.trim();
    const linkedUnitsPerSale = roundWeightKg(parseDecimalInput(form.linkedUnitsPerSale));
    const linkedPoolQuantity = resolvedLinkedInventoryValues.quantityAvailable;
    const linkedPoolThreshold = resolvedLinkedInventoryValues.reorderThreshold;
    const hasValidLinkedInventory =
      form.inventoryMode !== "linked" ||
      (Number.isFinite(linkedUnitsPerSale) &&
        linkedUnitsPerSale > 0 &&
        Number.isFinite(linkedPoolQuantity) &&
        linkedPoolQuantity >= 0 &&
        Number.isFinite(linkedPoolThreshold) &&
        linkedPoolThreshold >= 0);

    if (name.length < 2) {
      return { error: "Product name must be at least 2 characters." };
    }

    if (!hasValidLinkedInventory) {
      return { error: "Complete the linked inventory values before saving." };
    }

    if (form.isWeightBased) {
      const totalKgAvailable =
        form.inventoryMode === "linked"
          ? roundWeightKg(linkedPoolQuantity / linkedUnitsPerSale)
          : parseDecimalInput(form.totalKgAvailable);
      const minStock =
        form.inventoryMode === "linked"
          ? roundWeightKg(linkedPoolThreshold / linkedUnitsPerSale)
          : parseDecimalInput(form.minStock);

      if (!Number.isFinite(totalKgAvailable) || totalKgAvailable <= 0) {
        return { error: "Enter a valid total kilograms available." };
      }

      if (!Number.isFinite(minStock) || minStock < 0) {
        return { error: "Low-stock threshold must be zero or higher." };
      }

      try {
        const resolvedPricing = resolveWeightBasedPricing({
          pricingMode: form.pricingMode,
          pricingStrategy: form.pricingStrategy,
          totalKgAvailable,
          costPriceTotalCents: form.pricingMode === "derived" ? parseCurrencyToCents(form.costPriceTotal) : undefined,
          sellingPriceTotalCents:
            form.pricingMode === "derived" && form.pricingStrategy === "manual"
              ? parseCurrencyToCents(form.sellingPriceTotal)
              : undefined,
          costPricePerKgCents:
            form.pricingMode === "direct" ? parseCurrencyToCents(form.costPricePerKg) : undefined,
          sellingPricePerKgCents:
            form.pricingMode === "direct" && form.pricingStrategy === "manual"
              ? parseCurrencyToCents(form.sellingPricePerKg)
              : undefined,
          targetMarginPercent:
            form.pricingStrategy === "margin_based" ? parseDecimalInput(form.targetMarginPercent) : undefined,
        });

        return {
          error: null,
          minStock,
          type: "weight" as const,
          ...resolvedPricing,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : "Review the weight-based pricing values.",
        };
      }
    }

    const priceCents = parseCurrencyToCents(form.price);
    const costPriceCents = parseCurrencyToCents(form.costPrice);
    const stock =
      form.inventoryMode === "linked"
        ? Math.max(0, Math.floor(linkedPoolQuantity / linkedUnitsPerSale))
        : Number.parseInt(form.stock, 10);
    const minStock =
      form.inventoryMode === "linked"
        ? Math.max(0, Math.ceil(linkedPoolThreshold / linkedUnitsPerSale))
        : Number.parseInt(form.minStock, 10);

    if (!Number.isFinite(priceCents) || !Number.isFinite(costPriceCents)) {
      return { error: "Enter valid peso amounts for the selling and cost prices." };
    }

    if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(minStock) || minStock < 0) {
      return { error: "Stock and minimum stock must be non-negative whole numbers." };
    }

    if (costPriceCents >= priceCents) {
      return { error: "Selling price must be greater than cost price." };
    }

    return {
      error: null,
      type: "unit" as const,
      priceCents,
      costPriceCents,
      stock,
      minStock,
      marginPercent: computeProfitMargin(costPriceCents, priceCents),
      sellingPriceTotalCents: priceCents * stock,
    };
  }, [form, resolvedLinkedInventoryValues]);
  const shouldShowValidationMessage = modalVisible && (editingProduct !== null || form.name.trim().length > 0);
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

  const persistCategories = useCallback(async (nextCategories: string[]) => {
    const normalizedCategories = mergeCategoryLists(nextCategories);
    setCategories(normalizedCategories);
    await Storage.setItem(PRODUCT_CATEGORIES_KEY, JSON.stringify(normalizedCategories));
    return normalizedCategories;
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);

    try {
      const [nextProducts, dbCategories, storedCategoriesRaw, nextInventoryPools] = await Promise.all([
        listProducts(db, searchTerm),
        listProductCategories(db),
        Storage.getItem(PRODUCT_CATEGORIES_KEY),
        listInventoryPools(db),
      ]);

      const nextCategories = mergeCategoryLists(dbCategories, parseStoredCategories(storedCategoriesRaw));
      setCategories(nextCategories);
      setProducts(nextProducts);
      setInventoryPools(nextInventoryPools);
    } finally {
      setLoading(false);
    }
  }, [db, searchTerm]);

  useFocusEffect(
    useCallback(() => {
      void loadProducts();
    }, [loadProducts]),
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadProducts();
    }, 180);

    return () => clearTimeout(timeout);
  }, [loadProducts]);

  const openCreateModal = useCallback(() => {
    setEditingProduct(null);
    setForm(emptyForm);
    setPhotoSheetVisible(false);
    setCategoryModalVisible(false);
    setBarcodeScannerVisible(false);
    resetRepackState();
    setModalVisible(true);
  }, [resetRepackState]);

  const openEditModal = useCallback((product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      price: centsToDisplayValue(product.priceCents),
      costPrice: centsToDisplayValue(product.costPriceCents),
      stock: String(product.stock),
      category: product.category ?? "",
      barcode: product.barcode ?? "",
      imageUri: product.imageUri ?? "",
      minStock: product.isWeightBased ? formatWeightKg(product.minStock) : String(product.minStock),
      isWeightBased: product.isWeightBased,
      pricingMode: product.pricingMode,
      pricingStrategy: product.pricingStrategy,
      totalKgAvailable: product.totalKgAvailable !== null ? formatWeightKg(product.totalKgAvailable) : "",
      costPriceTotal: product.costPriceTotalCents !== null ? centsToDisplayValue(product.costPriceTotalCents) : "",
      sellingPriceTotal:
        product.sellingPriceTotalCents !== null ? centsToDisplayValue(product.sellingPriceTotalCents) : "",
      costPricePerKg: centsToDisplayValue(product.costPricePerKgCents ?? product.costPriceCents),
      sellingPricePerKg: centsToDisplayValue(product.sellingPricePerKgCents ?? product.priceCents),
      targetMarginPercent:
        product.targetMarginPercent !== null
          ? String(product.targetMarginPercent)
          : String(computeProfitMargin(product.costPriceCents, product.priceCents)),
      inventoryMode: product.inventoryMode,
      inventoryPoolId: product.inventoryPoolId,
      inventoryPoolName: product.inventoryPoolName ?? "",
      inventoryPoolBaseUnitLabel: product.inventoryBaseUnitLabel ?? (product.isWeightBased ? "gram" : "piece"),
      inventoryPoolQuantityAvailable:
        product.inventoryQuantityAvailable !== null ? formatWeightKg(product.inventoryQuantityAvailable) : "",
      inventoryPoolReorderThreshold:
        product.inventoryReorderThreshold !== null ? formatWeightKg(product.inventoryReorderThreshold) : "",
      inventoryBundleCount:
        product.inventoryMode === "linked" &&
        !product.isWeightBased &&
        product.inventoryQuantityAvailable !== null &&
        product.linkedUnitsPerSale !== null &&
        product.linkedUnitsPerSale > 0
          ? formatWeightKg(roundWeightKg(product.inventoryQuantityAvailable / product.linkedUnitsPerSale))
          : "",
      inventoryBundleReorderCount:
        product.inventoryMode === "linked" &&
        !product.isWeightBased &&
        product.inventoryReorderThreshold !== null &&
        product.linkedUnitsPerSale !== null &&
        product.linkedUnitsPerSale > 0
          ? formatWeightKg(roundWeightKg(product.inventoryReorderThreshold / product.linkedUnitsPerSale))
          : "",
      linkedUnitsPerSale: product.linkedUnitsPerSale !== null ? formatWeightKg(product.linkedUnitsPerSale) : "",
      linkedDisplayUnitLabel: product.linkedDisplayUnitLabel ?? (product.isWeightBased ? "kg" : "piece"),
      isPrimaryRestockProduct: product.isPrimaryRestockProduct,
      hasContainerReturn: product.hasContainerReturn,
      containerLabel: product.containerLabel ?? "",
      containerDeposit: product.containerDepositCents > 0 ? centsToDisplayValue(product.containerDepositCents) : "",
      defaultContainerQuantityPerSale: String(product.defaultContainerQuantityPerSale),
    });
    setPhotoSheetVisible(false);
    setCategoryModalVisible(false);
    setBarcodeScannerVisible(false);
    resetRepackState();
    setModalVisible(true);
  }, [resetRepackState]);

  const openCategoryModal = useCallback(
    (target: CategoryModalTarget) => {
      setCategoryModalTarget(target);
      setCategoryDraft(target === "product" ? form.category : "");
      setCategoryModalVisible(true);
    },
    [form.category],
  );

  const handleCreateCategory = useCallback(async () => {
    const nextCategory = normalizeCategoryName(categoryDraft);

    if (nextCategory.length < 2) {
      Alert.alert("Category too short", "Use at least 2 characters so the category is easy to recognize.");
      return;
    }

    const existingCategory =
      categories.find((category) => category.toLocaleLowerCase() === nextCategory.toLocaleLowerCase()) ??
      nextCategory;

    await persistCategories(mergeCategoryLists(categories, [existingCategory]));

    if (categoryModalTarget === "product") {
      setForm((current) => ({ ...current, category: existingCategory }));
    } else {
      setSelectedCategory(existingCategory);
    }

    setCategoryDraft("");
    setCategoryModalVisible(false);
  }, [categories, categoryDraft, categoryModalTarget, persistCategories]);

  const selectedInventoryPool = useMemo(
    () => inventoryPools.find((pool) => pool.id === form.inventoryPoolId) ?? null,
    [form.inventoryPoolId, inventoryPools],
  );

  const loadRepackContext = useCallback(
    async (inventoryPoolId: number, preferredOutputProductId?: number) => {
      const [poolProducts, nextRepackSessions] = await Promise.all([
        listProductsByInventoryPool(db, inventoryPoolId),
        listRepackSessionsForInventoryPool(db, inventoryPoolId),
      ]);

      const nextOutputProductId =
        preferredOutputProductId && poolProducts.some((product) => product.id === preferredOutputProductId)
          ? preferredOutputProductId
          : poolProducts[0]?.id ?? null;
      const nextSourceProductId =
        poolProducts.find((product) => product.id !== nextOutputProductId)?.id ?? poolProducts[0]?.id ?? null;

      setRepackProducts(poolProducts);
      setRepackSessions(nextRepackSessions);
      setRepackOutputProductId(nextOutputProductId);
      setRepackSourceProductId(nextSourceProductId);
      setRepackSourceQuantity("");
      setRepackOutputUnits("");
      setRepackWastage("0");
      setRepackNote("");
    },
    [db],
  );

  const handleOpenRepackModal = useCallback(async () => {
    const inventoryPoolId = editingProduct?.inventoryPoolId ?? form.inventoryPoolId;

    if (!inventoryPoolId) {
      Alert.alert("Shared inventory needed", "Link this product to an inventory pool before logging a repack session.");
      return;
    }

    await loadRepackContext(inventoryPoolId, editingProduct?.id ?? undefined);
    setRepackModalVisible(true);
  }, [editingProduct?.id, editingProduct?.inventoryPoolId, form.inventoryPoolId, loadRepackContext]);

  const handleSaveRepackSession = useCallback(async () => {
    if (!repackSourceProductId || !repackOutputProductId || !editingProduct?.inventoryPoolId) {
      return;
    }

    const sourceQuantityUsed = parseDecimalInput(repackSourceQuantity);
    const outputUnitsCreated = parseDecimalInput(repackOutputUnits);
    const wastageUnits = parseDecimalInput(repackWastage);

    if (!Number.isFinite(sourceQuantityUsed) || sourceQuantityUsed <= 0) {
      Alert.alert("Invalid source quantity", "Enter a source quantity greater than zero.");
      return;
    }

    if (!Number.isFinite(outputUnitsCreated) || outputUnitsCreated <= 0) {
      Alert.alert("Invalid output quantity", "Enter an output quantity greater than zero.");
      return;
    }

    if (!Number.isFinite(wastageUnits) || wastageUnits < 0) {
      Alert.alert("Invalid wastage", "Enter zero or a positive wastage value.");
      return;
    }

    setSavingRepack(true);

    try {
      await recordRepackSession(db, {
        sourceProductId: repackSourceProductId,
        outputProductId: repackOutputProductId,
        sourceQuantityUsed,
        outputUnitsCreated,
        wastageUnits,
        note: repackNote,
      });

      await Promise.all([
        loadProducts(),
        loadRepackContext(editingProduct.inventoryPoolId, repackOutputProductId ?? undefined),
      ]);
      const latestProducts = await listProducts(db);
      const refreshedProduct = latestProducts.find((product) => product.id === editingProduct.id);

      if (refreshedProduct) {
        openEditModal(refreshedProduct);
      }

      setRepackModalVisible(false);
    } catch (error) {
      Alert.alert("Repack failed", error instanceof Error ? error.message : "Could not record the repack session.");
    } finally {
      setSavingRepack(false);
    }
  }, [
    db,
    editingProduct,
    loadProducts,
    loadRepackContext,
    openEditModal,
    repackNote,
    repackOutputProductId,
    repackOutputUnits,
    repackSourceProductId,
    repackSourceQuantity,
    repackWastage,
  ]);

  const handleSave = useCallback(async () => {
    const normalizedCategory = normalizeCategoryName(form.category);

    if (pricingPreview.error) {
      Alert.alert("Invalid product setup", pricingPreview.error);
      return;
    }

    if (!("type" in pricingPreview)) {
      return;
    }

    const payload: ProductInput =
      pricingPreview.type === "weight"
        ? {
            name: form.name,
            priceCents: pricingPreview.sellingPricePerKgCents,
            costPriceCents: pricingPreview.costPricePerKgCents,
            stock: 0,
            category: normalizedCategory,
            barcode: form.barcode,
            imageUri: form.imageUri,
            minStock: pricingPreview.minStock,
            isWeightBased: true as const,
            pricingMode: form.pricingMode,
            pricingStrategy: form.pricingStrategy,
            totalKgAvailable: pricingPreview.totalKgAvailable,
            costPriceTotalCents: pricingPreview.costPriceTotalCents,
            sellingPriceTotalCents:
              form.pricingMode === "derived" ? pricingPreview.sellingPriceTotalCents : undefined,
            costPricePerKgCents: pricingPreview.costPricePerKgCents,
            sellingPricePerKgCents: pricingPreview.sellingPricePerKgCents,
            targetMarginPercent:
              form.pricingStrategy === "margin_based" ? pricingPreview.targetMarginPercent : undefined,
            computedPricePerKgCents: pricingPreview.computedPricePerKgCents,
            inventoryMode: form.inventoryMode,
            inventoryPoolId: form.inventoryMode === "linked" ? form.inventoryPoolId : null,
            inventoryPoolName: form.inventoryPoolName,
            inventoryPoolBaseUnitLabel: form.inventoryPoolBaseUnitLabel,
            inventoryPoolQuantityAvailable:
              form.inventoryMode === "linked" ? resolvedLinkedInventoryValues.quantityAvailable : null,
            inventoryPoolReorderThreshold:
              form.inventoryMode === "linked" ? resolvedLinkedInventoryValues.reorderThreshold : null,
            linkedUnitsPerSale: form.inventoryMode === "linked" ? parseDecimalInput(form.linkedUnitsPerSale) : null,
            linkedDisplayUnitLabel: form.linkedDisplayUnitLabel,
            isPrimaryRestockProduct: form.isPrimaryRestockProduct,
            hasContainerReturn: form.hasContainerReturn,
            containerLabel: form.containerLabel,
            containerDepositCents: parseCurrencyToCents(form.containerDeposit) || 0,
            defaultContainerQuantityPerSale: Math.max(1, Number.parseInt(form.defaultContainerQuantityPerSale, 10) || 1),
          }
        : {
            name: form.name,
            priceCents: pricingPreview.priceCents,
            costPriceCents: pricingPreview.costPriceCents,
            stock: pricingPreview.stock,
            category: normalizedCategory,
            barcode: form.barcode,
            imageUri: form.imageUri,
            minStock: pricingPreview.minStock,
            isWeightBased: false as const,
            inventoryMode: form.inventoryMode,
            inventoryPoolId: form.inventoryMode === "linked" ? form.inventoryPoolId : null,
            inventoryPoolName: form.inventoryPoolName,
            inventoryPoolBaseUnitLabel: form.inventoryPoolBaseUnitLabel,
            inventoryPoolQuantityAvailable:
              form.inventoryMode === "linked" ? resolvedLinkedInventoryValues.quantityAvailable : null,
            inventoryPoolReorderThreshold:
              form.inventoryMode === "linked" ? resolvedLinkedInventoryValues.reorderThreshold : null,
            linkedUnitsPerSale: form.inventoryMode === "linked" ? parseDecimalInput(form.linkedUnitsPerSale) : null,
            linkedDisplayUnitLabel: form.linkedDisplayUnitLabel,
            isPrimaryRestockProduct: form.isPrimaryRestockProduct,
            hasContainerReturn: form.hasContainerReturn,
            containerLabel: form.containerLabel,
            containerDepositCents: parseCurrencyToCents(form.containerDeposit) || 0,
            defaultContainerQuantityPerSale: Math.max(1, Number.parseInt(form.defaultContainerQuantityPerSale, 10) || 1),
          };

    setSaving(true);

    try {
      if (normalizedCategory) {
        await persistCategories(mergeCategoryLists(categories, [normalizedCategory]));
      }

      await saveProduct(
        db,
        payload,
        editingProduct?.id,
      );

      setPhotoSheetVisible(false);
      setCategoryModalVisible(false);
      resetRepackState();
      setModalVisible(false);
      setEditingProduct(null);
      setForm(emptyForm);
      await loadProducts();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The product could not be saved. Please review the form values.";
      Alert.alert("Save failed", message);
    } finally {
      setSaving(false);
    }
  }, [
    categories,
    db,
    editingProduct?.id,
    form,
    loadProducts,
    persistCategories,
    pricingPreview,
    resetRepackState,
    resolvedLinkedInventoryValues,
  ]);

  const handleDelete = useCallback(() => {
    if (!editingProduct) {
      return;
    }

    Alert.alert(
      "Delete product",
      `Remove ${editingProduct.name} from your catalog? Existing sale history will keep the old snapshots.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Delete",
          onPress: async () => {
            try {
              await deleteProduct(db, editingProduct.id);
              removeCartItem(editingProduct.id);
              setPhotoSheetVisible(false);
              setCategoryModalVisible(false);
              resetRepackState();
              setModalVisible(false);
              setEditingProduct(null);
              setForm(emptyForm);
              await loadProducts();
            } catch (error) {
              Alert.alert(
                "Delete failed",
                error instanceof Error ? error.message : "The product could not be removed right now.",
              );
            }
          },
        },
      ],
    );
  }, [db, editingProduct, loadProducts, removeCartItem, resetRepackState]);

  const handlePickImage = useCallback(
    async (source: "camera" | "library") => {
      if (pickingImage) {
        return;
      }

      try {
        setPickingImage(true);

        if (source === "camera") {
          if (!cameraPermission?.granted) {
            const permission = await requestCameraPermission();
            if (!permission.granted) {
              Alert.alert("Camera needed", "Allow camera access so you can take product photos.");
              return;
            }
          }
        } else if (!mediaPermission?.granted) {
          const permission = await requestMediaPermission();
          if (!permission.granted) {
            Alert.alert("Photos needed", "Allow photo library access so you can choose product images.");
            return;
          }
        }

        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [4, 3],
                mediaTypes: ["images"],
                quality: PRODUCT_IMAGE_QUALITY,
              })
            : await ImagePicker.launchImageLibraryAsync({
                allowsEditing: true,
                aspect: [4, 3],
                mediaTypes: ["images"],
                quality: PRODUCT_IMAGE_QUALITY,
              });

        if (result.canceled || !result.assets?.[0]?.uri) {
          return;
        }

        setForm((current) => ({ ...current, imageUri: result.assets[0].uri }));
      } catch (error) {
        Alert.alert("Image failed", error instanceof Error ? error.message : "Could not open the image picker.");
      } finally {
        setPickingImage(false);
      }
    },
    [cameraPermission?.granted, mediaPermission?.granted, pickingImage, requestCameraPermission, requestMediaPermission],
  );

  const handleOpenBarcodeScanner = useCallback(async () => {
    if (!barcodePermission || !barcodePermission.granted) {
      const permission = await requestBarcodePermission();
      if (!permission.granted) {
        Alert.alert("Camera needed", "Allow camera access so you can scan a product barcode.");
        return;
      }
    }

    setBarcodeScannerBusy(false);
    setBarcodeScannerVisible(true);
  }, [barcodePermission, requestBarcodePermission]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (barcodeScannerBusy) {
        return;
      }

      setBarcodeScannerBusy(true);
      setBarcodeScannerVisible(false);
      setForm((current) => ({ ...current, barcode: result.data }));
      setTimeout(() => setBarcodeScannerBusy(false), 180);
    },
    [barcodeScannerBusy],
  );

  const hasImage = form.imageUri.trim().length > 0;
  const categoryCountLabel =
    categories.length === 1
      ? t("produkto.savedCategory.single")
      : t("produkto.savedCategory.plural", { count: categories.length });
  const catalogCountLabel =
    visibleProducts.length === 1
      ? t("produkto.catalogCount.single", { count: visibleProducts.length })
      : t("produkto.catalogCount.plural", { count: visibleProducts.length });
  const showingLabel = selectedCategory
    ? t("produkto.showingCategory", { category: selectedCategory })
    : t("produkto.showingAll", { categoryCount: categoryCountLabel });
  const repackPoolId = editingProduct?.inventoryPoolId ?? form.inventoryPoolId;
  const repackPool = inventoryPools.find((pool) => pool.id === repackPoolId) ?? null;
  const repackSourceOptions = repackProducts.filter((product) => product.id !== repackOutputProductId);
  const repackOutputOptions = repackProducts.filter((product) => product.id !== repackSourceProductId);
  const hasMultipleRepackProducts = repackProducts.length >= 2;
  const selectedRepackSourceProduct =
    repackProducts.find((product) => product.id === repackSourceProductId) ?? null;
  const selectedRepackOutputProduct =
    repackProducts.find((product) => product.id === repackOutputProductId) ?? null;

  const renderCatalogCard = useCallback(
    (product: Product) => {
      return (
        <Pressable
          key={product.id}
          onPress={() => openEditModal(product)}
          style={({ pressed }) => ({
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            gap: theme.spacing.sm,
            opacity: pressed ? 0.92 : 1,
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
                  height: "94%",
                  width: "94%",
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
                ...microLabelTextStyle,
              }}
            >
              {product.category || t("productCard.value.general")}
            </Text>
          </View>

          <View
            style={{
              justifyContent: "space-between",
            }}
          >
            <View style={{ gap: 2, minWidth: 0 }}>
              <Text
                ellipsizeMode="tail"
                numberOfLines={1}
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: theme.typography.scale.bodySm.fontSize,
                  fontWeight: theme.typography.weight.semibold,
                  lineHeight: theme.typography.scale.bodySm.lineHeight,
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
          </View>
        </Pressable>
      );
    },
    [catalogCardWidth, microLabelTextStyle, openEditModal, t, theme],
  );

  return (
    <Screen title={t("produkto.title")}>
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
            paddingHorizontal: theme.spacing.md,
          }}
        >
          <Feather color={theme.colors.textSoft} name="search" size={16} />
          <TextInput
            allowFontScaling={false}
            onChangeText={setSearchTerm}
            placeholder={t("produkto.searchPlaceholder")}
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
          <Pressable
            accessibilityLabel={t("produkto.newCategoryButton")}
            onPress={() => openCategoryModal("catalog")}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: pressed ? theme.colors.primaryMuted : theme.colors.surface,
              borderColor: theme.colors.primary,
              borderRadius: theme.radius.pill,
              borderWidth: 1,
              height: 36,
              justifyContent: "center",
              opacity: pressed ? 0.92 : 1,
              width: 36,
            })}
          >
            <Feather color={theme.colors.primary} name="plus" size={14} />
          </Pressable>
          {[
            { label: t("produkto.categoryAll"), value: null as string | null },
            ...categories.map((category) => ({ label: category, value: category })),
          ].map((option) => {
            const active = selectedCategory === option.value;

            return (
              <Pressable
                key={`compact-${option.label}`}
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
          {false ? (
            <>
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
                  fontWeight: "600",
                }}
              >
                {t("produkto.categoriesLabel")}
              </Text>
              <Text
                style={{
                  color: theme.colors.textSoft,
                  display: "none",
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {selectedCategory ? `Showing ${selectedCategory}` : `Showing all products • ${categoryCountLabel}`}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {showingLabel}
              </Text>
            </View>
            <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.sm }}>
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
                    fontWeight: "600",
                  }}
                >
                  {categoriesExpanded ? t("produkto.toggleCategories.hide") : t("produkto.toggleCategories.show")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => openCategoryModal("catalog")}
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
                <Feather color={theme.colors.primary} name="plus" size={14} />
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {t("produkto.newCategoryButton")}
                </Text>
              </Pressable>
            </View>
          </View>

          {categoriesExpanded ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {[
                { label: t("produkto.categoryAll"), value: null as string | null },
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
                        fontWeight: "600",
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
            </>
          ) : null}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <ActionButton
            icon={<Feather color={theme.colors.primaryText} name="plus" size={16} />}
            label={t("produkto.addProductButton")}
            onPress={openCreateModal}
            style={{ flex: 1 }}
          />
          <ActionButton
            icon={<Feather color={theme.colors.text} name="shopping-bag" size={16} />}
            label={t("produkto.restockButton")}
            onPress={() => router.push("../restock")}
            style={{ flex: 1 }}
            variant="ghost"
          />
        </View>
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
            ...microLabelTextStyle,
          }}
        >
          {catalogCountLabel}
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: CATALOG_GRID_GAP }}>
        {loading ? (
          <SurfaceCard style={{ width: "100%" }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              {t("produkto.loadingCatalog")}
            </Text>
          </SurfaceCard>
          ) : products.length > 0 ? (
            visibleProducts.length > 0 ? (
              <>
                {visibleProducts.map(renderCatalogCard)}
                <Pressable
                  onPress={openCreateModal}
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
                      ...microLabelTextStyle,
                      textAlign: "center",
                    }}
                  >
                    {t("produkto.addProductButton")}
                  </Text>
                </Pressable>
              </>
            ) : (
              <SurfaceCard style={{ width: "100%" }}>
                <Text
                  style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                }}
              >
                {t("produkto.noMatches")}
              </Text>
            </SurfaceCard>
          )
        ) : (
          <View style={{ width: "100%" }}>
              <EmptyState
                icon="package"
                message={t("produkto.emptyMessage")}
                title={t("produkto.emptyTitle")}
              />
          </View>
        )}
      </View>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton label="Edit Product" onPress={() => {
              if (catalogInfoProduct) {
                setCatalogInfoProduct(null);
                openEditModal(catalogInfoProduct);
              }
            }} />
            <ActionButton label="Close" onPress={() => setCatalogInfoProduct(null)} variant="ghost" />
          </View>
        }
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
                  {catalogInfoProduct.isWeightBased
                    ? formatWeightKg(catalogInfoProduct.totalKgAvailable ?? 0)
                    : catalogInfoProduct.stock}
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
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={saving || Boolean(pricingPreview.error)}
              label={saving ? "Saving..." : editingProduct ? "Update Product" : "Create Product"}
              onPress={() => void handleSave()}
            />
            {editingProduct ? (
              <ActionButton label="Delete Product" onPress={handleDelete} variant="danger" />
            ) : null}
          </View>
        }
        onClose={() => {
          setPhotoSheetVisible(false);
          setCategoryModalVisible(false);
          setBarcodeScannerVisible(false);
          resetRepackState();
          setModalVisible(false);
        }}
        title={editingProduct ? t("produkto.editProduct") : t("produkto.newProduct")}
        visible={modalVisible}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Pressable
              onPress={() => setPhotoSheetVisible(true)}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                height: 72,
                justifyContent: "center",
                opacity: pressed ? 0.9 : 1,
                overflow: "hidden",
                width: 72,
              })}
            >
              {hasImage ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: form.imageUri }}
                  style={{ height: "100%", width: "100%" }}
                />
              ) : (
                <Feather color={theme.colors.primary} name="camera" size={22} />
              )}
            </Pressable>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  borderColor:
                    shouldShowValidationMessage && form.name.trim().length > 0 && form.name.trim().length < 2
                      ? theme.colors.danger
                      : theme.colors.border,
                  borderRadius: theme.radius.sm,
                  borderWidth: 1,
                  minHeight: 72,
                  paddingHorizontal: theme.spacing.md,
                }}
              >
                <TextInput
                  onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
                  placeholder="Product name"
                  placeholderTextColor={theme.colors.textSoft}
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 15,
                    minHeight: 70,
                  }}
                  value={form.name}
                />
              </View>
              {shouldShowValidationMessage && form.name.trim().length > 0 && form.name.trim().length < 2 ? (
                <Text
                  style={{
                    color: theme.colors.danger,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    lineHeight: 18,
                  }}
                >
                  Use at least 2 characters.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {[
              { label: "Per piece", value: false },
              { label: "Sold by weight", value: true },
            ].map((option) => {
              const active = form.isWeightBased === option.value;

              return (
                <Pressable
                  key={option.label}
                  onPress={() => setForm((current) => ({ ...current, isWeightBased: option.value }))}
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

          <SurfaceCard style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              {t("produkto.inventorySetup")}
            </Text>

            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {[
                { label: t("produkto.inventoryMode.standalone"), value: "standalone" as ProductInventoryMode },
                { label: t("produkto.inventoryMode.linked"), value: "linked" as ProductInventoryMode },
              ].map((option) => {
                const active = form.inventoryMode === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        inventoryMode: option.value,
                        inventoryBundleCount: option.value === "linked" ? current.inventoryBundleCount : "",
                        inventoryBundleReorderCount: option.value === "linked" ? current.inventoryBundleReorderCount : "",
                      }))
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

            {form.inventoryMode === "linked" ? (
              <>
                {inventoryPools.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                      {inventoryPools.map((pool) => {
                        const active = form.inventoryPoolId === pool.id;

                        return (
                          <Pressable
                            key={pool.id}
                            onPress={() =>
                              setForm((current) => ({
                                ...current,
                                inventoryBundleCount:
                                  current.linkedUnitsPerSale.trim().length > 0 &&
                                  Number.isFinite(parseDecimalInput(current.linkedUnitsPerSale)) &&
                                  parseDecimalInput(current.linkedUnitsPerSale) > 0
                                    ? formatWeightKg(
                                        roundWeightKg(pool.quantityAvailable / parseDecimalInput(current.linkedUnitsPerSale)),
                                      )
                                    : current.inventoryBundleCount,
                                inventoryBundleReorderCount:
                                  current.linkedUnitsPerSale.trim().length > 0 &&
                                  Number.isFinite(parseDecimalInput(current.linkedUnitsPerSale)) &&
                                  parseDecimalInput(current.linkedUnitsPerSale) > 0
                                    ? formatWeightKg(
                                        roundWeightKg(pool.reorderThreshold / parseDecimalInput(current.linkedUnitsPerSale)),
                                      )
                                    : current.inventoryBundleReorderCount,
                                inventoryPoolId: pool.id,
                                inventoryPoolName: pool.name,
                                inventoryPoolBaseUnitLabel: pool.baseUnitLabel,
                                inventoryPoolQuantityAvailable: formatWeightKg(pool.quantityAvailable),
                                inventoryPoolReorderThreshold: formatWeightKg(pool.reorderThreshold),
                              }))
                            }
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
                                fontFamily: theme.typography.body,
                                fontSize: 12,
                                fontWeight: "600",
                              }}
                            >
                              {pool.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : null}

                <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Shared pool name"
                      onChangeText={(value) =>
                        setForm((current) => ({
                          ...current,
                          inventoryPoolId:
                            selectedInventoryPool &&
                            value.trim().toLocaleLowerCase() === selectedInventoryPool.name.trim().toLocaleLowerCase()
                              ? selectedInventoryPool.id
                              : null,
                          inventoryPoolName: value,
                        }))
                      }
                      placeholder="Example: Marlboro master stock"
                      value={form.inventoryPoolName}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Base unit label"
                      onChangeText={(value) => setForm((current) => ({ ...current, inventoryPoolBaseUnitLabel: value }))}
                      placeholder={form.isWeightBased ? "gram" : "piece"}
                      value={form.inventoryPoolBaseUnitLabel}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      keyboardType="decimal-pad"
                      label="Pool quantity available"
                      onChangeText={(value) => setForm((current) => ({ ...current, inventoryPoolQuantityAvailable: value }))}
                      placeholder="0"
                      value={form.inventoryPoolQuantityAvailable}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <InputField
                      keyboardType="decimal-pad"
                      label="Reorder threshold"
                      onChangeText={(value) => setForm((current) => ({ ...current, inventoryPoolReorderThreshold: value }))}
                      placeholder="0"
                      value={form.inventoryPoolReorderThreshold}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      keyboardType="decimal-pad"
                      label="Units per sale"
                      onChangeText={(value) => setForm((current) => ({ ...current, linkedUnitsPerSale: value }))}
                      placeholder={form.isWeightBased ? "1000" : "1"}
                      value={form.linkedUnitsPerSale}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Display unit label"
                      onChangeText={(value) => setForm((current) => ({ ...current, linkedDisplayUnitLabel: value }))}
                      placeholder={form.isWeightBased ? "kg" : "stick"}
                      value={form.linkedDisplayUnitLabel}
                    />
                  </View>
                </View>

                <SurfaceCard style={{ gap: theme.spacing.sm, padding: theme.spacing.sm }}>
                  <View style={{ gap: 4 }}>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {t("produkto.inventoryHelper.title")}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      {t("produkto.inventoryHelper.subtitle")}
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <InputField
                        keyboardType="decimal-pad"
                        label={t("produkto.inventoryHelper.stockCount")}
                        onChangeText={(value) => setForm((current) => ({ ...current, inventoryBundleCount: value }))}
                        placeholder="0"
                        value={form.inventoryBundleCount}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <InputField
                        keyboardType="decimal-pad"
                        label={t("produkto.inventoryHelper.reorderCount")}
                        onChangeText={(value) =>
                          setForm((current) => ({ ...current, inventoryBundleReorderCount: value }))
                        }
                        placeholder="0"
                        value={form.inventoryBundleReorderCount}
                      />
                    </View>
                  </View>

                  {linkedInventoryHelper?.ready ? (
                    <>
                      {linkedInventoryHelper.quantityAvailable !== null ? (
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {t("produkto.inventoryHelper.quantity", {
                            quantity: formatWeightKg(linkedInventoryHelper.quantityAvailable),
                            unit: linkedInventoryHelper.baseUnitLabel,
                          })}
                        </Text>
                      ) : null}
                      {linkedInventoryHelper.reorderThreshold !== null ? (
                        <Text
                          style={{
                            color: theme.colors.textMuted,
                            fontFamily: theme.typography.body,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {t("produkto.inventoryHelper.threshold", {
                            quantity: formatWeightKg(linkedInventoryHelper.reorderThreshold),
                            unit: linkedInventoryHelper.baseUnitLabel,
                          })}
                        </Text>
                      ) : null}

                      {(linkedInventoryHelper.quantityAvailable !== null || linkedInventoryHelper.reorderThreshold !== null) ? (
                        <ActionButton
                          label={t("produkto.inventoryHelper.apply")}
                          onPress={() =>
                            setForm((current) => ({
                              ...current,
                              inventoryPoolQuantityAvailable:
                                linkedInventoryHelper.quantityAvailable !== null
                                  ? formatWeightKg(linkedInventoryHelper.quantityAvailable)
                                  : current.inventoryPoolQuantityAvailable,
                              inventoryPoolReorderThreshold:
                                linkedInventoryHelper.reorderThreshold !== null
                                  ? formatWeightKg(linkedInventoryHelper.reorderThreshold)
                                  : current.inventoryPoolReorderThreshold,
                            }))
                          }
                          variant="ghost"
                        />
                      ) : null}
                    </>
                  ) : (
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      {t("produkto.inventoryHelper.needsUnitsPerSale")}
                    </Text>
                  )}
                </SurfaceCard>

                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                  {[
                    { label: "Restock child", value: false },
                    { label: "Restock parent", value: true },
                  ].map((option) => {
                    const active = form.isPrimaryRestockProduct === option.value;

                    return (
                      <Pressable
                        key={option.label}
                        onPress={() => setForm((current) => ({ ...current, isPrimaryRestockProduct: option.value }))}
                        style={({ pressed }) => ({
                          backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                          borderColor: active ? theme.colors.primary : theme.colors.border,
                          borderRadius: theme.radius.sm,
                          borderWidth: 1,
                          flex: 1,
                          opacity: pressed ? 0.9 : 1,
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: 12,
                        })}
                      >
                        <Text
                          style={{
                            color: active ? theme.colors.primary : theme.colors.text,
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

                {editingProduct?.inventoryMode === "linked" && editingProduct.inventoryPoolId ? (
                  <ActionButton
                    label="Log Repack"
                    onPress={() => void handleOpenRepackModal()}
                    variant="secondary"
                  />
                ) : null}
              </>
            ) : null}
          </SurfaceCard>
        </View>

        {form.isWeightBased ? (
          <>
            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Weight pricing mode
              </Text>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                {[
                  { label: "Derived from total", value: "derived" as ProductPricingMode },
                  { label: "Direct per kg", value: "direct" as ProductPricingMode },
                ].map((option) => {
                  const active = form.pricingMode === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setForm((current) => ({ ...current, pricingMode: option.value }))}
                      style={({ pressed }) => ({
                        backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        borderRadius: theme.radius.sm,
                        borderWidth: 1,
                        flex: 1,
                        opacity: pressed ? 0.9 : 1,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: 12,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.primary : theme.colors.text,
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

            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Pricing strategy
              </Text>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                {[
                  { label: "Manual pricing", value: "manual" as ProductPricingStrategy },
                  { label: "Margin-based", value: "margin_based" as ProductPricingStrategy },
                ].map((option) => {
                  const active = form.pricingStrategy === option.value;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setForm((current) => ({ ...current, pricingStrategy: option.value }))}
                      style={({ pressed }) => ({
                        backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                        borderColor: active ? theme.colors.primary : theme.colors.border,
                        borderRadius: theme.radius.sm,
                        borderWidth: 1,
                        flex: 1,
                        opacity: pressed ? 0.9 : 1,
                        paddingHorizontal: theme.spacing.md,
                        paddingVertical: 12,
                      })}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.primary : theme.colors.text,
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

            {form.inventoryMode === "standalone" ? (
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label="Total kilograms available"
                    onChangeText={(value) => setForm((current) => ({ ...current, totalKgAvailable: value }))}
                    placeholder="0.000"
                    error={
                      shouldShowValidationMessage &&
                      (!Number.isFinite(parseDecimalInput(form.totalKgAvailable)) || parseDecimalInput(form.totalKgAvailable) <= 0)
                        ? "Enter a value greater than zero."
                        : null
                    }
                    value={form.totalKgAvailable}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label="Low-stock threshold (kg)"
                    onChangeText={(value) => setForm((current) => ({ ...current, minStock: value }))}
                    placeholder="0.500"
                    error={
                      shouldShowValidationMessage &&
                      (!Number.isFinite(parseDecimalInput(form.minStock)) || parseDecimalInput(form.minStock) < 0)
                        ? "Enter zero or higher."
                        : null
                    }
                    value={form.minStock}
                  />
                </View>
              </View>
            ) : (
              <SurfaceCard style={{ gap: theme.spacing.xs }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Shared inventory controls stock
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    lineHeight: 19,
                  }}
                >
                  Total kilograms and the low-stock threshold will be derived from the shared inventory pool.
                </Text>
              </SurfaceCard>
            )}

            {form.pricingMode === "derived" ? (
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label="Total cost price"
                    onChangeText={(value) => setForm((current) => ({ ...current, costPriceTotal: value }))}
                    placeholder="0.00"
                    value={form.costPriceTotal}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  {form.pricingStrategy === "manual" ? (
                    <InputField
                      keyboardType="decimal-pad"
                      label="Total selling price"
                      onChangeText={(value) => setForm((current) => ({ ...current, sellingPriceTotal: value }))}
                      placeholder="0.00"
                      value={form.sellingPriceTotal}
                    />
                  ) : (
                    <InputField
                      keyboardType="decimal-pad"
                      label="Target margin (%)"
                      onChangeText={(value) => setForm((current) => ({ ...current, targetMarginPercent: value }))}
                      placeholder="25"
                      value={form.targetMarginPercent}
                    />
                  )}
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label="Cost price per kg"
                    onChangeText={(value) => setForm((current) => ({ ...current, costPricePerKg: value }))}
                    placeholder="0.00"
                    value={form.costPricePerKg}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  {form.pricingStrategy === "manual" ? (
                    <InputField
                      keyboardType="decimal-pad"
                      label="Selling price per kg"
                      onChangeText={(value) => setForm((current) => ({ ...current, sellingPricePerKg: value }))}
                      placeholder="0.00"
                      value={form.sellingPricePerKg}
                    />
                  ) : (
                    <InputField
                      keyboardType="decimal-pad"
                      label="Target margin (%)"
                      onChangeText={(value) => setForm((current) => ({ ...current, targetMarginPercent: value }))}
                      placeholder="25"
                      value={form.targetMarginPercent}
                    />
                  )}
                </View>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <InputField
                  keyboardType="decimal-pad"
                  label="Selling price"
                  onChangeText={(value) => setForm((current) => ({ ...current, price: value }))}
                  placeholder="0.00"
                  error={
                    shouldShowValidationMessage &&
                    !Number.isFinite(parseCurrencyToCents(form.price))
                      ? "Enter a valid peso amount."
                      : null
                  }
                  value={form.price}
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  keyboardType="decimal-pad"
                  label="Cost price"
                  onChangeText={(value) => setForm((current) => ({ ...current, costPrice: value }))}
                  placeholder="0.00"
                  error={
                    shouldShowValidationMessage &&
                    !Number.isFinite(parseCurrencyToCents(form.costPrice))
                      ? "Enter a valid peso amount."
                      : null
                  }
                  value={form.costPrice}
                />
              </View>
            </View>
            {form.inventoryMode === "standalone" ? (
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="number-pad"
                    label="Stock"
                    onChangeText={(value) => setForm((current) => ({ ...current, stock: value }))}
                    placeholder="0"
                    error={
                      shouldShowValidationMessage &&
                      (!Number.isInteger(Number.parseInt(form.stock, 10)) || Number.parseInt(form.stock, 10) < 0)
                        ? "Use a whole number."
                        : null
                    }
                    value={form.stock}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="number-pad"
                    label="Min stock"
                    onChangeText={(value) => setForm((current) => ({ ...current, minStock: value }))}
                    placeholder="5"
                    error={
                      shouldShowValidationMessage &&
                      (!Number.isInteger(Number.parseInt(form.minStock, 10)) || Number.parseInt(form.minStock, 10) < 0)
                        ? "Use a whole number."
                        : null
                    }
                    value={form.minStock}
                  />
                </View>
              </View>
            ) : (
              <SurfaceCard style={{ gap: theme.spacing.xs }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  Shared inventory controls stock
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    lineHeight: 19,
                  }}
                >
                  Visible stock and low-stock alerts will be calculated from the linked inventory pool.
                </Text>
              </SurfaceCard>
            )}
          </>
        )}

        {shouldShowValidationMessage && pricingPreview.error ? (
          <SurfaceCard
            style={{
              backgroundColor: theme.colors.dangerMuted,
              borderColor: theme.colors.danger,
              borderWidth: 1,
              gap: theme.spacing.xs,
            }}
          >
            <Text
              style={{
                color: theme.colors.danger,
                fontFamily: theme.typography.body,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Fix before saving
            </Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {pricingPreview.error}
            </Text>
          </SurfaceCard>
        ) : pricingPreview.error ? null : "type" in pricingPreview && pricingPreview.type === "weight" ? (
          <SurfaceCard style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              Live pricing preview
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Price per kg
              </Text>
              <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {centsToDisplayValue(pricingPreview.computedPricePerKgCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Cost per kg
              </Text>
              <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {centsToDisplayValue(pricingPreview.costPricePerKgCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Total projected sales
              </Text>
              <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {centsToDisplayValue(pricingPreview.sellingPriceTotalCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Margin
              </Text>
              <Text style={{ color: theme.colors.success, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {formatMarginPercent(pricingPreview.realizedMarginPercent)}
              </Text>
            </View>
          </SurfaceCard>
        ) : "type" in pricingPreview && pricingPreview.type === "unit" ? (
          <SurfaceCard style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              Live pricing preview
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Selling price
              </Text>
              <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {centsToDisplayValue(pricingPreview.priceCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Total projected sales
              </Text>
              <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {centsToDisplayValue(pricingPreview.sellingPriceTotalCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Margin
              </Text>
              <Text style={{ color: theme.colors.success, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "600" }}>
                {formatMarginPercent(pricingPreview.marginPercent)}
              </Text>
            </View>
          </SurfaceCard>
        ) : null}

        <SurfaceCard style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            {t("produkto.containerTracking.title")}
          </Text>

          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {[
              { label: t("produkto.containerTracking.none"), value: false },
              { label: t("produkto.containerTracking.track"), value: true },
            ].map((option) => {
              const active = form.hasContainerReturn === option.value;

              return (
                <Pressable
                  key={option.label}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      hasContainerReturn: option.value,
                      containerLabel: option.value ? current.containerLabel : "",
                      containerDeposit: option.value ? current.containerDeposit : "",
                      defaultContainerQuantityPerSale: option.value ? current.defaultContainerQuantityPerSale : "1",
                    }))
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

          {form.hasContainerReturn ? (
            <>
              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    label={t("produkto.containerTracking.label")}
                    onChangeText={(value) => setForm((current) => ({ ...current, containerLabel: value }))}
                    placeholder={t("produkto.containerTracking.labelPlaceholder")}
                    value={form.containerLabel}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="number-pad"
                    label={t("produkto.containerTracking.perSale")}
                    onChangeText={(value) =>
                      setForm((current) => ({ ...current, defaultContainerQuantityPerSale: value }))
                    }
                    placeholder="1"
                    value={form.defaultContainerQuantityPerSale}
                  />
                </View>
              </View>

              <InputField
                keyboardType="decimal-pad"
                label={t("produkto.containerTracking.deposit")}
                onChangeText={(value) => setForm((current) => ({ ...current, containerDeposit: value }))}
                placeholder="0.00"
                value={form.containerDeposit}
              />
            </>
          ) : null}
        </SurfaceCard>
        <View style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            Category
          </Text>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              alignItems: "center",
              gap: theme.spacing.sm,
              paddingRight: theme.spacing.sm,
            }}
          >
            <Pressable
              onPress={() => openCategoryModal("product")}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: pressed ? theme.colors.primaryMuted : theme.colors.surface,
                borderColor: theme.colors.primary,
                borderRadius: theme.radius.pill,
                borderWidth: 1,
                flexDirection: "row",
                gap: theme.spacing.xs,
                opacity: pressed ? 0.92 : 1,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 10,
              })}
            >
              <Feather color={theme.colors.primary} name="plus" size={14} />
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                Add New
              </Text>
            </Pressable>
            {categories.map((category) => {
              const active = normalizeCategoryName(form.category).toLocaleLowerCase() === category.toLocaleLowerCase();

              return (
                <Pressable
                  key={category}
                  onPress={() => setForm((current) => ({ ...current, category }))}
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
                      fontWeight: "600",
                    }}
                  >
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Barcode
          </Text>
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.sm,
              borderWidth: 1,
              flexDirection: "row",
              minHeight: 52,
              paddingLeft: theme.spacing.md,
              paddingRight: theme.spacing.xs,
            }}
          >
            <TextInput
              onChangeText={(value) => setForm((current) => ({ ...current, barcode: value }))}
              placeholder="Optional"
              placeholderTextColor={theme.colors.textSoft}
              style={{
                color: theme.colors.text,
                flex: 1,
                fontFamily: theme.typography.body,
                fontSize: 15,
                minHeight: 50,
                paddingRight: theme.spacing.sm,
              }}
              value={form.barcode}
            />
            <Pressable
              accessibilityLabel="Scan barcode"
              hitSlop={6}
              onPress={() => void handleOpenBarcodeScanner()}
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
        </View>
      </ModalSheet>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={savingRepack || !hasMultipleRepackProducts}
              label={savingRepack ? "Saving Repack..." : "Save Repack"}
              onPress={() => void handleSaveRepackSession()}
            />
            <ActionButton label="Close" onPress={resetRepackState} variant="ghost" />
          </View>
        }
        onClose={resetRepackState}
        subtitle={t("produkto.repack.subtitle")}
        title={t("produkto.repack.title")}
        visible={repackModalVisible}
      >
        <View style={{ gap: theme.spacing.sm }}>
          {repackPool ? (
            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {repackPool.name}
                </Text>
                <Text
                  style={{
                    color: theme.colors.primary,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {formatWeightKg(repackPool.quantityAvailable)} {repackPool.baseUnitLabel}
                </Text>
              </View>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                Reorder threshold: {formatWeightKg(repackPool.reorderThreshold)} {repackPool.baseUnitLabel}
              </Text>
            </SurfaceCard>
          ) : null}

          {hasMultipleRepackProducts ? (
            <>
              <View style={{ gap: theme.spacing.xs }}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Source product
                </Text>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.sm }}
                >
                  {repackSourceOptions.map((product) => {
                    const active = product.id === repackSourceProductId;

                    return (
                      <Pressable
                        key={`repack-source-${product.id}`}
                        onPress={() => setRepackSourceProductId(product.id)}
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
                            fontWeight: "600",
                          }}
                        >
                          {product.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ gap: theme.spacing.xs }}>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Output product
                </Text>
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: theme.spacing.sm, paddingRight: theme.spacing.sm }}
                >
                  {repackOutputOptions.map((product) => {
                    const active = product.id === repackOutputProductId;

                    return (
                      <Pressable
                        key={`repack-output-${product.id}`}
                        onPress={() => setRepackOutputProductId(product.id)}
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
                            fontWeight: "600",
                          }}
                        >
                          {product.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label={`Source quantity${selectedRepackSourceProduct?.linkedDisplayUnitLabel ? ` (${selectedRepackSourceProduct.linkedDisplayUnitLabel})` : ""}`}
                    onChangeText={setRepackSourceQuantity}
                    placeholder="0"
                    value={repackSourceQuantity}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label={`Output created${selectedRepackOutputProduct?.linkedDisplayUnitLabel ? ` (${selectedRepackOutputProduct.linkedDisplayUnitLabel})` : ""}`}
                    onChangeText={setRepackOutputUnits}
                    placeholder="0"
                    value={repackOutputUnits}
                  />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
                <View style={{ flex: 1 }}>
                  <InputField
                    keyboardType="decimal-pad"
                    label={`Wastage${repackPool ? ` (${repackPool.baseUnitLabel})` : ""}`}
                    onChangeText={setRepackWastage}
                    placeholder="0"
                    value={repackWastage}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField
                    label="Note"
                    onChangeText={setRepackNote}
                    placeholder="Optional note"
                    value={repackNote}
                  />
                </View>
              </View>
            </>
          ) : (
            <SurfaceCard style={{ gap: theme.spacing.xs }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                Link one more product first
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                Repack sessions need at least two linked products in the same inventory pool, like a bulk item and its tingi version.
              </Text>
            </SurfaceCard>
          )}

          <SurfaceCard style={{ gap: theme.spacing.sm }}>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              Recent repack sessions
            </Text>
            {repackSessions.length > 0 ? (
              repackSessions.map((session) => {
                const sourceProduct =
                  repackProducts.find((product) => product.id === session.sourceProductId) ?? null;
                const outputProduct =
                  repackProducts.find((product) => product.id === session.outputProductId) ?? null;

                return (
                  <View
                    key={session.id}
                    style={{
                      borderTopColor: theme.colors.border,
                      borderTopWidth: 1,
                      gap: theme.spacing.xs,
                      paddingTop: theme.spacing.sm,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontFamily: theme.typography.body,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      {session.sourceProductName} to {session.outputProductName}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                        lineHeight: 18,
                      }}
                    >
                      Used {formatWeightKg(session.sourceQuantityUsed)} {sourceProduct?.linkedDisplayUnitLabel ?? "units"} •
                      Created {formatWeightKg(session.outputUnitsCreated)} {outputProduct?.linkedDisplayUnitLabel ?? "units"} •
                      Wastage {formatWeightKg(session.wastageUnits)} {repackPool?.baseUnitLabel ?? "units"}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.textSoft,
                        fontFamily: theme.typography.body,
                        fontSize: 12,
                      }}
                    >
                      {formatDateTimeLabel(session.createdAt)}
                    </Text>
                    {session.note ? (
                      <Text
                        style={{
                          color: theme.colors.textMuted,
                          fontFamily: theme.typography.body,
                          fontSize: 12,
                          lineHeight: 18,
                        }}
                      >
                        {session.note}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                No repack sessions recorded yet.
              </Text>
            )}
          </SurfaceCard>
        </View>
      </ModalSheet>

      <ModalSheet
        footer={<ActionButton label="Close Scanner" onPress={() => setBarcodeScannerVisible(false)} variant="ghost" />}
        onClose={() => setBarcodeScannerVisible(false)}
        subtitle="Scan a product code to fill the barcode field instantly."
        title="Scan Barcode"
        visible={barcodeScannerVisible}
      >
        <View
          style={{
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          {barcodePermission?.granted ? (
            <CameraView
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
              }}
              onBarcodeScanned={barcodeScannerVisible ? handleBarcodeScanned : undefined}
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
              <ActionButton label="Grant Camera Access" onPress={() => void handleOpenBarcodeScanner()} />
            </View>
          )}
        </View>
      </ModalSheet>

      <ModalSheet
        contentContainerStyle={{ paddingBottom: theme.spacing.sm }}
        footer={
          <ActionButton
            label="Done"
            onPress={() => setPhotoSheetVisible(false)}
          />
        }
        onClose={() => setPhotoSheetVisible(false)}
        title={hasImage ? t("produkto.replacePhoto") : t("produkto.addPhoto")}
        visible={photoSheetVisible}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            borderWidth: 1,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.colors.card,
              justifyContent: "center",
              minHeight: 248,
              padding: theme.spacing.lg,
            }}
          >
            {hasImage ? (
              <>
                <Image
                  resizeMode="cover"
                  source={{ uri: form.imageUri }}
                  style={{ backgroundColor: theme.colors.card, height: 248, width: "100%" }}
                />
                <Pressable
                  accessibilityLabel="Remove photo"
                  hitSlop={8}
                  onPress={() => setForm((current) => ({ ...current, imageUri: "" }))}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    height: 36,
                    justifyContent: "center",
                    opacity: pressed ? 0.92 : 1,
                    position: "absolute",
                    right: theme.spacing.md,
                    top: theme.spacing.md,
                    width: 36,
                  })}
                >
                  <Feather color={theme.colors.danger} name="trash-2" size={16} />
                </Pressable>
              </>
            ) : (
              <View style={{ alignItems: "center", gap: theme.spacing.sm }}>
                <View
                  style={{
                    alignItems: "center",
                    backgroundColor: theme.colors.primaryMuted,
                    borderRadius: theme.radius.pill,
                    height: 56,
                    justifyContent: "center",
                    width: 56,
                  }}
                >
                  <Feather color={theme.colors.primary} name="camera" size={24} />
                </View>
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.typography.body,
                    fontSize: 15,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  No photo yet
                </Text>
              </View>
            )}

            {pickingImage ? (
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: theme.colors.overlay,
                  borderRadius: theme.radius.pill,
                  height: 28,
                  justifyContent: "center",
                  left: theme.spacing.md,
                  position: "absolute",
                  top: theme.spacing.md,
                  width: 28,
                }}
              >
                <ActivityIndicator color={theme.colors.background} size="small" />
              </View>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <ActionButton
            disabled={pickingImage}
            icon={<Feather color={theme.colors.primaryText} name="camera" size={16} />}
            label={pickingImage ? "Opening..." : "Take Photo"}
            onPress={() => void handlePickImage("camera")}
            style={{ flex: 1, minWidth: 150 }}
          />
          <ActionButton
            disabled={pickingImage}
            icon={<Feather color={theme.colors.primary} name="image" size={16} />}
            label={pickingImage ? "Opening..." : "Choose Photo"}
            onPress={() => void handlePickImage("library")}
            style={{ flex: 1, minWidth: 150 }}
            variant="secondary"
          />
        </View>
      </ModalSheet>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              label={categoryModalTarget === "product" ? "Save And Use Category" : "Create Category"}
              onPress={() => void handleCreateCategory()}
            />
          </View>
        }
        onClose={() => setCategoryModalVisible(false)}
        subtitle={
          categoryModalTarget === "product"
            ? t("produkto.categorySubtitle.product")
            : t("produkto.categorySubtitle.catalog")
        }
        title={t("produkto.newCategory")}
        visible={categoryModalVisible}
      >
        <InputField
          label="Category name"
          onChangeText={setCategoryDraft}
          placeholder="Example: Drinks"
          value={categoryDraft}
        />
        <SurfaceCard style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            Saved categories
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {categories.length > 0 ? (
              categories.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setCategoryDraft(category)}
                  style={({ pressed }) => ({
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.pill,
                    borderWidth: 1,
                    opacity: pressed ? 0.9 : 1,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: 10,
                  })}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {category}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text
                style={{
                  color: theme.colors.textSoft,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                No categories yet. Your first one will appear as a quick button in Produkto.
              </Text>
            )}
          </View>
        </SurfaceCard>
      </ModalSheet>
    </Screen>
  );
}

