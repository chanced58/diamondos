import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  fullScreen?: boolean;
  /**
   * Spinner color. Defaults to the Light brand navy, which is nearly invisible
   * on a dark surface; themed callers pass a lighter brand color there.
   */
  color?: string;
}

export function LoadingSpinner({ size = 'large', fullScreen = false, color = colors.primary[700] }: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }
  return <ActivityIndicator size={size} color={color} />;
}
