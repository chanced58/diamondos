import type { Database } from '@baseball/database';

export type AdminDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Omit<Database['public']['Tables'], 'leagues'> & {
      // Migration 20260531000004 fills omitted slugs in a BEFORE INSERT trigger.
      leagues: Omit<Database['public']['Tables']['leagues'], 'Insert'> & {
        Insert: Omit<Database['public']['Tables']['leagues']['Insert'], 'slug'> & { slug?: string };
      };
    };
  };
};
