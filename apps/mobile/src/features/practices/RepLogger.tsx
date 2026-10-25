import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import {
  PRACTICE_REP_OUTCOMES,
  PracticeRepCoachTag,
  type PracticeRepOutcome,
  type PracticeRosterPlayer,
} from '@baseball/shared';
import { logPracticeRep } from './practices-api';
import { describeApiError } from '../../lib/api-client';

export const OUTCOME_LABELS: Record<PracticeRepOutcome, string> = {
  hit_hard: 'Hit hard',
  line_drive: 'Line drive',
  weak_contact: 'Weak contact',
  swing_miss: 'Swing & miss',
  take: 'Take',
  ground_out: 'Ground out',
  fly_out: 'Fly out',
  walk: 'Walk',
  foul: 'Foul',
};

const TAGS: Array<{ value: PracticeRepCoachTag; label: string }> = [
  { value: PracticeRepCoachTag.HOT, label: '🔥 Hot' },
  { value: PracticeRepCoachTag.COLD, label: '🧊 Cold' },
  { value: PracticeRepCoachTag.IMPROVED, label: '📈 Improved' },
  { value: PracticeRepCoachTag.FORM_BREAK, label: '⚠️ Form break' },
];

interface Props {
  practiceId: string;
  players: PracticeRosterPlayer[];
  onLogged: () => void;
}

const playerLabel = (p: PracticeRosterPlayer) => `${p.firstName} ${p.lastName.charAt(0)}.${p.jerseyNumber != null ? ` #${p.jerseyNumber}` : ''}`;

/**
 * BP rep logging (the web "Log a rep" form), built for the cage: pick the
 * hitter once, then each tap on an outcome logs a rep. A coach tag, when
 * chosen, rides on the next rep only.
 */
export function RepLogger({ practiceId, players, onLogged }: Props) {
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const [tag, setTag] = useState<PracticeRepCoachTag | null>(null);
  const [last, setLast] = useState<string | null>(null);

  const log = useMutation({
    mutationFn: (outcome: PracticeRepOutcome) => logPracticeRep(practiceId, { playerId, outcome, coachTag: tag }),
    onSuccess: (_result, outcome) => {
      const player = players.find((p) => p.id === playerId);
      setLast(`${OUTCOME_LABELS[outcome]} for ${player ? `${player.firstName} ${player.lastName}` : 'the hitter'}`);
      setTag(null);
      onLogged();
    },
  });

  if (players.length === 0) return null;

  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <Text className="text-sm font-semibold text-gray-900 mb-2">Log a rep</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8 }}>
        {players.map((p) => (
          <Chip key={p.id} label={playerLabel(p)} selected={p.id === playerId} onPress={() => setPlayerId(p.id)} />
        ))}
      </ScrollView>
      <View className="flex-row flex-wrap gap-2 mb-3">
        {TAGS.map((t) => (
          <Chip key={t.value} label={t.label} selected={tag === t.value} onPress={() => setTag(tag === t.value ? null : t.value)} small />
        ))}
      </View>
      <View className="flex-row flex-wrap gap-2">
        {PRACTICE_REP_OUTCOMES.map((outcome) => (
          <TouchableOpacity
            key={outcome}
            accessibilityRole="button"
            accessibilityLabel={`Log ${OUTCOME_LABELS[outcome]}`}
            disabled={!playerId || log.isPending}
            onPress={() => log.mutate(outcome)}
            className={`bg-brand-700 rounded-lg px-3 py-2.5 ${log.isPending ? 'opacity-50' : ''}`}
            style={{ minWidth: '30%' }}
          >
            <Text className="text-white text-sm font-semibold text-center">{OUTCOME_LABELS[outcome]}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {log.isError ? (
        <Text accessibilityRole="alert" className="text-xs text-red-700 mt-2">{describeApiError(log.error)}</Text>
      ) : last ? (
        <Text className="text-xs text-gray-500 mt-2">Logged: {last}</Text>
      ) : null}
    </View>
  );
}

/** A selectable pill, for the hitter and coach-tag pickers. */
function Chip({ label, selected, onPress, small }: { label: string; selected: boolean; onPress: () => void; small?: boolean }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`rounded-full border ${small ? 'px-2.5 py-1' : 'px-3 py-1.5'} ${selected ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-300'}`}
    >
      <Text className={`${small ? 'text-xs' : 'text-sm'} ${selected ? 'text-white font-semibold' : 'text-gray-700'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
