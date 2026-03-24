import assert from "node:assert/strict";

import {
  computePricePerKg,
  computeProfitMargin,
  computeSellingPriceFromMargin,
  computeTransactionTotal,
  resolveWeightBasedPricing,
} from "../utils/pricing";

function runPricingEngineTests() {
  assert.equal(computePricePerKg(12500, 2.5), 5000);
  assert.equal(computeTransactionTotal(0.75, 12000), 9000);
  assert.equal(computeProfitMargin(8000, 10000), 20);
  assert.equal(computeSellingPriceFromMargin(7500, 25), 10000);

  const derivedManual = resolveWeightBasedPricing({
    pricingMode: "derived",
    pricingStrategy: "manual",
    totalKgAvailable: 5,
    costPriceTotalCents: 40000,
    sellingPriceTotalCents: 50000,
  });

  assert.equal(derivedManual.costPricePerKgCents, 8000);
  assert.equal(derivedManual.sellingPricePerKgCents, 10000);
  assert.equal(derivedManual.sellingPriceTotalCents, 50000);

  const directMargin = resolveWeightBasedPricing({
    pricingMode: "direct",
    pricingStrategy: "margin_based",
    totalKgAvailable: 3.5,
    costPricePerKgCents: 8400,
    targetMarginPercent: 30,
  });

  assert.equal(directMargin.costPricePerKgCents, 8400);
  assert.equal(directMargin.sellingPricePerKgCents, 12000);
  assert.equal(directMargin.sellingPriceTotalCents, 42000);
  assert.equal(directMargin.targetMarginPercent, 30);

  assert.throws(
    () =>
      resolveWeightBasedPricing({
        pricingMode: "direct",
        pricingStrategy: "margin_based",
        totalKgAvailable: 0,
        costPricePerKgCents: 1000,
        targetMarginPercent: 10,
      }),
    /greater than zero/i,
  );

  assert.throws(
    () =>
      resolveWeightBasedPricing({
        pricingMode: "direct",
        pricingStrategy: "manual",
        totalKgAvailable: 2,
        costPricePerKgCents: 1000,
        sellingPricePerKgCents: 900,
      }),
    /greater than cost price/i,
  );
}

runPricingEngineTests();
console.log("pricing-engine tests passed");
