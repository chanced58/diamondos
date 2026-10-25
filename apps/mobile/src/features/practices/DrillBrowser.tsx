import { useMemo, useState, type ReactElement } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { Badge, EmptyState, ListRow, SegmentedControl } from '@baseball/ui';
import { PracticeSkillCategory, SKILL_CATEGORY_LABELS, type PracticeDrill } from '@baseball/shared';
import { ChoiceChips } from './ChoiceChips';
import { browseDrills, drillSubtitle, isTeamDrill, type DrillSource } from './drill-format';

const SOURCES: ReadonlyArray<{ value: DrillSource; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'system', label: 'Curated' },
  { value: 'team', label: 'Our drills' },
];

interface DrillBrowserProps {
  drills: PracticeDrill[];
  onPressDrill: (drill: PracticeDrill) => void;
  /** Picking drills: each picked drill shows its place in the order instead of a chevron. */
  pickedIds?: readonly string[];
  /** Pull-to-refresh for the list. */
  refreshControl?: ReactElement;
}

/**
 * The drill library as a searchable list: search, curated or the team's own,
 * and skill categories — the web library's main filters. Used by the library
 * screen and the plan-from-drills picker.
 */
export function DrillBrowser({ drills, onPressDrill, pickedIds, refreshControl }: DrillBrowserProps) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<DrillSource>('all');
  const [skillCategories, setSkillCategories] = useState<PracticeSkillCategory[]>([]);
  const shown = useMemo(() => browseDrills(drills, { search, source, skillCategories }), [drills, search, source, skillCategories]);

  return (
    <FlatList
      data={shown}
      keyExtractor={(drill) => drill.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      ListHeaderComponent={
        <View className="gap-3 mb-3">
          <TextInput
            accessibilityLabel="Search drills"
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base"
            value={search}
            onChangeText={setSearch}
            placeholder="Search drills"
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <SegmentedControl options={SOURCES} value={source} onChange={setSource} />
          <ChoiceChips
            options={Object.values(PracticeSkillCategory)}
            labels={SKILL_CATEGORY_LABELS}
            selected={skillCategories}
            onChange={setSkillCategories}
          />
          <Text className="text-xs text-gray-500">
            {shown.length === 1 ? '1 drill' : `${shown.length} drills`}
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const place = pickedIds ? pickedIds.indexOf(item.id) : -1;
        return (
          <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
            <ListRow
              title={item.name}
              subtitle={drillSubtitle(item)}
              accessibilityLabel={pickedIds ? `${item.name}${place >= 0 ? ', picked' : ''}` : undefined}
              right={
                place >= 0 ? (
                  <View className="w-7 h-7 rounded-full bg-brand-700 items-center justify-center">
                    <Text className="text-white text-sm font-semibold">{place + 1}</Text>
                  </View>
                ) : isTeamDrill(item) ? (
                  <Badge label="Team" variant="default" />
                ) : undefined
              }
              showChevron={!pickedIds}
              onPress={() => onPressDrill(item)}
            />
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState title="No drills" message="No drills match these filters." />}
    />
  );
}
