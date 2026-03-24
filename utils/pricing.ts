import type { Product, ProductPricingMode, ProductPricingStrategy } from "../types/models";

import { formatCurrencyFromCents } from "./money";

type NullableNumber = number | null | undefined;

export type WeightBasedPricingInput = {
  pricingMode: ProductPricingMode;
  pricingStrategy: ProductPricingStrategy;
  totalKgAvailable: number;
  costPriceTotalCents?: NullableNumber;
  sellingPriceTotalCents?: NullableNumber;
  costPricePerKgCents?: NullableNumber;
  sellingPricePerKgCents?: NullableNumber;
  targetMarginPercent?: NullableNumber;
};

export type WeightBasedPricingComputation = {
  totalKgAvailable: number;
  costPriceTotalCents: number;
  sellingPriceTotalCents: number;
  costPricePerKgCents: number;
  sellingPricePerKgCents: number;
  computedPricePerKgCents: number;
  targetMarginPercent: number | null;
  realizedMarginPercent: number;
};

function trimTrailingZeros(value: number, maxDecimals: number) {
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, "");
}

function toOptionalFiniteNumber(value: NullableNumber) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requirePositiveMoney(value: NullableNumber, label: string) {
  const normalized = toOptionalFiniteNumber(value);

  if (normalized === null || normalized <= 0 || !Number.isInteger(normalized)) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return normalized;
}

function requireMarginPercent(value: NullableNumber) {
  const normalized = toOptionalFiniteNumber(value);

  if (normalized === null || normalized <= 0 || normalized >= 100) {
    throw new Error("Target margin must be greater than 0 and less than 100.");
  }

  return Number(normalized.toFixed(2));
}

export function roundWeightKg(value: number) {
  if (!Number.isFinite(value)) {
    return Number.NaN;
  }

  return Number(value.toFixed(3));
}

export function formatWeightKg(value: number) {
  return trimTrailingZeros(roundWeightKg(value), 3);
}

export function computePricePerKg(totalCents: number, totalKg: number) {
  if (!Number.isFinite(totalCents) || !Number.isFinite(totalKg) || totalCents < 0 || totalKg <= 0) {
    throw new Error("Cannot compute price per kg from invalid values.");
  }

  return Math.round(totalCents / totalKg);
}

export function computeTransactionTotal(quantity: number, pricePerUnitCents: number) {
  if (!Number.isFinite(quantity) || !Number.isFinite(pricePerUnitCents) || quantity < 0 || pricePerUnitCents < 0) {
    throw new Error("Cannot compute transaction total from invalid values.");
  }

  return Math.round(quantity * pricePerUnitCents);
}

export function computeProfitMargin(costCents: number, sellingCents: number) {
  if (!Number.isFinite(costCents) || !Number.isFinite(sellingCents) || costCents < 0 || sellingCents <= 0) {
    return 0;
  }

  return Number((((sellingCents - costCents) / sellingCents) * 100).toFixed(2));
}

export function computeSellingPriceFromMargin(costCents: number, marginPercent: number) {
  if (!Number.isFinite(costCents) || costCents < 0) {
    throw new Error("Cost must be a non-negative amount.");
  }

  const normalizedMargin = requireMarginPercent(marginPercent);
  const marginRatio = normalizedMargin / 100;
  return Math.round(costCents / (1 - marginRatio));
}

export function formatMarginPercent(value: number) {
  return `${trimTrailingZeros(value, 2)}%`;
}

export function getProductAvailableQuantity(product: Pick<Product, "isWeightBased" | "stock" | "totalKgAvailable">) {
  return product.isWeightBased ? product.totalKgAvailable ?? 0 : product.stock;
}

export function getProductUnitLabel(product: Pick<Product, "isWeightBased"> | boolean) {
  return typeof product === "boolean" ? (product ? "kg" : "units") : product.isWeightBased ? "kg" : "units";
}

export function formatProductPriceLabel(product: Pick<Product, "isWeightBased" | "priceCents">) {
  return `${formatCurrencyFromCents(product.priceCents)}${product.isWeightBased ? "/kg" : ""}`;
}

export function formatProductStockLabel(
  product: Pick<Product, "isWeightBased" | "stock" | "totalKgAvailable">,
  suffix = "left",
) {
  const quantity = getProductAvailableQuantity(product);
  return product.isWeightBased ? `${formatWeightKg(quantity)} kg ${suffix}` : `${trimTrailingZeros(quantity, 0)} ${suffix}`;
}

export function formatProductMinStockLabel(product: Pick<Product, "isWeightBased" | "minStock">) {
  return product.isWeightBased
    ? `${formatWeightKg(product.minStock)} kg target`
    : `${trimTrailingZeros(product.minStock, 0)} target`;
}

export function resolveWeightBasedPricing(input: WeightBasedPricingInput): WeightBasedPricingComputation {
  const totalKgAvailable = roundWeightKg(input.totalKgAvailable);

  if (!Number.isFinite(totalKgAvailable) || totalKgAvailable <= 0) {
    throw new Error("Total kilograms available must be greater than zero.");
  }

  let costPriceTotalCents = 0;
  let sellingPriceTotalCents = 0;
  let costPricePerKgCents = 0;
  let sellingPricePerKgCents = 0;

  if (input.pricingMode === "derived") {
    const providedCostTotal =
      toOptionalFiniteNumber(input.costPriceTotalCents) ??
      (toOptionalFiniteNumber(input.costPricePerKgCents) !== null
        ? computeTransactionTotal(totalKgAvailable, input.costPricePerKgCents as number)
        : null);
    costPriceTotalCents = requirePositiveMoney(providedCostTotal, "Total cost price");
    costPricePerKgCents =
      toOptionalFiniteNumber(input.costPricePerKgCents) ?? computePricePerKg(costPriceTotalCents, totalKgAvailable);

    if (input.pricingStrategy === "manual") {
      const providedSellingTotal =
        toOptionalFiniteNumber(input.sellingPriceTotalCents) ??
        (toOptionalFiniteNumber(input.sellingPricePerKgCents) !== null
          ? computeTransactionTotal(totalKgAvailable, input.sellingPricePerKgCents as number)
          : null);

      sellingPriceTotalCents = requirePositiveMoney(providedSellingTotal, "Total selling price");

      if (sellingPriceTotalCents <= costPriceTotalCents) {
        throw new Error("Selling price must be greater than cost price.");
      }

      sellingPricePerKgCents =
        toOptionalFiniteNumber(input.sellingPricePerKgCents) ?? computePricePerKg(sellingPriceTotalCents, totalKgAvailable);
    } else {
      const targetMarginPercent = requireMarginPercent(input.targetMarginPercent);
      sellingPricePerKgCents = computeSellingPriceFromMargin(costPricePerKgCents, targetMarginPercent);
      sellingPriceTotalCents = computeTransactionTotal(totalKgAvailable, sellingPricePerKgCents);
    }
  } else {
    costPricePerKgCents =
      requirePositiveMoney(
        toOptionalFiniteNumber(input.costPricePerKgCents) ??
          (toOptionalFiniteNumber(input.costPriceTotalCents) !== null
            ? computePricePerKg(input.costPriceTotalCents as number, totalKgAvailable)
            : null),
        "Cost price per kg",
      );
    costPriceTotalCents =
      toOptionalFiniteNumber(input.costPriceTotalCents) ?? computeTransactionTotal(totalKgAvailable, costPricePerKgCents);

    if (input.pricingStrategy === "manual") {
      sellingPricePerKgCents =
        requirePositiveMoney(
          toOptionalFiniteNumber(input.sellingPricePerKgCents) ??
            (toOptionalFiniteNumber(input.sellingPriceTotalCents) !== null
              ? computePricePerKg(input.sellingPriceTotalCents as number, totalKgAvailable)
              : null),
          "Selling price per kg",
        );

      if (sellingPricePerKgCents <= costPricePerKgCents) {
        throw new Error("Selling price must be greater than cost price.");
      }

      sellingPriceTotalCents =
        toOptionalFiniteNumber(input.sellingPriceTotalCents) ??
        computeTransactionTotal(totalKgAvailable, sellingPricePerKgCents);
    } else {
      const targetMarginPercent = requireMarginPercent(input.targetMarginPercent);
      sellingPricePerKgCents = computeSellingPriceFromMargin(costPricePerKgCents, targetMarginPercent);
      sellingPriceTotalCents = computeTransactionTotal(totalKgAvailable, sellingPricePerKgCents);
    }
  }

  return {
    totalKgAvailable,
    costPriceTotalCents,
    sellingPriceTotalCents,
    costPricePerKgCents,
    sellingPricePerKgCents,
    computedPricePerKgCents: sellingPricePerKgCents,
    targetMarginPercent:
      input.pricingStrategy === "margin_based" ? requireMarginPercent(input.targetMarginPercent) : null,
    realizedMarginPercent: computeProfitMargin(costPricePerKgCents, sellingPricePerKgCents),
  };
}
