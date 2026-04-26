CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" uuid DEFAULT gen_random_uuid() NOT NULL,
	"quantity" integer NOT NULL,
	"shipping_lat" double precision NOT NULL,
	"shipping_lng" double precision NOT NULL,
	"total_before_discount_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"total_after_discount_cents" integer NOT NULL,
	"shipping_cost_cents" integer NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "orders_quantity_positive" CHECK ("orders"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"warehouse_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"distance_km" double precision NOT NULL,
	"shipping_cost_cents" integer NOT NULL,
	CONSTRAINT "shipments_quantity_positive" CHECK ("shipments"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"stock" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_stock_non_negative" CHECK ("warehouses"."stock" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipments" ADD CONSTRAINT "shipments_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shipments_order_id_idx" ON "shipments" USING btree ("order_id");