import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';

/**
 * Placeholder home. After Step 6 submission, the app should navigate to
 * /vendor/approval-status (see app/vendor/approval-status.tsx).
 */
export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>DeliverEats Vendor</Text>
      <Link href="/vendor/approval-status" asChild>
        <Text style={styles.link}>Open Approval Status screen</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  link: { color: '#0ea5e9', fontSize: 16 },
});
