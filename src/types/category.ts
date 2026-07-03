import type { Json } from "@/integrations/supabase/types";

export type AttributeType = 'text' | 'number' | 'boolean' | 'enum';

export interface CategoryAttribute {
  id?: string;
  category_id: string;
  name: string;
  label: string;
  attribute_type: AttributeType;
  unit?: string | null;
  options?: Json | string[] | null;
  is_required: boolean;
  display_order: number;
}

export interface Category {
  id: string;
  organization_id?: string;
  name: string;
  created_at: string;
  product_count?: number;
}
