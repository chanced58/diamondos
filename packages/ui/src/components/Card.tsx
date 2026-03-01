import React from 'react';
import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = '', style, ...props }: CardProps) {
  return (
    <View
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${className}`}
      style={style}
      {...props}
    >
      {children}
    </View>
  );
}
