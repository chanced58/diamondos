import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getSupabaseClient } from '../../src/lib/supabase';

/**
 * Input validation at the boundary, before either Supabase call.
 *
 * The OTP check asserts digits only and deliberately no length: these codes
 * arrive as 8 digits even though the docs describe 6, so a length rule would
 * reject valid codes. Digits-only still catches the common paste mistakes —
 * a whole magic-link URL, or a code with stray whitespace.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_PATTERN = /^\d+$/;

const GOOGLE_REDIRECT_URI = 'baseballcoaches://auth-callback';
const GOOGLE_NOT_INVITED_MESSAGE =
  "That Google account isn't associated with an invite. Contact your coach, or sign in with the email your invite was sent to.";
const GOOGLE_SIGNIN_FAILED_MESSAGE = 'Google sign-in failed. Please try again.';

/**
 * Shared by both branches of this screen so the form stays vertically
 * centred on devices where it fits (the current, screenshotted look) while
 * still allowing the ScrollView to grow and scroll past the viewport when
 * accessibility text sizing or a landscape keyboard pushes it past the fold
 * (finding M5). `flexGrow: 1` is what lets the content container be *at
 * least* the visible height (so centring has room to work) without
 * preventing it from growing taller than that when content overflows.
 */
const CENTERED_SCROLL_CONTENT = {
  flexGrow: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  paddingHorizontal: 24,
};

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  async function handleSignIn() {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) return;
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
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

    const oauthCode = queryParams?.code;
    if (typeof oauthCode === 'string') {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(oauthCode);
      if (exchangeError) setError(exchangeError.message);
    } else {
      setError('Something went wrong signing in with Google. Please try again.');
    }
    setGoogleLoading(false);
  }

  async function handleVerifyCode() {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.trim();
    if (!normalizedCode) return;
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!OTP_PATTERN.test(normalizedCode)) {
      setError('The code is the number from the email — digits only.');
      return;
    }
    setVerifying(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: normalizedCode,
      type: 'email',
    });

    if (verifyError) {
      setError(verifyError.message);
    }
    // On success, AuthProvider's onAuthStateChange picks up the new session
    // and (auth)/_layout.tsx redirects to (tabs) automatically.
    setVerifying(false);
  }

  if (sent) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-brand-900"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          testID="sign-in-scroll-sent"
          className="flex-1"
          contentContainerStyle={CENTERED_SCROLL_CONTENT}
          keyboardShouldPersistTaps="handled"
        >
          <Text className="text-5xl mb-4">📧</Text>
          <Text className="text-white text-2xl font-bold mb-2">Check your email</Text>
          <Text className="text-blue-300 text-center mb-8">
            We sent a code to {email}. Tap the link, or enter the code below.
          </Text>

          <View className="w-full mb-4">
            <Text className="text-blue-200 text-sm font-medium mb-1">Verification code</Text>
            <TextInput
              className="bg-white/10 border border-white/20 rounded-xl px-4 py-3.5 text-white text-base text-center tracking-widest"
              placeholder="Enter code"
              placeholderTextColor="rgba(147,197,253,0.5)"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={16}
            />
          </View>

          {error && (
            <View className="w-full bg-red-500/20 border border-red-400/30 rounded-xl px-4 py-3 mb-4">
              <Text className="text-red-300 text-sm">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="verify-code-button"
            className={`w-full bg-white rounded-xl py-3.5 items-center mb-4 ${
              verifying || !code.trim() ? 'opacity-50' : ''
            }`}
            onPress={handleVerifyCode}
            disabled={verifying || !code.trim()}
          >
            <Text className="text-brand-700 font-bold text-base">
              {verifying ? 'Verifying...' : 'Verify code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="use-different-email-button"
            className="py-3"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              setSent(false);
              setCode('');
              setError(null);
            }}
          >
            <Text className="text-blue-300 underline text-sm">Use a different email</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-brand-900"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        testID="sign-in-scroll-form"
        className="flex-1"
        contentContainerStyle={CENTERED_SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-white text-3xl font-bold mb-2">DiamondOS</Text>
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
          testID="send-magic-link-button"
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
          No password needed. We'll email you a link and a code.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
