export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      provider_services: {
        Row: {
          id: string
          provider_id: string
          name: string
          description: string | null
          price: number
          duration_minutes: number
          category: string
          image_id: string | null
          is_active: boolean
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          provider_id: string
          name: string
          description?: string | null
          price: number
          duration_minutes: number
          category: string
          image_id?: string | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          provider_id?: string
          name?: string
          description?: string | null
          price?: number
          duration_minutes?: number
          category?: string
          image_id?: string | null
          is_active?: boolean
          created_at?: string | null
          updated_at?: string | null
        }
      }
      profiles: {
        Row: {
          id: string
          first_name: string
          last_name: string
          phone: string | null
          address: string | null
          role: string
          created_at: string | null
          updated_at: string | null
          email: string
        }
        Insert: {
          id: string
          first_name: string
          last_name: string
          phone?: string | null
          address?: string | null
          role?: string
          created_at?: string | null
          updated_at?: string | null
          email: string
        }
        Update: {
          id?: string
          first_name?: string
          last_name?: string
          phone?: string | null
          address?: string | null
          role?: string
          created_at?: string | null
          updated_at?: string | null
          email?: string
        }
      }
      // Add other table types as needed
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: unknown
      }
      get_profile_safely: {
        Args: {
          user_id: string
        }
        Returns: {
          id: string
          email: string
          role: string
          first_name: string | null
          last_name: string | null
          phone: string | null
          address: string | null
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}