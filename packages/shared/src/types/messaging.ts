export enum ChannelType {
  ANNOUNCEMENT = 'announcement',
  TOPIC = 'topic',
  DIRECT = 'direct',
}

export enum RsvpStatus {
  ATTENDING = 'attending',
  NOT_ATTENDING = 'not_attending',
  MAYBE = 'maybe',
}

export interface Channel {
  id: string;
  teamId: string;
  channelType: ChannelType;
  name?: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelMember {
  id: string;
  channelId: string;
  userId: string;
  canPost: boolean;
  lastReadAt?: string;
  joinedAt: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  body: string;
  parentId?: string;
  isPinned: boolean;
  editedAt?: string;
  deletedAt?: string;
  createdAt: string;
}

export interface GameRsvp {
  id: string;
  gameId: string;
  userId: string;
  status: RsvpStatus;
  note?: string;
  respondedAt: string;
}

export interface PushToken {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  createdAt: string;
  lastUsedAt?: string;
}
