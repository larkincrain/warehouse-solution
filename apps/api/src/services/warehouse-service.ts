import type { WarehouseRepository, WarehouseRow } from '../repositories/warehouse-repository.js';

export function createWarehouseService(deps: { warehouses: WarehouseRepository }) {

  return {

    // Get all warehouses
    listAll: (): Promise<WarehouseRow[]> => deps.warehouses.listAll(),

  };

}

export type WarehouseService = ReturnType<typeof createWarehouseService>;
