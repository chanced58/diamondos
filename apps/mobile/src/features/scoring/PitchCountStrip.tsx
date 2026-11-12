import { Text, TouchableOpacity, View } from 'react-native';

/** Pitches / strikes / strike% for one line of the strip. */
function CountGroup({
  label,
  labelClassName = 'text-score-11px text-gray-500',
  pitches,
  strikes,
  emphasis,
}: {
  label: string;
  labelClassName?: string;
  pitches: number;
  strikes: number;
  emphasis?: boolean;
}) {
  // Percentage of nothing is nothing to report — an em dash beats "0%" or NaN
  // before the first pitch.
  const pct = pitches > 0 ? Math.round((strikes / pitches) * 100) : null;
  return (
    <View className="flex-1">
      <Text className={labelClassName} numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-row items-baseline gap-1.5 mt-0.5">
        <Text className={emphasis ? 'text-score-2xl font-bold text-gray-900' : 'text-score-lg font-semibold text-gray-700'}>
          {pitches}
        </Text>
        <Text className="text-score-11px text-gray-500">P</Text>
        <Text className={emphasis ? 'text-score-lg font-semibold text-gray-700' : 'text-score-base font-semibold text-gray-600'}>
          {strikes}
        </Text>
        <Text className="text-score-11px text-gray-500">S</Text>
        <Text className="text-score-11px text-gray-400">{pct === null ? '—' : `${pct}%`}</Text>
      </View>
    </View>
  );
}

/**
 * Pitch and strike totals, sitting above the action surface: the pitcher on
 * the mound and the staff behind them. This is the number a coach acts on
 * mid-inning — whether to warm someone up — so it lives where the eye already
 * is between pitches rather than across the screen in the context pane.
 */
export function PitchCountStrip({
  pitcherLabel,
  pitcherNeeded = false,
  onPressPitcher,
  pitcherAccessibilityLabel,
  pitches,
  strikes,
  staffPitches,
  staffStrikes,
  status,
}: {
  pitcherLabel: string;
  /** The pitcher's group is a call to action (their pitcher isn't set). */
  pitcherNeeded?: boolean;
  /** Makes the pitcher's group a button (their pitching change, on phones). */
  onPressPitcher?: () => void;
  pitcherAccessibilityLabel?: string;
  pitches: number;
  strikes: number;
  staffPitches: number;
  staffStrikes: number;
  status: { isOverLimit: boolean; isAtLimit: boolean; isAtWarning: boolean; maxAllowed: number } | null;
}) {
  const flagged = status !== null && (status.isOverLimit || status.isAtLimit || status.isAtWarning);
  const pitcherGroup = (
    <CountGroup
      label={pitcherLabel}
      labelClassName={
        onPressPitcher
          ? pitcherNeeded
            ? 'text-score-11px font-semibold text-amber-700'
            : 'text-score-11px font-semibold text-blue-700'
          : undefined
      }
      pitches={pitches}
      strikes={strikes}
      emphasis
    />
  );
  return (
    <View className="flex-row items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
      {onPressPitcher ? (
        <TouchableOpacity
          testID="pitch-strip-their-pitcher"
          accessibilityRole="button"
          accessibilityLabel={pitcherAccessibilityLabel}
          hitSlop={{ top: 10, bottom: 10 }}
          onPress={onPressPitcher}
          className="flex-1 flex-row"
        >
          {pitcherGroup}
        </TouchableOpacity>
      ) : (
        pitcherGroup
      )}
      <View className="w-px self-stretch bg-gray-200" />
      <CountGroup label="All pitchers · game" pitches={staffPitches} strikes={staffStrikes} />
      {flagged && status && (
        <View
          className={`px-2.5 py-1 rounded-full ${
            status.isOverLimit ? 'bg-red-600' : status.isAtLimit ? 'bg-red-100' : 'bg-amber-100'
          }`}
        >
          <Text
            className={`text-score-xs font-semibold ${
              status.isOverLimit ? 'text-white' : status.isAtLimit ? 'text-red-700' : 'text-amber-700'
            }`}
          >
            {status.isOverLimit
              ? `Over limit (${status.maxAllowed})`
              : `${pitches}/${status.maxAllowed}`}
          </Text>
        </View>
      )}
    </View>
  );
}
