export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          role: string
          shift_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          role: string
          shift_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
          shift_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      product_type_lookup: {
        Row: {
          product_type: string
          updated_at: string
          xola_name: string
        }
        Insert: {
          product_type: string
          updated_at?: string
          xola_name: string
        }
        Update: {
          product_type?: string
          updated_at?: string
          xola_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          boat_quals: Json
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_admin: boolean
          is_captain: boolean
          is_mate: boolean
          is_shore: boolean
          updated_at: string
          xola_guide_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          boat_quals?: Json
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          is_captain?: boolean
          is_mate?: boolean
          is_shore?: boolean
          updated_at?: string
          xola_guide_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          boat_quals?: Json
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
          is_captain?: boolean
          is_mate?: boolean
          is_shore?: boolean
          updated_at?: string
          xola_guide_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_xola_guide_id_fkey"
            columns: ["xola_guide_id"]
            isOneToOne: true
            referencedRelation: "xola_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_runs: {
        Row: {
          agent_version: string
          cache_creation_input_tokens: number | null
          cache_read_input_tokens: number | null
          created_at: string
          ended_at: string | null
          error: string | null
          id: string
          input_payload: Json
          input_tokens: number | null
          model: string | null
          output_payload: Json | null
          output_tokens: number | null
          run_type: string
          started_at: string
          triggered_by: string | null
          week_start: string | null
        }
        Insert: {
          agent_version: string
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          created_at?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          input_payload: Json
          input_tokens?: number | null
          model?: string | null
          output_payload?: Json | null
          output_tokens?: number | null
          run_type: string
          started_at?: string
          triggered_by?: string | null
          week_start?: string | null
        }
        Update: {
          agent_version?: string
          cache_creation_input_tokens?: number | null
          cache_read_input_tokens?: number | null
          created_at?: string
          ended_at?: string | null
          error?: string | null
          id?: string
          input_payload?: Json
          input_tokens?: number | null
          model?: string | null
          output_payload?: Json | null
          output_tokens?: number | null
          run_type?: string
          started_at?: string
          triggered_by?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      shifts: {
        Row: {
          boat_label: string | null
          boat_resource_id: string | null
          covered_event_ids: string[] | null
          created_at: string
          end_time: string
          id: string
          notes: string | null
          product_type: string
          roles: Json | null
          scheduling_run_id: string | null
          shift_date: string
          start_time: string
          status: string
          updated_at: string
          week_start: string | null
          xola_event_id: string | null
        }
        Insert: {
          boat_label?: string | null
          boat_resource_id?: string | null
          covered_event_ids?: string[] | null
          created_at?: string
          end_time: string
          id?: string
          notes?: string | null
          product_type: string
          roles?: Json | null
          scheduling_run_id?: string | null
          shift_date: string
          start_time: string
          status?: string
          updated_at?: string
          week_start?: string | null
          xola_event_id?: string | null
        }
        Update: {
          boat_label?: string | null
          boat_resource_id?: string | null
          covered_event_ids?: string[] | null
          created_at?: string
          end_time?: string
          id?: string
          notes?: string | null
          product_type?: string
          roles?: Json | null
          scheduling_run_id?: string | null
          shift_date?: string
          start_time?: string
          status?: string
          updated_at?: string
          week_start?: string | null
          xola_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_scheduling_run_id_fkey"
            columns: ["scheduling_run_id"]
            isOneToOne: false
            referencedRelation: "scheduling_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      xola_events: {
        Row: {
          id: string
          raw: Json
          seller_id: string
          synced_at: string
        }
        Insert: {
          id: string
          raw: Json
          seller_id: string
          synced_at?: string
        }
        Update: {
          id?: string
          raw?: Json
          seller_id?: string
          synced_at?: string
        }
        Relationships: []
      }
      xola_experiences: {
        Row: {
          description: string | null
          id: string
          name: string
          raw: Json
          synced_at: string
        }
        Insert: {
          description?: string | null
          id: string
          name: string
          raw: Json
          synced_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          raw?: Json
          synced_at?: string
        }
        Relationships: []
      }
      xola_guides: {
        Row: {
          email: string | null
          id: string
          name: string
          raw: Json
          seller_id: string
          synced_at: string
        }
        Insert: {
          email?: string | null
          id: string
          name: string
          raw: Json
          seller_id: string
          synced_at?: string
        }
        Update: {
          email?: string | null
          id?: string
          name?: string
          raw?: Json
          seller_id?: string
          synced_at?: string
        }
        Relationships: []
      }
      xola_orders: {
        Row: {
          id: string
          raw: Json
          seller_id: string
          synced_at: string
        }
        Insert: {
          id: string
          raw: Json
          seller_id: string
          synced_at?: string
        }
        Update: {
          id?: string
          raw?: Json
          seller_id?: string
          synced_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
