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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      breaks: {
        Row: {
          ended_at: string | null
          id: string
          kind: Database["public"]["Enums"]["break_kind"]
          shift_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["break_kind"]
          shift_id: string
          started_at?: string
          user_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["break_kind"]
          shift_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "breaks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_applications: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["gate_status"]
          ticket_number: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["gate_status"]
          ticket_number?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["gate_status"]
          ticket_number?: number
          user_id?: string
        }
        Relationships: []
      }
      gate_messages: {
        Row: {
          application_id: string
          content: string
          created_at: string
          id: string
          sender_id: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string
          id?: string
          sender_id: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_messages_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "gate_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          order_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          order_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          order_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          shipping_address: string | null
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          shipping_address?: string | null
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          shipping_address?: string | null
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_cents: number
          sort_order: number
          stock: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_cents?: number
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_cents?: number
          sort_order?: number
          stock?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      sports_blogs: {
        Row: {
          badge: string | null
          body: string | null
          category_id: string
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          image_url: string | null
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          body?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          body?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          id?: string
          image_url?: string | null
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sports_blogs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sports_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      staff_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "staff_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          id: string
          kind: string
          link_path: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          kind: string
          link_path?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          kind?: string
          link_path?: string | null
          title?: string
        }
        Relationships: []
      }
      ticket_categories: {
        Row: {
          color: string
          created_at: string
          description: string | null
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_internal: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category_id: string
          closed_at: string | null
          created_at: string
          id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category_id: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category_id?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "management"
        | "staff"
        | "moderator"
        | "member"
        | "pending"
      break_kind: "break" | "lunch"
      gate_status: "pending" | "approved" | "denied"
      order_status:
        | "pending"
        | "processing"
        | "shipped"
        | "completed"
        | "cancelled"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "waiting" | "resolved" | "closed"
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
    Enums: {
      app_role: [
        "admin",
        "management",
        "staff",
        "moderator",
        "member",
        "pending",
      ],
      break_kind: ["break", "lunch"],
      gate_status: ["pending", "approved", "denied"],
      order_status: [
        "pending",
        "processing",
        "shipped",
        "completed",
        "cancelled",
      ],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: ["open", "in_progress", "waiting", "resolved", "closed"],
    },
  },
} as const
