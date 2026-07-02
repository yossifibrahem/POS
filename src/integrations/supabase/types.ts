export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string | null
          level: string
        }
        Insert: {
          created_at?: string
          id: string
          last_seen_at?: string | null
          level?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string | null
          level?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          customer_id: string | null
          id: string
          notes: string | null
          processed_by: string | null
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          processed_by?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          id?: string
          notes?: string | null
          processed_by?: string | null
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      category_attributes: {
        Row: {
          attribute_type: string
          category_id: string
          created_at: string
          display_order: number
          id: string
          is_required: boolean
          label: string
          name: string
          options: Json | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          attribute_type: string
          category_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          label: string
          name: string
          options?: Json | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          attribute_type?: string
          category_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_required?: boolean
          label?: string
          name?: string
          options?: Json | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_attributes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          category_id: string | null
          cost: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          stock: number
          updated_at: string
        }
        Insert: {
          attributes?: Json
          category_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price?: number
          stock?: number
          updated_at?: string
        }
        Update: {
          attributes?: Json
          category_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refund_items: {
        Row: {
          id: string
          quantity: number
          refund_id: string
          sold_product_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          quantity: number
          refund_id: string
          sold_product_id: string
          unit_price: number
        }
        Update: {
          id?: string
          quantity?: number
          refund_id?: string
          sold_product_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refund_detail"
            referencedColumns: ["refund_id"]
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_sold_product_id_fkey"
            columns: ["sold_product_id"]
            isOneToOne: false
            referencedRelation: "cart_line_items"
            referencedColumns: ["sold_product_id"]
          },
          {
            foreignKeyName: "refund_items_sold_product_id_fkey"
            columns: ["sold_product_id"]
            isOneToOne: false
            referencedRelation: "sold_products"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          processed_by: string | null
          refund_amount: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          processed_by?: string | null
          refund_amount: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          processed_by?: string | null
          refund_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "refunds_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_refund_status"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "refunds_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      sold_products: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string | null
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id?: string | null
          quantity?: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string | null
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sold_products_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_refund_status"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "sold_products_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sold_products_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sold_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "cart_line_items"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "sold_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sold_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "refund_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
    }
    Views: {
      admin_profiles: {
        Row: {
          admin_since: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_online: boolean | null
          last_seen_at: string | null
          level: string | null
          phone: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admins_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_line_items: {
        Row: {
          cart_id: string | null
          line_total: number | null
          net_line_total: number | null
          product_attributes: Json | null
          product_cost: number | null
          product_id: string | null
          product_name: string | null
          refunded_quantity: number | null
          sold_product_id: string | null
          sold_quantity: number | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sold_products_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_refund_status"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "sold_products_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sold_products_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_refund_status: {
        Row: {
          cart_id: string | null
          net_amount: number | null
          refund_status: string | null
          refunded_amount: number | null
          sale_total: number | null
        }
        Relationships: []
      }
      cart_summary: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          id: string | null
          net_amount: number | null
          notes: string | null
          processed_by: string | null
          processed_by_level: string | null
          processed_by_name: string | null
          refund_status: string | null
          refunded_amount: number | null
          status: string | null
          total: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_detail: {
        Row: {
          cart_id: string | null
          processed_by_level: string | null
          processed_by_name: string | null
          product_id: string | null
          product_name: string | null
          refund_amount: number | null
          refund_id: string | null
          refund_item_id: string | null
          refund_line_total: number | null
          refunded_at: string | null
          refunded_quantity: number | null
          sold_product_id: string | null
          unit_price: number | null
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_sold_product_id_fkey"
            columns: ["sold_product_id"]
            isOneToOne: false
            referencedRelation: "cart_line_items"
            referencedColumns: ["sold_product_id"]
          },
          {
            foreignKeyName: "refund_items_sold_product_id_fkey"
            columns: ["sold_product_id"]
            isOneToOne: false
            referencedRelation: "sold_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_refund_status"
            referencedColumns: ["cart_id"]
          },
          {
            foreignKeyName: "refunds_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "cart_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_admin_level: { Args: { _user_id: string }; Returns: string }
      get_online_admins: {
        Args: never
        Returns: {
          full_name: string
          id: string
          last_seen_at: string
          level: string
        }[]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_admin_high: { Args: { _user_id: string }; Returns: boolean }
      is_admin_med_or_above: { Args: { _user_id: string }; Returns: boolean }
      ping_admin_presence: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
