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
      channel_members: {
        Row: {
          can_post: boolean
          channel_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          user_id: string
        }
        Insert: {
          can_post?: boolean
          channel_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id: string
        }
        Update: {
          can_post?: boolean
          channel_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_profile_fk"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      game_coach_notes: {
        Row: {
          coach_notes: string | null
          created_at: string
          game_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          coach_notes?: string | null
          created_at?: string
          game_id: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          coach_notes?: string | null
          created_at?: string
          game_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_coach_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_events: {
        Row: {
          created_by: string | null
          device_id: string
          event_type: string
          game_id: string
          id: string
          inning: number
          is_top_of_inning: boolean
          occurred_at: string
          payload: Json
          sequence_number: number
          synced_at: string
        }
        Insert: {
          created_by?: string | null
          device_id: string
          event_type: string
          game_id: string
          id?: string
          inning: number
          is_top_of_inning: boolean
          occurred_at: string
          payload?: Json
          sequence_number: number
          synced_at?: string
        }
        Update: {
          created_by?: string | null
          device_id?: string
          event_type?: string
          game_id?: string
          id?: string
          inning?: number
          is_top_of_inning?: boolean
          occurred_at?: string
          payload?: Json
          sequence_number?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_lineups: {
        Row: {
          batting_order: number | null
          created_at: string
          game_id: string
          id: string
          is_starter: boolean
          player_id: string
          starting_position:
            | Database["public"]["Enums"]["player_position"]
            | null
        }
        Insert: {
          batting_order?: number | null
          created_at?: string
          game_id: string
          id?: string
          is_starter?: boolean
          player_id: string
          starting_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
        }
        Update: {
          batting_order?: number | null
          created_at?: string
          game_id?: string
          id?: string
          is_starter?: boolean
          player_id?: string
          starting_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "game_lineups_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_lineups_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_notes: {
        Row: {
          created_at: string
          game_id: string
          id: string
          overall_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          overall_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          overall_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_player_notes: {
        Row: {
          athleticism: string | null
          attitude: string | null
          baserunning: string | null
          created_at: string
          fielding_catching: string | null
          game_id: string
          hitting: string | null
          id: string
          pitching: string | null
          player_id: string
          player_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          athleticism?: string | null
          attitude?: string | null
          baserunning?: string | null
          created_at?: string
          fielding_catching?: string | null
          game_id: string
          hitting?: string | null
          id?: string
          pitching?: string | null
          player_id: string
          player_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          athleticism?: string | null
          attitude?: string | null
          baserunning?: string | null
          created_at?: string
          fielding_catching?: string | null
          game_id?: string
          hitting?: string | null
          id?: string
          pitching?: string | null
          player_id?: string
          player_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_player_notes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rsvps: {
        Row: {
          game_id: string
          id: string
          note: string | null
          responded_at: string
          status: Database["public"]["Enums"]["rsvp_status"]
          user_id: string
        }
        Insert: {
          game_id: string
          id?: string
          note?: string | null
          responded_at?: string
          status: Database["public"]["Enums"]["rsvp_status"]
          user_id: string
        }
        Update: {
          game_id?: string
          id?: string
          note?: string | null
          responded_at?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_rsvps_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          address: string | null
          away_score: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_inning: number
          home_score: number
          id: string
          is_top_of_inning: boolean
          latitude: number | null
          location_type: Database["public"]["Enums"]["game_location_type"]
          longitude: number | null
          neutral_home_team: string | null
          notes: string | null
          opponent_name: string
          opponent_team_id: string | null
          outs: number
          place_id: string | null
          scheduled_at: string
          season_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["game_status"]
          team_id: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          address?: string | null
          away_score?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_inning?: number
          home_score?: number
          id?: string
          is_top_of_inning?: boolean
          latitude?: number | null
          location_type?: Database["public"]["Enums"]["game_location_type"]
          longitude?: number | null
          neutral_home_team?: string | null
          notes?: string | null
          opponent_name: string
          opponent_team_id?: string | null
          outs?: number
          place_id?: string | null
          scheduled_at: string
          season_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          team_id: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          address?: string | null
          away_score?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_inning?: number
          home_score?: number
          id?: string
          is_top_of_inning?: boolean
          latitude?: number | null
          location_type?: Database["public"]["Enums"]["game_location_type"]
          longitude?: number | null
          neutral_home_team?: string | null
          notes?: string | null
          opponent_name?: string
          opponent_team_id?: string | null
          outs?: number
          place_id?: string | null
          scheduled_at?: string
          season_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["game_status"]
          team_id?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_opponent_team_id_fkey"
            columns: ["opponent_team_id"]
            isOneToOne: false
            referencedRelation: "opponent_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          coaching_staff: string | null
          contact_name: string | null
          created_at: string
          email: string
          enriched: boolean | null
          enriched_at: string | null
          estimated_roster_size: string | null
          id: string
          key_talking_points: string | null
          lead_score: number | null
          league_district: string | null
          organization: string | null
          outreach_email: string | null
          outreach_subject: string | null
          pitch_count_notes: string | null
          pitch_count_regulated: boolean | null
          program_history: string | null
          program_summary: string | null
          program_type: string | null
          program_type_input: string | null
          school_enrollment: string | null
          score_reasoning: string | null
          state: string | null
          tech_adoption_signals: string | null
        }
        Insert: {
          coaching_staff?: string | null
          contact_name?: string | null
          created_at?: string
          email: string
          enriched?: boolean | null
          enriched_at?: string | null
          estimated_roster_size?: string | null
          id?: string
          key_talking_points?: string | null
          lead_score?: number | null
          league_district?: string | null
          organization?: string | null
          outreach_email?: string | null
          outreach_subject?: string | null
          pitch_count_notes?: string | null
          pitch_count_regulated?: boolean | null
          program_history?: string | null
          program_summary?: string | null
          program_type?: string | null
          program_type_input?: string | null
          school_enrollment?: string | null
          score_reasoning?: string | null
          state?: string | null
          tech_adoption_signals?: string | null
        }
        Update: {
          coaching_staff?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string
          enriched?: boolean | null
          enriched_at?: string | null
          estimated_roster_size?: string | null
          id?: string
          key_talking_points?: string | null
          lead_score?: number | null
          league_district?: string | null
          organization?: string | null
          outreach_email?: string | null
          outreach_subject?: string | null
          pitch_count_notes?: string | null
          pitch_count_regulated?: boolean | null
          program_history?: string | null
          program_summary?: string | null
          program_type?: string | null
          program_type_input?: string | null
          school_enrollment?: string | null
          score_reasoning?: string | null
          state?: string | null
          tech_adoption_signals?: string | null
        }
        Relationships: []
      }
      league_channel_members: {
        Row: {
          can_post: boolean
          id: string
          joined_at: string
          last_read_at: string | null
          league_channel_id: string
          user_id: string
        }
        Insert: {
          can_post?: boolean
          id?: string
          joined_at?: string
          last_read_at?: string | null
          league_channel_id: string
          user_id: string
        }
        Update: {
          can_post?: boolean
          id?: string
          joined_at?: string
          last_read_at?: string | null
          league_channel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_channel_members_league_channel_id_fkey"
            columns: ["league_channel_id"]
            isOneToOne: false
            referencedRelation: "league_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      league_channels: {
        Row: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at: string
          created_by: string
          description: string | null
          id: string
          league_id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          channel_type: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          league_id: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          channel_type?: Database["public"]["Enums"]["channel_type"]
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          league_id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_channels_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_divisions: {
        Row: {
          created_at: string
          id: string
          league_id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_divisions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          division_id: string | null
          id: string
          is_active: boolean
          joined_at: string
          league_id: string
          team_id: string
        }
        Insert: {
          division_id?: string | null
          id?: string
          is_active?: boolean
          joined_at?: string
          league_id: string
          team_id: string
        }
        Update: {
          division_id?: string | null
          id?: string
          is_active?: boolean
          joined_at?: string
          league_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_messages: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          league_channel_id: string
          parent_id: string | null
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          league_channel_id: string
          parent_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          league_channel_id?: string
          parent_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_messages_league_channel_id_fkey"
            columns: ["league_channel_id"]
            isOneToOne: false
            referencedRelation: "league_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "league_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      league_staff: {
        Row: {
          id: string
          is_active: boolean
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          joined_at?: string
          league_id: string
          role: Database["public"]["Enums"]["league_role"]
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          joined_at?: string
          league_id?: string
          role?: Database["public"]["Enums"]["league_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_staff_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          state_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_pinned: boolean
          parent_id: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          parent_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_pinned?: boolean
          parent_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_profile_fk"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opponent_game_lineups: {
        Row: {
          batting_order: number | null
          created_at: string
          game_id: string
          id: string
          is_starter: boolean
          opponent_player_id: string
          starting_position:
            | Database["public"]["Enums"]["player_position"]
            | null
        }
        Insert: {
          batting_order?: number | null
          created_at?: string
          game_id: string
          id?: string
          is_starter?: boolean
          opponent_player_id: string
          starting_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
        }
        Update: {
          batting_order?: number | null
          created_at?: string
          game_id?: string
          id?: string
          is_starter?: boolean
          opponent_player_id?: string
          starting_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "opponent_game_lineups_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opponent_game_lineups_opponent_player_id_fkey"
            columns: ["opponent_player_id"]
            isOneToOne: false
            referencedRelation: "opponent_players"
            referencedColumns: ["id"]
          },
        ]
      }
      opponent_lineup_entries: {
        Row: {
          batting_order: number
          created_at: string
          game_id: string
          id: string
          jersey_number: number
          player_name: string | null
          position: Database["public"]["Enums"]["player_position"] | null
        }
        Insert: {
          batting_order: number
          created_at?: string
          game_id: string
          id?: string
          jersey_number: number
          player_name?: string | null
          position?: Database["public"]["Enums"]["player_position"] | null
        }
        Update: {
          batting_order?: number
          created_at?: string
          game_id?: string
          id?: string
          jersey_number?: number
          player_name?: string | null
          position?: Database["public"]["Enums"]["player_position"] | null
        }
        Relationships: [
          {
            foreignKeyName: "opponent_lineup_entries_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      opponent_players: {
        Row: {
          bats: string | null
          created_at: string
          first_name: string
          id: string
          is_active: boolean
          jersey_number: string | null
          last_name: string
          notes: string | null
          opponent_team_id: string
          primary_position:
            | Database["public"]["Enums"]["player_position"]
            | null
          throws: string | null
          updated_at: string
        }
        Insert: {
          bats?: string | null
          created_at?: string
          first_name: string
          id?: string
          is_active?: boolean
          jersey_number?: string | null
          last_name: string
          notes?: string | null
          opponent_team_id: string
          primary_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
          throws?: string | null
          updated_at?: string
        }
        Update: {
          bats?: string | null
          created_at?: string
          first_name?: string
          id?: string
          is_active?: boolean
          jersey_number?: string | null
          last_name?: string
          notes?: string | null
          opponent_team_id?: string
          primary_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
          throws?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opponent_players_opponent_team_id_fkey"
            columns: ["opponent_team_id"]
            isOneToOne: false
            referencedRelation: "opponent_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      opponent_teams: {
        Row: {
          abbreviation: string | null
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          state_code: string | null
          team_id: string
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          state_code?: string | null
          team_id: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          state_code?: string | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opponent_teams_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_player_links: {
        Row: {
          created_at: string
          id: string
          parent_user_id: string
          player_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          parent_user_id: string
          player_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          parent_user_id?: string
          player_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_player_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_compliance_rules: {
        Row: {
          age_max: number | null
          age_min: number | null
          applies_from: string | null
          applies_until: string | null
          created_at: string
          id: string
          is_active: boolean
          max_pitches_per_day: number
          rest_day_thresholds: Json
          rule_name: string
          team_id: string | null
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          applies_from?: string | null
          applies_until?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_pitches_per_day: number
          rest_day_thresholds: Json
          rule_name: string
          team_id?: string | null
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          applies_from?: string | null
          applies_until?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_pitches_per_day?: number
          rest_day_thresholds?: Json
          rule_name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pitch_compliance_rules_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pitch_counts: {
        Row: {
          can_pitch_next_day: boolean | null
          created_at: string
          game_date: string
          game_id: string
          id: string
          pitch_count: number
          player_id: string
          required_rest_days: number | null
          season_id: string
          updated_at: string
        }
        Insert: {
          can_pitch_next_day?: boolean | null
          created_at?: string
          game_date: string
          game_id: string
          id?: string
          pitch_count?: number
          player_id: string
          required_rest_days?: number | null
          season_id: string
          updated_at?: string
        }
        Update: {
          can_pitch_next_day?: boolean | null
          created_at?: string
          game_date?: string
          game_id?: string
          id?: string
          pitch_count?: number
          player_id?: string
          required_rest_days?: number | null
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitch_counts_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_counts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitch_counts_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      player_team_memberships: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          jersey_number: number | null
          joined_at: string
          left_at: string | null
          player_id: string
          team_id: string
          transfer_reason: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          joined_at?: string
          left_at?: string | null
          player_id: string
          team_id: string
          transfer_reason?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          joined_at?: string
          left_at?: string | null
          player_id?: string
          team_id?: string
          transfer_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_team_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_transfers: {
        Row: {
          created_at: string
          from_team_id: string | null
          id: string
          initiated_by: string
          notes: string | null
          player_id: string
          reason: string | null
          to_team_id: string | null
          transferred_at: string
        }
        Insert: {
          created_at?: string
          from_team_id?: string | null
          id?: string
          initiated_by: string
          notes?: string | null
          player_id: string
          reason?: string | null
          to_team_id?: string | null
          transferred_at?: string
        }
        Update: {
          created_at?: string
          from_team_id?: string | null
          id?: string
          initiated_by?: string
          notes?: string | null
          player_id?: string
          reason?: string | null
          to_team_id?: string | null
          transferred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_transfers_from_team_id_fkey"
            columns: ["from_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_transfers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_transfers_to_team_id_fkey"
            columns: ["to_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          bats: Database["public"]["Enums"]["bats_throws"] | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          graduation_year: number | null
          id: string
          is_active: boolean
          jersey_number: number | null
          last_name: string
          notes: string | null
          phone: string | null
          primary_position:
            | Database["public"]["Enums"]["player_position"]
            | null
          secondary_positions: Database["public"]["Enums"]["player_position"][]
          team_id: string | null
          throws: Database["public"]["Enums"]["bats_throws"] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bats?: Database["public"]["Enums"]["bats_throws"] | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          graduation_year?: number | null
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          last_name: string
          notes?: string | null
          phone?: string | null
          primary_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
          secondary_positions?: Database["public"]["Enums"]["player_position"][]
          team_id?: string | null
          throws?: Database["public"]["Enums"]["bats_throws"] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bats?: Database["public"]["Enums"]["bats_throws"] | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          graduation_year?: number | null
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          last_name?: string
          notes?: string | null
          phone?: string | null
          primary_position?:
            | Database["public"]["Enums"]["player_position"]
            | null
          secondary_positions?: Database["public"]["Enums"]["player_position"][]
          team_id?: string | null
          throws?: Database["public"]["Enums"]["bats_throws"] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_notes: {
        Row: {
          coach_notes: string | null
          created_at: string
          id: string
          overall_notes: string | null
          practice_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          coach_notes?: string | null
          created_at?: string
          id?: string
          overall_notes?: string | null
          practice_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          coach_notes?: string | null
          created_at?: string
          id?: string
          overall_notes?: string | null
          practice_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_notes_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: true
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_player_notes: {
        Row: {
          athleticism: string | null
          attitude: string | null
          baserunning: string | null
          created_at: string
          fielding_catching: string | null
          hitting: string | null
          id: string
          pitching: string | null
          player_id: string
          player_notes: string | null
          practice_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          athleticism?: string | null
          attitude?: string | null
          baserunning?: string | null
          created_at?: string
          fielding_catching?: string | null
          hitting?: string | null
          id?: string
          pitching?: string | null
          player_id: string
          player_notes?: string | null
          practice_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          athleticism?: string | null
          attitude?: string | null
          baserunning?: string | null
          created_at?: string
          fielding_catching?: string | null
          hitting?: string | null
          id?: string
          pitching?: string | null
          player_id?: string
          player_notes?: string | null
          practice_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_player_notes_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_player_notes_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "practices"
            referencedColumns: ["id"]
          },
        ]
      }
      practices: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          place_id: string | null
          plan: string | null
          scheduled_at: string
          status: string
          team_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          place_id?: string | null
          plan?: string | null
          scheduled_at: string
          status?: string
          team_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          place_id?: string | null
          plan?: string | null
          scheduled_at?: string
          status?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practices_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      season_compliance_rules: {
        Row: {
          compliance_rule_id: string
          season_id: string
        }
        Insert: {
          compliance_rule_id: string
          season_id: string
        }
        Update: {
          compliance_rule_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_compliance_rules_compliance_rule_id_fkey"
            columns: ["compliance_rule_id"]
            isOneToOne: false
            referencedRelation: "pitch_compliance_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_compliance_rules_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      season_rosters: {
        Row: {
          added_at: string
          id: string
          player_id: string
          season_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          player_id: string
          season_id: string
        }
        Update: {
          added_at?: string
          id?: string
          player_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_rosters_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rosters_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string
          team_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date: string
          team_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          accent_color: string
          cta_button_text: string
          form_headline: string
          form_subtext: string
          hero_headline: string
          hero_subtext: string
          id: string
          logo_url: string | null
          primary_color: string
          secondary_color: string
          site_name: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          cta_button_text?: string
          form_headline?: string
          form_subtext?: string
          hero_headline?: string
          hero_subtext?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          site_name?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          cta_button_text?: string
          form_headline?: string
          form_subtext?: string
          hero_headline?: string
          hero_subtext?: string
          id?: string
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          site_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_events: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          event_type: Database["public"]["Enums"]["team_event_type"]
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          place_id: string | null
          starts_at: string
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: Database["public"]["Enums"]["team_event_type"]
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          place_id?: string | null
          starts_at: string
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: Database["public"]["Enums"]["team_event_type"]
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          place_id?: string | null
          starts_at?: string
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          email: string
          first_name: string | null
          id: string
          invited_at: string
          invited_by: string | null
          jersey_number: number | null
          last_name: string | null
          phone: string | null
          role: Database["public"]["Enums"]["team_role"]
          status: string
          team_id: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          first_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          jersey_number?: number | null
          last_name?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["team_role"]
          status?: string
          team_id: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          jersey_number?: number | null
          last_name?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["team_role"]
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          is_active: boolean
          jersey_number: number | null
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          joined_at?: string
          role: Database["public"]["Enums"]["team_role"]
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          jersey_number?: number | null
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          level: string
          logo_url: string | null
          name: string
          organization: string | null
          primary_color: string | null
          secondary_color: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          logo_url?: string | null
          name: string
          organization?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          level?: string
          logo_url?: string | null
          name?: string
          organization?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          first_name: string
          has_set_password: boolean
          id: string
          is_platform_admin: boolean
          last_name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          has_set_password?: boolean
          id: string
          is_platform_admin?: boolean
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          has_set_password?: boolean
          id?: string
          is_platform_admin?: boolean
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_league_role: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["league_role"]
      }
      get_leagues_for_team: { Args: { p_team_id: string }; Returns: string[] }
      get_team_role: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      is_channel_member: {
        Args: { p_channel_id: string; p_user_id: string }
        Returns: boolean
      }
      is_coach: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      is_league_member: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: boolean
      }
      is_league_staff: {
        Args: { p_league_id: string; p_user_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_player_owner: {
        Args: { p_player_id: string; p_user_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      bats_throws: "right" | "left" | "switch"
      channel_type: "announcement" | "topic" | "direct"
      game_location_type: "home" | "away" | "neutral"
      game_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "postponed"
      league_role: "league_admin" | "league_manager"
      player_position:
        | "pitcher"
        | "catcher"
        | "first_base"
        | "second_base"
        | "third_base"
        | "shortstop"
        | "left_field"
        | "center_field"
        | "right_field"
        | "designated_hitter"
        | "utility"
        | "infield"
        | "outfield"
      rsvp_status: "attending" | "not_attending" | "maybe"
      team_event_type: "meeting" | "scrimmage" | "travel" | "other"
      team_role:
        | "head_coach"
        | "assistant_coach"
        | "player"
        | "parent"
        | "athletic_director"
        | "scorekeeper"
        | "staff"
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
      bats_throws: ["right", "left", "switch"],
      channel_type: ["announcement", "topic", "direct"],
      game_location_type: ["home", "away", "neutral"],
      game_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "postponed",
      ],
      league_role: ["league_admin", "league_manager"],
      player_position: [
        "pitcher",
        "catcher",
        "first_base",
        "second_base",
        "third_base",
        "shortstop",
        "left_field",
        "center_field",
        "right_field",
        "designated_hitter",
        "utility",
        "infield",
        "outfield",
      ],
      rsvp_status: ["attending", "not_attending", "maybe"],
      team_event_type: ["meeting", "scrimmage", "travel", "other"],
      team_role: [
        "head_coach",
        "assistant_coach",
        "player",
        "parent",
        "athletic_director",
        "scorekeeper",
        "staff",
      ],
    },
  },
} as const
