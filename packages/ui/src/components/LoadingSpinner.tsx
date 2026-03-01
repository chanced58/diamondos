import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../theme/colors';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = 'large', fullScreen = false }: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size={size} color={colors.primary[700]} />
      </View>
    );
  }
  return <ActivityIndicator size={size} color={colors.primary[700]} />;
}
