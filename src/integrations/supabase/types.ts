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
      contagens_camera: {
        Row: {
          created_at: string
          id: string
          imagem_url: string
          inventario_id: string | null
          observacao: string | null
          origem: string
          part_number: string | null
          produto: string | null
          quantidade_arruelas: number
          quantidade_parafusos: number
          quantidade_porcas: number
          resultado_json: Json | null
          status_confirmacao: boolean
          total_itens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          imagem_url: string
          inventario_id?: string | null
          observacao?: string | null
          origem?: string
          part_number?: string | null
          produto?: string | null
          quantidade_arruelas?: number
          quantidade_parafusos?: number
          quantidade_porcas?: number
          resultado_json?: Json | null
          status_confirmacao?: boolean
          total_itens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          imagem_url?: string
          inventario_id?: string | null
          observacao?: string | null
          origem?: string
          part_number?: string | null
          produto?: string | null
          quantidade_arruelas?: number
          quantidade_parafusos?: number
          quantidade_porcas?: number
          resultado_json?: Json | null
          status_confirmacao?: boolean
          total_itens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contagens_camera_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_itens: {
        Row: {
          created_at: string
          designacao: string | null
          diferenca: number
          id: string
          inventario_id: string
          item_id: string | null
          localizacao: string | null
          part_number: string | null
          preco_medio_pond: number
          produto: string
          quantidade_contada: number
          quantidade_un_sistema: number
          unidade_un: string | null
          updated_at: string
          valor_divergencia: number
        }
        Insert: {
          created_at?: string
          designacao?: string | null
          diferenca?: number
          id?: string
          inventario_id: string
          item_id?: string | null
          localizacao?: string | null
          part_number?: string | null
          preco_medio_pond?: number
          produto: string
          quantidade_contada?: number
          quantidade_un_sistema?: number
          unidade_un?: string | null
          updated_at?: string
          valor_divergencia?: number
        }
        Update: {
          created_at?: string
          designacao?: string | null
          diferenca?: number
          id?: string
          inventario_id?: string
          item_id?: string | null
          localizacao?: string | null
          part_number?: string | null
          preco_medio_pond?: number
          produto?: string
          quantidade_contada?: number
          quantidade_un_sistema?: number
          unidade_un?: string | null
          updated_at?: string
          valor_divergencia?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_itens_inventario_id_fkey"
            columns: ["inventario_id"]
            isOneToOne: false
            referencedRelation: "inventarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_itens_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
        ]
      }
      inventarios: {
        Row: {
          assinatura: string | null
          created_at: string
          data: string
          finalized_at: string | null
          id: string
          nome_inventario: string
          observacao: string | null
          responsavel: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assinatura?: string | null
          created_at?: string
          data?: string
          finalized_at?: string | null
          id?: string
          nome_inventario: string
          observacao?: string | null
          responsavel: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assinatura?: string | null
          created_at?: string
          data?: string
          finalized_at?: string | null
          id?: string
          nome_inventario?: string
          observacao?: string | null
          responsavel?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      itens: {
        Row: {
          created_at: string
          created_by: string | null
          designacao: string
          id: string
          localizacao: string
          part_number: string
          preco_medio_pond: number
          produto: string
          quantidade_un: number
          unidade_un: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          designacao: string
          id?: string
          localizacao?: string
          part_number?: string
          preco_medio_pond?: number
          produto: string
          quantidade_un?: number
          unidade_un?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          designacao?: string
          id?: string
          localizacao?: string
          part_number?: string
          preco_medio_pond?: number
          produto?: string
          quantidade_un?: number
          unidade_un?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
