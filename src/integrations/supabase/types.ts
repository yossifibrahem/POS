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
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          customer_id: string
          id: string
          notes: string | null
          processed_by: string
          status: string
          total: number
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          processed_by: string
          status?: string
          total?: number
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          processed_by?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      category_attributes: {
        Row: {
          id: string
          category_id: string
          name: string
          label: string
          attribute_type: string
          unit: string | null
          options: Json | null
          is_required: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          category_id: string
          name: string
          label: string
          attribute_type: string
          unit?: string | null
          options?: Json | null
          is_required?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          category_id?: string
          name?: string
          label?: string
          attribute_type?: string
          unit?: string | null
          options?: Json | null
          is_required?: boolean
          display_order?: number
          created_at?: string
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
      customers: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost: number
          created_at: string
          id: string
          name: string
          price: number
          stock: number
          attributes: Json
        }
        Insert: {
          category_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          name: string
          price?: number
          stock?: number
          attributes?: Json
        }
        Update: {
          category_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          name?: string
          price?: number
          stock?: number
          attributes?: Json
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
      sold_products: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
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
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          id: string
          cart_id: string
          processed_by: string | null
          refund_amount: number
          created_at: string
        }
        Insert: {
          id?: string
          cart_id: string
          processed_by?: string | null
          refund_amount: number
          created_at?: string
        }
        Update: {
          id?: string
          cart_id?: string
          processed_by?: string | null
          refund_amount?: number
          created_at?: string
        }
        Relationships: [
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
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_items: {
        Row: {
          id: string
          refund_id: string
          sold_product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          refund_id: string
          sold_product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          id?: string
          refund_id?: string
          sold_product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
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
            referencedRelation: "sold_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      cart_refund_status: {
        Row: {
          cart_id: string | null
          sale_total: number | null
          refunded_amount: number | null
          net_amount: number | null
          refund_status: string | null
        }
        Insert: {
          cart_id?: string | null
          sale_total?: number | null
          refunded_amount?: number | null
          net_amount?: number | null
          refund_status?: string | null
        }
        Update: {
          cart_id?: string | null
          sale_total?: number | null
          refunded_amount?: number | null
          net_amount?: number | null
          refund_status?: string | null
        }
        Relationships: []
      }
      cart_summary: {
        Row: {
          id: string | null
          status: string | null
          total: number | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          customer_name: string | null
          customer_email: string | null
          processed_by_name: string | null
          refunded_amount: number | null
          net_amount: number | null
          refund_status: string | null
        }
        Insert: {
          id?: string | null
          status?: string | null
          total?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          customer_name?: string | null
          customer_email?: string | null
          processed_by_name?: string | null
          refunded_amount?: number | null
          net_amount?: number | null
          refund_status?: string | null
        }
        Update: {
          id?: string | null
          status?: string | null
          total?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          customer_name?: string | null
          customer_email?: string | null
          processed_by_name?: string | null
          refunded_amount?: number | null
          net_amount?: number | null
          refund_status?: string | null
        }
        Relationships: []
      }
      cart_line_items: {
        Row: {
          sold_product_id: string | null
          cart_id: string | null
          sold_quantity: number | null
          unit_price: number | null
          line_total: number | null
          refunded_quantity: number | null
          net_line_total: number | null
          product_id: string | null
          product_name: string | null
          product_attributes: Json | null
        }
        Insert: {
          sold_product_id?: string | null
          cart_id?: string | null
          sold_quantity?: number | null
          unit_price?: number | null
          line_total?: number | null
          refunded_quantity?: number | null
          net_line_total?: number | null
          product_id?: string | null
          product_name?: string | null
          product_attributes?: Json | null
        }
        Update: {
          sold_product_id?: string | null
          cart_id?: string | null
          sold_quantity?: number | null
          unit_price?: number | null
          line_total?: number | null
          refunded_quantity?: number | null
          net_line_total?: number | null
          product_id?: string | null
          product_name?: string | null
          product_attributes?: Json | null
        }
        Relationships: []
      }
      refund_detail: {
        Row: {
          refund_id: string | null
          cart_id: string | null
          refund_amount: number | null
          refunded_at: string | null
          processed_by_name: string | null
          refund_item_id: string | null
          sold_product_id: string | null
          refunded_quantity: number | null
          unit_price: number | null
          refund_line_total: number | null
          product_id: string | null
          product_name: string | null
        }
        Insert: {
          refund_id?: string | null
          cart_id?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          processed_by_name?: string | null
          refund_item_id?: string | null
          sold_product_id?: string | null
          refunded_quantity?: number | null
          unit_price?: number | null
          refund_line_total?: number | null
          product_id?: string | null
          product_name?: string | null
        }
        Update: {
          refund_id?: string | null
          cart_id?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          processed_by_name?: string | null
          refund_item_id?: string | null
          sold_product_id?: string | null
          refunded_quantity?: number | null
          unit_price?: number | null
          refund_line_total?: number | null
          product_id?: string | null
          product_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_admin: { Args: { _user_id: string }; Returns: boolean }
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
