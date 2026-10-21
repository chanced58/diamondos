import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { getSupabaseClient } from '../src/lib/supabase';
import { useAuth } from '../src/providers/AuthProvider';
import {
  describeAuthCallbackError,
  describeExchangeError,
  parseAuthCallbackUrl,
  type AuthCallbackResult,
} from '../src/features/auth/auth-callback';

/**
 * Landing route for `baseballcoaches://auth-callback`. Tapping the magic link
 * in the sign-in email opens the app here; without this route Expo Router
 * showed "Unmatched route" and the user stayed signed out.
 *
 * Exchanges the PKCE `code` for a session; AuthProvider then sees the user
 * and this screen hands over to the tabs. Google sign-in normally completes
 * inside `sign-in.tsx` (openAuthSessionAsync returns the URL there); if the
 * deep link also lands here, a failed second exchange is ignored once a
 * session exists.
 */
export default function AuthCallbackScreen() {
  const { user } = useAuth();
  const url = Linking.useURL();
  const params = useLocalSearchParams<{ code?: string; error?: string; error_code?: string; error_description?: string }>();
  const [error, setError] = useState<string | null>(null);
  const exchangedCodeRef = useRef<string | null>(null);

  const fromUrl = parseAuthCallbackUrl(url);
  const result: AuthCallbackResult = fromUrl.kind !== 'empty'
    ? fromUrl
    : params.error
      ? { kind: 'error', message: describeAuthCallbackError(params.error, params.error_code, params.error_description) }
      : params.code
        ? { kind: 'code', code: params.code }
        : { kind: 'empty' };
  const code = result.kind === 'code' ? result.code : null;

  useEffect(() => {
    if (!code || exchangedCodeRef.current === code) return;
    exchangedCodeRef.current = code;
    getSupabaseClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError) setError(describeExchangeError(exchangeError.message));
      })
      .catch((err: unknown) => {
        console.warn('auth-callback: code exchange threw', err);
        setError('Sign-in failed. Please try again.');
      });
  }, [code]);

  if (user) return <Redirect href="/(tabs)" />;

  const message = result.kind === 'error'
    ? result.message
    : result.kind === 'empty'
      ? 'This sign-in link is incomplete. Request a new one.'
      : error;

  if (!message) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-900">
        <ActivityIndicator color="#ffffff" />
        <Text className="text-blue-200 mt-3">Signing you in…</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-brand-900 px-6">
      <View className="w-full bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 mb-4">
        <Text accessibilityRole="alert" className="text-red-300 text-sm">{message}</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        className="w-full bg-white rounded-xl py-3.5 items-center"
        onPress={() => router.replace('/(auth)/sign-in')}
      >
        <Text className="text-brand-700 font-bold text-base">Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}
