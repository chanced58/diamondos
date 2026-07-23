import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getSupabaseClient } from '../../src/lib/supabase';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase's raw auth error text is written for developers, not coaches
// standing in a dugout. Map the ones we actually see to something a user
// can act on; anything unrecognized falls back to the original message.
const FRIENDLY_ERRORS: Record<string, string> = {
  'Invalid login credentials': 'That email and password don’t match. Check your password and try again.',
  'Email not confirmed': 'Confirm your email first — check your inbox for a verification link.',
};

function friendlyError(message: string): string {
  return FRIENDLY_ERRORS[message] ?? message;
}

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const supabase = getSupabaseClient();
  const trimmedEmail = email.trim();
  const emailIsValid = EMAIL_RE.test(trimmedEmail);
  const showEmailError = touched && trimmedEmail.length > 0 && !emailIsValid;

  async function handleSignIn() {
    setTouched(true);
    if (!emailIsValid || (usePassword && !password)) return;
    setLoading(true);
    setError(null);

    if (usePassword) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail.toLowerCase(),
        password,
      });
      if (signInError) {
        setError(friendlyError(signInError.message));
      }
      // On success the AuthProvider catches the session change and redirects.
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail.toLowerCase(),
      options: {
        emailRedirectTo: 'baseballcoaches://auth-callback',
      },
    });

    if (signInError) {
      setError(friendlyError(signInError.message));
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  const Logo = () => (
    <View className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 items-center justify-center mb-4">
      <Text className="text-3xl">⚾</Text>
    </View>
  );

  if (sent) {
    return (
      <SafeAreaView className="flex-1 bg-brand-900">
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-5xl mb-4">📧</Text>
          <Text className="text-white text-2xl font-bold mb-2">Check your email</Text>
          <Text className="text-blue-300 text-center mb-8">
            We sent a magic link to {trimmedEmail}. Tap the link on this device to sign in.
          </Text>
          <TouchableOpacity onPress={() => { setSent(false); setError(null); }}>
            <Text className="text-blue-300 underline text-sm">Use a different email</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-900">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 items-center justify-center px-6 py-10">
            <Logo />
            <Text className="text-white text-3xl font-bold mb-1">Baseball Coaches</Text>
            <Text className="text-blue-300 mb-10">Sign in to your coaching dashboard</Text>

            <View className="w-full bg-white/5 border border-white/10 rounded-2xl p-5">
              <View className="mb-4">
                <Text className="text-blue-200 text-sm font-medium mb-1">Email address</Text>
                <TextInput
                  className={`bg-white/10 border rounded-xl px-4 py-3.5 text-white text-base ${
                    showEmailError ? 'border-red-400' : 'border-white/20'
                  }`}
                  placeholder="coach@school.edu"
                  placeholderTextColor="rgba(147,197,253,0.5)"
                  value={email}
                  onChangeText={(v) => { setEmail(v); setError(null); }}
                  onBlur={() => setTouched(true)}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  returnKeyType={usePassword ? 'next' : 'done'}
                  onSubmitEditing={!usePassword ? handleSignIn : undefined}
                  accessibilityLabel="Email address"
                />
                {showEmailError && (
                  <Text className="text-red-300 text-xs mt-1">Enter a valid email address.</Text>
                )}
              </View>

              {usePassword && (
                <View className="mb-4">
                  <Text className="text-blue-200 text-sm font-medium mb-1">Password</Text>
                  <View className="flex-row items-center bg-white/10 border border-white/20 rounded-xl">
                    <TextInput
                      className="flex-1 px-4 py-3.5 text-white text-base"
                      placeholder="••••••••"
                      placeholderTextColor="rgba(147,197,253,0.5)"
                      value={password}
                      onChangeText={(v) => { setPassword(v); setError(null); }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      returnKeyType="done"
                      onSubmitEditing={handleSignIn}
                      accessibilityLabel="Password"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      className="px-4 py-3.5"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <Text className="text-blue-300 text-xs font-semibold">
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {error && (
                <View className="bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 mb-4">
                  <Text className="text-red-300 text-sm">{error}</Text>
                </View>
              )}

              <TouchableOpacity
                className={`bg-white rounded-xl py-3.5 items-center ${
                  loading || !emailIsValid || (usePassword && !password) ? 'opacity-50' : ''
                }`}
                onPress={handleSignIn}
                disabled={loading || !emailIsValid || (usePassword && !password)}
                accessibilityRole="button"
              >
                <Text className="text-brand-700 font-bold text-base">
                  {loading
                    ? 'Signing in…'
                    : usePassword
                      ? 'Sign in'
                      : 'Send magic link'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className="mt-5"
              onPress={() => {
                setUsePassword((v) => !v);
                setPassword('');
                setShowPassword(false);
                setError(null);
              }}
            >
              <Text className="text-blue-400 text-sm underline">
                {usePassword ? 'Use magic link instead' : 'Sign in with password instead'}
              </Text>
            </TouchableOpacity>

            {!usePassword && (
              <Text className="text-blue-400 text-xs text-center mt-6 px-4">
                No password needed. We&rsquo;ll email you a one-click sign-in link.
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
