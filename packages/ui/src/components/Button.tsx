import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type TouchableOpacityProps,
} from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends TouchableOpacityProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  label: string;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string }> = {
  primary: {
    container: 'bg-blue-700 active:bg-blue-800',
    text: 'text-white font-semibold',
  },
  secondary: {
    container: 'bg-white border border-gray-300 active:bg-gray-50',
    text: 'text-gray-800 font-semibold',
  },
  danger: {
    container: 'bg-red-600 active:bg-red-700',
    text: 'text-white font-semibold',
  },
  ghost: {
    container: 'bg-transparent active:bg-gray-100',
    text: 'text-blue-700 font-semibold',
  },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: 'px-3 py-1.5 rounded-md', text: 'text-sm' },
  md: { container: 'px-4 py-2 rounded-lg', text: 'text-base' },
  lg: { container: 'px-6 py-3 rounded-xl', text: 'text-lg' },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  label,
  disabled,
  ...props
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      className={`flex-row items-center justify-center ${v.container} ${s.container} ${isDisabled ? 'opacity-50' : ''}`}
      disabled={isDisabled}
      activeOpacity={0.8}
      {...props}
    >
      {loading && <ActivityIndicator size="small" color="currentColor" className="mr-2" />}
      <Text className={`${v.text} ${s.text}`}>{label}</Text>
    </TouchableOpacity>
  );
}
