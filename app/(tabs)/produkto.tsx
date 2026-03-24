import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";

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
  minStock: string;
};

const emptyForm: ProductFormState = {
  name: "",
  price: "",
  costPrice: "",
  stock: "0",
  category: "",
  barcode: "",
  minStock: "5",
};

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
      minStock: String(product.minStock),
    });
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
          minStock,
        },
        editingProduct?.id,
      );

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
        onClose={() => setModalVisible(false)}
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
      </ModalSheet>
    </Screen>
  );
}

