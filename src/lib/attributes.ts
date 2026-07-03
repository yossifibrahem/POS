import type { Json } from "@/integrations/supabase/types";
import type { AttributeType } from "@/types/category";

/**
 * Safely parse options from Json to string array
 */
export function parseOptions(options: Json | undefined | null): string[] {
  if (Array.isArray(options)) {
    return options.filter((o): o is string => typeof o === 'string');
  }
  return [];
}

/**
 * Safely parse product attributes from Json to a simple display/edit record.
 */
export function parseAttributes(attributes: Json | undefined | null): Record<string, string | number | boolean> {
  if (typeof attributes === 'object' && attributes !== null && !Array.isArray(attributes)) {
    return attributes as Record<string, string | number | boolean>;
  }
  return {};
}

/**
 * Get badge className for attribute type
 */
export function getAttributeTypeBadgeClass(type: AttributeType): string {
  const colors: Record<AttributeType, string> = {
    text: "bg-blue-100 text-blue-800",
    number: "bg-green-100 text-green-800",
    boolean: "bg-purple-100 text-purple-800",
    enum: "bg-orange-100 text-orange-800",
  };
  return colors[type];
}
