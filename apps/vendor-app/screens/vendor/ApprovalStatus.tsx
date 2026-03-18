import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { getOnboardingStatus, resubmitOnboarding, type OnboardingStatusResponse } from '../../src/api/vendorOnboarding';
import { useVendorSocket } from '../../src/socket/useVendorSocket';

const POLL_INTERVAL_MS = 30 * 1000;
const ONBOARDING_STEP_LABELS = [
  'Phone Verified',
  'Business Info',
  'Address',
  'KYC Documents',
  'Submitted',
] as const;

type ApprovalStatusScreenProps = {
  /** Access token for API and socket. Get from auth context after vendor login. */
  accessToken?: string | null;
  /** When approvalStatus is in notification payload, FCM tap can pass it to open this screen. */
  initialApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
  /** Navigate to vendor dashboard (home) after approval. */
  onGoToDashboard?: () => void;
  /** Navigate to Step 5 (KYC Documents) after resubmit. */
  onGoToKycStep?: () => void;
};

export function ApprovalStatus({
  accessToken,
  initialApprovalStatus,
  onGoToDashboard,
  onGoToKycStep,
}: ApprovalStatusScreenProps) {
  const [status, setStatus] = useState<OnboardingStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resubmitLoading, setResubmitLoading] = useState(false);
  const [trackExpanded, setTrackExpanded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getOnboardingStatus();
      setStatus(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.approvalStatus === 'pending') {
      pollRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [status?.approvalStatus, fetchStatus]);

  useVendorSocket(accessToken ?? null, {
    onApproved: () => fetchStatus(),
    onRejected: () => fetchStatus(),
  });

  // Pending: rotating hourglass animation
  useEffect(() => {
    if (status?.approvalStatus !== 'pending') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(spinAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(spinAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [status?.approvalStatus, spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const displayStatus = initialApprovalStatus ?? status?.approvalStatus ?? null;

  if (loading && !status) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (error && !status) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => { setLoading(true); fetchStatus(); }}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- PENDING ---
  if (displayStatus === 'pending' || (displayStatus === null && (status?.onboardingStep ?? 0) >= 6)) {
    const step = status?.onboardingStep ?? 6;
    return (
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <Animated.View style={[styles.iconWrap, { transform: [{ rotate: spin }] }]}>
          <Text style={styles.hourglass}>⌛</Text>
        </Animated.View>
        <Text style={styles.title}>Under Review</Text>
        <Text style={styles.body}>
          Your application is under review. We'll notify you once a decision is made.
        </Text>
        {status?.submittedAt && (
          <Text style={styles.muted}>Submitted {new Date(status.submittedAt).toLocaleString()}</Text>
        )}

        <TouchableOpacity
          style={styles.trackBtn}
          onPress={() => setTrackExpanded((e) => !e)}
          activeOpacity={0.8}
        >
          <Text style={styles.trackBtnText}>{trackExpanded ? 'Hide' : 'Track Submission'}</Text>
        </TouchableOpacity>

        {trackExpanded && (
          <View style={styles.steps}>
            {ONBOARDING_STEP_LABELS.map((label, i) => {
              const stepNum = i + 1;
              const done = step >= stepNum;
              return (
                <View key={label} style={styles.stepRow}>
                  <View style={[styles.stepDot, done ? styles.stepDotDone : styles.stepDotPending]} />
                  <Text style={[styles.stepLabel, done ? styles.stepLabelDone : styles.stepLabelPending]}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  // --- APPROVED ---
  if (displayStatus === 'approved') {
    return (
      <ApprovedView onGoToDashboard={onGoToDashboard} />
    );
  }

  // --- REJECTED ---
  if (displayStatus === 'rejected') {
    return (
      <RejectedView
        rejectionReason={status?.rejectionReason ?? null}
        onResubmit={async () => {
          setResubmitLoading(true);
          try {
            await resubmitOnboarding();
            onGoToKycStep?.();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Resubmit failed');
          } finally {
            setResubmitLoading(false);
          }
        }}
        resubmitLoading={resubmitLoading}
      />
    );
  }

  // Fallback: still loading or unknown
  return (
    <View style={styles.centered}>
      <Text style={styles.muted}>Loading status…</Text>
    </View>
  );
}

function ApprovedView({ onGoToDashboard }: { onGoToDashboard?: () => void }) {
  const [showConfetti, setShowConfetti] = useState(true);
  let ConfettiCannon: React.ComponentType<any> | null = null;
  try {
    ConfettiCannon = require('react-native-confetti-cannon').default;
  } catch {
    // Optional: install react-native-confetti-cannon for confetti
  }
  return (
    <ScrollView contentContainerStyle={styles.container} bounces={false}>
      {showConfetti && ConfettiCannon && (
        <ConfettiCannon
          count={150}
          origin={{ x: 0, y: 0 }}
          autoStart
          fadeOut
          explosionSpeed={350}
          fallSpeed={2500}
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}
      <Text style={styles.approvedEmoji}>🎉</Text>
      <Text style={styles.title}>Congratulations!</Text>
      <Text style={styles.body}>Your store has been approved and is now live.</Text>
      <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={onGoToDashboard}>
        <Text style={styles.primaryBtnText}>Go to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function RejectedView({
  rejectionReason,
  onResubmit,
  resubmitLoading,
}: {
  rejectionReason: string | null;
  onResubmit: () => Promise<void>;
  resubmitLoading: boolean;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container} bounces={false}>
      <View style={styles.rejectedIconWrap}>
        <Text style={styles.rejectedIcon}>⚠️</Text>
      </View>
      <Text style={[styles.title, { color: '#dc2626' }]}>Action Required</Text>
      <Text style={styles.body}>Your application was not approved.</Text>
      {rejectionReason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>{rejectionReason}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.btn, styles.rejectBtn]}
        onPress={onResubmit}
        disabled={resubmitLoading}
      >
        {resubmitLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>Resubmit Documents</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 48,
    alignItems: 'center',
    minHeight: '100%',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconWrap: {
    marginBottom: 24,
  },
  hourglass: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  muted: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
  },
  error: {
    fontSize: 16,
    color: '#dc2626',
    marginBottom: 16,
    textAlign: 'center',
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  primaryBtn: {
    backgroundColor: '#0ea5e9',
    marginTop: 8,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  trackBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  trackBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0ea5e9',
  },
  steps: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  stepDotDone: {
    backgroundColor: '#22c55e',
  },
  stepDotPending: {
    backgroundColor: '#cbd5e1',
  },
  stepLabel: {
    fontSize: 15,
  },
  stepLabelDone: {
    color: '#0f172a',
    fontWeight: '500',
  },
  stepLabelPending: {
    color: '#94a3b8',
  },
  approvedEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  rejectedIconWrap: {
    marginBottom: 16,
  },
  rejectedIcon: {
    fontSize: 56,
  },
  reasonBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  reasonText: {
    fontSize: 15,
    color: '#991b1b',
    lineHeight: 22,
  },
  rejectBtn: {
    backgroundColor: '#dc2626',
  },
});

export default ApprovalStatus;
