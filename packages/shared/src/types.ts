import type { z } from 'zod';
import * as S from './schemas.js';

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
