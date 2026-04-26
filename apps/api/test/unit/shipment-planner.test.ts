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
