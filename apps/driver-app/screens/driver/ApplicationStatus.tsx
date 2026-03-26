import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { SOCKET_URL, SUPPORT_EMAIL } from '@/lib/config';
import { fetchKycStatus, patchKycResubmit, getApiErrorMessage, type KycStatusResponse } from '@/lib/kycApi';
import { setKycVerificationComplete } from '@/lib/kycStorage';
import { parseExpiryFromReason, parseRequirementFromReason, rejectionScreenTitle } from '@/lib/parseKycRejection';

const ACCENT = '#DC2626';
const POLL_MS = 60_000;

export function ApplicationStatus() {
  const router = useRouter();
  const { accessToken, driverId } = useAuth();
  const [status, setStatus] = useState<KycStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [resubmitting, setResubmitting] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    if (!accessToken) return;
    const s = await fetchKycStatus(accessToken);
    setStatus(s);
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch {
        if (!cancelled) Alert.alert('Error', 'Could not load KYC status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, load]);

  useEffect(() => {
    if (!accessToken || !driverId) return;
    const s = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = s;
    s.on('connect', () => {
      s.emit('driver:join', { driverId });
    });
    const onUpdate = () => {
      load().catch(() => {});
    };
    s.on('driver:kyc_approved', onUpdate);
    s.on('driver:kyc_rejected', onUpdate);
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, driverId, load]);

  useEffect(() => {
    if (!accessToken) return;
    const t = setInterval(() => {
      load().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [accessToken, load]);

  useEffect(() => {
    if (status?.kycStatus !== 'approved') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [status?.kycStatus, pulse]);

  const onContact = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Driver KYC support')}`;
    Linking.openURL(url).catch(() => Alert.alert('Email', SUPPORT_EMAIL));
  };

  const onProceed = async () => {
    await setKycVerificationComplete(true);
    router.replace('/home');
  };

  const onUploadAgain = async () => {
    if (!accessToken) return;
    setResubmitting(true);
    try {
      await patchKycResubmit(accessToken);
      router.replace(`/document-verification?reset=${Date.now()}`);
    } catch (e) {
      Alert.alert('Error', getApiErrorMessage(e));
    } finally {
      setResubmitting(false);
    }
  };

  if (loading || !status) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const kyc = status.kycStatus;

  if (kyc === 'pending') {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.iconRing}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
        <Text style={styles.title}>Background Check</Text>
        <Text style={styles.subtitle}>
          Our verification partner is reviewing your driving history and background.
        </Text>
        <View style={styles.phaseBadge}>
          <Text style={styles.phaseBadgeActive}>ACTIVE</Text>
          <Text style={styles.phaseBadgeLabel}> Verification in progress</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: '65%' }]} />
        </View>
        <Text style={styles.note}>Estimated 24–48 hours remaining</Text>
        <View style={styles.checkRow}>
          <Text style={styles.checkIcon}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkTitle}>Identity verified</Text>
            <Text style={styles.checkSub}>Government ID documents successfully processed.</Text>
          </View>
        </View>
        <View style={styles.checkRow}>
          <Text style={styles.checkIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkTitle}>Driving record</Text>
            <Text style={styles.checkSub}>Reviewing state-level traffic violation reports.</Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]} onPress={onContact}>
          <Text style={styles.ctaText}>Contact support</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (kyc === 'approved') {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Animated.View style={[styles.verifiedCircle, { transform: [{ scale: pulse }] }]}>
          <Text style={styles.verifiedCheck}>✓</Text>
        </Animated.View>
        <View style={styles.verifiedPill}>
          <Text style={styles.verifiedPillText}>VERIFIED</Text>
        </View>
        <Text style={styles.title}>Identity verification</Text>
        <Text style={styles.subtitle}>Great news! Your identity documents have been successfully verified.</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>📅</Text>
          <View>
            <Text style={styles.infoLabel}>Document type</Text>
            <Text style={styles.infoValue}>Driver&apos;s license</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoIcon}>🛡️</Text>
          <View>
            <Text style={styles.infoLabel}>Security clearance</Text>
            <Text style={styles.infoValue}>Completed</Text>
          </View>
        </View>
        <Pressable style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]} onPress={onProceed}>
          <Text style={styles.ctaText}>Proceed</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (kyc === 'rejected') {
    const reason = status.kycRejectionReason;
    const expiry = parseExpiryFromReason(reason);
    const requirement = parseRequirementFromReason(reason);
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.alertIcon}>⚠️</Text>
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>ACTION REQUIRED</Text>
        </View>
        <Text style={styles.title}>{rejectionScreenTitle(reason)}</Text>
        <Text style={styles.rejectionBody}>{reason?.trim() || 'Please review your documents and re-upload.'}</Text>
        {reason?.trim() ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>📅</Text>
              <View>
                <Text style={styles.infoLabel}>Expired on</Text>
                <Text style={styles.infoValue}>{expiry ?? 'See reason above'}</Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>📄</Text>
              <View>
                <Text style={styles.infoLabel}>Requirement</Text>
                <Text style={styles.infoValue}>{requirement ?? 'Re-upload document'}</Text>
              </View>
            </View>
          </>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={onUploadAgain}
          disabled={resubmitting}
        >
          {resubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Upload again</Text>}
        </Pressable>
      </ScrollView>
    );
  }

  // not_submitted — send user to uploads from bootstrap; show short message if they land here
  return (
    <View style={styles.center}>
      <Text style={styles.subtitle}>Please complete document verification.</Text>
      <Pressable
        style={({ pressed }) => [styles.cta, { marginTop: 16 }, pressed && styles.ctaPressed]}
        onPress={() => router.replace(`/document-verification?reset=${Date.now()}`)}
      >
        <Text style={styles.ctaText}>Go to uploads</Text>
      </Pressable>
    </View>
  );
}

const p = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  body: { padding: 24, paddingBottom: 48, alignItems: 'stretch' },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: ACCENT,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#444', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 16,
  },
  phaseBadgeActive: { fontWeight: '800', color: '#b45309', fontSize: 11 },
  phaseBadgeLabel: { color: '#92400e', fontSize: 13 },
  progressTrack: { height: 8, backgroundColor: '#e5e5e5', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: '100%', backgroundColor: ACCENT },
  note: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 24 },
  checkRow: { flexDirection: 'row', gap: 12, marginBottom: 16, alignItems: 'flex-start' },
  checkIcon: { fontSize: 22 },
  checkTitle: { fontWeight: '700', fontSize: 15 },
  checkSub: { fontSize: 13, color: '#555', marginTop: 2, lineHeight: 18 },
  verifiedCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#16a34a',
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  verifiedCheck: { color: '#fff', fontSize: 48, fontWeight: '700' },
  verifiedPill: {
    alignSelf: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  verifiedPillText: { color: '#166534', fontWeight: '800', fontSize: 12 },
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 14 },
  infoIcon: { fontSize: 20 },
  infoLabel: { fontSize: 12, color: '#666' },
  infoValue: { fontSize: 15, fontWeight: '600' },
  alertIcon: { fontSize: 48, textAlign: 'center', marginBottom: 8 },
  actionBadge: {
    alignSelf: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  actionBadgeText: { color: '#991b1b', fontWeight: '800', fontSize: 11 },
  rejectionBody: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 20 },
  cta: {
    backgroundColor: ACCENT,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaPressed: { opacity: 0.88 },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

const styles = p;
