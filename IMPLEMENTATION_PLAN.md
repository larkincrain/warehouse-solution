# ScreenCloud OMS Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ScreenCloud OMS backend (Fastify + Drizzle + Postgres) with atomic order submission, full test coverage (unit/integration/e2e), and a robust CI/CD pipeline that deploys to Fly.io.

**Architecture:** Monorepo with `apps/api` (Fastify HTTP service) and `packages/shared` (zod schemas). Pure-function domain layer; transactional service layer with pessimistic row locking; layered test pyramid. Three GitHub Actions workflows (CI, E2E, Deploy) with preview environments per PR and `release_command`-gated migrations on production.

**Tech Stack:** Node 20 LTS · TypeScript strict · Fastify v5 · Drizzle ORM · PostgreSQL 16 · zod · vitest · @testcontainers/postgresql · Docker · Fly.io · GitHub Actions

**Reference spec:** [`IMPLEMENTATION_SPEC.md`](./IMPLEMENTATION_SPEC.md) (v2). This plan implements every section of that spec.

---

## Conventions

**Commit style.** Conventional Commits (`feat:`, `chore:`, `test:`, `docs:`, `ci:`). One commit per task unless explicitly noted. Push after each task only if you have a remote configured.

**Branching.** Work on `main` for the initial scaffold. Switch to feature branches starting at Task 7 to exercise the CI pipeline you'll build later.

**Path conventions.** All paths absolute from repo root: `apps/api/src/...`. Workspace package names: `@scos/api`, `@scos/shared`.

---

## Phase 1 — Monorepo skeleton

### Task 1: Initialize repo and root configuration

**Files:**
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.env.example`
- Create: `package.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Initialize git (if not already)**

```bash
git init
git checkout -b main 2>/dev/null || git checkout main
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
dist/
build/
coverage/
*.log
.env
.env.local
.DS_Store
.vscode/
.idea/
drizzle/meta/_journal.json.bak
.fly/
```

- [ ] **Step 3: Write `.nvmrc`**

```
20
```

- [ ] **Step 4: Write `.env.example`**

```
DATABASE_URL=postgresql://scos:scos@localhost:5432/scos
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

- [ ] **Step 5: Write root `package.json`**

```json
{
  "name": "scos-oms",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=20 <21",
    "npm": ">=10"
  },
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "npm run test:e2e -w @scos/api",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "prettier": "^3.3.0"
  }
}
```

- [ ] **Step 6: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 7: Install root deps**

```bash
npm install
```

Expected: creates `package-lock.json`, no errors.

- [ ] **Step 8: Commit**

```bash
git add .gitignore .nvmrc .env.example package.json package-lock.json tsconfig.base.json
git commit -m "chore: initialize monorepo with workspaces and base tsconfig"
```

---

### Task 2: Scaffold `packages/shared`

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Write `packages/shared/package.json`**

```json
{
  "name": "@scos/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Write `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write placeholder `packages/shared/src/index.ts`**

```typescript
export {};
```

- [ ] **Step 4: Install + build**

```bash
npm install
npm run build -w @scos/shared
```

Expected: `packages/shared/dist/index.js` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/shared package.json package-lock.json
git commit -m "chore: scaffold @scos/shared package"
```

---

### Task 3: Scaffold `apps/api`

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/.eslintrc.cjs`
- Create: `apps/api/src/server.ts`
- Create: `.prettierrc`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "@scos/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run --coverage",
    "test:unit": "vitest run test/unit --coverage",
    "test:integration": "vitest run test/integration",
    "test:e2e": "vitest run test/e2e",
    "lint": "eslint src test --ext .ts",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@fastify/swagger": "^9.0.0",
    "@fastify/swagger-ui": "^5.0.0",
    "@scos/shared": "*",
    "drizzle-orm": "^0.36.0",
    "fastify": "^5.0.0",
    "fastify-type-provider-zod": "^4.0.0",
    "pg": "^8.13.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "^10.13.0",
    "@types/node": "^20.16.0",
    "@types/pg": "^8.11.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@vitest/coverage-v8": "^2.1.0",
    "drizzle-kit": "^0.28.0",
    "eslint": "^8.57.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "undici": "^6.20.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["test", "dist", "node_modules"]
}
```

- [ ] **Step 3: Write `apps/api/vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/db/migrate.ts', 'src/db/seed.ts'],
      thresholds: {
        'src/domain/**': { lines: 100, branches: 100, functions: 100 },
        'src/services/**': { lines: 95, branches: 90, functions: 100 },
        'src/routes/**': { lines: 90, branches: 85, functions: 100 },
        'src/errors.ts': { lines: 100, branches: 100, functions: 100 },
      },
    },
    pool: 'forks',
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 4: Write `apps/api/.eslintrc.cjs`**

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.test.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
  ],
  env: { node: true, es2022: true },
  rules: {
    'no-console': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist/**', 'drizzle/**', 'coverage/**'],
};
```

- [ ] **Step 5: Write `apps/api/tsconfig.test.json` (so eslint can lint test files)**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 6: Write `apps/api/src/server.ts` (placeholder so build works)**

```typescript
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/', async () => ({ status: 'ok' }));

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

- [ ] **Step 7: Write root `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "tabWidth": 2,
  "semi": true,
  "printWidth": 100
}
```

- [ ] **Step 8: Install + verify build**

```bash
npm install
npm run build -w @scos/api
npm run typecheck
```

Expected: no errors; `apps/api/dist/server.js` exists.

- [ ] **Step 9: Commit**

```bash
git add apps/api package.json package-lock.json .prettierrc
git commit -m "chore: scaffold @scos/api with fastify, vitest, eslint"
```

---

## Phase 2 — Shared schemas

### Task 4: Define all zod schemas in `@scos/shared`

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/types.ts`

- [ ] **Step 1: Write `packages/shared/src/schemas.ts`**

```typescript
import { z } from 'zod';

export const ShippingAddressSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const VerifyOrderRequestSchema = z.object({
  quantity: z.number().int().positive(),
  shippingAddress: ShippingAddressSchema,
});

export const ShipmentLegSchema = z.object({
  warehouseId: z.string(),
  warehouseName: z.string(),
  warehouseLatitude: z.number(),
  warehouseLongitude: z.number(),
  quantity: z.number().int().positive(),
  distanceKm: z.number().nonnegative(),
  shippingCostCents: z.number().int().nonnegative(),
});

export const VerifyOrderResponseSchema = z.object({
  quantity: z.number().int().positive(),
  totalBeforeDiscountCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  discountPercent: z.number().int().min(0).max(20),
  totalAfterDiscountCents: z.number().int().nonnegative(),
  shippingCostCents: z.number().int().nonnegative(),
  isValid: z.boolean(),
  invalidReason: z.string().nullable(),
  shipmentPlan: z.array(ShipmentLegSchema),
});

export const SubmitOrderRequestSchema = VerifyOrderRequestSchema;

export const SubmitOrderResponseSchema = VerifyOrderResponseSchema.extend({
  id: z.string().uuid(),
  orderNumber: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export const InsufficientStockErrorSchema = z.object({
  error: z.literal('INSUFFICIENT_STOCK'),
  message: z.string(),
  availableStock: z.array(z.object({
    warehouseId: z.string(),
    stock: z.number().int().nonnegative(),
  })),
});

export const InvalidOrderErrorSchema = z.object({
  error: z.literal('INVALID_ORDER'),
  message: z.string(),
});

export const WarehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  stock: z.number().int().nonnegative(),
});

export const WarehousesResponseSchema = z.array(WarehouseSchema);

export const OrderSummarySchema = SubmitOrderResponseSchema.extend({
  shippingAddress: ShippingAddressSchema,
  shipments: z.array(ShipmentLegSchema),
}).omit({ shipmentPlan: true });

export const OrdersListResponseSchema = z.object({
  orders: z.array(OrderSummarySchema),
  nextCursor: z.string().nullable(),
});

export const OrdersListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
});

export const ReadyResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
});
```

- [ ] **Step 2: Write `packages/shared/src/types.ts`**

```typescript
import type { z } from 'zod';
import type * as S from './schemas.js';

export type ShippingAddress = z.infer<typeof S.ShippingAddressSchema>;
export type VerifyOrderRequest = z.infer<typeof S.VerifyOrderRequestSchema>;
export type VerifyOrderResponse = z.infer<typeof S.VerifyOrderResponseSchema>;
export type ShipmentLeg = z.infer<typeof S.ShipmentLegSchema>;
export type SubmitOrderRequest = z.infer<typeof S.SubmitOrderRequestSchema>;
export type SubmitOrderResponse = z.infer<typeof S.SubmitOrderResponseSchema>;
export type InsufficientStockErrorBody = z.infer<typeof S.InsufficientStockErrorSchema>;
export type InvalidOrderErrorBody = z.infer<typeof S.InvalidOrderErrorSchema>;
export type Warehouse = z.infer<typeof S.WarehouseSchema>;
export type WarehousesResponse = z.infer<typeof S.WarehousesResponseSchema>;
export type OrderSummary = z.infer<typeof S.OrderSummarySchema>;
export type OrdersListResponse = z.infer<typeof S.OrdersListResponseSchema>;
export type OrdersListQuery = z.infer<typeof S.OrdersListQuerySchema>;
```

- [ ] **Step 3: Update `packages/shared/src/index.ts`**

```typescript
export * from './schemas.js';
export * from './types.js';
```

- [ ] **Step 4: Build**

```bash
npm run build -w @scos/shared
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): define zod schemas for verify/submit/list/health"
```

---

## Phase 3 — Domain layer (TDD)

### Task 5: `domain/rounding.ts` — banker's rounding helper

**Files:**
- Create: `apps/api/src/domain/rounding.ts`
- Test: `apps/api/test/unit/rounding.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/test/unit/rounding.test.ts
import { describe, it, expect } from 'vitest';
import { bankersRound } from '../../src/domain/rounding.js';

describe('bankersRound', () => {
  it('rounds .5 to nearest even (down case)', () => {
    expect(bankersRound(0.5)).toBe(0);
    expect(bankersRound(2.5)).toBe(2);
  });
  it('rounds .5 to nearest even (up case)', () => {
    expect(bankersRound(1.5)).toBe(2);
    expect(bankersRound(3.5)).toBe(4);
  });
  it('rounds non-half values normally', () => {
    expect(bankersRound(1.4)).toBe(1);
    expect(bankersRound(1.6)).toBe(2);
    expect(bankersRound(-1.6)).toBe(-2);
  });
  it('passes through integers', () => {
    expect(bankersRound(0)).toBe(0);
    expect(bankersRound(7)).toBe(7);
    expect(bankersRound(-3)).toBe(-3);
  });
  it('handles negative half values', () => {
    expect(bankersRound(-0.5)).toBe(0);
    expect(bankersRound(-1.5)).toBe(-2);
    expect(bankersRound(-2.5)).toBe(-2);
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
npm run test:unit -w @scos/api -- rounding
```

Expected: FAIL — "Cannot find module ../../src/domain/rounding.js".

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/domain/rounding.ts

/**
 * Round half to even (banker's rounding). Symmetric, zero net bias across many values.
 * @param value Real number
 * @returns Nearest integer, ties broken to the nearest even integer
 */
export function bankersRound(value: number): number {
  const rounded = Math.round(value);
  const diff = Math.abs(value - Math.trunc(value));
  if (diff !== 0.5) return rounded;
  // tie → round to even
  const floor = Math.floor(value);
  return floor % 2 === 0 ? floor : floor + 1;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm run test:unit -w @scos/api -- rounding
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/rounding.ts apps/api/test/unit/rounding.test.ts
git commit -m "feat(domain): banker's rounding helper"
```

---

### Task 6: `domain/distance.ts` — haversine distance

**Files:**
- Create: `apps/api/src/domain/distance.ts`
- Test: `apps/api/test/unit/distance.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/test/unit/distance.test.ts
import { describe, it, expect } from 'vitest';
import { haversineKm, EARTH_RADIUS_KM } from '../../src/domain/distance.js';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBe(0);
  });

  it('matches LAX → JFK known distance (~3974 km)', () => {
    // Spec §2 warehouse coords are airport-resolution (LAX, JFK).
    const la = { lat: 33.9425, lng: -118.408056 };
    const ny = { lat: 40.639722, lng: -73.778889 };
    expect(haversineKm(la, ny)).toBeGreaterThan(3970);
    expect(haversineKm(la, ny)).toBeLessThan(3980);
  });

  it('matches CDG → WAW known distance (~1343 km)', () => {
    // Spec §2 warehouse coords are airport-resolution (CDG, WAW).
    const paris = { lat: 49.009722, lng: 2.547778 };
    const warsaw = { lat: 52.165833, lng: 20.967222 };
    expect(haversineKm(paris, warsaw)).toBeGreaterThan(1340);
    expect(haversineKm(paris, warsaw)).toBeLessThan(1350);
  });

  it('antipodes are roughly π * R apart', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 180 };
    expect(haversineKm(a, b)).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 0);
  });

  it('is symmetric', () => {
    const a = { lat: 22.308889, lng: 113.914444 };
    const b = { lat: 13.7563, lng: 100.5018 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });

  it('handles dateline crossing', () => {
    expect(haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 }))
      .toBeLessThan(haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: 0 }));
  });

  it('exposes EARTH_RADIUS_KM = 6371', () => {
    expect(EARTH_RADIUS_KM).toBe(6371);
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
npm run test:unit -w @scos/api -- distance
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/domain/distance.ts

/** Mean spherical Earth radius in kilometers. Used by all great-circle calculations. */
export const EARTH_RADIUS_KM = 6371;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points using the haversine formula.
 * @param a Point A in decimal degrees
 * @param b Point B in decimal degrees
 * @returns Distance in kilometers
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm run test:unit -w @scos/api -- distance
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/distance.ts apps/api/test/unit/distance.test.ts
git commit -m "feat(domain): haversine distance with EARTH_RADIUS_KM constant"
```

---

### Task 7: `domain/pricing.ts` — discount tiers and totals

**Files:**
- Create: `apps/api/src/domain/pricing.ts`
- Test: `apps/api/test/unit/pricing.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/test/unit/pricing.test.ts
import { describe, it, expect } from 'vitest';
import { calculateOrderTotals, discountPercentForQuantity, UNIT_PRICE_CENTS, UNIT_WEIGHT_KG } from '../../src/domain/pricing.js';

describe('discountPercentForQuantity', () => {
  it.each([
    [1, 0],
    [24, 0],
    [25, 5],
    [49, 5],
    [50, 10],
    [99, 10],
    [100, 15],
    [249, 15],
    [250, 20],
    [1000, 20],
  ])('quantity %i → %i%%', (q, pct) => {
    expect(discountPercentForQuantity(q)).toBe(pct);
  });
});

describe('calculateOrderTotals', () => {
  it('150 units → $22500 / 15% / $19125', () => {
    const t = calculateOrderTotals(150);
    expect(t.totalBeforeDiscountCents).toBe(2_250_000);
    expect(t.discountPercent).toBe(15);
    expect(t.discountCents).toBe(337_500);
    expect(t.totalAfterDiscountCents).toBe(1_912_500);
  });

  it('1 unit → no discount', () => {
    const t = calculateOrderTotals(1);
    expect(t.totalBeforeDiscountCents).toBe(15_000);
    expect(t.discountCents).toBe(0);
    expect(t.totalAfterDiscountCents).toBe(15_000);
  });

  it('250 units → 20% discount', () => {
    const t = calculateOrderTotals(250);
    expect(t.totalBeforeDiscountCents).toBe(3_750_000);
    expect(t.discountCents).toBe(750_000);
    expect(t.totalAfterDiscountCents).toBe(3_000_000);
  });

  it('all values are integer cents', () => {
    const t = calculateOrderTotals(37);
    expect(Number.isInteger(t.totalBeforeDiscountCents)).toBe(true);
    expect(Number.isInteger(t.discountCents)).toBe(true);
    expect(Number.isInteger(t.totalAfterDiscountCents)).toBe(true);
  });
});

describe('product constants', () => {
  it('UNIT_PRICE_CENTS = 15000', () => expect(UNIT_PRICE_CENTS).toBe(15_000));
  it('UNIT_WEIGHT_KG = 0.365', () => expect(UNIT_WEIGHT_KG).toBe(0.365));
});
```

- [ ] **Step 2: Verify the test fails**

```bash
npm run test:unit -w @scos/api -- pricing
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/domain/pricing.ts
import { bankersRound } from './rounding.js';

export const UNIT_PRICE_CENTS = 15_000; // $150.00
export const UNIT_WEIGHT_KG = 0.365;

export interface OrderTotals {
  totalBeforeDiscountCents: number;
  discountPercent: number;
  discountCents: number;
  totalAfterDiscountCents: number;
}

/**
 * Returns the discount percentage (0/5/10/15/20) for a given order quantity.
 * Highest tier reached, not stacked.
 */
export function discountPercentForQuantity(quantity: number): number {
  if (quantity >= 250) return 20;
  if (quantity >= 100) return 15;
  if (quantity >= 50) return 10;
  if (quantity >= 25) return 5;
  return 0;
}

/**
 * Calculate subtotal, discount, and total-after-discount for an order quantity.
 * All values are integer cents (banker's rounded).
 */
export function calculateOrderTotals(quantity: number): OrderTotals {
  const totalBeforeDiscountCents = quantity * UNIT_PRICE_CENTS;
  const discountPercent = discountPercentForQuantity(quantity);
  const discountCents = bankersRound((totalBeforeDiscountCents * discountPercent) / 100);
  const totalAfterDiscountCents = totalBeforeDiscountCents - discountCents;
  return { totalBeforeDiscountCents, discountPercent, discountCents, totalAfterDiscountCents };
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm run test:unit -w @scos/api -- pricing
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/pricing.ts apps/api/test/unit/pricing.test.ts
git commit -m "feat(domain): pricing tiers and integer-cent order totals"
```

---

### Task 8: `domain/order-validator.ts` — 15% rule

**Files:**
- Create: `apps/api/src/domain/order-validator.ts`
- Test: `apps/api/test/unit/order-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/test/unit/order-validator.test.ts
import { describe, it, expect } from 'vitest';
import { isOrderValid } from '../../src/domain/order-validator.js';

describe('isOrderValid', () => {
  it('returns true when shipping is exactly 15% of total', () => {
    expect(isOrderValid(150, 1000)).toBe(true); // 15% boundary inclusive (≤)
  });
  it('returns false when shipping just exceeds 15%', () => {
    expect(isOrderValid(151, 1000)).toBe(false);
  });
  it('returns true when shipping is well under 15%', () => {
    expect(isOrderValid(50, 1000)).toBe(true);
  });
  it('returns true with zero shipping', () => {
    expect(isOrderValid(0, 1000)).toBe(true);
  });
  it('returns false with zero order amount and any shipping', () => {
    expect(isOrderValid(1, 0)).toBe(false);
  });
  it('returns true with both zero (degenerate)', () => {
    expect(isOrderValid(0, 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
npm run test:unit -w @scos/api -- order-validator
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/domain/order-validator.ts

/**
 * An order is valid if shipping cost is at most 15% of the discounted total.
 * Both inputs are integer cents.
 */
export function isOrderValid(shippingCostCents: number, totalAfterDiscountCents: number): boolean {
  // shipping <= 0.15 * total  ⇔  100 * shipping <= 15 * total  (integer math, no floats)
  return 100 * shippingCostCents <= 15 * totalAfterDiscountCents;
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm run test:unit -w @scos/api -- order-validator
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/order-validator.ts apps/api/test/unit/order-validator.test.ts
git commit -m "feat(domain): 15% shipping vs total order validity check"
```

---

### Task 9: `domain/shipment-planner.ts` — greedy allocation

**Files:**
- Create: `apps/api/src/domain/shipment-planner.ts`
- Test: `apps/api/test/unit/shipment-planner.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/test/unit/shipment-planner.test.ts
import { describe, it, expect } from 'vitest';
import { planShipment, type WarehouseStockRow } from '../../src/domain/shipment-planner.js';

const customer = { lat: 13.7563, lng: 100.5018 }; // Bangkok

const warehouses: WarehouseStockRow[] = [
  { id: 'hong-kong', name: 'Hong Kong', latitude: 22.308889, longitude: 113.914444, stock: 100 },
  { id: 'paris',     name: 'Paris',     latitude: 49.009722, longitude: 2.547778,    stock: 100 },
  { id: 'los-angeles', name: 'Los Angeles', latitude: 33.9425, longitude: -118.408056, stock: 100 },
];

describe('planShipment', () => {
  it('single-warehouse fulfillment when nearest has enough stock', () => {
    const plan = planShipment(50, customer, warehouses);
    expect(plan.feasible).toBe(true);
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]?.warehouseId).toBe('hong-kong');
    expect(plan.legs[0]?.quantity).toBe(50);
  });

  it('splits across warehouses when nearest is short', () => {
    const plan = planShipment(150, customer, warehouses);
    expect(plan.feasible).toBe(true);
    const total = plan.legs.reduce((s, l) => s + l.quantity, 0);
    expect(total).toBe(150);
    expect(plan.legs[0]?.warehouseId).toBe('hong-kong');
    expect(plan.legs[0]?.quantity).toBe(100);
  });

  it('returns infeasible when total stock < quantity', () => {
    const plan = planShipment(500, customer, warehouses);
    expect(plan.feasible).toBe(false);
    const total = plan.legs.reduce((s, l) => s + l.quantity, 0);
    expect(total).toBe(300); // partial allocation populated
  });

  it('returns empty legs and infeasible for empty warehouses', () => {
    const plan = planShipment(10, customer, []);
    expect(plan.feasible).toBe(false);
    expect(plan.legs).toHaveLength(0);
  });

  it('breaks ties alphabetically by warehouse id', () => {
    const equidistant: WarehouseStockRow[] = [
      { id: 'b-warehouse', name: 'B', latitude: 0, longitude: 10, stock: 5 },
      { id: 'a-warehouse', name: 'A', latitude: 0, longitude: 10, stock: 5 },
    ];
    const plan = planShipment(5, { lat: 0, lng: 0 }, equidistant);
    expect(plan.legs[0]?.warehouseId).toBe('a-warehouse');
  });

  it('shippingCostCents matches sum of leg costs', () => {
    const plan = planShipment(150, customer, warehouses);
    const sum = plan.legs.reduce((s, l) => s + l.shippingCostCents, 0);
    expect(plan.shippingCostCents).toBe(sum);
  });

  it('skips warehouses with zero stock', () => {
    const ws: WarehouseStockRow[] = [
      { ...warehouses[0]!, stock: 0 },
      { ...warehouses[1]!, stock: 50 },
    ];
    const plan = planShipment(30, customer, ws);
    expect(plan.feasible).toBe(true);
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0]?.warehouseId).toBe('paris');
  });
});
```

- [ ] **Step 2: Verify the test fails**

```bash
npm run test:unit -w @scos/api -- shipment-planner
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// apps/api/src/domain/shipment-planner.ts
import { haversineKm, type LatLng } from './distance.js';
import { UNIT_WEIGHT_KG } from './pricing.js';
import { bankersRound } from './rounding.js';

export interface WarehouseStockRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stock: number;
}

export interface PlannedLeg {
  warehouseId: string;
  warehouseName: string;
  warehouseLatitude: number;
  warehouseLongitude: number;
  quantity: number;
  distanceKm: number;
  shippingCostCents: number;
}

export interface ShipmentPlan {
  feasible: boolean;
  legs: PlannedLeg[];
  shippingCostCents: number;
}

const SHIPPING_RATE_USD_PER_KG_KM = 0.01;
const CENTS_PER_USD = 100;

function legCostCents(distanceKm: number, units: number): number {
  const dollars = distanceKm * units * UNIT_WEIGHT_KG * SHIPPING_RATE_USD_PER_KG_KM;
  return bankersRound(dollars * CENTS_PER_USD);
}

/**
 * Greedy-by-distance allocation. Provably optimal here because per-unit shipping cost from each
 * warehouse is constant (distance × 0.365 × $0.01) and there are no fixed per-shipment costs or
 * quantity-tiered rates. Therefore each marginal unit is cheapest at the closest warehouse with
 * remaining stock.
 *
 * Tiebreak: equal distances are ordered alphabetically by warehouse id (deterministic).
 *
 * Returns infeasible with a populated partial allocation when total stock < quantity, so that
 * `verify` can show the rep what *could* be shipped.
 */
export function planShipment(
  quantity: number,
  customer: LatLng,
  warehouses: WarehouseStockRow[],
): ShipmentPlan {
  const ranked = warehouses
    .filter((w) => w.stock > 0)
    .map((w) => ({
      w,
      distanceKm: haversineKm(customer, { lat: w.latitude, lng: w.longitude }),
    }))
    .sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
      return a.w.id.localeCompare(b.w.id);
    });

  const legs: PlannedLeg[] = [];
  let remaining = quantity;
  let totalShippingCents = 0;

  for (const { w, distanceKm } of ranked) {
    if (remaining === 0) break;
    const take = Math.min(w.stock, remaining);
    const cents = legCostCents(distanceKm, take);
    legs.push({
      warehouseId: w.id,
      warehouseName: w.name,
      warehouseLatitude: w.latitude,
      warehouseLongitude: w.longitude,
      quantity: take,
      distanceKm,
      shippingCostCents: cents,
    });
    remaining -= take;
    totalShippingCents += cents;
  }

  return {
    feasible: remaining === 0,
    legs,
    shippingCostCents: totalShippingCents,
  };
}
```

- [ ] **Step 4: Verify tests pass**

```bash
npm run test:unit -w @scos/api -- shipment-planner
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/shipment-planner.ts apps/api/test/unit/shipment-planner.test.ts
git commit -m "feat(domain): greedy shipment planner with alphabetical tiebreak"
```

---

## Phase 4 — Database layer

### Task 10: Local Postgres via docker-compose + drizzle config

**Files:**
- Create: `docker-compose.yml`
- Create: `apps/api/drizzle.config.ts`

- [ ] **Step 1: Write `docker-compose.yml` (db only for now)**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: scos
      POSTGRES_USER: scos
      POSTGRES_PASSWORD: scos
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scos -d scos"]
      interval: 2s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: Write `apps/api/drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://scos:scos@localhost:5432/scos',
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 3: Boot Postgres and verify**

```bash
docker compose up -d db
docker compose ps
```

Expected: `db` service is `healthy`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml apps/api/drizzle.config.ts
git commit -m "chore(db): docker-compose postgres + drizzle config"
```

---

### Task 11: Drizzle schema + first migration

**Files:**
- Create: `apps/api/src/db/schema.ts`
- Generated: `apps/api/drizzle/0000_*.sql`

- [ ] **Step 1: Write `apps/api/src/db/schema.ts`**

```typescript
import { pgTable, text, integer, doublePrecision, uuid, timestamp, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  stock: integer('stock').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stockNonNegative: check('warehouses_stock_non_negative', sql`${t.stock} >= 0`),
}));

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: uuid('order_number').notNull().unique().defaultRandom(),
  quantity: integer('quantity').notNull(),
  shippingLat: doublePrecision('shipping_lat').notNull(),
  shippingLng: doublePrecision('shipping_lng').notNull(),
  totalBeforeDiscountCents: integer('total_before_discount_cents').notNull(),
  discountCents: integer('discount_cents').notNull(),
  totalAfterDiscountCents: integer('total_after_discount_cents').notNull(),
  shippingCostCents: integer('shipping_cost_cents').notNull(),
  idempotencyKey: text('idempotency_key').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  quantityPositive: check('orders_quantity_positive', sql`${t.quantity} > 0`),
  createdAtIdx: index('orders_created_at_idx').on(t.createdAt),
}));

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  warehouseId: text('warehouse_id').notNull().references(() => warehouses.id),
  quantity: integer('quantity').notNull(),
  distanceKm: doublePrecision('distance_km').notNull(),
  shippingCostCents: integer('shipping_cost_cents').notNull(),
}, (t) => ({
  orderIdx: index('shipments_order_id_idx').on(t.orderId),
  quantityPositive: check('shipments_quantity_positive', sql`${t.quantity} > 0`),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  shipments: many(shipments),
}));

export const shipmentsRelations = relations(shipments, ({ one }) => ({
  order: one(orders, { fields: [shipments.orderId], references: [orders.id] }),
  warehouse: one(warehouses, { fields: [shipments.warehouseId], references: [warehouses.id] }),
}));
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate -w @scos/api
```

Expected: a new file at `apps/api/drizzle/0000_*.sql` containing the table definitions.

- [ ] **Step 3: Inspect the generated migration to confirm CREATE TABLE for all three tables and the CHECK / index definitions are present**

```bash
ls apps/api/drizzle/
```

- [ ] **Step 4: Add `pgcrypto` extension as a separate prologue migration**

Edit the generated migration file: prepend a single line to enable `gen_random_uuid()`:

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
```

(Place it as the very first statement of the generated `0000_*.sql` file. Drizzle uses `--> statement-breakpoint` to separate executions.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git commit -m "feat(db): drizzle schema for warehouses, orders, shipments"
```

---

### Task 12: DB client, programmatic migrate runner, env config, errors

**Files:**
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/errors.ts`
- Test: `apps/api/test/unit/errors.test.ts`

- [ ] **Step 1: Write `apps/api/src/config.ts`**

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

- [ ] **Step 2: Write `apps/api/src/db/client.ts`**

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return Object.assign(db, { _pool: pool });
}

let _db: Db | null = null;

export function db(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is required');
    _db = createDb(url);
  }
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_db) {
    await _db._pool.end();
    _db = null;
  }
}
```

- [ ] **Step 3: Write `apps/api/src/db/migrate.ts`**

```typescript
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { db, closeDb } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

async function main() {
  const d = db();
  await migrate(d, { migrationsFolder });
  await closeDb();
  console.error('migrations applied'); // stderr; eslint-disabled by ESLint env
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

(Note: this file is excluded from coverage and the `no-console` rule via eslint comment.)

- [ ] **Step 4: Add eslint disables at top of `migrate.ts`**

Prepend:
```typescript
/* eslint-disable no-console */
```

- [ ] **Step 5: Write `apps/api/src/errors.ts`**

```typescript
export class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
}

export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK' as const;
  readonly httpStatus = 409;
  constructor(public readonly availableStock: { warehouseId: string; stock: number }[]) {
    super('Insufficient stock to fulfill order');
  }
}

export class InvalidOrderError extends Error {
  readonly code = 'INVALID_ORDER' as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly httpStatus = 404;
  constructor(message: string) { super(message); }
}

export function isKnownError(e: unknown): e is InsufficientStockError | InvalidOrderError | NotFoundError {
  return e instanceof InsufficientStockError || e instanceof InvalidOrderError || e instanceof NotFoundError;
}
```

(Strip the `abstract` `DomainError` if TS rejects it — using a plain marker class is fine; remove the `DomainError` if unused.)

- [ ] **Step 6: Simplify errors.ts (remove unused abstract base)**

Replace the file with:

```typescript
export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK' as const;
  readonly httpStatus = 409;
  constructor(public readonly availableStock: { warehouseId: string; stock: number }[]) {
    super('Insufficient stock to fulfill order');
    this.name = 'InsufficientStockError';
  }
}

export class InvalidOrderError extends Error {
  readonly code = 'INVALID_ORDER' as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly httpStatus = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export type KnownError = InsufficientStockError | InvalidOrderError | NotFoundError;

export function isKnownError(e: unknown): e is KnownError {
  return (
    e instanceof InsufficientStockError ||
    e instanceof InvalidOrderError ||
    e instanceof NotFoundError
  );
}
```

- [ ] **Step 7: Write `apps/api/test/unit/errors.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { InsufficientStockError, InvalidOrderError, NotFoundError, isKnownError } from '../../src/errors.js';

describe('errors', () => {
  it('InsufficientStockError carries snapshot + 409', () => {
    const e = new InsufficientStockError([{ warehouseId: 'paris', stock: 0 }]);
    expect(e.code).toBe('INSUFFICIENT_STOCK');
    expect(e.httpStatus).toBe(409);
    expect(e.availableStock[0]?.warehouseId).toBe('paris');
  });
  it('InvalidOrderError → 422', () => {
    const e = new InvalidOrderError('shipping too high');
    expect(e.code).toBe('INVALID_ORDER');
    expect(e.httpStatus).toBe(422);
  });
  it('NotFoundError → 404', () => {
    const e = new NotFoundError('order missing');
    expect(e.httpStatus).toBe(404);
  });
  it('isKnownError discriminates', () => {
    expect(isKnownError(new InvalidOrderError('x'))).toBe(true);
    expect(isKnownError(new Error('plain'))).toBe(false);
    expect(isKnownError('string')).toBe(false);
  });
});
```

- [ ] **Step 8: Run tests + typecheck**

```bash
npm run test:unit -w @scos/api -- errors
npm run typecheck -w @scos/api
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/db/client.ts apps/api/src/db/migrate.ts apps/api/src/errors.ts apps/api/test/unit/errors.test.ts
git commit -m "feat(api): config, db client, migrate runner, typed errors"
```

---

### Task 13: Idempotent seed runner

**Files:**
- Create: `apps/api/src/db/seed.ts`

- [ ] **Step 1: Write `apps/api/src/db/seed.ts`**

```typescript
/* eslint-disable no-console */
import { sql } from 'drizzle-orm';
import { db, closeDb } from './client.js';
import { warehouses } from './schema.js';

const SEED = [
  { id: 'los-angeles', name: 'Los Angeles', latitude: 33.9425,    longitude: -118.408056, stock: 355 },
  { id: 'new-york',    name: 'New York',    latitude: 40.639722,  longitude: -73.778889,  stock: 578 },
  { id: 'sao-paulo',   name: 'São Paulo',   latitude: -23.435556, longitude: -46.473056,  stock: 265 },
  { id: 'paris',       name: 'Paris',       latitude: 49.009722,  longitude: 2.547778,    stock: 694 },
  { id: 'warsaw',      name: 'Warsaw',      latitude: 52.165833,  longitude: 20.967222,   stock: 245 },
  { id: 'hong-kong',   name: 'Hong Kong',   latitude: 22.308889,  longitude: 113.914444,  stock: 419 },
];

async function main() {
  const d = db();
  await d.insert(warehouses).values(SEED).onConflictDoNothing({ target: warehouses.id });
  const count = await d.execute(sql`select count(*)::int as c from warehouses`);
  console.error('warehouses count:', count.rows[0]);
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Apply migration + seed against the running compose db**

```bash
DATABASE_URL=postgresql://scos:scos@localhost:5432/scos npm run db:migrate -w @scos/api
DATABASE_URL=postgresql://scos:scos@localhost:5432/scos npm run db:seed -w @scos/api
```

Expected output ends with `warehouses count: { c: 6 }`.

- [ ] **Step 3: Run seed a second time to confirm idempotency**

```bash
DATABASE_URL=postgresql://scos:scos@localhost:5432/scos npm run db:seed -w @scos/api
```

Expected: still `{ c: 6 }`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/db/seed.ts
git commit -m "feat(db): idempotent warehouse seed runner"
```

---

## Phase 5 — API foundation

### Task 14: Fastify server, swagger, error handler, graceful shutdown

**Files:**
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/src/app.ts` (factory used by tests too)
- Create: `apps/api/src/routes/health.ts`

- [ ] **Step 1: Write `apps/api/src/routes/health.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { HealthResponseSchema, ReadyResponseSchema } from '@scos/shared';
import { db } from '../db/client.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', {
    schema: { response: { 200: HealthResponseSchema } },
  }, async () => ({ status: 'ok' as const }));

  app.get('/ready', {
    schema: { response: { 200: ReadyResponseSchema, 503: ReadyResponseSchema } },
  }, async (_req, reply) => {
    try {
      await db().execute(sql`select 1`);
      return { status: 'ok' as const };
    } catch {
      return reply.status(503).send({ status: 'unavailable' as const });
    }
  });

  // appease the unused import
  z.literal('ok');
}
```

- [ ] **Step 2: Write `apps/api/src/app.ts`**

```typescript
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { isKnownError } from './errors.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp(opts: { logLevel?: string } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: opts.logLevel ?? 'info' },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: { title: 'ScreenCloud OMS API', version: '1.0.0' },
      servers: [{ url: '/' }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // setErrorHandler MUST be registered BEFORE child plugin contexts
  // (Fastify v5 only flows error handlers down to children registered after the call).
  app.setErrorHandler<Error & { statusCode?: number }>((err, req, reply) => {
    if (isKnownError(err)) {
      const body: Record<string, unknown> = { error: err.code, message: err.message };
      if (err.code === 'INSUFFICIENT_STOCK') {
        body.availableStock = err.availableStock;
      }
      return reply.status(err.httpStatus).send(body);
    }
    if (err.statusCode === 400) {
      return reply.status(400).send({ error: 'BAD_REQUEST', message: err.message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  await app.register(async (api) => {
    await api.register(healthRoutes);
  }, { prefix: '/api/v1' });

  return app;
}
```

- [ ] **Step 3: Replace `apps/api/src/server.ts`**

```typescript
import { buildApp } from './app.js';
import { closeDb } from './db/client.js';
import { loadConfig } from './config.js';

async function main() {
  const cfg = loadConfig();
  const app = await buildApp({ logLevel: cfg.LOG_LEVEL });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 4: Build + run locally**

```bash
npm run build -w @scos/api
DATABASE_URL=postgresql://scos:scos@localhost:5432/scos node apps/api/dist/server.js &
sleep 1
curl -s http://localhost:3000/api/v1/health
curl -s http://localhost:3000/api/v1/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/docs
kill %1
```

Expected: `{"status":"ok"}` for both; `200` for `/docs`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/server.ts apps/api/src/routes/health.ts
git commit -m "feat(api): fastify bootstrap with swagger, zod, error handler, graceful shutdown"
```

---

## Phase 6 — Verify endpoint with integration tests

### Task 15: Integration test harness with testcontainers

**Files:**
- Create: `apps/api/test/integration/setup.ts`

- [ ] **Step 1: Write `apps/api/test/integration/setup.ts`**

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { closeDb, createDb, type Db } from '../../src/db/client.js';
import { warehouses } from '../../src/db/schema.js';
import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../drizzle');

const SEED = [
  { id: 'los-angeles', name: 'Los Angeles', latitude: 33.9425,    longitude: -118.408056, stock: 355 },
  { id: 'new-york',    name: 'New York',    latitude: 40.639722,  longitude: -73.778889,  stock: 578 },
  { id: 'sao-paulo',   name: 'São Paulo',   latitude: -23.435556, longitude: -46.473056,  stock: 265 },
  { id: 'paris',       name: 'Paris',       latitude: 49.009722,  longitude: 2.547778,    stock: 694 },
  { id: 'warsaw',      name: 'Warsaw',      latitude: 52.165833,  longitude: 20.967222,   stock: 245 },
  { id: 'hong-kong',   name: 'Hong Kong',   latitude: 22.308889,  longitude: 113.914444,  stock: 419 },
];

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  container: StartedPostgreSqlContainer;
}

export async function startTestEnv(): Promise<TestEnv> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('scos').withUsername('scos').withPassword('scos').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  const d = createDb(url);
  await d.execute(sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await migrate(d, { migrationsFolder });
  await d.insert(warehouses).values(SEED).onConflictDoNothing({ target: warehouses.id });
  const app = await buildApp({ logLevel: 'silent' });
  return { app, db: d, container };
}

export async function resetState(env: TestEnv): Promise<void> {
  await env.db.execute(sql`TRUNCATE TABLE shipments, orders RESTART IDENTITY CASCADE`);
  await env.db.execute(sql`UPDATE warehouses SET stock = s.stock FROM (VALUES
    ('los-angeles', 355), ('new-york', 578), ('sao-paulo', 265),
    ('paris', 694), ('warsaw', 245), ('hong-kong', 419)
  ) AS s(id, stock) WHERE warehouses.id = s.id`);
}

export async function stopTestEnv(env: TestEnv): Promise<void> {
  await env.app.close();
  await closeDb();
  await env.container.stop();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/test/integration/setup.ts
git commit -m "test(integration): testcontainers postgres harness with seed"
```

---

### Task 16: Verify route + integration tests

**Files:**
- Create: `apps/api/src/routes/orders.ts` (verify only for now)
- Modify: `apps/api/src/app.ts` (register route)
- Create: `apps/api/test/integration/verify.test.ts`

- [ ] **Step 1: Write `apps/api/src/routes/orders.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import {
  VerifyOrderRequestSchema,
  VerifyOrderResponseSchema,
} from '@scos/shared';
import { db } from '../db/client.js';
import { warehouses } from '../db/schema.js';
import { planShipment } from '../domain/shipment-planner.js';
import { calculateOrderTotals } from '../domain/pricing.js';
import { isOrderValid } from '../domain/order-validator.js';

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.post('/verify', {
    schema: {
      body: VerifyOrderRequestSchema,
      response: { 200: VerifyOrderResponseSchema },
    },
  }, async (req) => {
    const { quantity, shippingAddress } = req.body;

    const ws = await db().select().from(warehouses);
    const plan = planShipment(quantity, { lat: shippingAddress.latitude, lng: shippingAddress.longitude }, ws);
    const totals = calculateOrderTotals(quantity);

    let isValid = plan.feasible;
    let invalidReason: string | null = null;
    if (!plan.feasible) {
      invalidReason = 'Insufficient stock across all warehouses';
    } else if (!isOrderValid(plan.shippingCostCents, totals.totalAfterDiscountCents)) {
      isValid = false;
      invalidReason = 'Shipping cost exceeds 15% of order total';
    }

    return {
      quantity,
      ...totals,
      shippingCostCents: plan.shippingCostCents,
      isValid,
      invalidReason,
      shipmentPlan: plan.legs,
    };
  });
}
```

- [ ] **Step 2: Register the route in `apps/api/src/app.ts`**

Modify the `/api/v1` plugin block to also register order routes:

```typescript
  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(orderRoutes, { prefix: '/orders' });
  }, { prefix: '/api/v1' });
```

Add the import: `import { orderRoutes } from './routes/orders.js';`

- [ ] **Step 3: Write `apps/api/test/integration/verify.test.ts`**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;

beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

describe('POST /api/v1/orders/verify', () => {
  it('returns valid plan for an in-budget order', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: 150, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isValid).toBe(true);
    expect(body.invalidReason).toBeNull();
    expect(body.discountPercent).toBe(15);
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
    expect(body.shipmentPlan.reduce((s: number, l: { quantity: number }) => s + l.quantity, 0)).toBe(150);
  });

  it('returns isValid:false with partial plan when stock insufficient', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: 100_000, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe('Insufficient stock across all warehouses');
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
  });

  it('returns isValid:false when shipping > 15% of total', async () => {
    // 1 unit shipped from very far → shipping dominates total
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: 1, shippingAddress: { latitude: -77.85, longitude: 166.67 } }, // McMurdo (Ushuaia is too close to São Paulo to trigger the rule for 1 unit)
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe('Shipping cost exceeds 15% of order total');
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
  });

  it('400s on invalid input', async () => {
    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders/verify',
      payload: { quantity: -5, shippingAddress: { latitude: 0, longitude: 0 } },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 4: Run integration tests**

```bash
npm run test:integration -w @scos/api -- verify
```

Expected: 4 tests pass. (First run may take ~30s pulling postgres image.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/orders.ts apps/api/src/app.ts apps/api/test/integration/verify.test.ts
git commit -m "feat(api): POST /orders/verify with integration tests"
```

---

## Phase 7 — Submit endpoint (the hard one)

### Task 17: Order service with transactional submit

**Files:**
- Create: `apps/api/src/services/order-service.ts`

- [ ] **Step 1: Write `apps/api/src/services/order-service.ts`**

```typescript
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { warehouses, orders, shipments } from '../db/schema.js';
import { planShipment } from '../domain/shipment-planner.js';
import { calculateOrderTotals } from '../domain/pricing.js';
import { isOrderValid } from '../domain/order-validator.js';
import { InsufficientStockError, InvalidOrderError } from '../errors.js';

export interface SubmitInput {
  quantity: number;
  shippingLat: number;
  shippingLng: number;
  idempotencyKey?: string;
}

export async function submitOrder(input: SubmitInput) {
  const d = db();

  if (input.idempotencyKey) {
    const existing = await d.query.orders.findFirst({
      where: eq(orders.idempotencyKey, input.idempotencyKey),
      with: { shipments: { with: { warehouse: true } } },
    });
    if (existing) return existing;
  }

  return d.transaction(async (tx) => {
    const lockedWarehouses = await tx
      .select()
      .from(warehouses)
      .orderBy(asc(warehouses.id))
      .for('update');

    const plan = planShipment(
      input.quantity,
      { lat: input.shippingLat, lng: input.shippingLng },
      lockedWarehouses,
    );

    if (!plan.feasible) {
      throw new InsufficientStockError(
        lockedWarehouses.map((w) => ({ warehouseId: w.id, stock: w.stock })),
      );
    }

    const totals = calculateOrderTotals(input.quantity);
    if (!isOrderValid(plan.shippingCostCents, totals.totalAfterDiscountCents)) {
      throw new InvalidOrderError('Shipping cost exceeds 15% of order total');
    }

    for (const leg of plan.legs) {
      await tx
        .update(warehouses)
        .set({ stock: sql`${warehouses.stock} - ${leg.quantity}` })
        .where(eq(warehouses.id, leg.warehouseId));
    }

    const [created] = await tx.insert(orders).values({
      quantity: input.quantity,
      shippingLat: input.shippingLat,
      shippingLng: input.shippingLng,
      totalBeforeDiscountCents: totals.totalBeforeDiscountCents,
      discountCents: totals.discountCents,
      totalAfterDiscountCents: totals.totalAfterDiscountCents,
      shippingCostCents: plan.shippingCostCents,
      idempotencyKey: input.idempotencyKey,
    }).returning();

    if (!created) throw new Error('order insert returned no row');

    await tx.insert(shipments).values(
      plan.legs.map((leg) => ({
        orderId: created.id,
        warehouseId: leg.warehouseId,
        quantity: leg.quantity,
        distanceKm: leg.distanceKm,
        shippingCostCents: leg.shippingCostCents,
      })),
    );

    const fresh = await tx.query.orders.findFirst({
      where: eq(orders.id, created.id),
      with: { shipments: { with: { warehouse: true } } },
    });
    if (!fresh) throw new Error('failed to re-read created order');
    return fresh;
  }, { isolationLevel: 'read committed' });
}
```

- [ ] **Step 2: Build to surface type errors**

```bash
npm run build -w @scos/api
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/order-service.ts
git commit -m "feat(services): transactional submitOrder with row locks and idempotency"
```

---

### Task 18: Submit route with integration tests (success, 409, 422, idempotency)

**Files:**
- Modify: `apps/api/src/routes/orders.ts`
- Create: `apps/api/test/integration/submit.test.ts`

- [ ] **Step 1: Add the submit route to `apps/api/src/routes/orders.ts`**

Append inside `orderRoutes`:

```typescript
  app.post('/', {
    schema: {
      body: SubmitOrderRequestSchema,
      response: {
        201: SubmitOrderResponseSchema,
        409: InsufficientStockErrorSchema,
        422: InvalidOrderErrorSchema,
      },
    },
  }, async (req, reply) => {
    const { quantity, shippingAddress } = req.body;
    const idempotencyKey = req.headers['idempotency-key'];
    const key = typeof idempotencyKey === 'string' ? idempotencyKey : undefined;

    const order = await submitOrder({
      quantity,
      shippingLat: shippingAddress.latitude,
      shippingLng: shippingAddress.longitude,
      idempotencyKey: key,
    });

    const shipmentPlan = order.shipments.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      warehouseLatitude: s.warehouse.latitude,
      warehouseLongitude: s.warehouse.longitude,
      quantity: s.quantity,
      distanceKm: s.distanceKm,
      shippingCostCents: s.shippingCostCents,
    }));

    return reply.status(201).send({
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      quantity: order.quantity,
      totalBeforeDiscountCents: order.totalBeforeDiscountCents,
      discountCents: order.discountCents,
      discountPercent: Math.round((order.discountCents / order.totalBeforeDiscountCents) * 100),
      totalAfterDiscountCents: order.totalAfterDiscountCents,
      shippingCostCents: order.shippingCostCents,
      isValid: true,
      invalidReason: null,
      shipmentPlan,
    });
  });
```

Add imports at the top:

```typescript
import {
  SubmitOrderRequestSchema,
  SubmitOrderResponseSchema,
  InsufficientStockErrorSchema,
  InvalidOrderErrorSchema,
} from '@scos/shared';
import { submitOrder } from '../services/order-service.js';
```

- [ ] **Step 2: Write `apps/api/test/integration/submit.test.ts`**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

describe('POST /api/v1/orders', () => {
  it('201 on success and decrements stock', async () => {
    const before = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    const beforeStock = (before.rows[0] as { stock: number }).stock;

    const res = await env.app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      payload: { quantity: 50, shippingAddress: bangkok },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTypeOf('string');
    expect(body.orderNumber).toBeTypeOf('string');
    expect(body.shipmentPlan[0].warehouseId).toBe('hong-kong');

    const after = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    expect((after.rows[0] as { stock: number }).stock).toBe(beforeStock - 50);
  });

  it('idempotency-key replay returns same order without re-decrementing stock', async () => {
    const key = '11111111-1111-1111-1111-111111111111';
    const r1 = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': key },
      payload: { quantity: 30, shippingAddress: bangkok },
    });
    expect(r1.statusCode).toBe(201);
    const before = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    const stockAfterFirst = (before.rows[0] as { stock: number }).stock;

    const r2 = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      headers: { 'idempotency-key': key },
      payload: { quantity: 30, shippingAddress: bangkok },
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.json().id).toBe(r1.json().id);

    const after = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
    expect((after.rows[0] as { stock: number }).stock).toBe(stockAfterFirst);
  });

  it('422 when shipping > 15% of total', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      payload: { quantity: 1, shippingAddress: { latitude: -54.8, longitude: -68.3 } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('INVALID_ORDER');
  });

  it('409 with stock snapshot when quantity exceeds total stock', async () => {
    const res = await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      payload: { quantity: 100_000, shippingAddress: bangkok },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toBe('INSUFFICIENT_STOCK');
    expect(Array.isArray(body.availableStock)).toBe(true);
    expect(body.availableStock.length).toBe(6);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test:integration -w @scos/api -- submit
```

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/orders.ts apps/api/test/integration/submit.test.ts
git commit -m "feat(api): POST /orders with integration tests for success/409/422/idempotency"
```

---

### Task 19: Concurrency stress test (50 iterations in CI)

**Files:**
- Create: `apps/api/test/integration/concurrency.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';
import { submitOrder } from '../../src/services/order-service.js';
import { InsufficientStockError } from '../../src/errors.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

const ITERATIONS = Number(process.env.CONCURRENCY_ITERATIONS ?? 10);

describe('concurrent submitOrder', () => {
  beforeEach(async () => {
    await resetState(env);
    // Reduce stock so exactly one of two parallel orders for the global stock can succeed.
    await env.db.execute(sql`UPDATE warehouses SET stock = 0 WHERE id <> 'hong-kong'`);
    await env.db.execute(sql`UPDATE warehouses SET stock = 100 WHERE id = 'hong-kong'`);
  });

  it(`exactly one of two parallel orders succeeds (×${ITERATIONS})`, async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      await env.db.execute(sql`UPDATE warehouses SET stock = 100 WHERE id = 'hong-kong'`);
      await env.db.execute(sql`TRUNCATE TABLE shipments, orders RESTART IDENTITY CASCADE`);

      const order = { quantity: 100, shippingLat: bangkok.latitude, shippingLng: bangkok.longitude };
      const results = await Promise.allSettled([submitOrder(order), submitOrder(order)]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const reject = rejected[0] as PromiseRejectedResult;
      expect(reject.reason).toBeInstanceOf(InsufficientStockError);

      const stockRow = await env.db.execute(sql`select stock from warehouses where id = 'hong-kong'`);
      expect((stockRow.rows[0] as { stock: number }).stock).toBe(0);
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run locally with 10 iterations**

```bash
npm run test:integration -w @scos/api -- concurrency
```

Expected: PASS. CI will set `CONCURRENCY_ITERATIONS=50`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/integration/concurrency.test.ts
git commit -m "test(integration): concurrent submit race — exactly one wins"
```

---

## Phase 8 — List endpoints (future-frontend hooks)

### Task 20: GET /warehouses

**Files:**
- Create: `apps/api/src/routes/warehouses.ts`
- Modify: `apps/api/src/app.ts` (register)
- Create: `apps/api/test/integration/warehouses.test.ts`

- [ ] **Step 1: Write `apps/api/src/routes/warehouses.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { asc } from 'drizzle-orm';
import { WarehousesResponseSchema } from '@scos/shared';
import { db } from '../db/client.js';
import { warehouses } from '../db/schema.js';

export async function warehouseRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', {
    schema: { response: { 200: WarehousesResponseSchema } },
  }, async () => {
    const rows = await db().select().from(warehouses).orderBy(asc(warehouses.id));
    return rows.map((w) => ({
      id: w.id, name: w.name, latitude: w.latitude, longitude: w.longitude, stock: w.stock,
    }));
  });
}
```

- [ ] **Step 2: Register in `apps/api/src/app.ts`**

Inside the `/api/v1` plugin, after orders:

```typescript
    await api.register(warehouseRoutes, { prefix: '/warehouses' });
```

Add: `import { warehouseRoutes } from './routes/warehouses.js';`

- [ ] **Step 3: Write `apps/api/test/integration/warehouses.test.ts`**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

describe('GET /api/v1/warehouses', () => {
  it('returns all 6 with current stock', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/warehouses' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(6);
    const ids = body.map((w: { id: string }) => w.id).sort();
    expect(ids).toEqual(['hong-kong', 'los-angeles', 'new-york', 'paris', 'sao-paulo', 'warsaw']);
  });

  it('reflects post-submit decrement', async () => {
    await env.app.inject({
      method: 'POST', url: '/api/v1/orders',
      payload: { quantity: 50, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    });
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/warehouses' });
    const hk = res.json().find((w: { id: string }) => w.id === 'hong-kong');
    expect(hk.stock).toBe(419 - 50);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm run test:integration -w @scos/api -- warehouses
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/warehouses.ts apps/api/src/app.ts apps/api/test/integration/warehouses.test.ts
git commit -m "feat(api): GET /warehouses + integration tests"
```

---

### Task 21: GET /orders with cursor pagination

**Files:**
- Modify: `apps/api/src/routes/orders.ts`
- Create: `apps/api/test/integration/orders-list.test.ts`

- [ ] **Step 1: Add the GET handler to `apps/api/src/routes/orders.ts`**

Append inside `orderRoutes`:

```typescript
  app.get('/', {
    schema: {
      querystring: OrdersListQuerySchema,
      response: { 200: OrdersListResponseSchema },
    },
  }, async (req) => {
    const { limit, cursor } = req.query;
    const cursorRow = cursor
      ? await db().query.orders.findFirst({ where: eq(orders.id, cursor) })
      : undefined;

    const where = cursorRow ? lt(orders.createdAt, cursorRow.createdAt) : undefined;

    const rows = await db().query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt)],
      limit: limit + 1,
      with: { shipments: { with: { warehouse: true } } },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

    return {
      orders: page.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        quantity: o.quantity,
        shippingAddress: { latitude: o.shippingLat, longitude: o.shippingLng },
        totalBeforeDiscountCents: o.totalBeforeDiscountCents,
        discountCents: o.discountCents,
        discountPercent: Math.round((o.discountCents / o.totalBeforeDiscountCents) * 100),
        totalAfterDiscountCents: o.totalAfterDiscountCents,
        shippingCostCents: o.shippingCostCents,
        createdAt: o.createdAt.toISOString(),
        isValid: true,
        invalidReason: null,
        shipments: o.shipments.map((s) => ({
          warehouseId: s.warehouseId,
          warehouseName: s.warehouse.name,
          warehouseLatitude: s.warehouse.latitude,
          warehouseLongitude: s.warehouse.longitude,
          quantity: s.quantity,
          distanceKm: s.distanceKm,
          shippingCostCents: s.shippingCostCents,
        })),
      })),
      nextCursor,
    };
  });
```

Add imports: `OrdersListQuerySchema`, `OrdersListResponseSchema` from `@scos/shared`; `desc, lt` from `drizzle-orm` (alongside `eq`).

- [ ] **Step 2: Write `apps/api/test/integration/orders-list.test.ts`**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestEnv, resetState, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });
beforeEach(async () => { await resetState(env); });

const bangkok = { latitude: 13.7563, longitude: 100.5018 };

describe('GET /api/v1/orders', () => {
  it('returns empty list initially', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ orders: [], nextCursor: null });
  });

  it('paginates newest-first via cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await env.app.inject({
        method: 'POST', url: '/api/v1/orders',
        payload: { quantity: 1, shippingAddress: bangkok },
      });
    }
    const page1 = await env.app.inject({ method: 'GET', url: '/api/v1/orders?limit=2' });
    const body1 = page1.json();
    expect(body1.orders).toHaveLength(2);
    expect(body1.nextCursor).toBeTypeOf('string');

    const page2 = await env.app.inject({ method: 'GET', url: `/api/v1/orders?limit=2&cursor=${body1.nextCursor}` });
    const body2 = page2.json();
    expect(body2.orders).toHaveLength(1);
    expect(body2.nextCursor).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm run test:integration -w @scos/api -- orders-list
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/orders.ts apps/api/test/integration/orders-list.test.ts
git commit -m "feat(api): GET /orders with cursor pagination"
```

---

### Task 22: Health route integration test

**Files:**
- Create: `apps/api/test/integration/health.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestEnv, stopTestEnv, type TestEnv } from './setup.js';

let env: TestEnv;
beforeAll(async () => { env = await startTestEnv(); }, 60_000);
afterAll(async () => { await stopTestEnv(env); });

describe('health', () => {
  it('GET /health → 200', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
  });
  it('GET /ready → 200 with db up', async () => {
    const r = await env.app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(r.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Run + verify coverage thresholds met**

```bash
npm test -w @scos/api
```

Expected: all unit + integration tests pass; coverage thresholds satisfied.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/integration/health.test.ts
git commit -m "test(integration): health and readiness endpoints"
```

---

## Phase 9 — Dockerfile, compose stack, e2e suite

### Task 23: Multi-stage Dockerfile

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
**/node_modules
**/dist
**/coverage
.git
.github
*.md
.env*
docker-compose*.yml
```

- [ ] **Step 2: Write `apps/api/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspaces

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @scos/shared
RUN npm run build -w @scos/api

FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/packages/shared/package.json packages/shared/
RUN npm ci --workspaces --omit=dev
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
```

- [ ] **Step 3: Build and run the image locally**

```bash
docker build -f apps/api/Dockerfile -t scos-oms-api:dev .
docker run --rm --network host -e DATABASE_URL=postgresql://scos:scos@localhost:5432/scos -p 3000:3000 scos-oms-api:dev &
sleep 2
curl -sf http://localhost:3000/api/v1/health
docker stop $(docker ps -q --filter ancestor=scos-oms-api:dev)
```

Expected: `{"status":"ok"}`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/Dockerfile .dockerignore
git commit -m "feat(docker): multi-stage Dockerfile for the API"
```

---

### Task 24: Compose api service + e2e variant

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker-compose.e2e.yml`

- [ ] **Step 1: Add the api service to `docker-compose.yml`**

Append:

```yaml
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://scos:scos@db:5432/scos
      NODE_ENV: production
      PORT: 3000
    depends_on:
      db: { condition: service_healthy }
    ports: ["3000:3000"]
    command: >
      sh -c "npm run db:migrate -w @scos/api &&
             npm run db:seed -w @scos/api &&
             node apps/api/dist/server.js"
```

- [ ] **Step 2: Write `docker-compose.e2e.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: scos
      POSTGRES_USER: scos
      POSTGRES_PASSWORD: scos
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scos -d scos"]
      interval: 2s
      timeout: 5s
      retries: 30

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://scos:scos@db:5432/scos
      NODE_ENV: production
      PORT: 3000
    depends_on:
      db: { condition: service_healthy }
    ports: ["3000:3000"]
    command: >
      sh -c "npm run db:migrate -w @scos/api &&
             npm run db:seed -w @scos/api &&
             node apps/api/dist/server.js"
```

- [ ] **Step 3: Smoke test with the api service**

```bash
docker compose down -v
docker compose up -d --build
sleep 10
curl -sf http://localhost:3000/api/v1/ready
curl -sf http://localhost:3000/api/v1/warehouses | head -c 200
docker compose down
```

Expected: ready returns ok; warehouses returns 6 entries.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml docker-compose.e2e.yml
git commit -m "chore(docker): compose api service + dedicated e2e variant"
```

---

### Task 25: E2E test suite

**Files:**
- Create: `apps/api/test/e2e/setup.ts`
- Create: `apps/api/test/e2e/verify.e2e.test.ts`
- Create: `apps/api/test/e2e/submit-flow.e2e.test.ts`
- Create: `apps/api/test/e2e/idempotency.e2e.test.ts`

- [ ] **Step 1: Write `apps/api/test/e2e/setup.ts`**

```typescript
import { request } from 'undici';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export async function waitForReady(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const r = await request(`${BASE_URL}/api/v1/ready`);
      if (r.statusCode === 200) return;
    } catch (e) { lastErr = e; }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`API never became ready: ${String(lastErr)}`);
}

export async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
  const r = await request(`${BASE_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
  const text = await r.body.text();
  return { status: r.statusCode, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}

export async function get<T>(path: string): Promise<{ status: number; body: T }> {
  const r = await request(`${BASE_URL}${path}`);
  const text = await r.body.text();
  return { status: r.statusCode, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}
```

- [ ] **Step 2: Write `apps/api/test/e2e/verify.e2e.test.ts`**

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { post, waitForReady } from './setup.js';

beforeAll(async () => { await waitForReady(); }, 60_000);

describe('e2e: POST /api/v1/orders/verify', () => {
  it('round-trips a valid verify request', async () => {
    const { status, body } = await post<{ isValid: boolean; shipmentPlan: unknown[]; discountPercent: number }>(
      '/api/v1/orders/verify',
      { quantity: 100, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    );
    expect(status).toBe(200);
    expect(body.isValid).toBe(true);
    expect(body.discountPercent).toBe(15);
    expect(body.shipmentPlan.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Write `apps/api/test/e2e/submit-flow.e2e.test.ts`**

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import { get, post, waitForReady } from './setup.js';

beforeAll(async () => { await waitForReady(); }, 60_000);

describe('e2e: submit → list → warehouse decrement', () => {
  it('creates an order and the warehouse stock reflects the decrement', async () => {
    const before = await get<{ id: string; stock: number }[]>('/api/v1/warehouses');
    const hkBefore = before.body.find((w) => w.id === 'hong-kong')!.stock;

    const submit = await post<{ id: string; orderNumber: string }>(
      '/api/v1/orders',
      { quantity: 25, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } },
    );
    expect(submit.status).toBe(201);
    expect(submit.body.orderNumber).toBeTypeOf('string');

    const list = await get<{ orders: { id: string }[] }>(`/api/v1/orders?limit=10`);
    expect(list.body.orders.find((o) => o.id === submit.body.id)).toBeTruthy();

    const after = await get<{ id: string; stock: number }[]>('/api/v1/warehouses');
    const hkAfter = after.body.find((w) => w.id === 'hong-kong')!.stock;
    expect(hkAfter).toBe(hkBefore - 25);
  });
});
```

- [ ] **Step 4: Write `apps/api/test/e2e/idempotency.e2e.test.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { post, waitForReady } from './setup.js';

beforeAll(async () => { await waitForReady(); }, 60_000);

describe('e2e: idempotency-key', () => {
  it('two POSTs with same key yield the same id', async () => {
    const key = randomUUID();
    const payload = { quantity: 5, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } };
    const r1 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': key });
    const r2 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': key });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
  });

  it('different key creates a different order', async () => {
    const payload = { quantity: 5, shippingAddress: { latitude: 13.7563, longitude: 100.5018 } };
    const r1 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': randomUUID() });
    const r2 = await post<{ id: string }>('/api/v1/orders', payload, { 'idempotency-key': randomUUID() });
    expect(r2.body.id).not.toBe(r1.body.id);
  });
});
```

- [ ] **Step 5: Run e2e against the compose stack**

```bash
docker compose -f docker-compose.e2e.yml up -d --build
npm run test:e2e -w @scos/api
docker compose -f docker-compose.e2e.yml down -v
```

Expected: all e2e tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/e2e
git commit -m "test(e2e): black-box verify, submit-flow, idempotency"
```

---

## Phase 10 — Cloud deploy (Fly.io)

### Task 26: fly.toml and provisioning

**Files:**
- Create: `fly.toml`

- [ ] **Step 1: Install flyctl locally if not present**

```bash
which flyctl || brew install flyctl
flyctl auth login
```

(Skip if you've already authenticated.)

- [ ] **Step 2: Provision the production app + Postgres**

```bash
flyctl launch --no-deploy --copy-config --name scos-oms-prod --region iad
flyctl postgres create --name scos-oms-prod-db --region iad --vm-size shared-cpu-1x --volume-size 1
flyctl postgres attach --app scos-oms-prod scos-oms-prod-db
```

(`postgres attach` sets `DATABASE_URL` as a Fly secret on the app.)

- [ ] **Step 3: Replace generated `fly.toml`**

```toml
app = "scos-oms-prod"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile"

[deploy]
  release_command = "sh -c 'npm run db:migrate -w @scos/api && npm run db:seed -w @scos/api'"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 1

  [[http_service.checks]]
    interval = "10s"
    timeout = "2s"
    grace_period = "10s"
    method = "GET"
    path = "/api/v1/ready"

[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

- [ ] **Step 4: First production deploy**

```bash
flyctl deploy --remote-only
flyctl status
curl -sf https://scos-oms-prod.fly.dev/api/v1/ready
```

Expected: `{"status":"ok"}`.

- [ ] **Step 5: Production smoke verify + submit**

```bash
curl -sf -X POST https://scos-oms-prod.fly.dev/api/v1/orders/verify \
  -H content-type:application/json \
  -d '{"quantity": 30, "shippingAddress": {"latitude": 13.7563, "longitude": 100.5018}}'
```

Expected: a 200 response with `isValid: true`.

- [ ] **Step 6: Commit**

```bash
git add fly.toml
git commit -m "chore(deploy): fly.toml with release_command for migrations"
```

---

## Phase 11 — CI/CD workflows

### Task 27: ci.yml (lint, typecheck, unit, integration)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build -w @scos/shared
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build -w @scos/shared
      - run: npm run typecheck

  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build -w @scos/shared
      - run: npm run test:unit -w @scos/api
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-unit
          path: apps/api/coverage

  integration:
    runs-on: ubuntu-latest
    env:
      CONCURRENCY_ITERATIONS: 50
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build -w @scos/shared
      - run: npm run test:integration -w @scos/api
```

- [ ] **Step 2: Push to a branch and open a PR to validate**

```bash
git checkout -b ci/initial-pipeline
git add .github/workflows/ci.yml
git commit -m "ci: add lint/typecheck/unit/integration workflow"
git push -u origin ci/initial-pipeline
gh pr create --fill
```

Expected: all four jobs go green.

- [ ] **Step 3: Merge once green**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

### Task 28: e2e.yml (docker-compose stack)

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: E2E

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: e2e-${{ github.ref }}
  cancel-in-progress: true

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run build -w @scos/shared
      - name: Start compose stack
        run: docker compose -f docker-compose.e2e.yml up -d --build
      - name: Wait for ready
        run: |
          for i in $(seq 1 60); do
            if curl -sf http://localhost:3000/api/v1/ready > /dev/null; then exit 0; fi
            sleep 2
          done
          docker compose -f docker-compose.e2e.yml logs
          exit 1
      - run: npm run test:e2e -w @scos/api
      - if: always()
        run: docker compose -f docker-compose.e2e.yml logs
      - if: always()
        run: docker compose -f docker-compose.e2e.yml down -v
```

- [ ] **Step 2: Open PR, validate green, merge**

```bash
git checkout -b ci/e2e
git add .github/workflows/e2e.yml
git commit -m "ci: add e2e workflow against docker-compose stack"
git push -u origin ci/e2e
gh pr create --fill
```

Wait for green; merge.

---

### Task 29: deploy.yml (preview per PR + production on main)

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add `FLY_API_TOKEN` to GitHub repo secrets**

```bash
flyctl auth token  # copy the output
gh secret set FLY_API_TOKEN
# paste when prompted
```

- [ ] **Step 2: Write the workflow**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  preview:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions: { pull-requests: write }
    env:
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
      APP_NAME: scos-oms-pr-${{ github.event.number }}
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Create preview app if missing
        run: |
          if ! flyctl status --app "$APP_NAME" >/dev/null 2>&1; then
            flyctl apps create "$APP_NAME" --org personal
            flyctl postgres create --name "${APP_NAME}-db" --region iad --vm-size shared-cpu-1x --volume-size 1
            flyctl postgres attach --app "$APP_NAME" "${APP_NAME}-db"
          fi
      - run: flyctl deploy --app "$APP_NAME" --remote-only --config fly.toml
      - name: Comment preview URL
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `Preview deployed: https://${process.env.APP_NAME}.fly.dev/api/v1/ready`,
            });

  production:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    env:
      FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --app scos-oms-prod --remote-only
      - name: Smoke test
        run: |
          for i in $(seq 1 30); do
            if curl -sf https://scos-oms-prod.fly.dev/api/v1/ready > /dev/null; then exit 0; fi
            sleep 5
          done
          echo "smoke test failed; rolling back"
          flyctl releases rollback --app scos-oms-prod
          exit 1
```

- [ ] **Step 3: Push, open PR, watch the preview deploy land**

```bash
git checkout -b ci/deploy
git add .github/workflows/deploy.yml
git commit -m "ci: add deploy workflow with preview per PR + production on main"
git push -u origin ci/deploy
gh pr create --fill
```

Expected: preview job comments a URL on the PR; the URL responds 200.

- [ ] **Step 4: Merge — production deploys automatically**

```bash
gh pr merge --squash --delete-branch
gh run watch
```

Expected: production deploy succeeds, smoke test passes.

---

## Phase 12 — Documentation + submission

### Task 30: README.md

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

```markdown
# ScreenCloud OMS — Backend

Backend service for ScreenCloud's sales-team Order Management System. Implements
order verification and atomic order submission across 6 global warehouses, with
pessimistic row-locked inventory decrements.

## Live demo
- Production: https://scos-oms-prod.fly.dev
- API docs:   https://scos-oms-prod.fly.dev/docs

## Quick start

```
docker compose up
# API on http://localhost:3000
# Swagger UI at http://localhost:3000/docs
```

## Architecture

```mermaid
flowchart LR
  client[Client] -->|HTTP| api[Fastify API]
  api -->|drizzle| pg[(PostgreSQL 16)]
  ci[GitHub Actions] -->|flyctl| fly[Fly.io]
  fly -->|release_command| pg
```

The API is a Fastify v5 service. Domain logic (distance, pricing, planning,
validation, rounding) lives in a pure-function `domain/` layer with 100%
test coverage. The transactional submit lives in `services/order-service.ts`
and uses Drizzle's first-class `SELECT ... FOR UPDATE` to lock all warehouse
rows in deterministic order before recomputing the plan and decrementing stock
in a single transaction.

## Key technical decisions

### Backend-only scope (per the brief)
Auxiliary `GET /orders` and `GET /warehouses` endpoints are kept as documented
future hook points so a UI can be added later without re-shaping the API.

### Why Fastify over Express
TypeScript-first; built-in schema validation; fastify-type-provider-zod gives
us OpenAPI generation from the same zod schemas the frontend would consume.

### Why Drizzle over Prisma
Atomic inventory decrements need `SELECT ... FOR UPDATE`. Drizzle exposes it
as a typed `.for('update')` call; Prisma only via `$queryRaw` (no types on
the locked rows). This is the deciding factor for the ORM choice.

### Greedy shipment planner
Per-unit shipping cost is constant per warehouse (`distance × 0.365 × $0.01`),
no fixed per-shipment costs and no quantity-tiered rates. Greedy-by-distance
is therefore provably optimal — each marginal unit goes to its cheapest
available warehouse.

### Money in integer cents (banker's rounding)
Floats forbidden for money. Banker's rounding applied at calculation
boundaries to avoid half-up bias accumulation across orders.

### UUID order numbers
Globally unique, non-enumerable, no central sequence. `id` (internal PK) and
`orderNumber` (external) are kept separate so the externally-visible
identifier can evolve without disturbing FKs.

### Concurrency model
Pessimistic row locking with deterministic warehouse-id ordering to prevent
deadlocks. The plan is recomputed against locked rows since the verify-time
plan may be stale. `read committed` isolation is sufficient because the row
locks give us serializable behavior on the rows we modify.

### Idempotency-Key
Production-grade addition not required by the brief. Retries are inevitable
in distributed systems.

### Shared zod schemas
The `packages/shared` workspace defines all request/response shapes once.
Today the API consumes them for validation and OpenAPI generation; tomorrow
a frontend consumes the same package — the GET endpoints are typed end-to-end.

## CI/CD

Three workflows, all in `.github/workflows/`:

- **`ci.yml`** — lint, typecheck, unit, integration. The concurrency stress test
  runs 50 iterations.
- **`e2e.yml`** — boots `docker-compose.e2e.yml`, polls `/ready`, runs e2e
  suite, tears down.
- **`deploy.yml`** — every PR gets an ephemeral preview app on Fly.io with its
  own DB; merges to `main` deploy production with `release_command`-gated
  migrations and post-deploy smoke testing (auto-rollback on failure).

Migrations run via Fly's `release_command` — never on app boot. App startup
assumes the schema is already current.

## Production concerns
- **Consistency:** pessimistic row locks, deterministic ordering, re-plan inside transaction.
- **Performance:** indexed by created_at, idempotency_key, order_number; planner is O(W log W).
- **Scalability paths:** optimistic versioning + retry, sharded inventory rows, read-replica routing for GETs.
- **Extensibility:** product hardcoded in two named constants; multi-product is a `products` table + `product_id` FK + signature change.

## Testing
- `npm test` — unit + integration with coverage thresholds enforced.
- `npm run test:e2e` — black-box e2e against docker-compose stack.
- Coverage thresholds: 100% on `domain/`, 95% on `services/`, 90% on `routes/`.

## What I'd do next (with more time)
- Optimistic locking alternative (version column + retry) for higher concurrency.
- Outbox pattern for downstream events (fulfillment, analytics).
- Redis cache for the warehouse list with invalidation on stock changes.
- Auth + per-rep rate limits.
- OpenTelemetry traces, Prometheus metrics, structured request IDs end-to-end.
- Property-based tests on the planner via fast-check.
- Real carrier integration; planner becomes min-cost flow.
- Admin endpoints (manual stock adjustment, refunds).
- Real-time stock updates via SSE.
- Multi-product (schema generalization is small).
- The frontend itself (the auxiliary GET endpoints are already in place).

## Submission
- Repository: https://github.com/<your-user>/screencloud-oms
- Live deploy: https://scos-oms-prod.fly.dev
- Email: imogen.king@screencloud.io
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with quick-start, decisions, CI/CD, submission"
```

---

### Task 31: ARCHITECTURE.md

**Files:**
- Create: `ARCHITECTURE.md`

- [ ] **Step 1: Write ARCHITECTURE.md**

```markdown
# Architecture

A deeper look at the request lifecycles, failure modes, and the data flow
behind the ScreenCloud OMS backend. Read alongside the README and
[`IMPLEMENTATION_SPEC.md`](./IMPLEMENTATION_SPEC.md).

## Request lifecycle: verify

```mermaid
sequenceDiagram
  participant C as Client
  participant F as Fastify
  participant DB as Postgres
  C->>F: POST /api/v1/orders/verify
  F->>F: zod validate body
  F->>DB: SELECT * FROM warehouses
  DB-->>F: rows
  F->>F: planShipment (greedy)
  F->>F: calculateOrderTotals
  F->>F: isOrderValid
  F-->>C: 200 { isValid, shipmentPlan, totals }
```

Verify is stateless and read-only. The plan it returns is a "best-effort
snapshot" — it can be invalidated by another submit landing in the
millisecond between verify and submit. The submit transaction is the
authoritative gate.

## Request lifecycle: submit

```mermaid
sequenceDiagram
  participant C as Client
  participant F as Fastify
  participant S as OrderService
  participant DB as Postgres
  C->>F: POST /api/v1/orders (Idempotency-Key?)
  F->>S: submitOrder(input)
  alt idempotency hit
    S->>DB: SELECT order WHERE idempotency_key = ?
    DB-->>S: existing
    S-->>F: existing
    F-->>C: 201 (replay)
  else fresh
    S->>DB: BEGIN
    S->>DB: SELECT ... FROM warehouses ORDER BY id FOR UPDATE
    DB-->>S: locked rows
    S->>S: planShipment + isOrderValid
    alt infeasible
      S->>DB: ROLLBACK
      S-->>F: throw InsufficientStockError
      F-->>C: 409 + stock snapshot
    else invalid (>15%)
      S->>DB: ROLLBACK
      S-->>F: throw InvalidOrderError
      F-->>C: 422
    else ok
      loop per leg
        S->>DB: UPDATE warehouses SET stock = stock - N WHERE id = ?
      end
      S->>DB: INSERT order RETURNING *
      S->>DB: INSERT shipments
      S->>DB: COMMIT
      S-->>F: order with shipments
      F-->>C: 201
    end
  end
```

## Failure modes

| Failure | Detection | Behavior |
|---|---|---|
| DB unreachable on verify | exception in select | 500 INTERNAL_ERROR (Fastify error handler) |
| DB unreachable on submit | exception in tx open | 500 INTERNAL_ERROR; tx never started, no partial state |
| Stock decremented to negative | CHECK constraint `stock >= 0` | tx rolls back; client gets 500 (invariant violation — should be impossible because of FOR UPDATE re-plan) |
| Concurrent submit wins the race | re-plan returns infeasible | 409 with snapshot of current stock |
| Invalid input | zod validation in route | 400 BAD_REQUEST |
| Idempotency-Key replay | pre-tx lookup | 201 with original payload, no decrement |
| Migration mid-deploy | release_command fails | Fly halts the release; old version stays serving |

## Data flow

```mermaid
flowchart TD
  req[HTTP request] -->|zod| route[route handler]
  route --> domain[pure domain functions]
  route --> service[order-service]
  service -->|drizzle| pg[(postgres)]
  domain --> route
  service --> route
  route --> resp[HTTP response]
```

The pure domain layer is dependency-free. The service layer composes domain
functions inside a transaction. Routes are thin: validate, dispatch, format.

## Locking timeline (concurrent submits)

```
t=0    Tx A   BEGIN; SELECT ... FOR UPDATE  (acquires locks)
t=0    Tx B   BEGIN; SELECT ... FOR UPDATE  (waits on Tx A)
t=10   Tx A   plan ok, decrements, INSERT, COMMIT
t=10   Tx B   acquires locks; re-plans against now-decremented stock
t=10   Tx B   if insufficient, ROLLBACK + 409; else proceeds
```

Because both transactions request locks in the same id order, deadlocks are
impossible.
```

- [ ] **Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: architecture with request lifecycle and failure modes"
```

---

### Task 32: Final verification + submission

- [ ] **Step 1: Run the full local test suite**

```bash
npm test
```

Expected: all unit + integration tests pass; coverage thresholds satisfied.

- [ ] **Step 2: Confirm CI is green on main**

```bash
gh run list --branch main --limit 5
```

Expected: latest CI, E2E, and Deploy runs are all `success`.

- [ ] **Step 3: Confirm production smoke**

```bash
curl -sf https://scos-oms-prod.fly.dev/api/v1/ready
curl -sf -X POST https://scos-oms-prod.fly.dev/api/v1/orders/verify \
  -H content-type:application/json \
  -d '{"quantity": 100, "shippingAddress": {"latitude": 13.7563, "longitude": 100.5018}}'
```

Expected: ready ok; verify returns isValid:true.

- [ ] **Step 4: Update README submission block with the actual repo URL**

```bash
# Edit README.md to fill in the github URL.
git add README.md
git commit -m "docs: pin submission URLs"
git push origin main
```

- [ ] **Step 5: Email Imogen**

Email `imogen.king@screencloud.io` with:
- The GitHub repo URL.
- The Fly.io live URL.
- A one-paragraph note pointing to the README's "Key technical decisions" and `ARCHITECTURE.md`.

---

## Plan self-review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| §2 Domain rules | Tasks 5–9 (rounding, distance, pricing, validator, planner) |
| §3 Tech stack | Tasks 1–3 (skeleton + deps), 10–12 (db), 14 (fastify) |
| §4 Repo layout | Tasks 1–3, 10–14 |
| §5 Schema | Task 11 |
| §6 API | Tasks 14 (health), 16 (verify), 18 (submit), 20 (warehouses), 21 (orders) |
| §7 Transactional submit | Task 17 |
| §8 Production concerns | Documented in README (Task 30) and ARCHITECTURE (Task 31) |
| §9 Local dev | Tasks 10, 24 |
| §10 Testing | Tasks 5–9 (unit), 15–22 (integration), 25 (e2e) |
| §11 CI/CD | Tasks 26 (fly.toml), 27 (ci), 28 (e2e), 29 (deploy) |
| §12 README | Task 30 |
| §13 Implementation order | Followed by phase ordering |
| §14 Code quality | tsconfig + eslint + prettier in Task 3; coverage thresholds in Task 3 vitest config |
| §15 Out of scope | Not implemented (correct) |
| §16 Definition of done | Verified in Task 32 |

No gaps detected.

**Type consistency check:** Schema field names (`orderNumber`, `shippingLat`, `shippingLng`, `*Cents`), error codes (`INSUFFICIENT_STOCK`, `INVALID_ORDER`), and exported function names (`planShipment`, `calculateOrderTotals`, `isOrderValid`, `submitOrder`, `bankersRound`, `haversineKm`) are consistent across all tasks.

**Placeholder scan:** No TBDs, no "implement later" stubs, no "similar to Task N" references.

---
