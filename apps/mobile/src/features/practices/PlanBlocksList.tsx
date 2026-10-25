import { Text, View } from 'react-native';
import { BLOCK_TYPE_LABELS, type PracticeBlockType } from '@baseball/shared';

export interface PlanBlock {
  blockType: PracticeBlockType;
  title: string;
  plannedDurationMinutes: number;
  drillId?: string | null;
  rationale: string;
}

/**
 * A generated plan's blocks for review before saving (the AI and prep
 * previews): title, type, minutes, the drill it uses and why it was chosen.
 */
export function PlanBlocksList({ blocks, drillsById }: { blocks: PlanBlock[]; drillsById: Record<string, string> }) {
  return (
    <View className="bg-white rounded-xl border border-gray-200 mb-4">
      {blocks.map((block, index) => {
        const drill = block.drillId ? drillsById[block.drillId] : undefined;
        return (
          <View key={`${index}-${block.title}`} className={`px-4 py-3 ${index > 0 ? 'border-t border-gray-100' : ''}`}>
            <View className="flex-row items-start justify-between">
              <Text className="flex-1 text-base font-medium text-gray-900">
                {index + 1}. {block.title}
              </Text>
              <Text className="text-sm text-gray-500 ml-2">{block.plannedDurationMinutes} min</Text>
            </View>
            <Text className="text-xs text-gray-500 mt-0.5">
              {BLOCK_TYPE_LABELS[block.blockType] ?? block.blockType}
              {drill ? ` · ${drill}` : ''}
            </Text>
            {block.rationale ? <Text className="text-sm text-gray-600 mt-1">{block.rationale}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** Minutes the blocks add up to. */
export function plannedMinutes(blocks: PlanBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.plannedDurationMinutes, 0);
}
