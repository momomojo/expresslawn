import { Stack } from 'expo-router';

export default function ServicesLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="index" 
        options={{ 
          headerShown: false 
        }} 
      />
      <Stack.Screen 
        name="add" 
        options={{
          presentation: 'modal',
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="edit" 
        options={{
          presentation: 'modal',
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="availability" 
        options={{
          presentation: 'modal',
          headerShown: false,
        }} 
      />
    </Stack>
  );
}