import { Stack, router } from 'expo-router';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function AuthLayout() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/(app)/(tabs)');
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
    </Stack>
  );
}