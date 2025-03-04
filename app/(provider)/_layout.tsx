import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function ProviderLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/provider-auth/login');
      } else {
        // Verify user is a provider
        supabase
          .from('provider_profiles')
          .select('id')
          .eq('id', session.user.id)
          .single()
          .then(({ data: provider, error }) => {
            if (error || !provider) {
              supabase.auth.signOut();
              router.replace('/provider-auth/login');
            }
          });
      }
    });
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}