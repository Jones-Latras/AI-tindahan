import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
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
import { deleteProduct, listProducts, saveProduct } from "@/db/repositories";
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

function isCloudImageUri(uri: string) {
  return /^https?:\/\//i.test(uri.trim());
}

export default function ProduktoScreen() {
  const db = useSQLiteContext();
  const { theme } = useAppTheme();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [photoSheetVisible, setPhotoSheetVisible] = useState(false);
  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();

  const loadProducts = useCallback(async () => {
    setLoading(true);

    try {
      const nextProducts = await listProducts(db, searchTerm);
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
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(async () => {
    const priceCents = parseCurrencyToCents(form.price);
    const costPriceCents = parseCurrencyToCents(form.costPrice);
    const stock = Number.parseInt(form.stock, 10);
    const minStock = Number.parseInt(form.minStock, 10);

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
      await saveProduct(
        db,
        {
          name: form.name,
          priceCents,
          costPriceCents,
          stock,
          category: form.category,
          barcode: form.barcode,
          imageUri: form.imageUri,
          minStock,
        },
        editingProduct?.id,
      );

      setPhotoSheetVisible(false);
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
  }, [db, editingProduct?.id, form, loadProducts]);

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

  return (
    <Screen subtitle="Secure CRUD for your product catalog, with low-stock context built in." title="Produkto">
      <SurfaceCard style={{ gap: theme.spacing.md }}>
        <InputField
          label="Search catalog"
          onChangeText={setSearchTerm}
          placeholder="Search by product or category"
          value={searchTerm}
        />
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
    </Screen>
  );
}
