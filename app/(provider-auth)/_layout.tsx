import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function ProviderAuthLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Check if user is a provider
        supabase
          .from('provider_profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()
          .then(({ data: provider }) => {
            if (provider) {
              router.replace('/(provider)/(tabs)');
            } else {
              // Not a provider, sign out
              supabase.auth.signOut();
            }
          });
      }
    });
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}