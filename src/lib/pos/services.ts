import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PosClient = SupabaseClient<Database>;

export interface SaleItemInput {
  productId: string;
  stock: number;
  quantity: number;
  unitPrice: number;
}

export interface ProcessSaleInput {
  customerId: string | null;
  processedBy: string;
  notes: string | null;
  items: SaleItemInput[];
}

export interface RefundLineInput {
  cartId: string;
  processedBy: string | null | undefined;
  soldProductId: string;
  productId: string | null;
  soldQuantity: number;
  refundedQuantity: number;
  quantity: number;
  unitPrice: number;
}

export interface RefundCartInput {
  cartId: string;
  processedBy: string | null | undefined;
}

export interface ProductPayloadWithCategory {
  category_id: string | null;
  attributes: Record<string, string | number | boolean>;
}

interface StockChange {
  productId: string;
  beforeStock: number;
  afterStock: number;
}

interface RefundItemInput {
  soldProductId: string;
  productId: string | null;
  quantity: number;
  unitPrice: number;
}

interface CartLineItemRow {
  sold_product_id: string | null;
  product_id: string | null;
  sold_quantity: number | null;
  refunded_quantity: number | null;
  unit_price: number | null;
}

export function calculateSaleTotal(items: SaleItemInput[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function sanitizeProductPayload<T extends ProductPayloadWithCategory>(payload: T): T {
  if (payload.category_id) {
    return payload;
  }

  return {
    ...payload,
    attributes: {},
  };
}

export async function processSale(
  input: ProcessSaleInput,
  client: PosClient = supabase,
): Promise<{ cartId: string; total: number }> {
  validateSaleInput(input.items);

  const total = calculateSaleTotal(input.items);
  const appliedStockChanges: StockChange[] = [];
  let cartId: string | null = null;

  try {
    const { data: cartData, error: cartError } = await client
      .from("carts")
      .insert({
        customer_id: input.customerId,
        processed_by: input.processedBy,
        notes: input.notes,
        status: "pending",
        total,
      })
      .select("id")
      .single();

    if (cartError) throw cartError;
    if (!cartData?.id) throw new Error("Failed to create cart");
    cartId = cartData.id;

    const soldItems = input.items.map((item) => ({
      cart_id: cartId,
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
    }));

    const { error: soldError } = await client.from("sold_products").insert(soldItems);
    if (soldError) throw soldError;

    await applySaleStockDeductions(input.items, appliedStockChanges, client);

    const { error: completeError } = await client
      .from("carts")
      .update({ status: "completed", total })
      .eq("id", cartId);

    if (completeError) throw completeError;

    return { cartId, total };
  } catch (error) {
    await restoreAppliedStock(appliedStockChanges, client);
    if (cartId) {
      await cleanupPendingSale(cartId, client);
    }
    throw normalizeSaleError(error);
  }
}

export async function refundCart(
  input: RefundCartInput,
  client: PosClient = supabase,
): Promise<{ refundId: string; refundAmount: number }> {
  const { data, error } = await client
    .from("cart_line_items")
    .select("sold_product_id, product_id, sold_quantity, refunded_quantity, unit_price")
    .eq("cart_id", input.cartId);

  if (error) throw error;
  const lineItems = (data || []) as CartLineItemRow[];
  if (lineItems.length === 0) {
    throw new Error("No products found in cart");
  }

  const refundItems = lineItems
    .map((item) => ({
      soldProductId: item.sold_product_id,
      productId: item.product_id,
      quantity: (item.sold_quantity || 0) - (item.refunded_quantity || 0),
      unitPrice: item.unit_price || 0,
    }))
    .filter((item): item is RefundItemInput => !!item.soldProductId && item.quantity > 0);

  if (refundItems.length === 0) {
    throw new Error("All items have already been fully refunded");
  }

  return createRefund(
    {
      cartId: input.cartId,
      processedBy: input.processedBy,
      items: refundItems,
    },
    client,
  );
}

export async function refundLineItem(
  input: RefundLineInput,
  client: PosClient = supabase,
): Promise<{ refundId: string; refundAmount: number }> {
  const remainingQuantity = input.soldQuantity - input.refundedQuantity;

  if (input.quantity < 1) {
    throw new Error("Refund quantity must be at least 1");
  }

  if (input.quantity > remainingQuantity) {
    throw new Error("Refund quantity exceeds remaining quantity");
  }

  return createRefund(
    {
      cartId: input.cartId,
      processedBy: input.processedBy,
      items: [
        {
          soldProductId: input.soldProductId,
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
        },
      ],
    },
    client,
  );
}

function validateSaleInput(items: SaleItemInput[]) {
  if (items.length === 0) {
    throw new Error("Cart is empty");
  }

  const invalidItem = items.find((item) => item.quantity < 1 || item.unitPrice < 0);
  if (invalidItem) {
    throw new Error("Cart contains invalid items");
  }

  const outOfStockItem = items.find((item) => item.quantity > item.stock);
  if (outOfStockItem) {
    throw new Error("Insufficient stock for one or more items.");
  }
}

async function applySaleStockDeductions(
  items: SaleItemInput[],
  appliedStockChanges: StockChange[],
  client: PosClient,
) {
  const productIds = [...new Set(items.map((item) => item.productId))];
  const { data, error } = await client.from("products").select("id, stock").in("id", productIds);

  if (error) throw error;

  const stockByProductId = new Map((data || []).map((product) => [product.id, product.stock]));
  const quantityByProductId = items.reduce((map, item) => {
    map.set(item.productId, (map.get(item.productId) || 0) + item.quantity);
    return map;
  }, new Map<string, number>());

  for (const [productId, quantity] of quantityByProductId) {
    const beforeStock = stockByProductId.get(productId);
    if (beforeStock === undefined) {
      throw new Error("One or more products could not be found.");
    }

    const afterStock = beforeStock - quantity;
    if (afterStock < 0) {
      throw new Error("Insufficient stock for one or more items.");
    }

    const { error: updateError } = await client.from("products").update({ stock: afterStock }).eq("id", productId);
    if (updateError) throw updateError;

    appliedStockChanges.push({ productId, beforeStock, afterStock });
  }
}

async function createRefund(
  input: {
    cartId: string;
    processedBy: string | null | undefined;
    items: RefundItemInput[];
  },
  client: PosClient,
): Promise<{ refundId: string; refundAmount: number }> {
  const refundAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  if (refundAmount <= 0) {
    throw new Error("Refund amount must be greater than zero");
  }

  const { data: refundData, error: refundError } = await client
    .from("refunds")
    .insert({
      cart_id: input.cartId,
      refund_amount: refundAmount,
      processed_by: input.processedBy || null,
    })
    .select("id")
    .single();

  if (refundError) throw refundError;
  if (!refundData?.id) throw new Error("Failed to create refund record");

  const refundItems = input.items.map((item) => ({
    refund_id: refundData.id,
    sold_product_id: item.soldProductId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
  }));

  const { error: itemError } = await client.from("refund_items").insert(refundItems);
  if (itemError) throw itemError;

  await restoreRefundedStock(input.items, client);

  return { refundId: refundData.id, refundAmount };
}

async function restoreRefundedStock(items: RefundItemInput[], client: PosClient) {
  const restockItems = items.filter((item) => !!item.productId);
  if (restockItems.length === 0) return;

  const productIds = [...new Set(restockItems.map((item) => item.productId as string))];
  const { data, error } = await client.from("products").select("id, stock").in("id", productIds);

  if (error) throw error;

  const stockByProductId = new Map((data || []).map((product) => [product.id, product.stock]));
  const quantityByProductId = restockItems.reduce((map, item) => {
    const productId = item.productId as string;
    map.set(productId, (map.get(productId) || 0) + item.quantity);
    return map;
  }, new Map<string, number>());

  for (const [productId, quantity] of quantityByProductId) {
    const beforeStock = stockByProductId.get(productId);
    if (beforeStock === undefined) continue;

    const { error: updateError } = await client
      .from("products")
      .update({ stock: beforeStock + quantity })
      .eq("id", productId);

    if (updateError) throw updateError;
  }
}

async function restoreAppliedStock(appliedStockChanges: StockChange[], client: PosClient) {
  for (const change of [...appliedStockChanges].reverse()) {
    await client.from("products").update({ stock: change.beforeStock }).eq("id", change.productId);
  }
}

async function cleanupPendingSale(cartId: string, client: PosClient) {
  await client.from("sold_products").delete().eq("cart_id", cartId);
  await client.from("carts").update({ status: "cancelled" }).eq("id", cartId);
}

function normalizeSaleError(error: unknown): Error {
  if (error instanceof Error && error.message.includes("Insufficient stock")) {
    return error;
  }

  if (typeof error === "object" && error && "message" in error) {
    const message = String(error.message);
    if (message.toLowerCase().includes("stock")) {
      return new Error("Insufficient stock for one or more items.");
    }
  }

  return new Error("Failed to complete sale. Please try again.");
}
