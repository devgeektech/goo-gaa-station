import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '@/context/AuthContext';
import {
  getApiErrorMessage,
  getMissingFields,
  uploadKycDocuments,
  type KycUploadFile,
} from '@/lib/kycApi';

type Picked = { uri: string; name: string; type: string };

function guessMime(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

function assetToPicked(a: DocumentPicker.DocumentPickerAsset): Picked {
  const name = a.name ?? 'document';
  return {
    uri: a.uri,
    name,
    type: a.mimeType && a.mimeType !== 'application/octet-stream' ? a.mimeType : guessMime(name),
  };
}

const ACCEPT_TYPES: string[] = ['image/*', 'application/pdf'];

export function DocumentVerification() {
  const router = useRouter();
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const { accessToken } = useAuth();
  const [license, setLicense] = useState<Picked | null>(null);
  const [national, setNational] = useState<Picked[]>([]);
  const [vehicle, setVehicle] = useState<Picked[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cardErrors, setCardErrors] = useState<{ driversLicense?: boolean; nationalId?: boolean; vehiclePhotos?: boolean }>({});

  /** After PATCH /driver/kyc/resubmit (200), navigation includes `?reset=` so all file picks clear. */
  useEffect(() => {
    if (reset == null || reset === '') return;
    setLicense(null);
    setNational([]);
    setVehicle([]);
    setCardErrors({});
    setUploading(false);
  }, [reset]);

  const pickLicense = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ACCEPT_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setLicense(assetToPicked(res.assets[0]));
    setCardErrors((e) => ({ ...e, driversLicense: false }));
  };

  const pickNational = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ACCEPT_TYPES,
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets?.length) return;
    setNational(res.assets.map(assetToPicked));
    setCardErrors((e) => ({ ...e, nationalId: false }));
  };

  const pickVehicle = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ACCEPT_TYPES,
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (res.canceled || !res.assets?.length) return;
    setVehicle(res.assets.map(assetToPicked));
    setCardErrors((e) => ({ ...e, vehiclePhotos: false }));
  };

  const canSubmit = Boolean(license && national.length > 0 && vehicle.length > 0);

  const toUpload = (p: Picked): KycUploadFile => ({
    uri: p.uri,
    name: p.name,
    type: p.type,
  });

  const onSubmit = async () => {
    if (!accessToken || !license) return;
    setUploading(true);
    setCardErrors({});
    try {
      await uploadKycDocuments(accessToken, {
        driversLicense: toUpload(license),
        nationalId: national.map(toUpload),
        vehiclePhotos: vehicle.map(toUpload),
      });
      router.replace('/application-status');
    } catch (err) {
      const missing = getMissingFields(err);
      const next: typeof cardErrors = {};
      if (missing.includes('driversLicense')) next.driversLicense = true;
      if (missing.includes('nationalId')) next.nationalId = true;
      if (missing.includes('vehiclePhotos')) next.vehiclePhotos = true;
      setCardErrors(next);
      if (missing.length === 0) Alert.alert('Upload failed', getApiErrorMessage(err));
      else Alert.alert('Missing documents', `Please add: ${missing.join(', ')}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>Upload clear photos or PDFs of each item (max 5MB each; JPG, PNG, PDF).</Text>

      <UploadCard
        title="Driver's license"
        subtitle={license ? license.name : 'Tap to choose one file'}
        dashedError={cardErrors.driversLicense}
        onPress={pickLicense}
      />

      <UploadCard
        title="National ID"
        subtitle={national.length ? `${national.length} file(s) selected` : 'Tap to choose one or more files'}
        badge={national.length > 0 ? `${national.length} files selected` : undefined}
        dashedError={cardErrors.nationalId}
        onPress={pickNational}
      />

      <UploadCard
        title="Vehicle photos"
        subtitle={vehicle.length ? `${vehicle.length} file(s) selected` : 'Tap to add photos or files'}
        badge={vehicle.length > 0 ? `${vehicle.length} files selected` : undefined}
        dashedError={cardErrors.vehiclePhotos}
        onPress={pickVehicle}
      />

      <View style={styles.warningPill}>
        <Text style={styles.warningText}>
          Make sure all text is clear and readable. Avoid glare or reflections.
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          (!canSubmit || uploading) && styles.submitDisabled,
          pressed && canSubmit && !uploading && styles.submitPressed,
        ]}
        onPress={onSubmit}
        disabled={!canSubmit || uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit documents</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function UploadCard({
  title,
  subtitle,
  badge,
  dashedError,
  onPress,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  dashedError?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.card, dashedError && styles.cardError]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>{subtitle}</Text>
      {badge ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 40 },
  lead: { fontSize: 14, color: '#444', marginBottom: 16, lineHeight: 20 },
  card: {
    minHeight: 120,
    borderWidth: 2,
    borderColor: '#ccc',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  cardError: { borderColor: '#DC2626' },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  cardSubtitle: { fontSize: 13, color: '#666', textAlign: 'center' },
  countBadge: {
    marginTop: 10,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  countBadgeText: { color: '#991b1b', fontWeight: '600', fontSize: 12 },
  warningPill: {
    backgroundColor: '#fee2e2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  warningText: { color: '#991b1b', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  submit: {
    backgroundColor: '#DC2626',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  submitPressed: { opacity: 0.9 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
