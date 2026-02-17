import { supabase } from "@/integrations/supabase/client";

/**
 * Check if all products in a cart are fully refunded and update cart status accordingly.
 * 
 * @param cartId - The ID of the cart to check
 * @returns Promise<boolean> - True if cart status was updated to 'refunded', false otherwise
 */
export async function updateCartStatusIfAllRefunded(cartId: string): Promise<boolean> {
  // Get all sold_products for this cart
  const { data: soldProducts, error: fetchError } = await supabase
    .from("sold_products")
    .select("id, status")
    .eq("cart_id", cartId);

  if (fetchError) {
    console.error("Error fetching sold products:", fetchError);
    return false;
  }

  // If no products, nothing to do
  if (!soldProducts || soldProducts.length === 0) {
    return false;
  }

  // Check if ALL products have status = 'refunded'
  const allRefunded = soldProducts.every((sp) => sp.status === "refunded");

  if (allRefunded) {
    // Update cart status to 'refunded'
    const { error: updateError } = await supabase
      .from("carts")
      .update({ status: "refunded" })
      .eq("id", cartId);

    if (updateError) {
      console.error("Error updating cart status:", updateError);
      return false;
    }

    return true;
  }

  return false;
}

