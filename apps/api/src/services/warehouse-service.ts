import type { WarehouseRepository, WarehouseRow } from '../repositories/warehouse-repository.js';

export function createWarehouseService(deps: { warehouses: WarehouseRepository }) {
  return {
    listAll: (): Promise<WarehouseRow[]> => deps.warehouses.listAll(),
  };
}

export type WarehouseService = ReturnType<typeof createWarehouseService>;
