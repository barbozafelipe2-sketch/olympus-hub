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
      account_limits: {
        Row: {
          created_at: string
          daily_request_limit: number | null
          daily_token_limit: number | null
          monthly_token_limit: number | null
          plan_code: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_request_limit?: number | null
          daily_token_limit?: number | null
          monthly_token_limit?: number | null
          plan_code?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_request_limit?: number | null
          daily_token_limit?: number | null
          monthly_token_limit?: number | null
          plan_code?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      artifact_files: {
        Row: {
          artifact_id: string
          bucket_id: string
          created_at: string
          id: string
          mime_type: string
          owner_id: string
          size_bytes: number
          storage_path: string
          version: number
        }
        Insert: {
          artifact_id: string
          bucket_id?: string
          created_at?: string
          id?: string
          mime_type: string
          owner_id: string
          size_bytes: number
          storage_path: string
          version: number
        }
        Update: {
          artifact_id?: string
          bucket_id?: string
          created_at?: string
          id?: string
          mime_type?: string
          owner_id?: string
          size_bytes?: number
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_files_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_versions: {
        Row: {
          artifact_id: string
          content: string
          created_at: string
          id: string
          model: string | null
          owner_id: string
          provider: string | null
          request_id: string | null
          version: number
        }
        Insert: {
          artifact_id: string
          content: string
          created_at?: string
          id?: string
          model?: string | null
          owner_id: string
          provider?: string | null
          request_id?: string | null
          version: number
        }
        Update: {
          artifact_id?: string
          content?: string
          created_at?: string
          id?: string
          model?: string | null
          owner_id?: string
          provider?: string | null
          request_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_versions_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          conversation_id: string | null
          created_at: string
          current_version: number
          id: string
          kind: string
          mime_type: string
          owner_id: string
          project_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          current_version?: number
          id?: string
          kind?: string
          mime_type?: string
          owner_id: string
          project_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          current_version?: number
          id?: string
          kind?: string
          mime_type?: string
          owner_id?: string
          project_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_checkpoints: {
        Row: {
          content: string
          conversation_id: string
          covered_message_count: number
          created_at: string
          owner_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          content?: string
          conversation_id: string
          covered_message_count?: number
          created_at?: string
          owner_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          covered_message_count?: number
          created_at?: string
          owner_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_checkpoints_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          mode: string
          owner_id: string
          project_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string
          owner_id: string
          project_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string
          owner_id?: string
          project_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      executions: {
        Row: {
          call_count: number
          conversation_id: string | null
          created_at: string
          degraded: boolean
          fallback_used: boolean
          id: string
          latency_ms: number
          mode: string
          model: string
          multi_provider: boolean
          owner_id: string
          project_id: string | null
          provider: string
          request_id: string
          status: string
          trace: Json
        }
        Insert: {
          call_count: number
          conversation_id?: string | null
          created_at?: string
          degraded?: boolean
          fallback_used?: boolean
          id?: string
          latency_ms: number
          mode: string
          model: string
          multi_provider?: boolean
          owner_id: string
          project_id?: string | null
          provider: string
          request_id: string
          status?: string
          trace?: Json
        }
        Update: {
          call_count?: number
          conversation_id?: string | null
          created_at?: string
          degraded?: boolean
          fallback_used?: boolean
          id?: string
          latency_ms?: number
          mode?: string
          model?: string
          multi_provider?: boolean
          owner_id?: string
          project_id?: string | null
          provider?: string
          request_id?: string
          status?: string
          trace?: Json
        }
        Relationships: [
          {
            foreignKeyName: "executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          owner_id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          owner_id: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          owner_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          onboarding_completed: boolean
          onboarding_completed_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          onboarding_completed?: boolean
          onboarding_completed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_files: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          mime_type: string
          name: string
          owner_id: string
          project_id: string
          size_bytes: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          bucket_id?: string
          created_at?: string
          id?: string
          mime_type: string
          name: string
          owner_id: string
          project_id: string
          size_bytes: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          mime_type?: string
          name?: string
          owner_id?: string
          project_id?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_memories: {
        Row: {
          content: string
          created_at: string
          id: string
          importance: number
          kind: string
          owner_id: string
          project_id: string | null
          source_message_id: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          importance?: number
          kind?: string
          owner_id: string
          project_id?: string | null
          source_message_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          importance?: number
          kind?: string
          owner_id?: string
          project_id?: string | null
          source_message_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memories_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          created_at: string
          due_at: string | null
          id: string
          owner_id: string
          priority: number
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          id?: string
          owner_id: string
          priority?: number
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          id?: string
          owner_id?: string
          priority?: number
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          goal: string
          id: string
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          goal?: string
          id?: string
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          cache_write_tokens: number
          cached_input_tokens: number
          created_at: string
          estimated_cost_microusd: number | null
          execution_id: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          owner_id: string
          project_id: string | null
          provider: string
          reasoning_tokens: number
          request_id: string
          role: string
          tool_tokens: number
          total_tokens: number
        }
        Insert: {
          cache_write_tokens?: number
          cached_input_tokens?: number
          created_at?: string
          estimated_cost_microusd?: number | null
          execution_id: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          owner_id: string
          project_id?: string | null
          provider: string
          reasoning_tokens?: number
          request_id: string
          role: string
          tool_tokens?: number
          total_tokens?: number
        }
        Update: {
          cache_write_tokens?: number
          cached_input_tokens?: number
          created_at?: string
          estimated_cost_microusd?: number | null
          execution_id?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          owner_id?: string
          project_id?: string | null
          provider?: string
          reasoning_tokens?: number
          request_id?: string
          role?: string
          tool_tokens?: number
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_artifact_version: {
        Args: {
          p_artifact_id: string
          p_content: string
          p_model?: string
          p_provider?: string
          p_request_id?: string
        }
        Returns: {
          version: number
          version_id: string
        }[]
      }
      complete_my_onboarding: { Args: never; Returns: undefined }
      create_artifact_with_version: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_kind: string
          p_mime_type: string
          p_model?: string
          p_project_id: string
          p_provider?: string
          p_request_id?: string
          p_title: string
        }
        Returns: {
          artifact_id: string
          version: number
          version_id: string
        }[]
      }
      get_my_usage_summary: {
        Args: never
        Returns: {
          daily_requests: number
          daily_tokens: number
          monthly_tokens: number
        }[]
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
