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
