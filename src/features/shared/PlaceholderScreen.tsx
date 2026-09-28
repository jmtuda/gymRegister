import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = { title: string; description: string };

export function PlaceholderScreen({ title, description }: Props) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>gymRegister</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>Próximamente</Text></View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  content: { flex: 1, justifyContent: 'center', padding: 32 },
  eyebrow: { color: '#0e7490', fontSize: 14, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: '#0f172a', fontSize: 36, fontWeight: '800', marginBottom: 12 },
  description: { color: '#475569', fontSize: 18, lineHeight: 26, maxWidth: 420 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#cffafe', borderRadius: 999, marginTop: 24, paddingHorizontal: 14, paddingVertical: 7 },
  badgeText: { color: '#155e75', fontWeight: '700' },
});
