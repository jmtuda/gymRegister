import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { initializeDatabase } from '@/data/database';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="gym-register.db" onInit={initializeDatabase}>
      <Stack screenOptions={{ headerShown: false }} />
    </SQLiteProvider>
  );
}
