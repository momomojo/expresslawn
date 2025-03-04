import { Stack } from 'expo-router';

export default function BookingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fff' },
        presentation: 'modal',
      }}
    >
      <Stack.Screen name="[id]" />
      <Stack.Screen name="schedule" />
      <Stack.Screen name="address" />
      <Stack.Screen name="review" />
      <Stack.Screen name="success" />
    </Stack>
  );
}