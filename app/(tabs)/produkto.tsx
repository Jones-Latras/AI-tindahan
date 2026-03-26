import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { ProductCard } from "@/components/ProductCard";
import { Screen } from "@/components/Screen";
import { SurfaceCard } from "@/components/SurfaceCard";
import { useAppLanguage } from "@/contexts/LanguageContext";
import { useAppTheme } from "@/contexts/ThemeContext";
import {
  deleteProduct,
  listProductCategories,
  listProducts,
  saveProduct,
  type ProductInput,
} from "@/db/repositories";
import { useCartStore } from "@/store/useCartStore";
import type { Product, ProductPricingMode, ProductPricingStrategy } from "@/types/models";
import { centsToDisplayValue, parseCurrencyToCents } from "@/utils/money";
import {
  computeProfitMargin,
  formatMarginPercent,
  formatProductMinStockLabel,
  formatProductPriceLabel,
  formatProductStockLabel,
  formatWeightKg,
  resolveWeightBasedPricing,
} from "@/utils/pricing";

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
};

const PRODUCT_IMAGE_QUALITY = 0.72;
const PRODUCT_CATEGORIES_KEY = "tindahan.product-categories";

type CategoryModalTarget = "catalog" | "product";

function isCloudImageUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

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
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryModalTarget, setCategoryModalTarget] = useState<CategoryModalTarget>("catalog");
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();
  const removeCartItem = useCartStore((state) => state.removeItem);
  const pricingPreview = useMemo<ProductFormPreview>(() => {
    const name = form.name.trim();

    if (name.length < 2) {
      return { error: "Product name must be at least 2 characters." };
    }

    if (form.isWeightBased) {
      const totalKgAvailable = parseDecimalInput(form.totalKgAvailable);
      const minStock = parseDecimalInput(form.minStock);

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
    const stock = Number.parseInt(form.stock, 10);
    const minStock = Number.parseInt(form.minStock, 10);

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
  }, [form]);
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
      const [nextProducts, dbCategories, storedCategoriesRaw] = await Promise.all([
        listProducts(db, searchTerm),
        listProductCategories(db),
        Storage.getItem(PRODUCT_CATEGORIES_KEY),
      ]);

      const nextCategories = mergeCategoryLists(dbCategories, parseStoredCategories(storedCategoriesRaw));
      setCategories(nextCategories);
      setProducts(nextProducts);
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
    setModalVisible(true);
  }, []);

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
    });
    setPhotoSheetVisible(false);
    setCategoryModalVisible(false);
    setModalVisible(true);
  }, []);

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
  }, [categories, db, editingProduct?.id, form, loadProducts, persistCategories, pricingPreview]);

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
  }, [db, editingProduct, loadProducts, removeCartItem]);

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

  const hasImage = form.imageUri.trim().length > 0;
  const imageAlreadyBackedUp = hasImage && isCloudImageUri(form.imageUri);
  const categoryCountLabel = categories.length === 1 ? "1 saved category" : `${categories.length} saved categories`;

  return (
    <Screen title={t("produkto.title")}>
      <SurfaceCard style={{ gap: theme.spacing.md }}>
        <InputField
          label="Search catalog"
          onChangeText={setSearchTerm}
          placeholder="Search by product or category"
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
                  display: "none",
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {selectedCategory ? `Showing ${selectedCategory}` : `Showing all products • ${categoryCountLabel}`}
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
                    fontWeight: "700",
                  }}
                >
                  {categoriesExpanded ? "Hide" : "Show"}
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
                    fontWeight: "700",
                  }}
                >
                  New Category
                </Text>
              </Pressable>
            </View>
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
          icon={<Feather color={theme.colors.primaryText} name="plus" size={16} />}
          label="Magdagdag ng Produkto"
          onPress={openCreateModal}
        />
      </SurfaceCard>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
        {loading ? (
          <SurfaceCard style={{ width: "100%" }}>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 14,
              }}
            >
              Loading product list...
            </Text>
          </SurfaceCard>
        ) : products.length > 0 ? (
          visibleProducts.length > 0 ? (
            visibleProducts.map((product) => {
              const availableStock = product.isWeightBased ? product.totalKgAvailable ?? 0 : product.stock;

              return (
                <ProductCard
                  actionIconName="edit-2"
                  actionLabel="Edit"
                  cardPressEnabled={false}
                  category={product.category}
                  imageUri={product.imageUri}
                  isWeightBased={product.isWeightBased}
                  key={product.id}
                  marginPercent={formatMarginPercent(computeProfitMargin(product.costPriceCents, product.priceCents))}
                  minStock={product.minStock}
                  minStockLabel={formatProductMinStockLabel(product)}
                  name={product.name}
                  onActionPress={() => openEditModal(product)}
                  priceCents={product.priceCents}
                  priceLabel={formatProductPriceLabel(product)}
                  showInfoFlip
                  stock={availableStock}
                  stockLabel={formatProductStockLabel(product)}
                />
              );
            })
          ) : (
            <SurfaceCard style={{ width: "100%" }}>
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
                message="Create your first item here. Once products exist, the Benta screen can sell them instantly."
                title={t("produkto.emptyTitle")}
              />
          </View>
        )}
      </View>

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
          setModalVisible(false);
        }}
        subtitle={t("produkto.productModalSubtitle")}
        title={editingProduct ? t("produkto.editProduct") : t("produkto.newProduct")}
        visible={modalVisible}
      >
        <InputField
          label="Product name"
          onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
          placeholder="Example: Lucky Me Pancit Canton"
          error={
            shouldShowValidationMessage && form.name.trim().length > 0 && form.name.trim().length < 2
              ? "Use at least 2 characters."
              : null
          }
          value={form.name}
        />
        <SurfaceCard style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 14,
              fontWeight: "700",
            }}
          >
            Selling setup
          </Text>
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
                      color: active ? theme.colors.primaryText : theme.colors.text,
                      fontFamily: theme.typography.body,
                      fontSize: 13,
                      fontWeight: "700",
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

        {form.isWeightBased ? (
          <>
            <SurfaceCard style={{ gap: theme.spacing.sm }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 14,
                  fontWeight: "700",
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
                          fontWeight: "700",
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
                  fontWeight: "700",
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
                          fontWeight: "700",
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
                fontWeight: "700",
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
                fontWeight: "700",
              }}
            >
              Live pricing preview
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Price per kg
              </Text>
              <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {centsToDisplayValue(pricingPreview.computedPricePerKgCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Cost per kg
              </Text>
              <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {centsToDisplayValue(pricingPreview.costPricePerKgCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Total projected sales
              </Text>
              <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {centsToDisplayValue(pricingPreview.sellingPriceTotalCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Margin
              </Text>
              <Text style={{ color: theme.colors.success, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
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
                fontWeight: "700",
              }}
            >
              Live pricing preview
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Selling price
              </Text>
              <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {centsToDisplayValue(pricingPreview.priceCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Total projected sales
              </Text>
              <Text style={{ color: theme.colors.text, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {centsToDisplayValue(pricingPreview.sellingPriceTotalCents)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.textMuted, fontFamily: theme.typography.body, fontSize: 13 }}>
                Margin
              </Text>
              <Text style={{ color: theme.colors.success, fontFamily: theme.typography.body, fontSize: 13, fontWeight: "700" }}>
                {formatMarginPercent(pricingPreview.marginPercent)}
              </Text>
            </View>
          </SurfaceCard>
        ) : null}
        <InputField
          label="Category"
          onChangeText={(value) => setForm((current) => ({ ...current, category: value }))}
          placeholder="Snacks, Drinks, Household"
          value={form.category}
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
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              Quick category picks
            </Text>
            <Pressable
              onPress={() => openCategoryModal("product")}
              style={({ pressed }) => ({
                alignItems: "center",
                flexDirection: "row",
                gap: theme.spacing.xs,
                opacity: pressed ? 0.84 : 1,
              })}
            >
              <Feather color={theme.colors.primary} name="plus-circle" size={14} />
              <Text
                style={{
                  color: theme.colors.primary,
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                Add new
              </Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {categories.length > 0 ? (
              categories.map((category) => {
                const active =
                  normalizeCategoryName(form.category).toLocaleLowerCase() === category.toLocaleLowerCase();

                return (
                  <Pressable
                    key={category}
                    onPress={() => setForm((current) => ({ ...current, category }))}
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
                        fontWeight: "700",
                      }}
                    >
                      {category}
                    </Text>
                  </Pressable>
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
                No saved categories yet. Add one to reuse it quickly.
              </Text>
            )}
          </View>
        </View>
        <InputField
          label="Barcode"
          onChangeText={(value) => setForm((current) => ({ ...current, barcode: value }))}
          placeholder="Optional"
          value={form.barcode}
        />
        <View style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.typography.body,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            Product image
          </Text>
          <Pressable
            onPress={() => setPhotoSheetVisible(true)}
            style={({ pressed }) => ({
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              borderWidth: 1,
              flexDirection: "row",
              gap: theme.spacing.md,
              opacity: pressed ? 0.9 : 1,
              padding: theme.spacing.md,
            })}
          >
            <View
              style={{
                alignItems: "center",
                backgroundColor: theme.colors.card,
                borderRadius: theme.radius.md,
                height: 72,
                justifyContent: "center",
                overflow: "hidden",
                width: 72,
              }}
            >
              {hasImage ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: form.imageUri }}
                  style={{ height: "100%", width: "100%" }}
                />
              ) : (
                <Feather color={theme.colors.primary} name="image" size={20} />
              )}
            </View>

            <View style={{ flex: 1, gap: theme.spacing.xs, justifyContent: "center" }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.typography.body,
                  fontSize: 15,
                  fontWeight: "700",
                }}
              >
                {hasImage ? "Replace product photo" : "Add product photo"}
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {hasImage
                  ? imageAlreadyBackedUp
                    ? "This image is already in cloud backup. Replacing it uploads a new lighter copy next time you back up."
                    : "Saved locally and ready for cloud backup. Tap to replace, remove, or review the photo."
                  : "Open the photo sheet to take or choose a clean product image. The picker saves a lighter copy before backup."}
              </Text>
            </View>

            <View style={{ justifyContent: "center" }}>
              <Feather color={theme.colors.textMuted} name="chevron-right" size={18} />
            </View>
          </Pressable>
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
        fullHeight
        onClose={() => setPhotoSheetVisible(false)}
        subtitle={
          hasImage
            ? t("produkto.photoSubtitle.hasImage")
            : t("produkto.photoSubtitle.empty")
        }
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
              minHeight: 280,
              padding: theme.spacing.lg,
            }}
          >
            {hasImage ? (
              <Image
                resizeMode="cover"
                source={{ uri: form.imageUri }}
                style={{ backgroundColor: theme.colors.card, height: 280, width: "100%" }}
              />
            ) : (
              <View style={{ alignItems: "center", gap: theme.spacing.sm, maxWidth: 240 }}>
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
                    fontSize: 16,
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  No photo selected yet
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontFamily: theme.typography.body,
                    fontSize: 13,
                    lineHeight: 19,
                    textAlign: "center",
                  }}
                >
                  Add one now so product cards feel easier to scan in both Produkto and Benta.
                </Text>
              </View>
            )}
          </View>

          <View
            style={{
              borderTopColor: theme.colors.border,
              borderTopWidth: 1,
              gap: theme.spacing.xs,
              padding: theme.spacing.md,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.typography.body,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              {hasImage
                ? imageAlreadyBackedUp
                  ? "Cloud copy ready"
                  : "Saved locally, waiting for backup"
                : "Auto-compresses before backup"}
            </Text>
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.typography.body,
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {hasImage
                ? imageAlreadyBackedUp
                  ? "This image already points to Supabase Storage."
                  : "The next time you tap backup, this photo will upload to Supabase Storage automatically."
                : "The picker keeps the saved image lighter so backup stays practical on the free plan."}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          <ActionButton
            disabled={pickingImage}
            icon={<Feather color={theme.colors.primaryText} name="camera" size={16} />}
            label={pickingImage ? "Opening..." : hasImage ? "Take New Photo" : "Take Photo"}
            onPress={() => void handlePickImage("camera")}
            style={{ flex: 1, minWidth: 150 }}
          />
          <ActionButton
            disabled={pickingImage}
            icon={<Feather color={theme.colors.primary} name="image" size={16} />}
            label={pickingImage ? "Opening..." : hasImage ? "Choose New Photo" : "Choose Photo"}
            onPress={() => void handlePickImage("library")}
            style={{ flex: 1, minWidth: 150 }}
            variant="secondary"
          />
          {hasImage ? (
            <ActionButton
              icon={<Feather color={theme.colors.danger} name="trash-2" size={16} />}
              label="Remove Current Photo"
              onPress={() => setForm((current) => ({ ...current, imageUri: "" }))}
              style={{ width: "100%" }}
              variant="ghost"
            />
          ) : null}
        </View>

        <SurfaceCard style={{ gap: theme.spacing.sm }}>
          <Text
            style={{
              color: theme.colors.text,
              fontFamily: theme.typography.body,
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            Crop hints
          </Text>

          {[
            {
              icon: "box",
              text: "Center the product and let the crop frame breathe so labels stay readable.",
            },
            {
              icon: "sun",
              text: "Use even lighting and avoid dark shelves or strong shadows when possible.",
            },
            {
              icon: "sliders",
              text: "Keep the background simple. One clear item photo works better than a busy scene.",
            },
          ].map((tip) => (
            <View
              key={tip.text}
              style={{
                alignItems: "flex-start",
                flexDirection: "row",
                gap: theme.spacing.sm,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: theme.colors.primaryMuted,
                  borderRadius: theme.radius.pill,
                  height: 28,
                  justifyContent: "center",
                  width: 28,
                }}
              >
                <Feather color={theme.colors.primary} name={tip.icon as "box" | "sun" | "sliders"} size={14} />
              </View>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  flex: 1,
                  fontFamily: theme.typography.body,
                  fontSize: 13,
                  lineHeight: 19,
                }}
              >
                {tip.text}
              </Text>
            </View>
          ))}
        </SurfaceCard>
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
              fontWeight: "700",
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
                      fontWeight: "700",
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
