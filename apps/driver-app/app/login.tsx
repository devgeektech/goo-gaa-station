import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { sendDriverOtp, verifyDriverOtp } from '@/lib/authApi';

export default function LoginScreen() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);

  const onSendOtp = async () => {
    const p = phone.trim();
    if (!p) {
      Alert.alert('Phone required');
      return;
    }
    setLoading(true);
    try {
      await sendDriverOtp(p);
      setStep('otp');
      Alert.alert('OTP sent', 'Check SMS (dev: see API logs).');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    const p = phone.trim();
    const o = otp.trim();
    if (!o) {
      Alert.alert('OTP required');
      return;
    }
    setLoading(true);
    try {
      const { accessToken, refreshToken } = await verifyDriverOtp(p, o);
      await setSession(accessToken, refreshToken);
      router.replace('/');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>Driver sign in</Text>
        <Text style={styles.label}>Phone (E.164, e.g. +491234567890)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          autoCapitalize="none"
          keyboardType="phone-pad"
          editable={step === 'phone' && !loading}
        />
        {step === 'otp' ? (
          <>
            <Text style={[styles.label, styles.mt]}>OTP</Text>
            <TextInput style={styles.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" editable={!loading} />
          </>
        ) : null}
        {step === 'phone' ? (
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onSendOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send OTP</Text>}
          </Pressable>
        ) : (
          <Pressable style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]} onPress={onVerify} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify</Text>}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 24, justifyContent: 'center' },
  card: { gap: 8 },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 12 },
  label: { fontSize: 13, color: '#555' },
  mt: { marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  btn: {
    marginTop: 20,
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
