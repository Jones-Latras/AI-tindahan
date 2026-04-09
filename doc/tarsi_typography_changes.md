# Tarsi-Inspired Typography Changes

## Overview
This document covers the recommended typography changes needed to closely match the visual style shown in the provided Tarsi screenshots.


## Recommended Font Stack

### Primary recommendation
**Plus Jakarta Sans**

### Fallbacks
- Manrope
- Inter
- sans-serif

### CSS font-family
```css
font-family: "Plus Jakarta Sans", "Manrope", "Inter", sans-serif;
```

## Why this change
The screenshots suggest:
- rounded and friendly letterforms
- geometric construction
- softer look than SF Pro
- modern finance-app feel

This makes **Plus Jakarta Sans** the best first choice, with **Manrope** and **Inter** as strong backups.

## Font usage rules
Use a **single font family** across the app for consistency.

### Weight mapping
- **700** — page titles, large money values, highly important text
- **600** — section titles, card titles, item names
- **500** — tabs, buttons, chips, emphasized small labels
- **400** — body text, helper text, descriptions, timestamps

## Recommended type scale

### Display
- **40 / 44, 700**
- Use for main screen titles
- Examples: `Accounts`, `Plan`, `History`

### Heading 1
- **24 / 30, 700**
- Use for strong section titles
- Examples: `Today`, `Budgets`

### Heading 2
- **18 / 24, 600**
- Use for card titles and important item labels
- Examples: `Category budgets`, `Food`, `Income`

### Body
- **16 / 22, 400–500**
- Use for standard body text and main supporting copy

### Body Small
- **14 / 20, 400–500**
- Use for secondary text and descriptions
- Example: `Manage your wallets and balances`

### Label
- **13 / 18, 500**
- Use for pills, tabs, metadata, and chip labels
- Examples: `Day`, `Week`, `Month`, `GCash`

### Caption
- **12 / 16, 400**
- Use for helper text, timestamps, and small secondary info
- Examples: `12:33 PM`, `Weekly budget`

### Micro
- **11 / 14, 500**
- Use for very small labels and dense metadata

## Component mapping

### Page titles
- Size: **40 / 44**
- Weight: **700**

### Section titles
- Size: **24 / 30**
- Weight: **700**

### Card titles
- Size: **18 / 24**
- Weight: **600**

### Large money amounts
- Size: **24 / 30**
- Weight: **700**

### Medium money amounts
- Size: **18 / 24**
- Weight: **700**

### Primary body text
- Size: **16 / 22**
- Weight: **400**

### Secondary text
- Size: **14 / 20**
- Weight: **400**

### Tab / chip / pill text
- Size: **13 / 18**
- Weight: **500**

### Timestamps / helper text
- Size: **12 / 16**
- Weight: **400**

## CSS design tokens
```css
:root {
  --font-ui: "Plus Jakarta Sans", "Manrope", "Inter", sans-serif;

  --text-display: 40px;
  --lh-display: 44px;

  --text-h1: 24px;
  --lh-h1: 30px;

  --text-h2: 18px;
  --lh-h2: 24px;

  --text-body: 16px;
  --lh-body: 22px;

  --text-body-sm: 14px;
  --lh-body-sm: 20px;

  --text-label: 13px;
  --lh-label: 18px;

  --text-caption: 12px;
  --lh-caption: 16px;

  --text-micro: 11px;
  --lh-micro: 14px;
}
```

## Tailwind config
```js
fontFamily: {
  sans: ['"Plus Jakarta Sans"', '"Manrope"', '"Inter"', 'sans-serif'],
},
fontSize: {
  display: ['40px', '44px'],
  h1: ['24px', '30px'],
  h2: ['18px', '24px'],
  body: ['16px', '22px'],
  bodysm: ['14px', '20px'],
  label: ['13px', '18px'],
  caption: ['12px', '16px'],
  micro: ['11px', '14px'],
}
```

## Practical change summary
Replace the current font choice with:
- **Plus Jakarta Sans** as primary
- **Manrope** as first fallback
- **Inter** as second fallback

Then update the typography system so that:
- large page titles use **40/44 700**
- section headers use **24/30 700**
- item and card titles use **18/24 600**
- body text uses **16/22 400**
- secondary text uses **14/20 400**
- chips and tabs use **13/18 500**
- helper text uses **12/16 400**

## Final recommendation
To best match the screenshots, use:

**Plus Jakarta Sans**
- **700** for large titles and money
- **600** for section and card headings
- **500** for tabs and labels
- **400** for general UI copy

This setup should give your app a very similar visual tone to Tarsi.
