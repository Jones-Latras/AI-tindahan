---
title: "TindaHanAI — AI-powered micro-retail storefront & operations"
publishedAt: "2026-04-03"
summary: "Mobile-first point-of-sale and operations app that uses AI-driven pricing, inventory automation, and simple checkout to help sari‑sari stores and small retailers increase efficiency and margins."
---

# TindaHanAI — AI-powered micro-retail storefront & operations

## Title
TindaHanAI — AI-powered micro-retail storefront & operations

## PublishedAt
2026-04-03

## Summary
TindaHanAI is a mobile-first point-of-sale and business operations platform designed for sari‑sari stores and small retailers. It combines lightweight inventory, sales, and restocking workflows with an AI-driven pricing engine to reduce manual work, improve pricing consistency, and help owners make smarter restock decisions.

## Problem
- Small neighborhood retailers operate with manual processes: paper lists, ad-hoc pricing, and manual stock counts.
- Pricing is inconsistent and reactive; restocking is guesswork; owners lack time and simple analytics.
- Technology needs to be extremely low-friction, multilingual, and work on low-end devices and intermittent connectivity.

## Solution
TindaHanAI solves these problems with a mobile-first app and a lightweight backend:
- An in-app product catalog and fast checkout flow for walk-in customers.
- An AI-powered pricing engine that suggests optimal, weight-aware prices and promotions.
- Automated restock suggestions and simple inventory workflows to reduce stockouts.
- Offline-capable app with background sync to a Supabase backend for reliability.
- Server-side AI proxy for model calls (privacy and cost control) and lightweight client UI.

## Customer-facing storefront
- Mobile app for customers and cashiers: product browsing, quick add-to-cart, and single-screen checkout.
- Clean product cards, receipt generation, and a localized UI (language toggle and themes).
- Components used: `ProductCard`, `CartItem`, `ReceiptView`, and a frictionless `InputField`-driven checkout.

## Business operations platform
- Store owner console inside the app: `palista` (inventory list), `restock` suggestions, `benta` (sales), and `gastos` (expenses).
- Persistent data layer backed by Supabase/Postgres (`db/database.ts`, `db/repositories.ts`) with seed and migration scripts.
- Serverless functions and a small AI proxy (`supabase/functions/gemini-proxy`) to handle model requests securely.
- Background jobs and seed tooling: `scripts/seed-store.ts`, `supabase/supabase-setup.sql`.
### Reliability and quality layer
- Offline-first sync with background reconciliation, idempotent updates, and conflict resolution to handle intermittent connectivity.
- Strong typing (TypeScript), linters, and unit/integration tests for critical logic (e.g., `utils/pricing.ts`, `scripts/pricing-engine.test.ts`).
- CI with automated tests and EAS build checks before release.
- Monitoring, error reporting, and lightweight telemetry for crash and performance insights.
- Secure, rate-limited AI proxy with retries and graceful degradation to keep UX reliable and control costs.

## Tech stack
- Frontend: Expo + React Native (TypeScript)
- Backend: Supabase (Postgres), serverless functions (Node)
- AI: Model proxy for Gemini/OpenAI-style calls (`services/ai.ts`)
- Build & deployment: EAS / Expo tooling
- Utilities & tests: `utils/pricing.ts`, `scripts/pricing-engine.test.ts`

## Impact
- Reduced time spent on pricing and reconciliation by streamlining common tasks.
- Increased pricing consistency and decreased pricing errors for small retailers.
- Better stock visibility and restock guidance, reducing stockouts and lost sales.
- Enabled owners with limited tech experience to run digitally assisted operations from a single mobile app.

---

If you'd like, I can:
- Add a short screenshot gallery or step-by-step flows for the customer-facing screens.
- Add real pilot metrics if you provide them.
