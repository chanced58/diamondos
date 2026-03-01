/**
 * Supabase generated types placeholder.
 * Run `pnpm --filter @baseball/database gen-types` after your Supabase project
 * is set up to regenerate this file from your actual schema.
 *
 * Command: supabase gen types typescript --local > src/types/supabase.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
      };
      teams: {
        Row: {
          id: string;
          name: string;
          organization: string | null;
          logo_url: string | null;
          state_code: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          organization?: string | null;
          logo_url?: string | null;
          state_code?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          organization?: string | null;
          logo_url?: string | null;
          state_code?: string | null;
          updated_at?: string;
        };
      };
      seasons: {
        Row: {
          id: string;
          team_id: string;
          name: string;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          name: string;
          start_date: string;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          name?: string;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
        };
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: 'head_coach' | 'assistant_coach' | 'player' | 'parent' | 'athletic_director';
          is_active: boolean;
          joined_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role: 'head_coach' | 'assistant_coach' | 'player' | 'parent' | 'athletic_director';
          is_active?: boolean;
          joined_at?: string;
        };
        Update: {
          role?: 'head_coach' | 'assistant_coach' | 'player' | 'parent' | 'athletic_director';
          is_active?: boolean;
        };
      };
      players: {
        Row: {
          id: string;
          team_id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          jersey_number: number | null;
          primary_position: string | null;
          bats: string | null;
          throws: string | null;
          date_of_birth: string | null;
          graduation_year: number | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id?: string | null;
          first_name: string;
          last_name: string;
          jersey_number?: number | null;
          primary_position?: string | null;
          bats?: string | null;
          throws?: string | null;
          date_of_birth?: string | null;
          graduation_year?: number | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          jersey_number?: number | null;
          primary_position?: string | null;
          bats?: string | null;
          throws?: string | null;
          date_of_birth?: string | null;
          graduation_year?: number | null;
          notes?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      games: {
        Row: {
          id: string;
          season_id: string;
          team_id: string;
          opponent_name: string;
          scheduled_at: string;
          location_type: 'home' | 'away' | 'neutral';
          venue_name: string | null;
          status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
          home_score: number;
          away_score: number;
          current_inning: number;
          is_top_of_inning: boolean;
          outs: number;
          notes: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          team_id: string;
          opponent_name: string;
          scheduled_at: string;
          location_type?: 'home' | 'away' | 'neutral';
          venue_name?: string | null;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
          home_score?: number;
          away_score?: number;
          current_inning?: number;
          is_top_of_inning?: boolean;
          outs?: number;
          notes?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          opponent_name?: string;
          scheduled_at?: string;
          location_type?: 'home' | 'away' | 'neutral';
          venue_name?: string | null;
          status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
          home_score?: number;
          away_score?: number;
          current_inning?: number;
          is_top_of_inning?: boolean;
          outs?: number;
          notes?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
      };
      game_events: {
        Row: {
          id: string;
          game_id: string;
          sequence_number: number;
          event_type: string;
          inning: number;
          is_top_of_inning: boolean;
          payload: Json;
          occurred_at: string;
          created_by: string;
          device_id: string;
          synced_at: string;
        };
        Insert: {
          id: string;
          game_id: string;
          sequence_number: number;
          event_type: string;
          inning: number;
          is_top_of_inning: boolean;
          payload?: Json;
          occurred_at: string;
          created_by: string;
          device_id: string;
          synced_at?: string;
        };
        Update: never; // game_events are immutable
      };
      channels: {
        Row: {
          id: string;
          team_id: string;
          channel_type: 'announcement' | 'topic' | 'direct';
          name: string | null;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          channel_type: 'announcement' | 'topic' | 'direct';
          name?: string | null;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string | null;
          description?: string | null;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          channel_id: string;
          sender_id: string;
          body: string;
          parent_id: string | null;
          is_pinned: boolean;
          edited_at: string | null;
          deleted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          sender_id: string;
          body: string;
          parent_id?: string | null;
          is_pinned?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          body?: string;
          is_pinned?: boolean;
          edited_at?: string | null;
          deleted_at?: string | null;
        };
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform: string;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: {
          last_used_at?: string | null;
        };
      };
      pitch_counts: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          season_id: string;
          game_date: string;
          pitch_count: number;
          required_rest_days: number | null;
          can_pitch_next_day: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          player_id: string;
          season_id: string;
          game_date: string;
          pitch_count?: number;
          required_rest_days?: number | null;
          can_pitch_next_day?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pitch_count?: number;
          required_rest_days?: number | null;
          can_pitch_next_day?: boolean | null;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_team_role: {
        Args: { p_team_id: string; p_user_id: string };
        Returns: 'head_coach' | 'assistant_coach' | 'player' | 'parent' | 'athletic_director' | null;
      };
      is_coach: {
        Args: { p_team_id: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      team_role: 'head_coach' | 'assistant_coach' | 'player' | 'parent' | 'athletic_director';
      game_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
      game_location_type: 'home' | 'away' | 'neutral';
      player_position: 'pitcher' | 'catcher' | 'first_base' | 'second_base' | 'third_base' | 'shortstop' | 'left_field' | 'center_field' | 'right_field' | 'designated_hitter' | 'utility';
      bats_throws: 'right' | 'left' | 'switch';
      channel_type: 'announcement' | 'topic' | 'direct';
      rsvp_status: 'attending' | 'not_attending' | 'maybe';
    };
  };
}
