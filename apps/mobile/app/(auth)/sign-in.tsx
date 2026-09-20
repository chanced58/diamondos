import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getSupabaseClient } from '../../src/lib/supabase';

const GOOGLE_REDIRECT_URI = 'baseballcoaches://auth-callback';
const GOOGLE_NOT_INVITED_MESSAGE =
  "That Google account isn't associated with an invite. Contact your coach, or sign in with the email your invite was sent to.";
const GOOGLE_SIGNIN_FAILED_MESSAGE = 'Google sign-in failed. Please try again.';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  async function handleSignIn() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
      options: {
        emailRedirectTo: 'baseballcoaches://auth-callback',
      },
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);

    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: GOOGLE_REDIRECT_URI, skipBrowserRedirect: true },
    });

    if (oauthError || !data?.url) {
      setError(oauthError?.message ?? 'Unable to start Google sign-in.');
      setGoogleLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT_URI);

    if (result.type !== 'success') {
      // User cancelled or dismissed the browser — not an error.
      setGoogleLoading(false);
      return;
    }

    const { queryParams } = Linking.parse(result.url);

    if (queryParams?.error) {
      setError(queryParams.error === 'server_error' ? GOOGLE_NOT_INVITED_MESSAGE : GOOGLE_SIGNIN_FAILED_MESSAGE);
      setGoogleLoading(false);
      return;
    }

    const code = queryParams?.code;
    if (typeof code === 'string') {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) setError(exchangeError.message);
    } else {
      setError('Something went wrong signing in with Google. Please try again.');
    }
    setGoogleLoading(false);
  }

  if (sent) {
    return (
      <View className="flex-1 bg-brand-900 items-center justify-center px-6">
        <Text className="text-5xl mb-4">📧</Text>
        <Text className="text-white text-2xl font-bold mb-2">Check your email</Text>
        <Text className="text-blue-300 text-center mb-8">
          We sent a magic link to {email}. Tap the link to sign in.
        </Text>
        <TouchableOpacity onPress={() => setSent(false)}>
          <Text className="text-blue-300 underline text-sm">Use a different email</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-brand-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-white text-3xl font-bold mb-2">Baseball Coaches</Text>
        <Text className="text-blue-300 mb-10">Sign in to your account</Text>

        <TouchableOpacity
          className={`w-full bg-white rounded-xl py-3.5 items-center mb-4 ${
            googleLoading ? 'opacity-50' : ''
          }`}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
        >
          <Text className="text-brand-700 font-bold text-base">
            {googleLoading ? 'Opening Google…' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        <Text className="text-blue-400 text-xs mb-6">or sign in with email</Text>

        <View className="w-full mb-4">
          <Text className="text-blue-200 text-sm font-medium mb-1">Email address</Text>
          <TextInput
            className="bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white text-base"
            placeholder="coach@school.edu"
            placeholderTextColor="rgba(147,197,253,0.5)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {error && (
          <View className="w-full bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 mb-4">
            <Text className="text-red-300 text-sm">{error}</Text>
          </View>
        )}

        <TouchableOpacity
          className={`w-full bg-white rounded-xl py-3.5 items-center ${
            loading || !email ? 'opacity-50' : ''
          }`}
          onPress={handleSignIn}
          disabled={loading || !email.trim()}
        >
          <Text className="text-brand-700 font-bold text-base">
            {loading ? 'Sending...' : 'Send magic link'}
          </Text>
        </TouchableOpacity>

        <Text className="text-blue-400 text-xs text-center mt-6">
          No password needed. We'll email you a one-click sign-in link.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
