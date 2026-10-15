import type { Database } from '@baseball/database';

type SubscriptionTable = Database['public']['Tables']['subscriptions'];
type BillableEntityType = Database['public']['Enums']['billable_entity_type'] | 'player';

// Migration 20260417000001_player_profiles adds player subscriptions and profiles.
// Keep this admin query schema narrow until the generated Database includes it.
export type AdminDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Omit<Database['public']['Tables'], 'subscriptions' | 'leagues'> & {
      // Migration 20260531000004 fills omitted slugs in a BEFORE INSERT trigger.
      leagues: Omit<Database['public']['Tables']['leagues'], 'Insert'> & {
        Insert: Omit<Database['public']['Tables']['leagues']['Insert'], 'slug'> & { slug?: string };
      };
      subscriptions: Omit<SubscriptionTable, 'Row' | 'Insert' | 'Update'> & {
        Row: Omit<SubscriptionTable['Row'], 'entity_type'> & {
          entity_type: BillableEntityType;
          user_id: string | null;
        };
        Insert: Omit<SubscriptionTable['Insert'], 'entity_type'> & {
          entity_type: BillableEntityType;
          user_id?: string | null;
        };
        Update: Omit<SubscriptionTable['Update'], 'entity_type'> & {
          entity_type?: BillableEntityType;
          user_id?: string | null;
        };
      };
      // Only these profile fields are queried by the admin billing dropdown.
      player_profiles: {
        Row: { user_id: string; handle: string };
        Insert: { user_id: string; handle: string };
        Update: { user_id?: string; handle?: string };
        Relationships: [];
      };
    };
  };
};
