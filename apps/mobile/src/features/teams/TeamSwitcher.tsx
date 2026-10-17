import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRole } from '../../providers/RoleProvider';
import { TournamentTag } from '../tournaments/TournamentTag';

/**
 * Lets a user on more than one team pick which team's games the Games and
 * Schedule tabs show — e.g. a coach's regular team and a separate tournament
 * team. Renders nothing for a single team. The choice persists through
 * RoleProvider's stored active team.
 */
export function TeamSwitcher() {
  const { memberships, activeTeam, setActiveTeamId } = useRole();
  if (memberships.length < 2) return null;

  return (
    <View className="border-b border-gray-200 bg-white">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {memberships.map((team) => {
          const selected = team.teamId === activeTeam?.teamId;
          return (
            <TouchableOpacity
              key={team.teamId}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={team.isTournamentTeam ? `${team.teamName}, tournament team` : team.teamName}
              onPress={() => {
                void setActiveTeamId(team.teamId);
              }}
              className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
                selected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
              }`}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                {team.teamName}
              </Text>
              {team.isTournamentTeam && <TournamentTag inverted={selected} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
