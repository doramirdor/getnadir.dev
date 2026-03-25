export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_preview: string
          name: string
          status: Database["public"]["Enums"]["status_type"]
          updated_at: string
          user_id: string
          credit_limit: number | null
          include_byok_in_limit: boolean | null
          // DEPRECATED - Use presets for configuration
          last_used: string | null
          usage_count: number | null
          slug: string | null
          description: string | null
          system_prompt: string | null
          selected_models: string[]
          sort_strategy: string | null
          benchmark_model: string | null
          load_balancing_policy: string
          use_fallback: boolean
          enable_caching: boolean
          enable_logging: boolean
          log_level: string
          model_parameters: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_preview: string
          name: string
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
          user_id: string
          credit_limit?: number | null
          include_byok_in_limit?: boolean | null
          // DEPRECATED - Use presets for configuration
          last_used?: string | null
          usage_count?: number | null
          slug?: string | null
          description?: string | null
          system_prompt?: string | null
          selected_models?: string[]
          sort_strategy?: string | null
          benchmark_model?: string | null
          load_balancing_policy?: string
          use_fallback?: boolean
          enable_caching?: boolean
          enable_logging?: boolean
          log_level?: string
          model_parameters?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_preview?: string
          name?: string
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
          user_id?: string
          credit_limit?: number | null
          include_byok_in_limit?: boolean | null
          // DEPRECATED - Use presets for configuration
          last_used?: string | null
          usage_count?: number | null
          slug?: string | null
          description?: string | null
          system_prompt?: string | null
          selected_models?: string[]
          sort_strategy?: string | null
          benchmark_model?: string | null
          load_balancing_policy?: string
          use_fallback?: boolean
          enable_caching?: boolean
          enable_logging?: boolean
          log_level?: string
          model_parameters?: Json
        }
        Relationships: []
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string
          description: string | null
          enabled: boolean | null
          icon_url: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["status_type"]
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          icon_url?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          description?: string | null
          enabled?: boolean | null
          icon_url?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
        }
        Relationships: []
      }
      logs: {
        Row: {
          cost: number
          created_at: string
          id: string
          model: string
          prompt: string
          provider: string
          request_id: string
          response_time_ms: number | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cost?: number
          created_at?: string
          id?: string
          model: string
          prompt: string
          provider: string
          request_id: string
          response_time_ms?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          model?: string
          prompt?: string
          provider?: string
          request_id?: string
          response_time_ms?: number | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cost_this_month: number | null
          created_at: string
          email: string
          id: string
          last_login: string | null
          name: string
          provider_budgets: Json | null
          requests_this_month: number | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["status_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cost_this_month?: number | null
          created_at?: string
          email: string
          id?: string
          last_login?: string | null
          name: string
          provider_budgets?: Json | null
          requests_this_month?: number | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cost_this_month?: number | null
          created_at?: string
          email?: string
          id?: string
          last_login?: string | null
          name?: string
          provider_budgets?: Json | null
          requests_this_month?: number | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      providers: {
        Row: {
          api_key_hash: string | null
          created_at: string
          enabled: boolean | null
          id: string
          models: string[]
          name: string
          provider_id: string
          status: Database["public"]["Enums"]["status_type"]
          updated_at: string
        }
        Insert: {
          api_key_hash?: string | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          models?: string[]
          name: string
          provider_id: string
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
        }
        Update: {
          api_key_hash?: string | null
          created_at?: string
          enabled?: boolean | null
          id?: string
          models?: string[]
          name?: string
          provider_id?: string
          status?: Database["public"]["Enums"]["status_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_providers: {
        Row: {
          allowed_models: string[]
          api_key_hash: string | null
          budget_limit: number | null
          cost_this_month: number | null
          created_at: string
          enabled: boolean
          id: string
          provider_id: string
          requests_this_month: number | null
          updated_at: string
          use_byok: boolean
          user_id: string
        }
        Insert: {
          allowed_models?: string[]
          api_key_hash?: string | null
          budget_limit?: number | null
          cost_this_month?: number | null
          created_at?: string
          enabled?: boolean
          id?: string
          provider_id: string
          requests_this_month?: number | null
          updated_at?: string
          use_byok?: boolean
          user_id: string
        }
        Update: {
          allowed_models?: string[]
          api_key_hash?: string | null
          budget_limit?: number | null
          cost_this_month?: number | null
          created_at?: string
          enabled?: boolean
          id?: string
          provider_id?: string
          requests_this_month?: number | null
          updated_at?: string
          use_byok?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_providers_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_providers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_provider_keys: {
        Row: {
          id: string
          user_id: string
          provider_id: string
          provider_name: string
          api_key_hash: string | null
          byok_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider_id: string
          provider_name: string
          api_key_hash?: string | null
          byok_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider_id?: string
          provider_name?: string
          api_key_hash?: string | null
          byok_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_policies: {
        Row: {
          id: string
          user_id: string
          api_key_id: string | null
          name: string
          policy_type: Database["public"]["Enums"]["policy_type"]
          template_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          api_key_id?: string | null
          name: string
          policy_type: Database["public"]["Enums"]["policy_type"]
          template_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          api_key_id?: string | null
          name?: string
          policy_type?: Database["public"]["Enums"]["policy_type"]
          template_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_policy_items: {
        Row: {
          id: string
          policy_id: string
          model_name: string
          provider_name: string
          owner: string
          input_cost: number
          output_cost: number
          token_capacity: number
          distribution_percentage: number | null
          sequence_order: number
          created_at: string
        }
        Insert: {
          id?: string
          policy_id: string
          model_name: string
          provider_name: string
          owner: string
          input_cost?: number
          output_cost?: number
          token_capacity?: number
          distribution_percentage?: number | null
          sequence_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          policy_id?: string
          model_name?: string
          provider_name?: string
          owner?: string
          input_cost?: number
          output_cost?: number
          token_capacity?: number
          distribution_percentage?: number | null
          sequence_order?: number
          created_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          id: string
          name: string
          description: string | null
          plan_type: string
          price_per_month: number | null
          price_per_request: number | null  
          credit_amount: number | null
          credit_price: number | null
          is_active: boolean
          features: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          plan_type: string
          price_per_month?: number | null
          price_per_request?: number | null
          credit_amount?: number | null
          credit_price?: number | null
          is_active?: boolean
          features?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          plan_type?: string
          price_per_month?: number | null
          price_per_request?: number | null
          credit_amount?: number | null
          credit_price?: number | null
          is_active?: boolean
          features?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          plan_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_payment_method_id: string | null
          status: string
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          plan_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_payment_method_id?: string | null
          status?: string
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          plan_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_payment_method_id?: string | null
          status?: string
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          id: string
          user_id: string
          balance: number
          auto_charge_enabled: boolean
          auto_charge_threshold: number
          auto_charge_amount: number
          upper_limit: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          balance?: number
          auto_charge_enabled?: boolean
          auto_charge_threshold?: number
          auto_charge_amount?: number
          upper_limit?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          balance?: number
          auto_charge_enabled?: boolean
          auto_charge_threshold?: number
          auto_charge_amount?: number
          upper_limit?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          id: string
          user_id: string
          transaction_type: string
          amount: number
          balance_after: number
          description: string | null
          stripe_payment_intent_id: string | null
          api_key_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          transaction_type: string
          amount: number
          balance_after: number
          description?: string | null
          stripe_payment_intent_id?: string | null
          api_key_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          transaction_type?: string
          amount?: number
          balance_after?: number
          description?: string | null
          stripe_payment_intent_id?: string | null
          api_key_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_tokens: {
        Row: {
          id: string
          user_id: string
          token_code: string
          token_type: string
          days_valid: number | null
          credit_amount: number | null
          is_redeemed: boolean
          redeemed_at: string | null
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          token_code: string
          token_type: string
          days_valid?: number | null
          credit_amount?: number | null
          is_redeemed?: boolean
          redeemed_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          token_code?: string
          token_type?: string
          days_valid?: number | null
          credit_amount?: number | null
          is_redeemed?: boolean
          redeemed_at?: string | null
          expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_payment_methods: {
        Row: {
          id: string
          user_id: string
          stripe_payment_method_id: string
          card_brand: string | null
          card_last_four: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          stripe_payment_method_id: string
          card_brand?: string | null
          card_last_four?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          stripe_payment_method_id?: string
          card_brand?: string | null
          card_last_four?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_tracking: {
        Row: {
          id: string
          user_id: string
          api_key_id: string | null
          model_name: string | null
          tokens_used: number
          cost: number
          request_count: number
          created_date: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          api_key_id?: string | null
          model_name?: string | null
          tokens_used?: number
          cost?: number
          request_count?: number
          created_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          api_key_id?: string | null
          model_name?: string | null
          tokens_used?: number
          cost?: number
          request_count?: number
          created_date?: string
          created_at?: string
        }
        Relationships: []
      }
      admin_tokens: {
        Row: {
          id: string
          token_code: string
          token_type: string
          name: string
          description: string | null
          days_valid: number | null
          credit_amount: number | null
          max_uses: number
          current_uses: number
          is_active: boolean
          created_by: string | null
          created_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          token_code: string
          token_type: string
          name: string
          description?: string | null
          days_valid?: number | null
          credit_amount?: number | null
          max_uses?: number
          current_uses?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          expires_at?: string | null
        }
        Update: {
          id?: string
          token_code?: string
          token_type?: string
          name?: string
          description?: string | null
          days_valid?: number | null
          credit_amount?: number | null
          max_uses?: number
          current_uses?: number
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          expires_at?: string | null
        }
        Relationships: []
      }
      user_token_redemptions: {
        Row: {
          id: string
          user_id: string
          admin_token_id: string
          token_code: string
          redeemed_at: string
          expires_at: string | null
          days_granted: number | null
          credits_granted: number | null
          is_active: boolean
          is_expired: boolean
        }
        Insert: {
          id?: string
          user_id: string
          admin_token_id: string
          token_code: string
          redeemed_at?: string
          expires_at?: string | null
          days_granted?: number | null
          credits_granted?: number | null
          is_active?: boolean
          is_expired?: boolean
        }
        Update: {
          id?: string
          user_id?: string
          admin_token_id?: string
          token_code?: string
          redeemed_at?: string
          expires_at?: string | null
          days_granted?: number | null
          credits_granted?: number | null
          is_active?: boolean
          is_expired?: boolean
        }
        Relationships: []
      }
      purchase_logs: {
        Row: {
          id: string
          user_id: string
          purchase_type: string
          item_name: string
          item_description: string | null
          amount: number
          currency: string
          stripe_payment_intent_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          payment_method_id: string | null
          plan_id: string | null
          credits_purchased: number | null
          subscription_period_start: string | null
          subscription_period_end: string | null
          admin_token_id: string | null
          token_code: string | null
          status: string
          payment_status: string | null
          created_at: string
          updated_at: string
          completed_at: string | null
          metadata: Json
          notes: string | null
        }
        Insert: {
          id?: string
          user_id: string
          purchase_type: string
          item_name: string
          item_description?: string | null
          amount: number
          currency?: string
          stripe_payment_intent_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          payment_method_id?: string | null
          plan_id?: string | null
          credits_purchased?: number | null
          subscription_period_start?: string | null
          subscription_period_end?: string | null
          admin_token_id?: string | null
          token_code?: string | null
          status?: string
          payment_status?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          metadata?: Json
          notes?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          purchase_type?: string
          item_name?: string
          item_description?: string | null
          amount?: number
          currency?: string
          stripe_payment_intent_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          payment_method_id?: string | null
          plan_id?: string | null
          credits_purchased?: number | null
          subscription_period_start?: string | null
          subscription_period_end?: string | null
          admin_token_id?: string | null
          token_code?: string | null
          status?: string
          payment_status?: string | null
          created_at?: string
          updated_at?: string
          completed_at?: string | null
          metadata?: Json
          notes?: string | null
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          id: string
          user_id: string
          integration_type: string
          provider_name: string
          display_name: string | null
          api_key_hash: string | null
          api_key_preview: string | null
          is_active: boolean
          is_default: boolean
          daily_limit: number | null
          monthly_limit: number | null
          rate_limit_rpm: number | null
          allowed_models: string[] | null
          blocked_models: string[] | null
          requests_today: number
          requests_this_month: number
          last_used_at: string | null
          cost_today: number
          cost_this_month: number
          created_at: string
          updated_at: string
          last_health_check: string | null
          health_status: string
        }
        Insert: {
          id?: string
          user_id: string
          integration_type: string
          provider_name: string
          display_name?: string | null
          api_key_hash?: string | null
          api_key_preview?: string | null
          is_active?: boolean
          is_default?: boolean
          daily_limit?: number | null
          monthly_limit?: number | null
          rate_limit_rpm?: number | null
          allowed_models?: string[] | null
          blocked_models?: string[] | null
          requests_today?: number
          requests_this_month?: number
          last_used_at?: string | null
          cost_today?: number
          cost_this_month?: number
          created_at?: string
          updated_at?: string
          last_health_check?: string | null
          health_status?: string
        }
        Update: {
          id?: string
          user_id?: string
          integration_type?: string
          provider_name?: string
          display_name?: string | null
          api_key_hash?: string | null
          api_key_preview?: string | null
          is_active?: boolean
          is_default?: boolean
          daily_limit?: number | null
          monthly_limit?: number | null
          rate_limit_rpm?: number | null
          allowed_models?: string[] | null
          blocked_models?: string[] | null
          requests_today?: number
          requests_this_month?: number
          last_used_at?: string | null
          cost_today?: number
          cost_this_month?: number
          created_at?: string
          updated_at?: string
          last_health_check?: string | null
          health_status?: string
        }
        Relationships: []
      }
      subscription_changes: {
        Row: {
          id: string
          user_id: string
          subscription_id: string
          change_type: string
          old_plan_id: string | null
          new_plan_id: string | null
          old_status: string | null
          new_status: string | null
          proration_amount: number
          effective_date: string
          created_at: string
          reason: string | null
          triggered_by: string
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          subscription_id: string
          change_type: string
          old_plan_id?: string | null
          new_plan_id?: string | null
          old_status?: string | null
          new_status?: string | null
          proration_amount?: number
          effective_date?: string
          created_at?: string
          reason?: string | null
          triggered_by?: string
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          subscription_id?: string
          change_type?: string
          old_plan_id?: string | null
          new_plan_id?: string | null
          old_status?: string | null
          new_status?: string | null
          proration_amount?: number
          effective_date?: string
          created_at?: string
          reason?: string | null
          triggered_by?: string
          metadata?: Json
        }
        Relationships: []
      }
      integration_usage_logs: {
        Row: {
          id: string
          user_id: string
          integration_id: string
          api_key_id: string | null
          request_id: string | null
          model_used: string | null
          provider: string | null
          tokens_input: number
          tokens_output: number
          tokens_total: number
          cost_input: number
          cost_output: number
          cost_total: number
          response_time_ms: number | null
          status_code: number | null
          request_timestamp: string
          created_date: string
          error_message: string | null
          error_code: string | null
        }
        Insert: {
          id?: string
          user_id: string
          integration_id: string
          api_key_id?: string | null
          request_id?: string | null
          model_used?: string | null
          provider?: string | null
          tokens_input?: number
          tokens_output?: number
          tokens_total?: number
          cost_input?: number
          cost_output?: number
          cost_total?: number
          response_time_ms?: number | null
          status_code?: number | null
          request_timestamp?: string
          created_date?: string
          error_message?: string | null
          error_code?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          integration_id?: string
          api_key_id?: string | null
          request_id?: string | null
          model_used?: string | null
          provider?: string | null
          tokens_input?: number
          tokens_output?: number
          tokens_total?: number
          cost_input?: number
          cost_output?: number
          cost_total?: number
          response_time_ms?: number | null
          status_code?: number | null
          request_timestamp?: string
          created_date?: string
          error_message?: string | null
          error_code?: string | null
        }
        Relationships: []
      }
      presets: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          system_prompt: string | null
          selected_models: string[]
          model_parameters: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          system_prompt?: string | null
          selected_models?: string[]
          model_parameters?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          system_prompt?: string | null
          selected_models?: string[]
          model_parameters?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      status_type: "active" | "inactive" | "connected" | "disconnected"
      user_role: "admin" | "user"
      policy_type: "fallback" | "load_balance"
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
      status_type: ["active", "inactive", "connected", "disconnected"],
      user_role: ["admin", "user"],
    },
  },
} as const
