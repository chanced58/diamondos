import { View, Text } from 'react-native';
import { Button } from '@baseball/ui';
import type { GameDetailResponse } from '@baseball/shared';

type Reconciliation = NonNullable<GameDetailResponse['reconciliation']>;

interface ReconciliationCardProps {
  reconciliation: Reconciliation;
  /** The conflict key whose override is being saved, if any. */
  savingKey: string | null;
  onOverride: (conflictKey: string, useAwayValue: boolean) => void;
}

const fmt = (value: number | null) => (value === null ? '—' : String(value));

/**
 * Dual-scorekeeper reconciliation for a completed paired game (the web's
 * ReconciliationPanel). The home log stands unless the settler accepts the
 * away value; keeping the home value is a choice too, and the differences
 * stay to settle until each has one. A player's conflicts are decided
 * together. Overrides never touch the event log.
 */
export function ReconciliationCard({ reconciliation, savingKey, onOverride }: ReconciliationCardProps) {
  const { conflicts, homeTeamLabel, awayTeamLabel, canOverride } = reconciliation;
  // An older web deploy sends no `settled`; there only an away value was recorded.
  const isSettled = (conflict: (typeof conflicts)[number]) => conflict.settled ?? conflict.overridden;
  const openCount = conflicts.filter((conflict) => !isSettled(conflict)).length;

  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4">
      <Text accessibilityRole="header" className="font-semibold text-gray-900">
        Scorekeeper reconciliation
      </Text>
      <Text className="text-xs text-gray-400 mt-0.5">{homeTeamLabel} log is canonical</Text>

      {conflicts.length === 0 ? (
        <Text className="text-sm text-emerald-700 mt-3">✓ Both scorekeepers agree on every tracked value.</Text>
      ) : (
        <>
          <Text className="text-xs text-gray-500 mt-3 mb-1">
            {conflicts.length} difference{conflicts.length === 1 ? '' : 's'} between the two logs
            {openCount > 0 ? `, ${openCount} still to settle` : ', all settled'}. The home value stands unless{' '}
            {canOverride ? 'you accept' : 'the home coach accepts'} the away value.
          </Text>
          {conflicts.map((conflict) => {
            const settled = isSettled(conflict);
            const saving = savingKey === conflict.key;
            return (
              <View key={conflict.key} className="py-3 border-b border-gray-100">
                <Text className="text-sm text-gray-800">{conflict.label}</Text>
                {!settled && <Text className="text-xs text-amber-700 mt-0.5">Not settled</Text>}
                <View className="flex-row flex-wrap gap-x-4 mt-1">
                  <Text className={`text-sm ${conflict.overridden ? 'text-gray-400' : 'font-semibold text-emerald-700'}`}>
                    {homeTeamLabel} (home): {fmt(conflict.homeLog)}
                  </Text>
                  <Text className={`text-sm ${conflict.overridden ? 'font-semibold text-emerald-700' : 'text-gray-400'}`}>
                    {awayTeamLabel}: {fmt(conflict.awayLog)}
                  </Text>
                </View>
                {canOverride && (
                  <View className="mt-2 flex-row flex-wrap gap-2">
                    {(!settled || conflict.overridden) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={saving}
                        disabled={savingKey !== null}
                        label={`${conflict.overridden ? 'Use' : 'Keep'} ${homeTeamLabel} value`}
                        onPress={() => onOverride(conflict.key, false)}
                      />
                    )}
                    {(!settled || !conflict.overridden) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={saving}
                        disabled={savingKey !== null}
                        label={`Use ${awayTeamLabel} value`}
                        onPress={() => onOverride(conflict.key, true)}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}
