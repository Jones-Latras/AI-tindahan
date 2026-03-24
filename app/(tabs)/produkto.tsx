import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Pressable, Text, View } from "react-native";

import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/EmptyState";
import { InputField } from "@/components/InputField";
import { ModalSheet } from "@/components/ModalSheet";
import { ProductCard } from "@/components/ProductCard";
import { Screen } from "@/components/Screen";
import { SurfaceCard } from "@/components/SurfaceCard";
import { useAppTheme } from "@/contexts/ThemeContext";
import { deleteProduct, listProductCategories, listProducts, saveProduct } from "@/db/repositories";
import type { Product } from "@/types/models";
import { centsToDisplayValue, parseCurrencyToCents } from "@/utils/money";

type ProductFormState = {
  name: string;
  price: string;
  costPrice: string;
  stock: string;
  category: string;
  barcode: string;
  imageUri: string;
  minStock: string;
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

export default function ProduktoScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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

      setProducts(
        selectedCategory
          ? nextProducts.filter(
              (product) =>
                normalizeCategoryName(product.category ?? "").toLocaleLowerCase() ===
                selectedCategory.toLocaleLowerCase(),
            )
          : nextProducts,
      );
    } finally {
      setLoading(false);
    }
  }, [db, searchTerm, selectedCategory]);

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
      minStock: String(product.minStock),
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
    const priceCents = parseCurrencyToCents(form.price);
    const costPriceCents = parseCurrencyToCents(form.costPrice);
    const stock = Number.parseInt(form.stock, 10);
    const minStock = Number.parseInt(form.minStock, 10);
    const normalizedCategory = normalizeCategoryName(form.category);

    if (!Number.isFinite(priceCents) || !Number.isFinite(costPriceCents)) {
      Alert.alert("Invalid amount", "Enter valid peso amounts for the selling and cost prices.");
      return;
    }

    if (!Number.isInteger(stock) || stock < 0 || !Number.isInteger(minStock) || minStock < 0) {
      Alert.alert("Invalid stock", "Stock and minimum stock must be non-negative whole numbers.");
      return;
    }

    setSaving(true);

    try {
      if (normalizedCategory) {
        await persistCategories(mergeCategoryLists(categories, [normalizedCategory]));
      }

      await saveProduct(
        db,
        {
          name: form.name,
          priceCents,
          costPriceCents,
          stock,
          category: normalizedCategory,
          barcode: form.barcode,
          imageUri: form.imageUri,
          minStock,
        },
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
  }, [categories, db, editingProduct?.id, form, loadProducts, persistCategories]);

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
              setPhotoSheetVisible(false);
              setCategoryModalVisible(false);
              setModalVisible(false);
              setEditingProduct(null);
              setForm(emptyForm);
              await loadProducts();
            } catch {
              Alert.alert(
                "Delete blocked",
                "This product may already be linked to sales history, so it cannot be removed safely.",
              );
            }
          },
        },
      ],
    );
  }, [db, editingProduct, loadProducts]);

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
    <Screen subtitle="Secure CRUD for your product catalog, with low-stock context built in." title="Produkto">
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
                  fontFamily: theme.typography.body,
                  fontSize: 12,
                }}
              >
                {selectedCategory ? `Showing ${selectedCategory}` : `Showing all products • ${categoryCountLabel}`}
              </Text>
            </View>
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
          products.map((product) => {
            const marginPercent =
              product.priceCents > 0
                ? `${(((product.priceCents - product.costPriceCents) / product.priceCents) * 100).toFixed(0)}%`
                : "0%";

            return (
              <ProductCard
                category={product.category}
                imageUri={product.imageUri}
                key={product.id}
                marginPercent={marginPercent}
                minStock={product.minStock}
                name={product.name}
                onPress={() => openEditModal(product)}
                priceCents={product.priceCents}
                stock={product.stock}
              />
            );
          })
        ) : (
          <View style={{ width: "100%" }}>
            <EmptyState
              icon="package"
              message="Create your first item here. Once products exist, the Benta screen can sell them instantly."
              title="Catalog Is Empty"
            />
          </View>
        )}
      </View>

      <ModalSheet
        footer={
          <View style={{ gap: theme.spacing.sm }}>
            <ActionButton
              disabled={saving}
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
        subtitle="Keep names clear, prices accurate, and stock values realistic so checkout stays reliable."
        title={editingProduct ? "Edit Product" : "New Product"}
        visible={modalVisible}
      >
        <InputField
          label="Product name"
          onChangeText={(value) => setForm((current) => ({ ...current, name: value }))}
          placeholder="Example: Lucky Me Pancit Canton"
          value={form.name}
        />
        <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <InputField
              keyboardType="decimal-pad"
              label="Selling price"
              onChangeText={(value) => setForm((current) => ({ ...current, price: value }))}
              placeholder="0.00"
              value={form.price}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              keyboardType="decimal-pad"
              label="Cost price"
              onChangeText={(value) => setForm((current) => ({ ...current, costPrice: value }))}
              placeholder="0.00"
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
              value={form.stock}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              keyboardType="number-pad"
              label="Min stock"
              onChangeText={(value) => setForm((current) => ({ ...current, minStock: value }))}
              placeholder="5"
              value={form.minStock}
            />
          </View>
        </View>
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
                backgroundColor: theme.colors.surfaceMuted,
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
            ? "Swap the current product photo without cluttering the main form. New picks stay lighter and upload during your next cloud backup."
            : "Add a clean product shot here. The picker opens the built-in crop tool, then saves a lighter image before backup."
        }
        title={hasImage ? "Replace Product Photo" : "Add Product Photo"}
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
              backgroundColor: theme.colors.surfaceMuted,
              justifyContent: "center",
              minHeight: 280,
              padding: theme.spacing.lg,
            }}
          >
            {hasImage ? (
              <Image
                resizeMode="cover"
                source={{ uri: form.imageUri }}
                style={{ backgroundColor: theme.colors.surfaceMuted, height: 280, width: "100%" }}
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
            ? "Create a reusable category and apply it to the product you are editing."
            : "Create category buttons so the catalog is easier to filter and browse."
        }
        title="New Category"
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
