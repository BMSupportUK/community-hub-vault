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
      admin_backup_codes: {
        Row: {
          batch_id: string
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          batch_id: string
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_unlock_lockouts: {
        Row: {
          failed_count: number
          last_failed_at: string | null
          locked_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_count?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_count?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
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
      channel_permissions: {
        Row: {
          can_delete: boolean
          can_mention: boolean
          can_send: boolean
          can_view: boolean
          channel_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_delete?: boolean
          can_mention?: boolean
          can_send?: boolean
          can_view?: boolean
          channel_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_delete?: boolean
          can_mention?: boolean
          can_send?: boolean
          can_view?: boolean
          channel_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "channel_permissions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_reads: {
        Row: {
          channel_id: string
          last_read_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          last_read_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          last_read_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_welcome_embeds: {
        Row: {
          body: string
          channel_id: string
          image_url: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          channel_id: string
          image_url?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          channel_id?: string
          image_url?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_welcome_embeds_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          created_at: string
          group_label: string
          icon: string
          id: string
          name: string
          slow_mode_seconds: number
          slug: string
          sort_order: number
          staff_only: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_label?: string
          icon?: string
          id?: string
          name: string
          slow_mode_seconds?: number
          slug: string
          sort_order?: number
          staff_only?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_label?: string
          icon?: string
          id?: string
          name?: string
          slow_mode_seconds?: number
          slug?: string
          sort_order?: number
          staff_only?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          edited_at: string | null
          id: string
          pinned_at: string | null
          pinned_by: string | null
          sender_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_reviews: {
        Row: {
          body: string
          created_at: string
          id: string
          rating: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          rating: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          rating?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      discount_code_products: {
        Row: {
          created_at: string
          discount_code_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          discount_code_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          discount_code_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_code_products_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_code_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          amount_cents: number | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          percent: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          percent?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          percent?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          created_at: string
          html_body: string
          key: string
          subject: string
          text_body: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          html_body: string
          key: string
          subject: string
          text_body: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          html_body?: string
          key?: string
          subject?: string
          text_body?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      email_verification_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: []
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
      hero_boxes: {
        Row: {
          description: string
          icon_url: string | null
          id: string
          position: number
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string
          icon_url?: string | null
          id?: string
          position: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string
          icon_url?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      holiday_requests: {
        Row: {
          created_at: string
          end_date: string
          id: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      install_blogs: {
        Row: {
          badge: string | null
          body: string | null
          category_id: string
          created_at: string
          created_by: string | null
          excerpt: string | null
          id: string
          image_url: string | null
          pdf_url: string | null
          published: boolean
          sort_order: number
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
          pdf_url?: string | null
          published?: boolean
          sort_order?: number
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
          pdf_url?: string | null
          published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "install_blogs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "install_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      install_categories: {
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
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          id: string
          referral_bonus_paid: boolean
          referral_bonus_paid_at: string | null
          referral_bonus_paid_by: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          id?: string
          referral_bonus_paid?: boolean
          referral_bonus_paid_at?: string | null
          referral_bonus_paid_by?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          referral_bonus_paid?: boolean
          referral_bonus_paid_at?: string | null
          referral_bonus_paid_by?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: []
      }
      kb_article_ratings: {
        Row: {
          article_id: string
          created_at: string
          id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_article_ratings_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
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
          slug: string
          sort_order: number
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
          slug: string
          sort_order?: number
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
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      mfa_reset_log: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reset_by: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reset_by: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reset_by?: string
          target_user_id?: string
        }
        Relationships: []
      }
      nav_order: {
        Row: {
          key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      new_content_posts: {
        Row: {
          attachments: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
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
      page_permissions: {
        Row: {
          allowed_roles: Database["public"]["Enums"]["app_role"][]
          label: string
          page_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          label: string
          page_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allowed_roles?: Database["public"]["Enums"]["app_role"][]
          label?: string
          page_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_ratings: {
        Row: {
          created_at: string
          product_id: string
          rating: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          rating: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          rating?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_ratings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_recommended: boolean
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
          is_recommended?: boolean
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
          is_recommended?: boolean
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
          is_private: boolean
          sports_blogs_baseline_at: string | null
          timezone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_private?: boolean
          sports_blogs_baseline_at?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_private?: boolean
          sports_blogs_baseline_at?: string | null
          timezone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      qd_dns_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          label: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      role_definitions: {
        Row: {
          created_at: string
          is_active: boolean
          is_system: boolean
          label: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          is_system?: boolean
          label: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          is_system?: boolean
          label?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      shift_slots: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          shift_date: string
          slot_type: Database["public"]["Enums"]["slot_type"]
          start_time: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          shift_date: string
          slot_type?: Database["public"]["Enums"]["slot_type"]
          start_time: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          shift_date?: string
          slot_type?: Database["public"]["Enums"]["slot_type"]
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          slot_id: string
          status: Database["public"]["Enums"]["request_status"]
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_id: string
          status?: Database["public"]["Enums"]["request_status"]
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          target_user_id?: string | null
          updated_at?: string
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
      shop_policies: {
        Row: {
          body: string
          key: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string
          key: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string
          key?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      signup_info: {
        Row: {
          city: string | null
          connection: string | null
          country: string | null
          created_at: string
          device_fingerprint: string | null
          device_memory: string | null
          extra: Json | null
          geo_accuracy_m: number | null
          geo_latitude: number | null
          geo_longitude: number | null
          geo_permission: string | null
          hw_concurrency: string | null
          ip: string | null
          is_proxy: boolean | null
          is_vpn: boolean | null
          isp: string | null
          language: string | null
          languages: string | null
          platform: string | null
          referrer: string | null
          region: string | null
          screen: string | null
          timezone: string | null
          url: string | null
          user_agent: string | null
          user_id: string
          vendor: string | null
          viewport: string | null
          vpn_provider: string | null
          vpn_raw: Json | null
        }
        Insert: {
          city?: string | null
          connection?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_memory?: string | null
          extra?: Json | null
          geo_accuracy_m?: number | null
          geo_latitude?: number | null
          geo_longitude?: number | null
          geo_permission?: string | null
          hw_concurrency?: string | null
          ip?: string | null
          is_proxy?: boolean | null
          is_vpn?: boolean | null
          isp?: string | null
          language?: string | null
          languages?: string | null
          platform?: string | null
          referrer?: string | null
          region?: string | null
          screen?: string | null
          timezone?: string | null
          url?: string | null
          user_agent?: string | null
          user_id: string
          vendor?: string | null
          viewport?: string | null
          vpn_provider?: string | null
          vpn_raw?: Json | null
        }
        Update: {
          city?: string | null
          connection?: string | null
          country?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_memory?: string | null
          extra?: Json | null
          geo_accuracy_m?: number | null
          geo_latitude?: number | null
          geo_longitude?: number | null
          geo_permission?: string | null
          hw_concurrency?: string | null
          ip?: string | null
          is_proxy?: boolean | null
          is_vpn?: boolean | null
          isp?: string | null
          language?: string | null
          languages?: string | null
          platform?: string | null
          referrer?: string | null
          region?: string | null
          screen?: string | null
          timezone?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string
          vendor?: string | null
          viewport?: string | null
          vpn_provider?: string | null
          vpn_raw?: Json | null
        }
        Relationships: []
      }
      sports_blog_reads: {
        Row: {
          blog_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          blog_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          blog_id?: string
          read_at?: string
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
          sort_order: number
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
          sort_order?: number
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
          sort_order?: number
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
      status_incident_updates: {
        Row: {
          attachments: Json
          created_at: string
          created_by: string | null
          id: string
          incident_id: string
          message: string
          status: Database["public"]["Enums"]["incident_status"]
        }
        Insert: {
          attachments?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          incident_id: string
          message: string
          status: Database["public"]["Enums"]["incident_status"]
        }
        Update: {
          attachments?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          incident_id?: string
          message?: string
          status?: Database["public"]["Enums"]["incident_status"]
        }
        Relationships: [
          {
            foreignKeyName: "status_incident_updates_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "status_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      status_incidents: {
        Row: {
          attachments: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["incident_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
          attachments: Json
          content: string
          created_at: string
          id: string
          is_internal: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
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
      ticket_ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          rating: number
          ticket_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          ticket_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          ticket_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_ignores: {
        Row: {
          created_at: string
          id: string
          ignored_id: string
          ignorer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ignored_id: string
          ignorer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ignored_id?: string
          ignorer_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link_path: string | null
          read_at: string | null
          source_id: string | null
          source_type: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link_path?: string | null
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link_path?: string | null
          read_at?: string | null
          source_id?: string | null
          source_type?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
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
      vault_pins: {
        Row: {
          created_at: string
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      verification_checks: {
        Row: {
          created_at: string
          duplicate_device_count: number
          duplicate_ip_count: number
          email_code_verified: boolean
          email_code_verified_at: string | null
          email_disposable: boolean | null
          email_mx_ok: boolean | null
          notes: string | null
          overall_status: Database["public"]["Enums"]["verification_status"]
          turnstile_ok: boolean | null
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          duplicate_device_count?: number
          duplicate_ip_count?: number
          email_code_verified?: boolean
          email_code_verified_at?: string | null
          email_disposable?: boolean | null
          email_mx_ok?: boolean | null
          notes?: string | null
          overall_status?: Database["public"]["Enums"]["verification_status"]
          turnstile_ok?: boolean | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          duplicate_device_count?: number
          duplicate_ip_count?: number
          email_code_verified?: boolean
          email_code_verified_at?: string | null
          email_disposable?: boolean | null
          email_mx_ok?: boolean | null
          notes?: string | null
          overall_status?: Database["public"]["Enums"]["verification_status"]
          turnstile_ok?: boolean | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      app_credentials: {
        Row: {
          app_login_name: string | null
          created_at: string | null
          created_by: string | null
          expiry_at: string | null
          id: string | null
          notes: string | null
          owner_id: string | null
          password: string | null
          updated_at: string | null
        }
        Insert: {
          app_login_name?: string | null
          created_at?: string | null
          created_by?: string | null
          expiry_at?: string | null
          id?: string | null
          notes?: never
          owner_id?: string | null
          password?: never
          updated_at?: string | null
        }
        Update: {
          app_login_name?: string | null
          created_at?: string | null
          created_by?: string | null
          expiry_at?: string | null
          id?: string | null
          notes?: never
          owner_id?: string | null
          password?: never
          updated_at?: string | null
        }
        Relationships: []
      }
      gate_messages: {
        Row: {
          application_id: string | null
          content: string | null
          created_at: string | null
          id: string | null
          sender_id: string | null
        }
        Insert: {
          application_id?: string | null
          content?: never
          created_at?: string | null
          id?: string | null
          sender_id?: string | null
        }
        Update: {
          application_id?: string | null
          content?: never
          created_at?: string | null
          id?: string | null
          sender_id?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          customer_type: string | null
          discount_cents: number | null
          discount_code: string | null
          email: string | null
          existing_username: string | null
          id: string | null
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          shipping_address: string | null
          shipping_name: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total_cents: number | null
          updated_at: string | null
          user_id: string | null
          wants_adult_content: boolean | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          customer_type?: string | null
          discount_cents?: number | null
          discount_code?: string | null
          email?: never
          existing_username?: string | null
          id?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          shipping_address?: never
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_cents?: number | null
          updated_at?: string | null
          user_id?: string | null
          wants_adult_content?: boolean | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          customer_type?: string | null
          discount_cents?: number | null
          discount_code?: string | null
          email?: never
          existing_username?: string | null
          id?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          shipping_address?: never
          shipping_name?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_cents?: number | null
          updated_at?: string | null
          user_id?: string | null
          wants_adult_content?: boolean | null
        }
        Relationships: []
      }
      user_ip_logs: {
        Row: {
          created_at: string | null
          id: string | null
          ip: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          ip?: never
          user_agent?: never
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          ip?: never
          user_agent?: never
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      app_encrypt: { Args: { p: string }; Returns: string }
      can_in_channel: {
        Args: { _action: string; _channel: string; _user: string }
        Returns: boolean
      }
      check_admin_unlock_lockout: { Args: never; Returns: Json }
      cleanup_old_chat_messages: { Args: never; Returns: number }
      clear_admin_unlock_failures: { Args: never; Returns: undefined }
      create_app_role: {
        Args: { _label: string; _name: string }
        Returns: undefined
      }
      delete_app_role: { Args: { _name: string }; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      export_app_credentials_for_backup: {
        Args: never
        Returns: {
          app_login_name: string
          created_at: string
          created_by: string
          expiry_at: string
          id: string
          notes: string
          owner_id: string
          password: string
          updated_at: string
        }[]
      }
      get_invite_leaderboard: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          total_count: number
          used_count: number
          user_id: string
          username: string
        }[]
      }
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
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_admin_unlock_failure: { Args: never; Returns: Json }
      redeem_invite: { Args: { p_code: string }; Returns: Json }
      restore_app_credentials_from_backup: {
        Args: { p_mode?: string; p_snapshot: Json }
        Returns: Json
      }
      submit_appeal: { Args: { p_reason: string }; Returns: Json }
    }
    Enums: {
      app_role:
        | "admin"
        | "management"
        | "staff"
        | "moderator"
        | "member"
        | "pending"
        | "banned"
        | "subscriber"
        | "nonsubscriber"
        | "rejected"
      break_kind: "break" | "lunch"
      friendship_status: "pending" | "accepted"
      gate_status: "pending" | "approved" | "denied"
      incident_status:
        | "investigating"
        | "identified"
        | "monitoring"
        | "completed"
      order_status:
        | "pending"
        | "processing"
        | "shipped"
        | "completed"
        | "cancelled"
      request_status: "pending" | "approved" | "denied"
      review_status: "pending" | "approved" | "rejected"
      slot_type: "shift" | "hourly"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "waiting" | "resolved" | "closed"
      verification_status: "pending" | "verified" | "flagged"
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
        "banned",
        "subscriber",
        "nonsubscriber",
        "rejected",
      ],
      break_kind: ["break", "lunch"],
      friendship_status: ["pending", "accepted"],
      gate_status: ["pending", "approved", "denied"],
      incident_status: [
        "investigating",
        "identified",
        "monitoring",
        "completed",
      ],
      order_status: [
        "pending",
        "processing",
        "shipped",
        "completed",
        "cancelled",
      ],
      request_status: ["pending", "approved", "denied"],
      review_status: ["pending", "approved", "rejected"],
      slot_type: ["shift", "hourly"],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: ["open", "in_progress", "waiting", "resolved", "closed"],
      verification_status: ["pending", "verified", "flagged"],
    },
  },
} as const
