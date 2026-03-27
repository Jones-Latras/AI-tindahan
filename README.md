# TindaHan AI

Phase 1 foundation for a sari-sari store POS app built with Expo Router, Expo SQLite, and a fully theme-aware React Native UI.

## Current Status

Implemented in this repo:

- Phase 1 app scaffold with Expo Router tabs
- Light and dark mode toggle with persistent preference storage
- Secure local SQLite schema with migrations
- Home dashboard with sales, profit, utang, and low-stock summaries
- Products screen with create, edit, delete, search, and low-stock visibility
- POS screen with cart state, sukli calculation, stock checks, and checkout persistence
- Palista screen with customer management, utang history, and partial payment support
- Phase 2 Gemini-ready AI layer for daily insights, chat, trust scoring, and restock suggestions
- Barcode scanning with `expo-camera`
- Payment method tracking for cash, GCash, Maya, and utang-linked checkout

## Security Decisions Already Applied

- Money is stored as integer cents, not floating-point values, to avoid rounding drift.
- User input is trimmed and sanitized before writes.
- Runtime writes use bound SQL parameters instead of interpolated strings.
- Checkout uses an exclusive SQLite transaction so stock validation and sale writes stay atomic.
- `.env` files are ignored by git and only `.env.example` is committed.
- Inventory, customer, and utang tables include basic integrity checks and foreign keys.
- AI prompts use summary data and avoid sending customer phone numbers to Gemini.
- Gemini failures degrade gracefully instead of blocking the POS or ledger flows.

## Security Note For Gemini

Gemini requests now go through the Supabase Edge Function at `supabase/functions/gemini-proxy/index.ts`.

Do not place a Gemini API key in the Expo client app. `EXPO_PUBLIC_*` values are bundled into the client, so the real `GEMINI_API_KEY` must stay in Supabase secrets only.

## Gemini Proxy Setup

1. Keep these client env vars in your local `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Set the real Gemini secret in Supabase:

```bash
supabase secrets set GEMINI_API_KEY=your_real_key
```

3. Deploy the proxy function:

```bash
supabase functions deploy gemini-proxy
```

4. If you want to test locally with the Supabase CLI:

```bash
supabase functions serve gemini-proxy --env-file supabase/.env
```

## Stack

- Expo SDK 54 style scaffold for Expo Go compatibility
- Expo Router
- Expo SQLite
- Zustand
- React Native Safe Area Context
- Expo Status Bar and System UI

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npx expo start
```

## Phase 1 Notes

- The build plan uses `REAL` values for money, but this implementation intentionally uses integer cents for better correctness.
- `cost_price` was included early so the dashboard can already report profit cleanly.
- The app is optimized first for Android / Expo Go because the original plan targets Play Store delivery.

## Next Phase

Next major work can focus on Phase 3 polish items such as discounts, receipt sharing, onboarding, cloud backup, celebrations, and launch prep.
