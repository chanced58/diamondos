'use client';
import type { JSX } from 'react';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { formatDate, formatTime } from '@baseball/shared';

type MessageRow = {
  id: string;
  body: string;
  sender_id: string;
  created_at: string;
  edited_at: string | null;
  is_pinned: boolean;
  user_profiles: { first_name: string; last_name: string } | null;
};

type MemberProfile = { firstName: string; lastName: string };

type Props = {
  channelId: string;
  channelType: string;
  initialMessages: MessageRow[];
  canPost: boolean;
  currentUserId: string;
  memberProfiles: Record<string, MemberProfile>;
};

function getInitials(profile: { first_name: string; last_name: string } | MemberProfile | null) {
  if (!profile) return '?';
  const first = 'first_name' in profile ? profile.first_name : profile.firstName;
  const last  = 'last_name'  in profile ? profile.last_name  : profile.lastName;
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function getFullName(profile: { first_name: string; last_name: string } | MemberProfile | null) {
  if (!profile) return 'Unknown';
  const first = 'first_name' in profile ? profile.first_name : profile.firstName;
  const last  = 'last_name'  in profile ? profile.last_name  : profile.lastName;
  return `${first} ${last}`;
}

export function LeagueMessageThread({
  channelId,
  channelType,
  initialMessages,
  canPost,
  currentUserId,
  memberProfiles,
}: Props): JSX.Element | null {
  const isAnnouncement = channelType === 'announcement';
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Cast to any — league tables are not in generated types until `gen-types` runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase  = createBrowserClient() as any;

  // Subscribe to new league messages via Supabase Realtime
  useEffect(() => {
    const sub = supabase
      .channel(`league-room:${channelId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'league_messages',
          filter: `league_channel_id=eq.${channelId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as MessageRow;
          const profile = memberProfiles[newMsg.sender_id];
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [
              ...prev,
              {
                ...newMsg,
                user_profiles: profile
                  ? { first_name: profile.firstName, last_name: profile.lastName }
                  : null,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [channelId, supabase, memberProfiles]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (sending) return;
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setSendError(null);

    const { error } = await supabase.from('league_messages').insert({
      league_channel_id: channelId,
      sender_id:  currentUserId,
      body,
    });

    if (error) {
      setSendError(error.message);
    } else {
      setDraft('');
    }
    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !sending) {
      e.preventDefault();
      handleSend();
    }
  }

  // Group messages by date
  type MessageGroup = { dateLabel: string; messages: MessageRow[] };
  const grouped: MessageGroup[] = [];
  for (const msg of messages) {
    const dateLabel = formatDate(msg.created_at);
    const last = grouped[grouped.length - 1];
    if (!last || last.dateLabel !== dateLabel) {
      grouped.push({ dateLabel, messages: [msg] });
    } else {
      last.messages.push(msg);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-8">
            No messages yet. {canPost ? 'Be the first to say something!' : ''}
          </p>
        )}

        {grouped.map((group) => (
          <div key={group.dateLabel}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium">{group.dateLabel}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {group.messages.map((msg, i) => {
              const profile = msg.user_profiles;
              const isOwn   = msg.sender_id === currentUserId;
              const prev    = i > 0 ? group.messages[i - 1] : null;
              const showHeader = !prev || prev.sender_id !== msg.sender_id;

              if (isAnnouncement) {
                return (
                  <div key={msg.id} className="group my-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-amber-700 text-white flex items-center justify-center text-xs font-bold">
                            {getInitials(profile)}
                          </div>
                          <span className="text-sm font-bold text-amber-900">
                            {isOwn ? 'You' : getFullName(profile)}
                          </span>
                        </div>
                        <span className="text-xs text-amber-500 font-medium">
                          {formatDate(msg.created_at)} &middot; {formatTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 leading-relaxed whitespace-pre-wrap break-words">
                        {msg.body}
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={`group flex gap-3 ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
                  <div className="w-8 shrink-0 mt-0.5">
                    {showHeader && (
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          isOwn
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {getInitials(profile)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {showHeader && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-gray-900">
                          {isOwn ? 'You' : getFullName(profile)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
                      {msg.body}
                    </p>
                    {msg.edited_at && (
                      <span className="text-xs text-gray-400 italic"> (edited)</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Compose area */}
      {canPost ? (
        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-4">
          {sendError && (
            <p className="text-xs text-red-600 mb-2">{sendError}</p>
          )}
          <div className="flex items-end gap-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message… (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              style={{ minHeight: '42px', maxHeight: '160px', overflowY: 'auto' }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="shrink-0 bg-amber-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-amber-800 disabled:opacity-50 transition-colors"
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-3 text-center">
          <p className="text-xs text-gray-400">
            This channel is read-only for your role. Only league staff can post here.
          </p>
        </div>
      )}
    </div>
  );
}
