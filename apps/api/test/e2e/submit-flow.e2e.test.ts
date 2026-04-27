import { beforeAll, describe, expect, it } from 'vitest';
import { get, post, waitForReady } from './setup.js';

beforeAll(async () => { await waitForReady(); }, 60_000);

describe('e2e: submit → list → warehouse decrement', () => {

  it('creates an order and the warehouse stock reflects the decrement', async () => {

    const before = await get<{ id: string; stock: number }[]>('/api/v1/warehouses');
    const hkBefore = before.body.find((w) => w.id === 'hong-kong')!.stock;

    const submit = await post<{ id: string; orderNumber: string }>(
      '/api/v1/orders',
      { 
        quantity: 25, 
        shippingAddress: { 
          latitude: 13.7563, 
          longitude: 100.5018 
        } 
      },
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
