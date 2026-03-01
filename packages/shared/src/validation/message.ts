import { z } from 'zod';
import { ChannelType, RsvpStatus } from '../types/messaging';

export const createChannelSchema = z.object({
  channelType: z.nativeEnum(ChannelType),
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().min(1, 'Message cannot be empty').max(4000),
  parentId: z.string().uuid().optional(),
});

export const rsvpSchema = z.object({
  status: z.nativeEnum(RsvpStatus),
  note: z.string().max(200).optional(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type RsvpInput = z.infer<typeof rsvpSchema>;
