import { View, Text, TouchableOpacity } from 'react-native';
import { ZONE_MAP, isInnerZone } from '@baseball/shared';

interface StrikeZoneGridProps {
  selected: number | null;
  onSelect: (zone: number | null) => void;
}

const CELL_SIZE = 40;

/**
 * 5x5 pitch-location grid (pitcher's view). Direct port of web
 * ScoringBoard.tsx's StrikeZoneGrid — built with plain Views/TouchableOpacity
 * (no react-native-svg, matching DefensiveDiamond.tsx's no-SVG precedent).
 * Tapping the already-selected zone clears it.
 */
export function StrikeZoneGrid({ selected, onSelect }: StrikeZoneGridProps) {
  return (
    <View className="self-start rounded-lg overflow-hidden border border-gray-200">
      {ZONE_MAP.map((row, rowIdx) => (
        <View key={rowIdx} className="flex-row">
          {row.map((zone) => {
            const inner = isInnerZone(zone);
            const isSelected = selected === zone;
            const fill = isSelected
              ? inner
                ? 'bg-brand-500'
                : 'bg-amber-400'
              : inner
                ? 'bg-white'
                : 'bg-gray-100';
            const border = inner ? 'border border-gray-200' : '';
            const textColor = isSelected
              ? 'text-white'
              : inner
                ? 'text-gray-400'
                : 'text-gray-300';
            return (
              <TouchableOpacity
                key={zone}
                className={`items-center justify-center ${fill} ${border}`}
                style={{ width: CELL_SIZE, height: CELL_SIZE }}
                onPress={() => onSelect(isSelected ? null : zone)}
              >
                {inner && (
                  <Text className={`text-xs font-semibold ${textColor}`}>{zone}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
