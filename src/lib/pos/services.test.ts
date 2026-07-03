import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { processSale, refundCart, refundLineItem, sanitizeProductPayload } from "./services";

interface MockError {
  message: string;
}

interface MockResult {
  data: unknown;
  error: MockError | null;
}

interface MockCall {
  table: string;
  action: string;
  payload?: unknown;
  filters: Record<string, unknown>;
}

interface ProductRow {
  id: string;
  stock: number;
}

interface CartLineItemRow {
  sold_product_id: string | null;
  product_id: string | null;
  sold_quantity: number | null;
  refunded_quantity: number | null;
  unit_price: number | null;
}

class MockSupabase {
  calls: MockCall[] = [];
  products: ProductRow[] = [];
  cartLineItems: CartLineItemRow[] = [];
  failComplete = false;

  from(table: string) {
    return new MockBuilder(this, table);
  }

  asClient() {
    return this as unknown as SupabaseClient<Database>;
  }
}

class MockBuilder implements PromiseLike<MockResult> {
  private action = "select";
  private payload: unknown;
  private filters: Record<string, unknown> = {};

  constructor(private readonly db: MockSupabase, private readonly table: string) {}

  insert(payload: unknown) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  select() {
    return this;
  }

  single() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters[column] = value;
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters[column] = value;
    return this;
  }

  then<TResult1 = MockResult, TResult2 = never>(
    onfulfilled?: ((value: MockResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<MockResult> {
    this.db.calls.push({
      table: this.table,
      action: this.action,
      payload: this.payload,
      filters: { ...this.filters },
    });

    if (this.table === "carts" && this.action === "insert") {
      return { data: { id: "cart-1" }, error: null };
    }

    if (this.table === "carts" && this.action === "update") {
      const payload = this.payload as { status?: string };
      if (payload.status === "completed" && this.db.failComplete) {
        return { data: null, error: { message: "failed to complete" } };
      }
      return { data: null, error: null };
    }

    if (this.table === "refunds" && this.action === "insert") {
      return { data: { id: "refund-1" }, error: null };
    }

    if (this.table === "cart_line_items" && this.action === "select") {
      return { data: this.db.cartLineItems, error: null };
    }

    if (this.table === "products" && this.action === "select") {
      const ids = (this.filters.id || []) as string[];
      return { data: this.db.products.filter((product) => ids.includes(product.id)), error: null };
    }

    if (this.table === "products" && this.action === "update") {
      const productId = this.filters.id as string;
      const payload = this.payload as { stock: number };
      this.db.products = this.db.products.map((product) =>
        product.id === productId ? { ...product, stock: payload.stock } : product,
      );
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }
}

describe("POS services", () => {
  it("processes a sale by creating records, storing total, deducting stock, and completing the cart", async () => {
    const db = new MockSupabase();
    db.products = [{ id: "product-1", stock: 5 }];

    const result = await processSale(
      {
        customerId: null,
        processedBy: "admin-1",
        notes: null,
        items: [{ productId: "product-1", stock: 5, quantity: 2, unitPrice: 10 }],
      },
      db.asClient(),
    );

    expect(result).toEqual({ cartId: "cart-1", total: 20 });
    expect(db.products).toEqual([{ id: "product-1", stock: 3 }]);
    expect(db.calls.map((call) => `${call.table}:${call.action}`)).toEqual([
      "carts:insert",
      "sold_products:insert",
      "products:select",
      "products:update",
      "carts:update",
    ]);
    expect(db.calls[0].payload).toMatchObject({ status: "pending", total: 20 });
    expect(db.calls[4].payload).toMatchObject({ status: "completed", total: 20 });
  });

  it("attempts stock restoration and pending-sale cleanup when sale completion fails", async () => {
    const db = new MockSupabase();
    db.products = [{ id: "product-1", stock: 5 }];
    db.failComplete = true;

    await expect(
      processSale(
        {
          customerId: null,
          processedBy: "admin-1",
          notes: null,
          items: [{ productId: "product-1", stock: 5, quantity: 2, unitPrice: 10 }],
        },
        db.asClient(),
      ),
    ).rejects.toThrow("Failed to complete sale. Please try again.");

    expect(db.products).toEqual([{ id: "product-1", stock: 5 }]);
    expect(db.calls).toContainEqual(expect.objectContaining({ table: "sold_products", action: "delete" }));
    expect(db.calls).toContainEqual(
      expect.objectContaining({ table: "carts", action: "update", payload: { status: "cancelled" } }),
    );
  });

  it("refunds all remaining cart quantities and restores product stock", async () => {
    const db = new MockSupabase();
    db.products = [{ id: "product-1", stock: 5 }];
    db.cartLineItems = [
      {
        sold_product_id: "sold-1",
        product_id: "product-1",
        sold_quantity: 3,
        refunded_quantity: 1,
        unit_price: 10,
      },
    ];

    const result = await refundCart({ cartId: "cart-1", processedBy: "admin-1" }, db.asClient());

    expect(result).toEqual({ refundId: "refund-1", refundAmount: 20 });
    expect(db.products).toEqual([{ id: "product-1", stock: 7 }]);
    expect(db.calls).toContainEqual(
      expect.objectContaining({
        table: "refund_items",
        action: "insert",
        payload: [{ refund_id: "refund-1", sold_product_id: "sold-1", quantity: 2, unit_price: 10 }],
      }),
    );
  });

  it("refunds a single line item quantity and restores only that stock", async () => {
    const db = new MockSupabase();
    db.products = [{ id: "product-1", stock: 5 }];

    const result = await refundLineItem(
      {
        cartId: "cart-1",
        processedBy: "admin-1",
        soldProductId: "sold-1",
        productId: "product-1",
        soldQuantity: 4,
        refundedQuantity: 1,
        quantity: 2,
        unitPrice: 15,
      },
      db.asClient(),
    );

    expect(result).toEqual({ refundId: "refund-1", refundAmount: 30 });
    expect(db.products).toEqual([{ id: "product-1", stock: 7 }]);
  });

  it("blocks over-refunds before writing records", async () => {
    const db = new MockSupabase();

    await expect(
      refundLineItem(
        {
          cartId: "cart-1",
          processedBy: "admin-1",
          soldProductId: "sold-1",
          productId: "product-1",
          soldQuantity: 2,
          refundedQuantity: 1,
          quantity: 2,
          unitPrice: 15,
        },
        db.asClient(),
      ),
    ).rejects.toThrow("Refund quantity exceeds remaining quantity");

    expect(db.calls).toEqual([]);
  });

  it("clears product attributes when category is removed", () => {
    expect(
      sanitizeProductPayload({
        name: "Laptop",
        category_id: null,
        attributes: { ram: "16GB" },
      }),
    ).toEqual({
      name: "Laptop",
      category_id: null,
      attributes: {},
    });
  });
});
