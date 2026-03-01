import { Model, field } from '@nozbe/watermelondb';

export class Player extends Model {
  static table = 'players';

  @field('remote_id') remoteId!: string;
  @field('team_id') teamId!: string;
  @field('first_name') firstName!: string;
  @field('last_name') lastName!: string;
  @field('jersey_number') jerseyNumber!: number | undefined;
  @field('primary_position') primaryPosition!: string | undefined;
  @field('bats') bats!: string | undefined;
  @field('throws') throws!: string | undefined;
  @field('is_active') isActive!: boolean;
  @field('synced_at') syncedAt!: number | undefined;

  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}
