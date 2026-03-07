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
          is_platform_admin: boolean;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_platform_admin?: boolean;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          is_platform_admin?: boolean;
          email?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          name: string;
          organization: string | null;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
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
          primary_color?: string | null;
          secondary_color?: string | null;
          state_code?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          organization?: string | null;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          state_code?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: string;
          is_active: boolean;
          joined_at: string;
          jersey_number: number | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role: string;
          is_active?: boolean;
          joined_at?: string;
          jersey_number?: number | null;
        };
        Update: {
          role?: string;
          is_active?: boolean;
          jersey_number?: number | null;
        };
        Relationships: [];
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
          secondary_positions: string[];
          bats: string | null;
          throws: string | null;
          date_of_birth: string | null;
          graduation_year: number | null;
          notes: string | null;
          email: string | null;
          phone: string | null;
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
          secondary_positions?: string[];
          bats?: string | null;
          throws?: string | null;
          date_of_birth?: string | null;
          graduation_year?: number | null;
          notes?: string | null;
          email?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          first_name?: string;
          last_name?: string;
          jersey_number?: number | null;
          primary_position?: string | null;
          secondary_positions?: string[];
          bats?: string | null;
          throws?: string | null;
          date_of_birth?: string | null;
          graduation_year?: number | null;
          notes?: string | null;
          email?: string | null;
          phone?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          season_id: string | null;
          team_id: string;
          opponent_name: string;
          scheduled_at: string;
          location_type: string;
          venue_name: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          status: string;
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
          season_id?: string | null;
          team_id: string;
          opponent_name: string;
          scheduled_at: string;
          location_type?: string;
          venue_name?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          status?: string;
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
          location_type?: string;
          venue_name?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          status?: string;
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
        Relationships: [];
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
        Update: never;
        Relationships: [];
      };
      game_lineups: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          batting_order: number;
          starting_position: string | null;
          is_starter: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          player_id: string;
          batting_order: number;
          starting_position?: string | null;
          is_starter?: boolean;
          created_at?: string;
        };
        Update: {
          batting_order?: number;
          starting_position?: string | null;
          is_starter?: boolean;
        };
        Relationships: [];
      };
      channels: {
        Row: {
          id: string;
          team_id: string;
          channel_type: string;
          name: string | null;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          channel_type: string;
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
        Relationships: [];
      };
      channel_members: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          can_post: boolean;
          last_read_at: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          channel_id: string;
          user_id: string;
          can_post?: boolean;
          last_read_at?: string | null;
          joined_at?: string;
        };
        Update: {
          can_post?: boolean;
          last_read_at?: string | null;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      practices: {
        Row: {
          id: string;
          team_id: string;
          scheduled_at: string;
          duration_minutes: number | null;
          location: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          status: string;
          plan: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          scheduled_at: string;
          duration_minutes?: number | null;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          status?: string;
          plan?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          scheduled_at?: string;
          duration_minutes?: number | null;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          status?: string;
          plan?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      practice_notes: {
        Row: {
          id: string;
          practice_id: string;
          overall_notes: string | null;
          coach_notes: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          practice_id: string;
          overall_notes?: string | null;
          coach_notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          overall_notes?: string | null;
          coach_notes?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      practice_player_notes: {
        Row: {
          id: string;
          practice_id: string;
          player_id: string;
          pitching: string | null;
          hitting: string | null;
          fielding_catching: string | null;
          baserunning: string | null;
          athleticism: string | null;
          attitude: string | null;
          player_notes: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          practice_id: string;
          player_id: string;
          pitching?: string | null;
          hitting?: string | null;
          fielding_catching?: string | null;
          baserunning?: string | null;
          athleticism?: string | null;
          attitude?: string | null;
          player_notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          pitching?: string | null;
          hitting?: string | null;
          fielding_catching?: string | null;
          baserunning?: string | null;
          athleticism?: string | null;
          attitude?: string | null;
          player_notes?: string | null;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      season_rosters: {
        Row: {
          id: string;
          season_id: string;
          player_id: string;
          added_at: string;
        };
        Insert: {
          id?: string;
          season_id: string;
          player_id: string;
          added_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      parent_player_links: {
        Row: {
          id: string;
          parent_user_id: string;
          player_id: string;
          relationship: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parent_user_id: string;
          player_id: string;
          relationship?: string | null;
          created_at?: string;
        };
        Update: {
          relationship?: string | null;
        };
        Relationships: [];
      };
      team_events: {
        Row: {
          id: string;
          team_id: string;
          title: string;
          event_type: string;
          starts_at: string;
          ends_at: string | null;
          location: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          title: string;
          event_type?: string;
          starts_at: string;
          ends_at?: string | null;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          event_type?: string;
          starts_at?: string;
          ends_at?: string | null;
          location?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          place_id?: string | null;
          description?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      team_invitations: {
        Row: {
          id: string;
          team_id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          role: string;
          invited_by: string;
          invited_at: string;
          accepted_at: string | null;
          status: string;
          jersey_number: number | null;
        };
        Insert: {
          id?: string;
          team_id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          role: string;
          invited_by: string;
          invited_at?: string;
          accepted_at?: string | null;
          status?: string;
          jersey_number?: number | null;
        };
        Update: {
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          role?: string;
          invited_at?: string;
          accepted_at?: string | null;
          status?: string;
          jersey_number?: number | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_team_role: {
        Args: { p_team_id: string; p_user_id: string };
        Returns: string | null;
      };
      is_coach: {
        Args: { p_team_id: string; p_user_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      team_role: 'head_coach' | 'assistant_coach' | 'player' | 'parent' | 'athletic_director' | 'scorekeeper';
      game_status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'postponed';
      game_location_type: 'home' | 'away' | 'neutral';
      player_position: 'pitcher' | 'catcher' | 'first_base' | 'second_base' | 'third_base' | 'shortstop' | 'left_field' | 'center_field' | 'right_field' | 'designated_hitter' | 'utility' | 'infield' | 'outfield';
      bats_throws: 'right' | 'left' | 'switch';
      channel_type: 'announcement' | 'topic' | 'direct';
      rsvp_status: 'attending' | 'not_attending' | 'maybe';
      team_event_type: 'meeting' | 'scrimmage' | 'travel' | 'other';
    };
    CompositeTypes: Record<string, never>;
  };
}
