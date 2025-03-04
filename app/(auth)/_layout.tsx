import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function AuthLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // Check if user is a provider
        const { data: provider } = await supabase
          .from('provider_profiles')
          .select('id')
          .eq('id', session.user.id)
          .single();

        if (provider) {
          router.replace('/(provider)/(tabs)');
        } else {
          router.replace('/(app)/(tabs)');
        }
      }
    });
  }, []);

  return (
    <Stack
      initialRouteName="login"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="provider-register" />
    </Stack>
  );
}