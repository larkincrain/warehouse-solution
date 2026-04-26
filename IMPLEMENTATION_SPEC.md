# ScreenCloud Order Management System — Implementation Spec (v2)

> Backend-only spec for the ScreenCloud Staff Engineer take-home challenge. Implements `POST /verify` and `POST /orders` with atomic inventory decrement, plus auxiliary `GET` endpoints reserved as future hook points for a potential frontend (out of scope per the brief). **CI/CD pipeline robustness is the primary staff signal** in this submission, alongside architectural clarity, code quality, and the README.

---

## 1. Context & goals

Backend service for ScreenCloud's internal Order Management System. Sales reps need to:

1. **Verify** a potential order's pricing and validity before committing (stateless calculation).
2. **Submit** an order, which atomically decrements per-warehouse inventory and persists the order with totals calculated at submit time.

The PDF brief explicitly scopes the work to the backend; a frontend is **not** in scope. Auxiliary `GET /orders` and `GET /warehouses` endpoints are kept as documented future hook points so a UI can be added without re-shaping the API.

**Production-system framing.** The brief asks us to consider performance, scalability, consistency, and extensibility. Each is addressed explicitly — see §8.

**Non-goals:** authentication, multi-tenancy, real payment processing, real shipping carrier integration, admin UIs for stock adjustment, the frontend itself.

---

## 2. Domain rules

### Product
- **Name:** SCOS Station P1 Pro
- **Unit price:** $150.00
- **Unit weight:** 365 g (0.365 kg)

### Volume discount tiers
The discount is the **highest single tier reached** by the order quantity (not stacked / not progressive).

| Quantity   | Discount |
|------------|----------|
| <25        | 0%       |
| 25–49      | 5%       |
| 50–99      | 10%      |
| 100–249    | 15%      |
| 250+       | 20%      |

**Worked example.** 150 units × $150 = $22,500 subtotal. Tier reached: 100–249 → 15%. Discount = $3,375.00. Total after discount = $19,125.00.

### Warehouses (fixed seed data)
| ID            | Name        | Latitude    | Longitude    | Initial stock |
|---------------|-------------|-------------|--------------|---------------|
| los-angeles   | Los Angeles | 33.9425     | -118.408056  | 355           |
| new-york      | New York    | 40.639722   | -73.778889   | 578           |
| sao-paulo     | São Paulo   | -23.435556  | -46.473056   | 265           |
| paris         | Paris       | 49.009722   | 2.547778     | 694           |
| warsaw        | Warsaw      | 52.165833   | 20.967222    | 245           |
| hong-kong     | Hong Kong   | 22.308889   | 113.914444   | 419           |

### Distance
- Great-circle distance via the **haversine formula**.
- **Earth radius constant:** `EARTH_RADIUS_KM = 6371` (spherical mean). Defined once in `domain/distance.ts`; never literal-elsewhere.

### Shipping cost
- **Rate:** $0.01 per kilogram per kilometer.
- **Per-leg cost (cents):** `bankers_round(distance_km × units × 0.365 × 0.01 × 100)`.
- **Total shipping cost:** sum of per-leg cents (no further rounding).

### Rounding rule
- Shipping calculations produce fractional cents. We use **banker's rounding** (round half to even, IEEE 754 default).
- **Why banker's:** zero net bias across many orders compared to half-up. Implemented in `domain/rounding.ts`; not delegated to `Math.round` (which is half-up-toward-positive-infinity in JS and biased).

### Shipment planning
- Goal: **minimize total shipping cost** subject to per-warehouse stock constraints.
- **Greedy-by-distance is provably optimal here.** Per-unit shipping cost from each warehouse is a constant (`distance × 0.365 × 0.01`); there are no fixed per-shipment costs and no quantity-tiered shipping rates. So each marginal unit should go to its cheapest available warehouse — exactly what greedy produces. A full proof lives in the planner's docblock.
- **Algorithm.** Sort warehouses ascending by distance. For each in order, allocate `min(remaining_units, warehouse_stock)`. Stop when filled or warehouses exhausted.
- **Tiebreak.** Equal distances are broken alphabetically by warehouse id — deterministic for snapshot tests.
- If total available stock < order quantity, the plan is **infeasible** but a partial allocation is still returned (see verify behavior below).

### Order validity
An order is **invalid** if `totalShippingCost > 0.15 × totalAfterDiscount`. Single check on totals, not per-leg.

### `verify` behavior on invalid orders (deliberate choices — the PDF is silent)
- **Quantity > total stock:** HTTP 200, `isValid: false`, `invalidReason: "Insufficient stock across all warehouses"`, `shipmentPlan` populated with the partial allocation. Rationale: lets the rep see "we could ship 600 of 1000 today — here's where they'd come from."
- **Shipping > 15% of discounted total:** HTTP 200, `isValid: false`, `invalidReason: "Shipping cost exceeds 15% of order total"`, with the optimal `shipmentPlan` still populated. Rationale: the rep can see what was attempted and pivot (smaller order, closer destination).
- **`submit` is strict** on both cases: 422 (invalid order) or 409 (insufficient stock). Verify is informational; submit is authoritative.

### Money handling
- All monetary values are **integer cents** internally (DB columns, domain functions, API responses).
- Floats are forbidden for money. The API returns cents; consumers format for display.
- This is a deliberate production-grade choice not required by the brief; called out for the reviewer.

---

## 3. Tech stack

### Backend (`apps/api`)
- **Runtime:** Node.js 20 LTS (pinned via `.nvmrc` and `engines`)
- **Language:** TypeScript (strict mode, `noUncheckedIndexedAccess: true`)
- **HTTP framework:** Fastify v5
- **ORM:** Drizzle ORM with `pg` (`node-postgres`) driver
- **Migrations:** drizzle-kit
- **Validation:** zod (schemas live in `packages/shared`)
- **API docs:** `@fastify/swagger` + `@fastify/swagger-ui`, schemas derived from zod via `fastify-type-provider-zod`
- **Logging:** pino (Fastify default), structured JSON, request IDs
- **Testing:** vitest + `@vitest/coverage-v8` (unit) + `@testcontainers/postgresql` (integration) + `undici` (e2e)
- **Database:** PostgreSQL 16

### Shared (`packages/shared`)
- All zod request/response schemas + inferred TypeScript types.
- The API consumes them for validation and OpenAPI generation.
- **Reserved as the future API contract package** for a frontend. Publishing-shape today means a UI can be added later without contract-drift bugs — the GET endpoints are already typed end-to-end.

### Infrastructure
- **Local dev:** Docker Compose (postgres + api).
- **CI:** GitHub Actions — see §11 for the full pipeline. **CI/CD is the primary staff signal in this submission.**
- **Cloud deploy:** **Fly.io** (recommended; rationale and alternatives in §11).
- **Package manager:** npm with workspaces.

### Explicitly NOT using
- **Prisma.** Drizzle's first-class `.for('update')` exposes `SELECT FOR UPDATE` in the type system; Prisma forces `$queryRaw` and loses types on exactly the query that matters most here.
- **NestJS** or any opinionated app framework (per the PDF brief).
- **Kubernetes** for this challenge (overkill; mentioned in README "what's next").

---

## 4. Repository layout

```
screencloud-oms/
├── apps/
│   └── api/
│       ├── src/
│       │   ├── server.ts                 # Fastify bootstrap, plugin registration, graceful shutdown
│       │   ├── config.ts                 # env parsing via zod, fail-fast on missing/invalid
│       │   ├── routes/
│       │   │   ├── orders.ts             # POST /verify, POST /, GET /
│       │   │   ├── warehouses.ts         # GET /
│       │   │   └── health.ts             # GET /health, GET /ready
│       │   ├── domain/                   # pure functions, ZERO external deps
│       │   │   ├── distance.ts           # haversine + EARTH_RADIUS_KM
│       │   │   ├── pricing.ts            # discount tiers, totals
│       │   │   ├── shipment-planner.ts   # greedy allocation
│       │   │   ├── order-validator.ts    # 15% rule
│       │   │   └── rounding.ts           # banker's rounding helper
│       │   ├── services/
│       │   │   └── order-service.ts      # transactional submit
│       │   ├── db/
│       │   │   ├── client.ts             # Drizzle client + pg Pool
│       │   │   ├── schema.ts             # Drizzle table definitions
│       │   │   ├── migrate.ts            # programmatic migrate runner (used by release command)
│       │   │   └── seed.ts               # idempotent warehouse seed
│       │   └── errors.ts                 # typed domain errors → HTTP mapping
│       ├── drizzle/                      # generated migration SQL files
│       ├── drizzle.config.ts
│       ├── test/
│       │   ├── unit/
│       │   │   ├── distance.test.ts
│       │   │   ├── pricing.test.ts
│       │   │   ├── shipment-planner.test.ts
│       │   │   ├── order-validator.test.ts
│       │   │   ├── rounding.test.ts
│       │   │   └── errors.test.ts
│       │   ├── integration/
│       │   │   ├── setup.ts              # testcontainers postgres bootstrap, migrations, seed
│       │   │   ├── verify.test.ts
│       │   │   ├── submit.test.ts
│       │   │   ├── concurrency.test.ts   # the race test
│       │   │   ├── orders-list.test.ts
│       │   │   ├── warehouses.test.ts
│       │   │   └── health.test.ts
│       │   └── e2e/
│       │       ├── setup.ts              # boots docker-compose stack, polls /ready
│       │       ├── verify.e2e.test.ts
│       │       ├── submit-flow.e2e.test.ts
│       │       └── idempotency.e2e.test.ts
│       ├── Dockerfile                    # multi-stage: build → node:20-bookworm-slim runner
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts              # coverage thresholds enforced
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── schemas.ts                # zod request/response schemas
│       │   ├── types.ts                  # inferred types
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── .github/
│   └── workflows/
│       ├── ci.yml                        # PR + push: lint, typecheck, unit, integration
│       ├── e2e.yml                       # PR + push: docker-compose e2e suite
│       └── deploy.yml                    # PR (preview) + main (prod): build, push, deploy
├── fly.toml                              # Fly.io app config + release_command for migrations
├── docker-compose.yml                    # local dev: db + api
├── docker-compose.e2e.yml                # CI-friendly variant for the e2e suite
├── package.json                          # workspaces root
├── tsconfig.base.json
├── .nvmrc
├── .gitignore
├── .env.example
├── README.md
└── ARCHITECTURE.md
```

---

## 5. Database schema (Drizzle)

```typescript
// apps/api/src/db/schema.ts
import { pgTable, text, integer, doublePrecision, uuid, timestamp, index, check } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const warehouses = pgTable('warehouses', {
  id: text('id').primaryKey(),                          // 'los-angeles', etc.
  name: text('name').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  stock: integer('stock').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  stockNonNegative: check('warehouses_stock_non_negative', sql`${t.stock} >= 0`),
}));

export const orders = pgTable('orders', {
  // Internal primary key. Used for FK joins.
  id: uuid('id').primaryKey().defaultRandom(),
  // Externally-visible order number. UUID by design decision: globally unique, non-enumerable
  // (no information leak about order volume), no central sequence required, trivial to defend.
  orderNumber: uuid('order_number').notNull().unique().defaultRandom(),
  quantity: integer('quantity').notNull(),
  shippingLat: doublePrecision('shipping_lat').notNull(),
  shippingLng: doublePrecision('shipping_lng').notNull(),
  // PDF requires storing total price, discount, and shipping cost as calculated AT SUBMIT TIME.
  // The four "*Cents" columns below satisfy that requirement.
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

### Schema notes
- **`id` vs `orderNumber`.** Internal joins use `id`. External callers see `orderNumber`. Separation lets us evolve the externally-visible identifier (e.g., to a human-readable ULID) later without disturbing FKs. Both default to `gen_random_uuid()` (Postgres `pgcrypto`).
- **CHECK constraints** are inline via Drizzle's `check()`, not raw SQL post-migration.
- **Indexes:** `orders.created_at` (listing newest-first), `shipments.order_id` (relation join). `idempotency_key` and `order_number` indexed via `unique()`.

### Seeding
The 6 warehouses in §2 are seeded by `apps/api/src/db/seed.ts`. The seed is **idempotent** (`INSERT ... ON CONFLICT DO NOTHING`). Run as a one-shot command before the app starts, never on app boot — see §9 (compose) and §11 (production release command).

---

## 6. API specification

Base path: `/api/v1`. All requests/responses are JSON. Schemas defined once in `packages/shared/src/schemas.ts` and validated end-to-end via zod. The `/api/v1` prefix is a deliberate choice to keep a clean migration path for future breaking changes.

### `POST /api/v1/orders/verify`
Stateless calculation. Does not modify any data.

**Request:**
```json
{ "quantity": 150, "shippingAddress": { "latitude": 13.7563, "longitude": 100.5018 } }
```

**200:**
```json
{
  "quantity": 150,
  "totalBeforeDiscountCents": 2250000,
  "discountCents": 337500,
  "discountPercent": 15,
  "totalAfterDiscountCents": 1912500,
  "shippingCostCents": 28456,
  "isValid": true,
  "invalidReason": null,
  "shipmentPlan": [
    {
      "warehouseId": "hong-kong",
      "warehouseName": "Hong Kong",
      "warehouseLatitude": 22.308889,
      "warehouseLongitude": 113.914444,
      "quantity": 150,
      "distanceKm": 1690.4,
      "shippingCostCents": 9255
    }
  ]
}
```

For the two invalid cases (insufficient stock; shipping > 15%), see §2 — the response is still 200 with `isValid: false` and the best-attempted plan included.

### `POST /api/v1/orders`
Submits and persists an order. Atomically decrements warehouse stock.

**Headers:**
- `Idempotency-Key: <uuid>` (optional). Production-grade addition not required by the brief; documented in the README under "decisions."

**Request:** same as verify.

**201:** verify response shape, plus:
```json
{
  "id": "uuid",
  "orderNumber": "uuid",
  "createdAt": "2026-04-25T10:30:00.000Z"
}
```

**409 Conflict** — insufficient stock at submission time. Body includes a current stock snapshot:
```json
{
  "error": "INSUFFICIENT_STOCK",
  "message": "...",
  "availableStock": [{ "warehouseId": "...", "stock": 123 }]
}
```

**422 Unprocessable Entity** — order is invalid (shipping > 15%):
```json
{ "error": "INVALID_ORDER", "message": "Shipping cost exceeds 15% of order total" }
```

**Idempotency:** if `Idempotency-Key` matches a previously-submitted order, return the original 201 response. No new order, no stock decrement.

### `GET /api/v1/warehouses` — *future-frontend hook*
Returns all warehouses with current stock. Not required by the brief; kept so a UI (or ops tooling) can display state without re-querying internals.

### `GET /api/v1/orders` — *future-frontend hook*
Cursor-paginated, newest first. Each order embeds its shipments with denormalized warehouse details.

**Query params:** `?limit=50&cursor=<orderId>`

```json
{
  "orders": [{
    "id": "...", "orderNumber": "...", "quantity": 150,
    "shippingAddress": { "latitude": ..., "longitude": ... },
    "totalBeforeDiscountCents": ..., "discountCents": ...,
    "totalAfterDiscountCents": ..., "shippingCostCents": ...,
    "createdAt": "...",
    "shipments": [{ "warehouseId": "...", "warehouseName": "...", "quantity": ..., "distanceKm": ..., "shippingCostCents": ... }]
  }],
  "nextCursor": "..." | null
}
```

### `GET /api/v1/health` and `GET /api/v1/ready`
- `/health` → 200 always (liveness).
- `/ready` → 200 if DB connection succeeds, 503 otherwise (readiness). Used by Fly.io's load balancer for traffic gating and by the e2e harness to know when to start.

### OpenAPI / Swagger
Interactive docs at `/docs` in non-production. Production exposes the JSON spec only (no UI), useful for client codegen.

---

## 7. The transactional submit (the most-scrutinized code)

```typescript
// apps/api/src/services/order-service.ts
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { warehouses, orders, shipments } from '../db/schema';
import { planShipment } from '../domain/shipment-planner';
import { calculateOrderTotals } from '../domain/pricing';
import { isOrderValid } from '../domain/order-validator';
import { InsufficientStockError, InvalidOrderError } from '../errors';

export async function submitOrder(input: {
  quantity: number;
  shippingLat: number;
  shippingLng: number;
  idempotencyKey?: string;
}) {
  // Idempotency short-circuit BEFORE the transaction.
  if (input.idempotencyKey) {
    const existing = await db.query.orders.findFirst({
      where: eq(orders.idempotencyKey, input.idempotencyKey),
      with: { shipments: { with: { warehouse: true } } },
    });
    if (existing) return existing;
  }

  return db.transaction(async (tx) => {
    // 1. Lock warehouse rows in a deterministic order to prevent deadlocks
    //    between concurrent submits. .for('update') is Drizzle's first-class
    //    SELECT FOR UPDATE.
    const lockedWarehouses = await tx
      .select()
      .from(warehouses)
      .orderBy(asc(warehouses.id))
      .for('update');

    // 2. Plan against the freshly locked stock snapshot — the verify-time plan
    //    may be stale by the time submit lands.
    const plan = planShipment(
      input.quantity,
      { lat: input.shippingLat, lng: input.shippingLng },
      lockedWarehouses,
    );

    if (!plan.feasible) {
      throw new InsufficientStockError(
        lockedWarehouses.map(w => ({ warehouseId: w.id, stock: w.stock })),
      );
    }

    const totals = calculateOrderTotals(input.quantity);
    if (!isOrderValid(plan.shippingCostCents, totals.totalAfterDiscountCents)) {
      throw new InvalidOrderError('Shipping cost exceeds 15% of order total');
    }

    // 3. Decrement stock per leg using a SQL expression — never read-then-write.
    //    Even though we hold the row lock, this is the correct pattern to internalize
    //    and survives a future refactor that drops the lock.
    for (const leg of plan.legs) {
      await tx
        .update(warehouses)
        .set({ stock: sql`${warehouses.stock} - ${leg.quantity}` })
        .where(eq(warehouses.id, leg.warehouseId));
    }

    // 4. Insert order + shipments. orderNumber is generated by the DB default (UUID).
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

    await tx.insert(shipments).values(
      plan.legs.map(leg => ({
        orderId: created.id,
        warehouseId: leg.warehouseId,
        quantity: leg.quantity,
        distanceKm: leg.distanceKm,
        shippingCostCents: leg.shippingCostCents,
      })),
    );

    // Re-fetch with relations for the response.
    return tx.query.orders.findFirst({
      where: eq(orders.id, created.id),
      with: { shipments: { with: { warehouse: true } } },
    });
  }, { isolationLevel: 'read committed' });
}
```

**Critical details:**
- `.orderBy(asc(warehouses.id))` BEFORE `.for('update')` — consistent lock ordering prevents deadlocks between concurrent submits.
- Re-plan inside the transaction against locked rows.
- `sql\`${warehouses.stock} - ${leg.quantity}\`` for the decrement, not a read-then-write.
- `read committed` isolation is sufficient because explicit row locks give serializable behavior on the rows we care about.
- `orderNumber` collisions are cosmologically negligible (UUIDv4); no retry path needed.

---

## 8. Production concerns

The brief explicitly asks us to consider **performance, scalability, consistency, and extensibility**. Each is addressed below; the README condenses these into reviewer-facing prose.

### Consistency
- Pessimistic row locking via Drizzle's `.for('update')` inside a transaction.
- Locks acquired in deterministic warehouse-ID order — eliminates the deadlock risk between concurrent submits.
- Plan recomputed against locked rows since the verify-time plan may be stale.
- `read committed` isolation — sufficient with explicit row locks; `serializable` would add overhead for no extra safety on the rows we actually modify.
- Stock decrements use SQL expressions, not read-then-write — defends against a future refactor that drops the lock.

### Performance
- Indexes: `orders.created_at` (listing), `shipments.order_id` (relation join), `orders.idempotency_key` (unique), `orders.order_number` (unique). At W=6 warehouses, the planner's O(W log W) is irrelevant.
- The transactional submit holds 6 row locks for ~10 ms typical (single-region Postgres).
- Connection pool: `pg.Pool` with `max=10` on a small Fly.io machine; tune by `vCPU × 2` in production.

### Scalability
- **Where pessimistic locking breaks down.** When per-warehouse contention exceeds ~100 submits/sec, lock waits dominate. Two evolution paths:
  1. **Optimistic versioning.** Replace `FOR UPDATE` with a `version` column + `UPDATE ... WHERE version = ?` + retry on conflict. Higher throughput at scale; needs a client-side retry budget.
  2. **Sharded inventory.** Split each warehouse's stock into N rows (e.g., one per pallet); allocate against shards in random order. Reduces contention by ~N×.
- **Read scaling.** `GET /orders` and `GET /warehouses` can route to a Postgres read replica behind a separate `db.read` client — schema unchanged.
- **Horizontal API scaling.** Stateless API; scale to N replicas behind Fly.io's load balancer with no coordination required.

### Extensibility
- Single-product hardcoding lives in two named constants (`UNIT_PRICE_CENTS`, `UNIT_WEIGHT_KG`). Domain functions take their inputs explicitly — no globals.
- Multi-product migration path is mechanical: `products` table with `(id, name, unit_price_cents, unit_weight_g)`; `orders`/`shipments` grow a `product_id` FK; domain functions take a `product` argument. **The change is a schema migration + signature change, not a rewrite.**
- New rules (per-region pricing, time-bounded promos) slot in as additional parameters or new pure functions.

### Observability
- Pino structured JSON logs with request IDs (Fastify default).
- `/health` (liveness) and `/ready` (readiness) endpoints.
- "What's next" in the README covers OpenTelemetry traces, RED metrics, and per-warehouse fulfillment dashboards.

---

## 9. Local development setup

### `docker-compose.yml`
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
    # Migrations and seed run as separate one-shot commands BEFORE the app starts —
    # never on app boot. Mirrors the production release_command in fly.toml.
    command: >
      sh -c "npm run db:migrate -w @scos/api &&
             npm run db:seed -w @scos/api &&
             node apps/api/dist/server.js"

volumes:
  pgdata:
```

### Goal: `docker compose up` and the system works
- Postgres provisioned and healthy.
- Migrations applied.
- Warehouses seeded (idempotent).
- API on http://localhost:3000 with `/docs` available.

### `.env.example`
```
DATABASE_URL=postgresql://scos:scos@localhost:5432/scos
PORT=3000
NODE_ENV=development
```

### npm scripts (root)
```json
{
  "scripts": {
    "dev": "npm run dev --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "npm run test:e2e -w @scos/api",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

### npm scripts (apps/api)
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run --coverage",
    "test:unit": "vitest run test/unit --coverage",
    "test:integration": "vitest run test/integration",
    "test:e2e": "vitest run test/e2e",
    "lint": "eslint src test",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

---

## 10. Testing strategy

The brief allows minimal coverage but **this submission targets full line + branch coverage** for `domain/` and `services/`. The test plan itself is a staff signal — it demonstrates how I think about correctness across pure-functional, real-DB, and black-box layers.

### Coverage thresholds (enforced in `vitest.config.ts`)
```typescript
coverage: {
  provider: 'v8',
  thresholds: {
    'src/domain/**':   { lines: 100, branches: 100, functions: 100 },
    'src/services/**': { lines: 95,  branches: 90,  functions: 100 },
    'src/routes/**':   { lines: 90,  branches: 85,  functions: 100 },
    'src/lib/**':      { lines: 100, branches: 100, functions: 100 },
    'src/errors.ts':   { lines: 100, branches: 100, functions: 100 },
  },
}
```
Build fails if thresholds drop. CI publishes a coverage report as a workflow artifact.

### Unit tests (`test/unit/`) — fast, no DB
- `distance.test.ts`: known city pairs (LA→NY ~3935 km, Paris→Warsaw ~1366 km), antipodes, identical points, equator pairs, both poles, the international date line.
- `pricing.test.ts`: every discount tier boundary (24→0%, 25→5%, 49→5%, 50→10%, 99→10%, 100→15%, 249→15%, 250→20%, 1000→20%); integer-cent invariants.
- `shipment-planner.test.ts`:
  - Single-warehouse fulfillment (small order, plenty of stock).
  - Multi-warehouse split when nearest is short.
  - Picks nearest warehouse when multiple have stock.
  - Returns infeasible when total stock < quantity (with partial allocation populated).
  - Total of leg quantities equals order quantity (when feasible).
  - Empty warehouses input.
  - Tied distances → deterministic alphabetical tiebreak.
- `order-validator.test.ts`: exactly 15.0% (valid, boundary), 15.001% (invalid), zero shipping (valid), zero order amount (edge).
- `rounding.test.ts`: half-down, half-up at .5 (banker's expectations), negatives, integer passthrough.
- `errors.test.ts`: each typed error maps to the correct HTTP status code via the route error handler.

### Integration tests (`test/integration/`) — real Postgres via testcontainers
- Shared container per test file with `TRUNCATE ... RESTART IDENTITY CASCADE` between tests.
- `verify.test.ts`: response shape matches schema; insufficient stock → 200 + `isValid:false` + partial plan; shipping > 15% → 200 + `isValid:false` + plan present.
- `submit.test.ts`: success decrements stock correctly; idempotency-key replay returns same `orderNumber` without re-decrementing; 422 on shipping > 15%; 409 on insufficient stock with stock snapshot in body.
- `concurrency.test.ts` — **the most important test**:
  - Seed warehouses with stock that exactly fulfills one of two parallel orders.
  - Fire two `submitOrder` calls via `Promise.all`.
  - Assert: exactly one succeeds; exactly one throws `InsufficientStockError`; total final stock = initial − winning_order.quantity.
  - Run **10 iterations locally**; CI runs **50 iterations** to catch flakiness.
- `orders-list.test.ts`: pagination cursor walks the full set newest-first; empty case returns empty array; cursor-after-end returns empty + null nextCursor.
- `warehouses.test.ts`: returns all 6 with current stock; reflects post-submit decrement.
- `health.test.ts`: `/health` always 200; `/ready` returns 503 when DB pool is shut down.

### E2E tests (`test/e2e/`) — black-box against compose stack
Run via `docker compose -f docker-compose.e2e.yml up -d && vitest run test/e2e`. Test the full HTTP boundary including Fastify, OpenAPI validation, error mapping, and headers. Slower (~30 s startup) — runs as a separate CI job.
- `verify.e2e.test.ts`: round-trip the verify endpoint with realistic payloads; validate against the published OpenAPI schema.
- `submit-flow.e2e.test.ts`: submit → list → fetch by id → verify stock decrement visible via `GET /warehouses`.
- `idempotency.e2e.test.ts`: two POSTs with the same `Idempotency-Key` return identical bodies and identical IDs; a third POST with a different key creates a new order.

### What NOT to test
- Drizzle internals.
- Fastify framework behavior.
- Trivial getters/setters.
- Visual / frontend behavior (no frontend in this submission).

---

## 11. CI/CD — the staff signal

The brief flags CI/CD as "a plus." This submission treats it as a primary deliverable. The pipeline below demonstrates production rigor: parallelism, caching, layered test stages, image build with provenance, preview environments, gated production deploys, migration safety, and rollback.

### Pipeline overview
```
PR opened ──► ci.yml ─────────┬─► lint
                              ├─► typecheck
                              ├─► unit tests (with coverage thresholds)
                              └─► integration tests (testcontainers postgres)

PR opened ──► e2e.yml ────────► docker-compose stack ──► e2e suite

PR opened ──► deploy.yml ─────► build + push image ──► Fly.io PREVIEW deploy
                                                       (sticky URL per PR, ephemeral DB)

merge to main ──► deploy.yml ─► build + push image ──► Fly.io PRODUCTION deploy
                                                       ├─► release_command runs migrations
                                                       ├─► smoke test against /ready
                                                       └─► auto-rollback on failure
```

### `.github/workflows/ci.yml`
- **Triggers:** PR + push to main.
- **Concurrency:** group per ref with `cancel-in-progress: true` — superseded runs die instantly.
- **Caching:** `actions/setup-node` with `cache: 'npm'`; Drizzle migration files cached by hash.
- **Jobs (parallel where possible):**
  1. `lint` — eslint with `@typescript-eslint/recommended-type-checked`.
  2. `typecheck` — `tsc --noEmit` in every workspace.
  3. `unit` — `vitest run test/unit --coverage` with thresholds enforced. Uploads coverage as an artifact.
  4. `integration` — `vitest run test/integration` (testcontainers spins postgres on the runner). The concurrency test runs 50× via `vitest --repeats=50`.
- All jobs must pass for merge. Required status checks enforced via branch protection.

### `.github/workflows/e2e.yml`
- Boots `docker-compose.e2e.yml` (db + api), polls `/ready` until 200, runs the e2e suite, tears down.
- Lives in its own workflow because the runtime profile differs — slower, network-bound; isolating it keeps the fast feedback loop fast.

### `.github/workflows/deploy.yml`
- **Triggers:** PR (preview) + push to main (production).
- **Steps:**
  1. Build the multi-stage Dockerfile (Node build → `node:20-bookworm-slim` runner). **Bookworm-slim is preferred over distroless for this challenge** because it includes a shell — needed by the compose `command:` chain and Fly's `release_command` to sequence `npm run db:migrate && npm run db:seed && node ...`. Distroless would force shifting all sequencing into a wrapper script or release pipeline step, adding moving parts for no real benefit at this scale.
  2. Push to GHCR with tags `:sha-<short>`, `:branch-<name>`, plus `:latest` on main.
  3. Deploy:
     - **PR:** `flyctl deploy --app scos-oms-pr-${{ github.event.number }}` — ephemeral preview app with its own throwaway DB. Bot comments the URL on the PR.
     - **main:** `flyctl deploy --app scos-oms-prod` — production.
  4. Post-deploy smoke test: `GET /api/v1/ready` until 200 or fail.
  5. On failure, `flyctl releases rollback` automatically.
- Production deploys are gated by a GitHub Environment (`production`) with optional required reviewers.
- **Migrations run via `release_command` in `fly.toml`** — they execute on a one-shot machine BEFORE traffic shifts to the new release. App boot never runs migrations. This is the standard "migrate before deploy" pattern and is the single most important CI/CD detail in the spec.

### Recommended cloud provider: **Fly.io**
- **Why Fly:**
  - Docker-native deploys (matches our local stack 1:1).
  - Managed Postgres add-on (`fly postgres create`).
  - Multi-region machines (good talking point for a global-warehouse domain).
  - `release_command` primitive handles migration safety natively.
  - Single CLI, no IAM ceremony, generous free tier suitable for a demo.
- **Alternatives considered:**
  - **Render** — even simpler UX, similar primitives, less control over the release pipeline.
  - **AWS ECS Fargate** — production credibility, but the IAM/VPC/RDS setup balloons the spec for marginal gain on a take-home.
  - **Google Cloud Run** — serverless containers, excellent for stateless APIs; DB hookup adds Cloud SQL Auth Proxy or VPC connectors.
- The README explains this decision; the deploy workflow is a thin `flyctl` wrapper that's trivial to swap.

### Branch protection (configured in repo)
- `main` requires: `ci.yml` green, `e2e.yml` green, ≥1 review.
- Linear history (no merge commits).
- Auto-delete head branch on merge.

---

## 12. README structure (a meaningful portion of the grade)

```markdown
# ScreenCloud OMS — Backend

Backend service for ScreenCloud's sales-team Order Management System. Implements
order verification and atomic submission across 6 global warehouses.

## Live demo
- Production: https://scos-oms-prod.fly.dev
- API docs:   https://scos-oms-prod.fly.dev/docs

## Quick start
```
docker compose up
# API on http://localhost:3000
# Swagger UI at http://localhost:3000/docs
```

## Architecture overview
[Mermaid sequence diagrams: verify flow; submit flow with row locks]
[2–3 paragraphs on the major design moves]

## Key technical decisions

### Backend-only scope (per the brief)
The challenge scopes work to the backend. Auxiliary `GET /orders` and `GET /warehouses`
endpoints are kept as documented future hook points so a UI can be added later
without re-shaping the API contract.

### Why Fastify over Express
Modern TypeScript-first framework, built-in schema validation, faster.
Schema → OpenAPI generation comes free via @fastify/swagger.

### Why Drizzle over Prisma
This problem hinges on atomic inventory decrements under concurrent load.
SELECT ... FOR UPDATE is the right tool, and Drizzle exposes it as a
first-class .for('update') on the query builder — no raw SQL escape hatch,
full type safety on locked rows. Prisma supports row locks only via
$queryRaw, losing types on exactly the query that most needs them.

### Greedy shipment planner (provably optimal)
Per-unit shipping cost from each warehouse is constant
(distance × 0.365 kg × $0.01/kg/km), no fixed per-shipment costs.
Greedy-by-distance is therefore provably optimal. A tiered or carrier-
integrated formulation would become Min-Cost Flow / LP — out of scope.

### Money in integer cents (banker's rounding)
Floats forbidden for money. All persistence and computation use integer
cents. Banker's rounding is applied at calculation boundaries to avoid
half-up bias accumulation.

### UUID order numbers
Defensible: globally unique, non-enumerable (no information leak about
order volume), no central sequence required. `id` (internal PK) and
`orderNumber` (external) are kept separate so the externally-visible
format can evolve without disturbing FKs.

### Concurrency model
Pessimistic row locking via Drizzle's `.for('update')` inside a
transaction. Locks acquired in deterministic warehouse-ID order to
prevent deadlocks. Plan recomputed against locked rows since the
verify-time plan may be stale. Read-committed isolation is sufficient
because the row locks give us serializable behavior on the rows we modify.

### Idempotency-Key (production polish)
Not required by the brief. Implemented because retries are inevitable
in distributed systems and the cost of doing it right up front is small.

### Shared zod schemas
The `packages/shared` workspace defines all request/response shapes once.
Today the API consumes them for validation and OpenAPI generation;
tomorrow a frontend can consume them for forms and types — the
GET endpoints are already typed end-to-end.

## CI/CD
[link to workflows; explain the 3-workflow split: ci, e2e, deploy]
[explain release_command pattern for migration safety]
[explain preview deploys per PR]

## Production concerns
[condensed scaling/extensibility paragraphs from spec §8]

## API documentation
Swagger UI at /docs.

## Testing
- `npm test`        — unit + integration with coverage thresholds enforced
- `npm run test:e2e` — e2e against docker-compose stack
- Concurrency stress test for atomic stock decrement, run 50× in CI

## What I'd do next (with more time)
- Optimistic locking alternative (version column + retry).
- Outbox pattern for downstream events (fulfillment, analytics).
- Redis cache for warehouse list with invalidation on stock changes.
- Auth + per-rep rate limits.
- OpenTelemetry traces, Prometheus metrics, structured request IDs.
- Property-based tests on the planner via fast-check.
- Real carrier integration; planner becomes min-cost flow.
- Admin endpoints (manual stock adjustment, refunds).
- Real-time stock updates via SSE.
- Multi-product (schema generalization is small).
- The frontend itself (the auxiliary GET endpoints are already in place).

## Submission
- Repository: <github-url>
- Live deploy: <fly-url>
- Email: imogen.king@screencloud.io
```

A short `ARCHITECTURE.md` complements the README for the follow-up interview discussion: request lifecycle for verify, request lifecycle for submit (with mermaid sequence diagram), failure modes, data flow, the locking timeline.

---

## 13. Implementation order

Build in this order to maximize the chance of having a working CI'd, deployed system:

1. **Monorepo skeleton.** Workspaces, shared package with one zod schema, api workspace builds "hello world", minimal Dockerfile.
2. **Domain functions + unit tests.** distance, pricing, shipment-planner, order-validator, rounding. All pure, all 100% covered. Algorithmic core first.
3. **Drizzle schema + migration + seed.** Confirm `docker compose up db` + migrate + seed works.
4. **API: verify endpoint** wired to domain. OpenAPI/Swagger working at `/docs`.
5. **API: submit endpoint with transaction.** Then write the concurrency integration test with the 50-iteration loop.
6. **API: list endpoints** (orders, warehouses) — future-frontend hooks.
7. **Health/ready endpoints + observability wiring.**
8. **E2E suite** against the compose stack.
9. **Dockerfile** (multi-stage → `node:20-bookworm-slim` runner; shell included so compose `command:` chains and Fly `release_command` can sequence migrate → seed → start) + **`fly.toml`** with `release_command` for migrations.
10. **CI workflows** (ci.yml, e2e.yml, deploy.yml). Verify preview deploys land per PR.
11. **README + ARCHITECTURE.md.** Block out time; this is meaningful grade weight.
12. **Production deploy.** Run a smoke verify+submit against the live URL; link from the README.

---

## 14. Code quality bar

- TypeScript `strict: true` in every workspace; `noUncheckedIndexedAccess: true`.
- ESLint with `@typescript-eslint/recommended-type-checked`; `eslint-plugin-import` for ordering.
- Prettier (single quotes, trailing commas, 2-space indent).
- No `any` (linter-enforced); intentional escape hatches use `unknown` + narrowing and a justifying comment.
- All exported functions in `domain/` have JSDoc explaining inputs, outputs, and any non-obvious behavior.
- All errors are typed (custom error classes), not strings; central error → HTTP mapping in `errors.ts`.
- No `console.log` in committed code (eslint-no-console). Use `req.log.info()` / `app.log.info()`.
- All env vars parsed and validated at startup via zod (`config.ts`); fail-fast on missing/invalid.
- Coverage thresholds enforced in CI (see §10).

---

## 15. Out of scope (do NOT implement)

- **Frontend** (deliberately — see §1 framing; the GET endpoints remain as future hooks).
- Authentication / authorization.
- Rate limiting.
- Multiple products / SKUs (extensibility path documented in §8).
- Real payment processing.
- Real shipping carrier integration.
- Email notifications.
- Admin UI for stock adjustments.
- Internationalization.

If any of these come up while implementing, note them in the README's "what's next" section.

---

## 16. Definition of done

- [ ] `docker compose up` brings up a working backend from a clean clone.
- [ ] `POST /verify` and `POST /orders` implemented and documented at `/docs`.
- [ ] Auxiliary `GET /orders`, `GET /warehouses`, `/health`, `/ready` implemented as future-frontend hooks.
- [ ] Unit tests cover `domain/` at 100% line + branch.
- [ ] Integration tests cover all routes against real Postgres via testcontainers.
- [ ] Concurrency integration test passes 50× consecutively in CI.
- [ ] E2E tests pass against docker-compose stack.
- [ ] Coverage thresholds enforced in `vitest.config.ts`; CI fails on drop.
- [ ] CI workflows green: `ci.yml` (lint, typecheck, unit, integration), `e2e.yml`, `deploy.yml`.
- [ ] Deploy workflow lands a preview environment per PR and a production deploy on main merge.
- [ ] Migrations run via Fly's `release_command`, never on app boot.
- [ ] Production smoke test (verify + submit) succeeds against the live URL.
- [ ] README covers architecture, decisions, CI/CD, deploy URL, and submission instructions.
- [ ] `ARCHITECTURE.md` includes mermaid sequence diagrams for verify and submit.
- [ ] No committed `.env` files, secrets, or `node_modules`.
