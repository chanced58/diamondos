import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState } from '@baseball/ui';
import {
  defaultLeagueScoringSettings,
  MAX_BATTERS_CAP,
  MAX_INNINGS_CAP,
  MIN_BATTERS_CAP,
  MIN_INNINGS,
  type LeagueScoringSettings,
  type LeagueScoringSettingsResponse,
} from '@baseball/shared';
import { ChoiceChips } from '../../../../../src/features/practices/ChoiceChips';
import { SettingSection, SettingStepper, SettingSwitch } from '../../../../../src/features/league-admin/SettingControls';
import {
  leagueScoringSettingsQueryKey,
  saveLeagueScoringSettings,
  useLeagueScoringSettings,
} from '../../../../../src/features/league-admin/league-admin-api';
import { describeApiError } from '../../../../../src/lib/api-client';

type GameLength = LeagueScoringSettings['gameLength'];

const BASES = ['1', '2', '3'] as const;
const BASE_LABELS = { '1': '1st', '2': '2nd', '3': '3rd' } as const;
const NO_PITCH_RULE = 'none';

/**
 * The league's scoring settings (the web league admin Scoring Settings form):
 * lineups, game length, guests, substitutions, game rules, dual scorekeeping
 * and the default pitch-count ruleset, for every team in the league. League
 * admins change and save them as one; managers read.
 */
export default function LeagueScoringSettingsScreen() {
  const { leagueId = '' } = useLocalSearchParams<{ leagueId: string }>();
  const query = useLeagueScoringSettings(leagueId);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<LeagueScoringSettings | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (settings: LeagueScoringSettings) => saveLeagueScoringSettings(leagueId, settings),
    onSuccess: ({ settings }) => {
      queryClient.setQueryData<LeagueScoringSettingsResponse>(leagueScoringSettingsQueryKey(leagueId), (current) =>
        current ? { ...current, settings } : current,
      );
      setDraft(null);
      setSaved(true);
    },
  });

  const header = <Stack.Screen options={{ title: 'Scoring settings' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const { canEdit, pitchRuleOptions } = query.data;
  const settings = draft ?? query.data.settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(query.data.settings);
  const locked = !canEdit || save.isPending;

  const edit = (next: LeagueScoringSettings) => {
    setDraft(next);
    setSaved(false);
    save.reset();
  };
  const patch = <K extends keyof LeagueScoringSettings>(section: K, values: Partial<LeagueScoringSettings[K]>) =>
    edit({ ...settings, [section]: { ...settings[section], ...values } });
  const patchGameLength = <K extends 'mercy' | 'runCap' | 'tiebreakerExtras'>(rule: K, values: Partial<GameLength[K]>) =>
    patch('gameLength', { [rule]: { ...settings.gameLength[rule], ...values } } as Partial<GameLength>);

  const { lineup, gameLength, guests } = settings;
  const pitchRuleIds = [NO_PITCH_RULE, ...pitchRuleOptions.map((rule) => rule.id)];
  const pitchRuleLabels: Record<string, string> = {
    [NO_PITCH_RULE]: 'No default (teams choose)',
    ...Object.fromEntries(pitchRuleOptions.map((rule) => [rule.id, rule.label])),
  };
  const selectedPitchRule = settings.compliance.defaultPitchRuleId ?? NO_PITCH_RULE;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <Text className="text-sm text-gray-500">
        {query.data.league.name} · applies to every team in the league
        {canEdit ? '' : '. League admins change these; you can view them.'}
      </Text>

      <SettingSection title="Lineup and batting" description="How batting orders are built and extended during a game.">
        <SettingSwitch label="Expanded lineups (more than 9 batters)" value={lineup.allowExpanded} disabled={locked} onChange={(allowExpanded) => patch('lineup', { allowExpanded })} />
        {lineup.allowExpanded && (
          <>
            <SettingStepper label="Most batters" value={lineup.maxBatters} min={MIN_BATTERS_CAP} max={MAX_BATTERS_CAP} disabled={locked} onChange={(maxBatters) => patch('lineup', { maxBatters })} />
            <SettingSwitch label="Add batters mid-game" value={lineup.allowMidGameExtension} disabled={locked} onChange={(allowMidGameExtension) => patch('lineup', { allowMidGameExtension })} />
          </>
        )}
        <SettingSwitch label="Continuous batting order (every rostered player bats)" value={lineup.continuousBattingOrder} disabled={locked} onChange={(continuousBattingOrder) => patch('lineup', { continuousBattingOrder })} />
      </SettingSection>

      <SettingSection title="Game length" description="Innings, mercy rule, per-half run cap and the ghost-runner tiebreaker.">
        <SettingStepper label="Regulation innings" value={gameLength.maxInnings} min={MIN_INNINGS} max={MAX_INNINGS_CAP} disabled={locked} onChange={(maxInnings) => patch('gameLength', { maxInnings })} />
        <SettingSwitch label="Mercy rule" value={gameLength.mercy.enabled} disabled={locked} onChange={(enabled) => patchGameLength('mercy', { enabled })} />
        {gameLength.mercy.enabled && (
          <>
            <SettingStepper label="Run differential" value={gameLength.mercy.runDiff} min={1} max={30} disabled={locked} onChange={(runDiff) => patchGameLength('mercy', { runDiff })} />
            <SettingStepper label="After completed inning" value={gameLength.mercy.afterInning} min={1} max={MAX_INNINGS_CAP} disabled={locked} onChange={(afterInning) => patchGameLength('mercy', { afterInning })} />
          </>
        )}
        <SettingSwitch label="Max runs per half-inning" value={gameLength.runCap.enabled} disabled={locked} onChange={(enabled) => patchGameLength('runCap', { enabled })} />
        {gameLength.runCap.enabled && (
          <SettingStepper label="Run cap" value={gameLength.runCap.value} min={1} max={30} disabled={locked} onChange={(value) => patchGameLength('runCap', { value })} />
        )}
        <SettingSwitch label="Ghost-runner tiebreaker in extras" value={gameLength.tiebreakerExtras.enabled} disabled={locked} onChange={(enabled) => patchGameLength('tiebreakerExtras', { enabled })} />
        {gameLength.tiebreakerExtras.enabled && (
          <>
            <View className="py-2.5 border-b border-gray-100">
              <Text className="text-base text-gray-900 mb-2">Runner starts on</Text>
              <ChoiceChips
                options={BASES}
                labels={BASE_LABELS}
                selected={[String(gameLength.tiebreakerExtras.startBase) as (typeof BASES)[number]]}
                onChange={(picked) => {
                  const next = picked.find((base) => base !== String(gameLength.tiebreakerExtras.startBase));
                  if (next && !locked) patchGameLength('tiebreakerExtras', { startBase: Number(next) as 1 | 2 | 3 });
                }}
              />
            </View>
            <SettingStepper label="Starts at inning" value={gameLength.tiebreakerExtras.fromInning} min={1} max={MAX_INNINGS_CAP} disabled={locked} onChange={(fromInning) => patchGameLength('tiebreakerExtras', { fromInning })} />
          </>
        )}
      </SettingSection>

      <SettingSection title="Guest players" description="Non-roster players, ad hoc or from another team, in a lineup.">
        <SettingSwitch label="Allow guest players in lineups" value={guests.allowed} disabled={locked} onChange={(allowed) => patch('guests', { allowed })} />
        {guests.allowed && (
          <SettingSwitch label="Count guest appearances toward stats by default" value={guests.countTowardStatsDefault} disabled={locked} onChange={(countTowardStatsDefault) => patch('guests', { countTowardStatsDefault })} />
        )}
      </SettingSection>

      <SettingSection title="Substitutions and rules">
        <SettingSwitch
          label="Courtesy runner for catcher and pitcher"
          value={settings.substitutions.courtesyRunnerForCatcherPitcher}
          disabled={locked}
          onChange={(courtesyRunnerForCatcherPitcher) => patch('substitutions', { courtesyRunnerForCatcherPitcher })}
        />
        <SettingSwitch
          label="Dropped third strike (batter can run on an uncaught K3)"
          value={settings.rules.droppedThirdStrike}
          disabled={locked}
          onChange={(droppedThirdStrike) => patch('rules', { droppedThirdStrike })}
        />
      </SettingSection>

      <SettingSection
        title="Scorekeeping"
        description="Both teams score the same game. The opponent must be a linked team; the home team’s log stays canonical and differences show once both games are done."
      >
        <SettingSwitch label="Dual scorekeeper" value={settings.scorekeeping.dualScorekeeper} disabled={locked} onChange={(dualScorekeeper) => patch('scorekeeping', { dualScorekeeper })} />
      </SettingSection>

      <SettingSection title="Pitch-count compliance" description="The default ruleset for new seasons in the league. Teams can still choose their own per season.">
        <View className="py-3">
          <ChoiceChips
            options={pitchRuleIds}
            labels={pitchRuleLabels}
            selected={[selectedPitchRule]}
            onChange={(picked) => {
              const next = picked.find((id) => id !== selectedPitchRule);
              if (next && !locked) patch('compliance', { defaultPitchRuleId: next === NO_PITCH_RULE ? null : next });
            }}
          />
        </View>
      </SettingSection>

      {canEdit && (
        <View className="gap-2 mt-6">
          {save.isError && (
            <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <Text accessibilityRole="alert" className="text-sm text-red-700">
                {describeApiError(save.error)}
              </Text>
            </View>
          )}
          {saved && !dirty && <Text className="text-sm text-emerald-700">Settings saved.</Text>}
          <Button label="Save settings" loading={save.isPending} disabled={!dirty || save.isPending} onPress={() => save.mutate(settings)} />
          <Button label="Reset to defaults" variant="secondary" disabled={save.isPending} onPress={() => edit(defaultLeagueScoringSettings())} />
          {dirty && <Text className="text-xs text-gray-500">Unsaved changes. Nothing changes for the league until you save.</Text>}
        </View>
      )}
    </ScrollView>
  );
}
