import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

export default function DriverHomeScreen() {
  const router = useRouter();
  const { signOut } = useAuth();

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Driver dashboard</Text>
      <Text style={styles.muted}>You are on the main home screen. Hook tabs / orders here (Phase 8+).</Text>
      <Pressable
        style={styles.secondary}
        onPress={async () => {
          await signOut();
          router.replace('/login');
        }}
      >
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '800' },
  muted: { color: '#666', marginTop: 8, lineHeight: 20 },
  secondary: {
    marginTop: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { fontWeight: '600' },
});
