import { Text, View } from 'react-native';

/** Small amber pill marking a tournament team or a tournament game. */
export function TournamentTag({ inverted = false }: { inverted?: boolean }) {
  return (
    <View className={`px-1.5 py-0.5 rounded-full ${inverted ? 'bg-white/20' : 'bg-amber-100'}`}>
      <Text className={`text-[10px] font-semibold ${inverted ? 'text-white' : 'text-amber-800'}`}>
        Tournament
      </Text>
    </View>
  );
}
