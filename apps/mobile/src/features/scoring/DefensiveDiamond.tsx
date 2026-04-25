import { View, Text } from 'react-native';
import type { DefensiveLineup, Fielder, PositionAbbr } from '@baseball/shared';

interface DefensiveDiamondProps {
  lineup: DefensiveLineup;
  /** Optional small caption above the field (e.g., team name). */
  teamLabel?: string;
}

const FIELD_W = 300;
const FIELD_H = 220;

type Spot = {
  pos: Exclude<PositionAbbr, 'DH'>;
  /** Top-left coords of the pill's positioning box (we'll center horizontally with translateX). */
  top: number;
  left: number;
};

// Coordinates picked to mirror a real diamond at 300x220.
// Each pill is positioned by its top-left; widths vary so we anchor by left edge
// and center via translateX of half the pill width inside the View.
const SPOTS: Spot[] = [
  { pos: 'CF', top: 5,   left: FIELD_W / 2 },
  { pos: 'LF', top: 30,  left: 40 },
  { pos: 'RF', top: 30,  left: FIELD_W - 40 },
  { pos: 'SS', top: 95,  left: 100 },
  { pos: '2B', top: 95,  left: 200 },
  { pos: '3B', top: 145, left: 50 },
  { pos: '1B', top: 145, left: 250 },
  { pos: 'P',  top: 130, left: FIELD_W / 2 },
  { pos: 'C',  top: 195, left: FIELD_W / 2 },
];

function fielderLabel(f: Fielder | null): string {
  if (!f) return '';
  const num = f.jerseyNumber != null && f.jerseyNumber !== '' ? `#${f.jerseyNumber} ` : '';
  return `${num}${f.lastName || f.firstName || 'Player'}`.trim();
}

function PositionPill({
  pos,
  fielder,
  top,
  left,
}: {
  pos: PositionAbbr;
  fielder: Fielder | null;
  top: number;
  left: number;
}) {
  const filled = !!fielder;
  const text = filled ? `${pos}  ${fielderLabel(fielder)}` : pos;
  return (
    <View
      className={`absolute rounded-md px-1.5 py-0.5 ${filled ? 'bg-brand-700 border border-brand-500' : 'bg-black/40 border border-white/30'}`}
      style={{
        top,
        left,
        transform: [{ translateX: -28 }],
        minWidth: 56,
        maxWidth: 96,
      }}
    >
      <Text
        className="text-white text-[10px] font-semibold text-center"
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * Compact baseball-field diamond showing the current defensive alignment.
 * Used above defensive-substitution and position-change pickers so the
 * scorer can see who's currently at each position before making the change.
 *
 * Built with absolute-positioned <View>s (matching BaserunnerDisplay) so we
 * don't pull in react-native-svg.
 */
export function DefensiveDiamond({ lineup, teamLabel }: DefensiveDiamondProps) {
  return (
    <View>
      {teamLabel && (
        <Text className="text-xs text-gray-400 uppercase tracking-wide mb-1">
          {teamLabel} — current alignment
        </Text>
      )}
      <View
        className="bg-emerald-900/90 rounded-xl overflow-hidden self-center"
        style={{ width: FIELD_W, height: FIELD_H }}
      >
        {/* Outfield grass already provided by background. Infield dirt diamond: */}
        <View
          className="absolute bg-amber-800/80"
          style={{
            width: 110,
            height: 110,
            top: 75,
            left: FIELD_W / 2 - 55,
            transform: [{ rotate: '45deg' }],
          }}
        />
        {/* Infield grass center */}
        <View
          className="absolute bg-emerald-800"
          style={{
            width: 60,
            height: 60,
            top: 100,
            left: FIELD_W / 2 - 30,
            transform: [{ rotate: '45deg' }],
          }}
        />
        {/* Pitcher's mound */}
        <View
          className="absolute bg-amber-700 rounded-full"
          style={{ width: 14, height: 14, top: 130, left: FIELD_W / 2 - 7 }}
        />

        {SPOTS.map((spot) => (
          <PositionPill
            key={spot.pos}
            pos={spot.pos}
            fielder={lineup[spot.pos]}
            top={spot.top}
            left={spot.left}
          />
        ))}
      </View>

      <View className="flex-row items-center mt-2 gap-2">
        <Text className="text-xs text-gray-400 uppercase tracking-wide w-8">DH</Text>
        {lineup.DH ? (
          <Text className="text-sm text-gray-700 font-medium">{fielderLabel(lineup.DH)}</Text>
        ) : (
          <Text className="text-sm text-gray-400">—</Text>
        )}
      </View>
    </View>
  );
}
