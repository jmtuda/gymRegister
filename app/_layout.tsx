import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { initializeAppDatabase } from '@/data/initializeAppDatabase';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="gym-register.db" onInit={initializeAppDatabase}>
      <Stack screenOptions={{ headerShown: false }} />
    </SQLiteProvider>
  );
}
