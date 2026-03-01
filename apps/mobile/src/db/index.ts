import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { schema } from './schema';
import { Game } from './models/Game';
import { GameEvent } from './models/GameEvent';
import { Player } from './models/Player';
import { Channel } from './models/Channel';
import { Message } from './models/Message';

const adapter = new SQLiteAdapter({
  schema,
  // dbName: 'baseball_coaches',  // defaults to app bundle ID
  jsi: true,        // Turbo module for better performance
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
    // In production, consider clearing the database and resyncing
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Game, GameEvent, Player, Channel, Message],
});

export { Game, GameEvent, Player, Channel, Message };
