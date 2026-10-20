import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { extractDocumentFields } from '@/services/api/document-ocr';
import { publishVaultDocument } from '@/services/family-documents';
import {
  decryptDocument, deleteEncryptedDocument, exportDecryptedDocument, saveEncryptedDocument,
} from '@/services/document-vault';
import { isVaultInitialized, saveVaultRecords, unlockNativeVault, unlockWebVault, type VaultRecord, type VaultRecordType } from '@/services/vault';
import { useAppTheme } from '@/state/ThemeProvider';
import { useAuth } from '@/state/AuthProvider';
import { base64ToBytes, bytesToBase64, documentBytesMatchMimeType } from '@/utils/documentCrypto';
import DocumentToolsPanel from './DocumentToolsPanel';
import { checkProcessing, type ProcessedDocument } from '@/utils/documentTools';
import { saveDocumentBatch } from '@/utils/vaultDocumentBatch';
import { goBackOrHome } from '@/services/navigation';

type Draft = Record<string, string>;

const recordTypes: { value: VaultRecordType; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'login', title: 'Website / app login', icon: 'globe-outline' },
  { value: 'pin', title: 'PIN or passcode', icon: 'keypad-outline' },
  { value: 'bank', title: 'Bank account', icon: 'business-outline' },
  { value: 'card', title: 'Payment card', icon: 'card-outline' },
];

const fieldsByType: Record<VaultRecordType, { key: string; label: string; secure?: boolean; keyboard?: 'default' | 'url' }[]> = {
  login: [
    { key: 'website', label: 'Website or app name' },
    { key: 'username', label: 'Username or email' },
    { key: 'password', label: 'Password', secure: true },
  ],
  pin: [{ key: 'pin', label: 'PIN or passcode', secure: true }],
  bank: [
    { key: 'bankName', label: 'Bank name' },
    { key: 'accountHolder', label: 'Account holder' },
    { key: 'accountNumber', label: 'Account number', secure: true },
    { key: 'ifsc', label: 'IFSC / routing code' },
  ],
  card: [
    { key: 'issuer', label: 'Bank or card issuer' },
    { key: 'lastFour', label: 'Last four digits only' },
    { key: 'expiry', label: 'Expiry (MM/YY)' },
  ],
  document: [],
};

const emptyDraft = (): Draft => ({ title: '', notes: '' });
const documentCategories = [
  'Aadhaar card', 'PAN card', '10th certificate', '12th certificate',
  'Degree / diploma', 'Bank document', 'Other',
];
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_OCR_BYTES = 6 * 1024 * 1024;

function supportedMimeType(asset: DocumentPicker.DocumentPickerAsset): string | null {
  const mimeType = asset.mimeType?.toLowerCase();
  if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType ?? '')) return mimeType!;
  const extension = asset.name.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return null;
}

function suggestedCategory(filename: string): string {
  const name = filename.toLowerCase();
  if (name.includes('aadhaar') || name.includes('aadhar')) return 'Aadhaar card';
  if (name.includes('pan')) return 'PAN card';
  if (name.includes('10th') || name.includes('ssc')) return '10th certificate';
  if (name.includes('12th') || name.includes('hsc')) return '12th certificate';
  if (name.includes('degree') || name.includes('diploma')) return 'Degree / diploma';
  if (name.includes('bank') || name.includes('account')) return 'Bank document';
  return 'Other';
}

function VaultInput({
  label, value, onChangeText, colors, secure = false, keyboard = 'default', autoCapitalize = 'none', placeholder, newPassword = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
  secure?: boolean;
  keyboard?: 'default' | 'url';
  autoCapitalize?: 'none' | 'sentences' | 'words';
  placeholder?: string;
  newPassword?: boolean;
}) {
  const [secretVisible, setSecretVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <View style={[styles.inputContainer, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure && !secretVisible}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          autoComplete={newPassword ? 'new-password' : 'off'}
          importantForAutofill="no"
          keyboardType={keyboard === 'url' ? 'url' : 'default'}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.inputInContainer, { color: colors.text }]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secretVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            accessibilityState={{ checked: secretVisible }}
            onPress={() => setSecretVisible((visible) => !visible)}
            style={styles.passwordVisibilityButton}
          >
            <Ionicons name={secretVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function VaultScreen({ openToolsOnUnlock = false }: { openToolsOnUnlock?: boolean }) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [vaultKey, setVaultKey] = useState('');
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formType, setFormType] = useState<VaultRecordType | null>(null);
  const [editingId, setEditingId] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [revealedId, setRevealedId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<VaultRecord | null>(null);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'pdf' | 'image'>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [pendingFilter, setPendingFilter] = useState('all');
  const [pendingFileTypeFilter, setPendingFileTypeFilter] = useState<'all' | 'pdf' | 'image'>('all');
  const [selectedDocument, setSelectedDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentCategory, setDocumentCategory] = useState('Other');
  const [customCategory, setCustomCategory] = useState('');
  const [documentFormVisible, setDocumentFormVisible] = useState(false);
  const [ocrTarget, setOcrTarget] = useState<VaultRecord | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const vaultSession = useRef(0);
  const documentPickerActive = useRef(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [toolDocumentId, setToolDocumentId] = useState('');
  const [toolSession, setToolSession] = useState(0);
  const recordsRef = useRef(records);
  useEffect(() => { recordsRef.current = records; }, [records]);

  useEffect(() => {
    let active = true;
    isVaultInitialized().then((exists) => {
      if (active) setInitialized(exists);
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to inspect the encrypted vault.');
    });
    return () => { active = false; };
  }, []);

  const lockVault = useCallback(() => {
    vaultSession.current += 1;
    setRecords([]);
    setVaultKey('');
    setUnlocked(false);
    setRevealedId('');
    setDeleteTarget(null);
    setFormType(null);
    setEditingId('');
    setDraft(emptyDraft());
    setPassword('');
    setPasswordConfirm('');
    setSelectedDocument(null);
    setDocumentFormVisible(false);
    setDocumentTitle('');
    setCustomCategory('');
    setOcrTarget(null);
    setCopyMessage('');
    setError('');
    setToolsVisible(false);
    setToolDocumentId('');
  }, []);

  useFocusEffect(useCallback(() => () => lockVault(), [lockVault]));

  useEffect(() => {
    if (!unlocked) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && !documentPickerActive.current) lockVault();
    });
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && !documentPickerActive.current) lockVault();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [lockVault, unlocked]);

  const documentCategoryFilters = useMemo(
    () => Array.from(new Set(records
      .filter((record) => record.type === 'document' && record.documentCategory)
      .map((record) => record.documentCategory!))),
    [records],
  );
  const filterTitle = useMemo(() => {
    const typeTitle = filter === 'all'
      ? 'All items'
      : filter === 'documents'
        ? 'Documents'
        : filter.startsWith('category:')
          ? filter.slice(9)
          : recordTypes.find((item) => item.value === filter)?.title ?? 'All items';
    const formatTitle = fileTypeFilter === 'all' ? '' : fileTypeFilter === 'pdf' ? 'PDF' : 'Images';
    return formatTitle ? `${typeTitle} · ${formatTitle}` : typeTitle;
  }, [fileTypeFilter, filter]);
  const visibleRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesCategory = filter === 'all' ||
        (filter === 'documents' && record.type === 'document') ||
        (filter.startsWith('category:') && record.type === 'document' && record.documentCategory === filter.slice(9)) ||
        (!filter.startsWith('category:') && filter !== 'documents' && record.type === filter);
      const matchesFileType = fileTypeFilter === 'all' || (
        record.type === 'document' &&
        (fileTypeFilter === 'pdf'
          ? record.documentMimeType === 'application/pdf'
          : record.documentMimeType?.startsWith('image/'))
      );
      const matchesQuery = !query || [
        record.title,
        record.documentCategory,
        record.documentFilename,
        record.extractedDocumentType,
        record.notes,
        ...(record.extractedFields ?? []).flatMap((field) => [field.label, field.value]),
      ].some((value) => value?.toLowerCase().includes(query));
      return matchesCategory && matchesFileType && matchesQuery;
    });
  }, [fileTypeFilter, filter, records, searchQuery]);

  const unlock = async () => {
    setBusy(true);
    setError('');
    try {
      let result;
      if (Platform.OS === 'web') {
        if (password.trim().length < 12) {
          setError('Use a vault password with at least 12 characters.');
          return;
        }
        if (!initialized && password !== passwordConfirm) {
          setError('The vault passwords do not match.');
          return;
        }
        result = await unlockWebVault(password, !initialized);
      } else {
        result = await unlockNativeVault();
      }
      setRecords(result.records);
      setVaultKey(result.key);
      setInitialized(true);
      setUnlocked(true);
      vaultSession.current += 1;
      if (openToolsOnUnlock) { setToolSession(vaultSession.current); setToolsVisible(true); }
      setPassword('');
      setPasswordConfirm('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to unlock the vault.');
    } finally {
      setBusy(false);
    }
  };

  const persist = async (next: VaultRecord[]) => {
    if (!vaultKey) throw new Error('The vault is locked. Unlock it before changing records.');
    await saveVaultRecords(next, vaultKey);
    setRecords(next);
  };

  const saveToolFiles = async (files: ProcessedDocument[], category: string, signal: AbortSignal): Promise<VaultRecord[]> => {
    const assertSession = () => {
      checkProcessing(signal);
      if (!vaultKey || toolSession !== vaultSession.current) throw new Error('The vault locked before the files could be saved. Unlock it and try again.');
    };
    assertSession();
    setBusy(true);
    try {
      for (const file of files) {
        if (!documentBytesMatchMimeType(file.bytes, file.mimeType)) throw new Error('The processed file is invalid and was not saved.');
      }
      return await saveDocumentBatch(files, category, {
        assertActive: assertSession,
        saveFile: (bytes) => saveEncryptedDocument(bytes, vaultKey),
        deleteFile: deleteEncryptedDocument,
        readRecords: () => recordsRef.current,
        commitRecords: async (next) => {
          await saveVaultRecords(next, vaultKey);
          if (toolSession === vaultSession.current) {
            recordsRef.current = next;
            setRecords(next);
          }
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const openForm = (type: VaultRecordType, record?: VaultRecord) => {
    setFormType(type);
    setEditingId(record?.id ?? '');
    setDraft(record
      ? Object.fromEntries(Object.entries(record).filter(([key, value]) =>
        (key === 'title' || key === 'notes' || fieldsByType[type].some((field) => field.key === key)) &&
        typeof value === 'string')) as Draft
      : emptyDraft());
    setError('');
  };

  const closeForm = () => {
    setFormType(null);
    setEditingId('');
    setDraft(emptyDraft());
    setError('');
  };

  const saveRecord = async () => {
    if (!formType || !draft.title?.trim()) {
      setError('Add a clear name for this vault entry.');
      return;
    }
    if (formType === 'login' && !draft.password?.trim()) {
      setError('Enter the website or app password.');
      return;
    }
    if (formType === 'pin' && !draft.pin?.trim()) {
      setError('Enter the PIN or passcode.');
      return;
    }
    if (formType === 'bank' && !draft.accountNumber?.trim()) {
      setError('Enter the bank account number.');
      return;
    }
    if (formType === 'card' && !/^\d{4}$/.test(draft.lastFour ?? '')) {
      setError('For safety, enter only the card’s last four digits.');
      return;
    }

    setBusy(true);
    setError('');
    const session = vaultSession.current;
    try {
      const timestamp = new Date().toISOString();
      const cleanDraft = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value !== ''),
      ) as Draft;
      if (formType === 'card') delete cleanDraft.notes;
      const existing = records.find((record) => record.id === editingId);
      const nextRecord = {
        ...cleanDraft,
        id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        type: formType,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      } as VaultRecord;
      const next = existing
        ? records.map((record) => record.id === editingId ? nextRecord : record)
        : [nextRecord, ...records];
      if (session !== vaultSession.current) throw new Error('The vault locked before this entry could be saved.');
      await persist(next);
      closeForm();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save this vault entry.');
    } finally {
      setBusy(false);
    }
  };

  const pickDocument = async () => {
    setError('');
    documentPickerActive.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('The selected file could not be read.');
      if (!supportedMimeType(asset)) throw new Error('Choose a PDF, JPG/JPEG, PNG, or WebP file.');
      if (asset.size !== undefined && asset.size > MAX_DOCUMENT_BYTES) {
        throw new Error('Choose a document smaller than 20 MB.');
      }
      setSelectedDocument(asset);
      setDocumentTitle(asset.name.replace(/\.[^.]+$/, ''));
      setDocumentCategory(suggestedCategory(asset.name));
      setCustomCategory('');
      setDocumentFormVisible(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not select this document.');
    } finally {
      documentPickerActive.current = false;
    }
  };

  const saveDocument = async () => {
    if (!selectedDocument || !vaultKey) {
      setError('Unlock the vault and choose a document before saving.');
      return;
    }
    const title = documentTitle.trim();
    const category = documentCategory === 'Custom' ? customCategory.trim() : documentCategory;
    if (!title || !category) {
      setError('Enter a document name and category.');
      return;
    }

    setBusy(true);
    setError('');
    let storageId = '';
    const session = vaultSession.current;
    try {
      const mimeType = supportedMimeType(selectedDocument);
      if (!mimeType) throw new Error('Choose a PDF, JPG/JPEG, PNG, or WebP file.');
      let bytes: Uint8Array;
      if (Platform.OS === 'web') {
        bytes = selectedDocument.file
          ? new Uint8Array(await selectedDocument.file.arrayBuffer())
          : selectedDocument.base64
            ? base64ToBytes(selectedDocument.base64)
            : await new File(selectedDocument.uri).bytes()
      } else {
        const pickerCopy = new File(selectedDocument.uri);
        try {
          bytes = await pickerCopy.bytes();
        } finally {
          if (pickerCopy.exists) pickerCopy.delete();
        }
      }
      if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
        throw new Error('Choose a non-empty document smaller than 20 MB.');
      }
      if (!documentBytesMatchMimeType(bytes, mimeType)) {
        throw new Error('The selected file content does not match its PDF or image type.');
      }
      storageId = await saveEncryptedDocument(bytes, vaultKey);
      const timestamp = new Date().toISOString();
      const record: VaultRecord = {
        id: storageId,
        type: 'document',
        title,
        documentCategory: category,
        documentFilename: selectedDocument.name,
        documentMimeType: mimeType,
        documentStorageId: storageId,
        documentSize: bytes.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (session !== vaultSession.current) throw new Error('The vault locked before this document could be saved.');
      await persist([record, ...records]);
      setDocumentFormVisible(false);
      setSelectedDocument(null);
      setDocumentTitle('');
      setDocumentCategory('Other');
      setCustomCategory('');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not encrypt and save this document.';
      if (storageId) {
        try {
          await deleteEncryptedDocument(storageId);
        } catch (cleanupFailure) {
          const cleanupMessage = cleanupFailure instanceof Error ? cleanupFailure.message : 'Unknown storage error.';
          setError(`${message} An encrypted file may remain in storage: ${cleanupMessage}`);
          return;
        }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDocumentExtraction = async () => {
    const target = ocrTarget;
    const storageId = target?.documentStorageId;
    const mimeType = target?.documentMimeType;
    if (!target || !storageId || !vaultKey || !mimeType) return;
    const session = vaultSession.current;
    setOcrBusy(true);
    setError('');
    setOcrTarget(null);
    try {
      const bytes = await decryptDocument(storageId, vaultKey);
      if (bytes.length > MAX_OCR_BYTES) {
        throw new Error('For extraction, choose a document no larger than 6 MB. It remains safely saved in your vault.');
      }
      const result = await extractDocumentFields(bytesToBase64(bytes), mimeType);
      if (session !== vaultSession.current) return;
      const next = records.map((record) => record.id === target.id
        ? {
          ...record,
          extractedDocumentType: result.document_type,
          extractedFields: result.fields,
          updatedAt: new Date().toISOString(),
        }
        : record);
      await persist(next);
    } catch (failure) {
      if (session === vaultSession.current) {
        setError(failure instanceof Error ? failure.message : 'Could not extract document details.');
      }
    } finally {
      setOcrBusy(false);
    }
  };

  const copyDocumentField = async (field: { label: string; value: string }) => {
    try {
      const copied = await Clipboard.setStringAsync(field.value);
      if (!copied) throw new Error('Clipboard access was not granted.');
      setCopyMessage(`${field.label} copied. Clipboard contents may remain available to other apps.`);
      setTimeout(() => setCopyMessage(''), 4000);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not copy this detail.');
    }
  };

  const openDocument = async (record: VaultRecord) => {
    if (!record.documentStorageId || !record.documentMimeType || !vaultKey) return;
    setBusy(true);
    setError('');
    try {
      const extension = record.documentFilename?.split('.').pop() || (record.documentMimeType === 'application/pdf' ? 'pdf' : 'jpg');
      await exportDecryptedDocument(
        record.documentStorageId,
        vaultKey,
        record.documentFilename || `${record.title}.${extension}`,
        record.documentMimeType,
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not open this document.');
    } finally {
      setBusy(false);
    }
  };

  const shareDocument = async (record: VaultRecord) => {
    if (!record.documentStorageId || !record.documentMimeType || !record.documentFilename || !vaultKey || !user) return;
    setBusy(true);
    setError('');
    try {
      const bytes = await decryptDocument(record.documentStorageId, vaultKey);
      await publishVaultDocument({
        bytes,
        ownerUid: user.uid,
        title: record.title,
        category: record.documentCategory || 'Other',
        filename: record.documentFilename,
        mimeType: record.documentMimeType,
      });
      setCopyMessage('An encrypted family copy is published. Connected members can now request access.');
      setTimeout(() => setCopyMessage(''), 6000);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Could not share this document.';
      setError(message);
      if (message.includes('Family screen')) router.navigate('/family');
    } finally {
      setBusy(false);
    }
  };

  const confirmShareDocument = (record: VaultRecord) => {
    Alert.alert(
      'Publish an encrypted family copy?',
      `“${record.title}” will be uploaded as an end-to-end encrypted copy. Connected family members can see its name and category and request access. You must approve each request. Approved members can download it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Publish encrypted copy', onPress: () => void shareDocument(record) },
      ],
    );
  };

  const deleteRecord = (record: VaultRecord) => {
    setDeleteTarget(record);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setBusy(true);
    setError('');
    const session = vaultSession.current;
    try {
      if (session !== vaultSession.current) throw new Error('The vault locked before this entry could be deleted.');
      await persist(records.filter((item) => item.id !== target.id));
      setRevealedId('');
      setDeleteTarget(null);
      if (target.documentStorageId) {
        try {
          await deleteEncryptedDocument(target.documentStorageId);
        } catch (cleanupFailure) {
          const cleanupMessage = cleanupFailure instanceof Error ? cleanupFailure.message : 'Unknown storage error.';
          setError(`The document was removed from the vault list, but its encrypted file could not be deleted: ${cleanupMessage}`);
        }
      }
    } catch (failure) {
      if (session === vaultSession.current) setError(failure instanceof Error ? failure.message : 'Unable to delete this entry.');
    } finally {
      setBusy(false);
    }
  };

  const typeTitle = (type: VaultRecordType) => type === 'document'
    ? 'Private document'
    : recordTypes.find((item) => item.value === type)?.title ?? type;
  const visibleSecret = (record: VaultRecord) => {
    if (revealedId !== record.id) return '••••••••';
    if (record.type === 'login') return record.password;
    if (record.type === 'pin') return record.pin;
    if (record.type === 'bank') return record.accountNumber;
    return record.lastFour ? `•••• ${record.lastFour}` : undefined;
  };
  const detailRows = (record: VaultRecord) => {
    const rows: { label: string; value?: string; secret?: boolean }[] = [];
    if (record.type === 'login') {
      rows.push({ label: 'Username', value: record.username }, { label: 'Website / app', value: record.website }, { label: 'Password', value: visibleSecret(record), secret: true });
    } else if (record.type === 'pin') {
      rows.push({ label: 'PIN', value: visibleSecret(record), secret: true });
    } else if (record.type === 'bank') {
      rows.push(
        { label: 'Bank', value: record.bankName },
        { label: 'Account holder', value: record.accountHolder },
        { label: 'Account number', value: visibleSecret(record), secret: true },
        { label: 'IFSC / routing', value: record.ifsc },
      );
    } else if (record.type === 'card') {
      rows.push(
        { label: 'Issuer', value: record.issuer },
        { label: 'Card', value: visibleSecret(record), secret: true },
        { label: 'Expiry', value: record.expiry },
      );
    }
    if (record.notes) rows.push({ label: 'Notes', value: record.notes });
    return rows.filter((row) => row.value);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBackOrHome} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={21} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>{openToolsOnUnlock && !unlocked ? 'Document tools' : 'Private vault'}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Encrypted on this device</Text>
        </View>
        {unlocked ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Lock vault" onPress={lockVault} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.primary} />
          </Pressable>
        ) : <View style={styles.headerSpacer} />}
      </View>

      {!unlocked ? (
        <ScrollView style={styles.lockScroll} contentContainerStyle={[styles.lockContent, { paddingBottom: Math.max(insets.bottom, 20) }]}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.lockPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.lockIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.lockTitle, { color: colors.text }]}>{initialized ? 'Unlock your vault' : 'Create your private vault'}</Text>
          {openToolsOnUnlock ? <Text style={[styles.lockCaption, { color: colors.muted }]}>Unlock to compress, resize or convert files. New uploads and results will be auto-saved here.</Text> : null}
          <Text style={[styles.lockCaption, { color: colors.muted }]}>
            {Platform.OS === 'web'
              ? initialized
                ? 'Enter the vault password you created in this browser. It is separate from your account password.'
                : 'Choose a unique password with 12+ characters. It encrypts this vault and is never saved.'
              : 'Your vault is encrypted on this device. Unlocking uses your device biometrics; it is not synced or backed up.'}
          </Text>
          {Platform.OS === 'web' ? (
            <>
              <VaultInput label="Vault password" placeholder="Enter vault password" value={password} onChangeText={setPassword} colors={colors} secure autoCapitalize="none" newPassword={!initialized} />
              {!initialized ? <VaultInput label="Confirm vault password" placeholder="Re-enter vault password" value={passwordConfirm} onChangeText={setPasswordConfirm} colors={colors} secure autoCapitalize="none" newPassword /> : null}
            </>
          ) : null}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy || initialized === null} onPress={() => void unlock()} style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: busy || initialized === null ? 0.65 : 1 }]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{Platform.OS === 'web' ? (initialized ? 'Unlock vault' : 'Create encrypted vault') : (initialized ? 'Unlock with biometrics' : 'Create vault with biometrics')}</Text>}
          </Pressable>
          <View style={[styles.warningCard, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.warningText, { color: colors.muted }]}>
              No password recovery or cloud backup. If the web password or native secure key is lost, encrypted entries cannot be recovered.
            </Text>
          </View>
        </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.safetyBanner, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="lock-closed" size={16} color={colors.primary} />
            <Text style={[styles.safetyText, { color: colors.text }]}>Documents are encrypted on this device. Gemini extraction sends a copy to Google only after you confirm; extracted details are encrypted in this vault.</Text>
          </View>
          <View style={styles.addHeader}>
            <View style={styles.addHeading}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Your private vault</Text>
              <Text style={[styles.sectionCaption, { color: colors.muted }]}>{records.length} {records.length === 1 ? 'item' : 'items'} · stays on this device</Text>
            </View>
            <View style={styles.addActions}>
              <Pressable accessibilityRole="button" disabled={busy || ocrBusy} onPress={() => { setToolSession(vaultSession.current); setToolDocumentId(''); setToolsVisible(true); }}
                style={[styles.addButton, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="construct-outline" size={18} color={colors.primary} />
                <Text style={[styles.addText, { color: colors.primary }]}>Document tools</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void pickDocument()}
                style={[styles.addButton, { backgroundColor: colors.primary }, busy && styles.disabledButton]}>
                <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                <Text style={styles.addText}>Upload document</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => openForm('login')} style={[styles.addButton, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={[styles.addText, { color: colors.primary }]}>Add item</Text>
              </Pressable>
            </View>
          </View>
          <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <TextInput
              accessibilityLabel="Search vault documents and entries"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search names, categories, or extracted details"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              style={[styles.searchInput, { color: colors.text }]}
            />
            {searchQuery ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')}
                style={styles.clearSearch}>
                <Ionicons name="close-circle" size={19} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.filterToolbar}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Filter vault, currently ${filterTitle}`}
              accessibilityState={{ expanded: filterModalVisible }}
              onPress={() => {
                setPendingFilter(filter);
                setPendingFileTypeFilter(fileTypeFilter);
                setFilterModalVisible(true);
              }}
              style={[styles.filterButton, { backgroundColor: colors.surface, borderColor: filter !== 'all' || fileTypeFilter !== 'all' ? colors.primary : colors.border }]}>
              <Ionicons name="options-outline" size={18} color={colors.primary} />
              <Text numberOfLines={1} style={[styles.filterButtonText, { color: colors.text }]}>{filterTitle}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </Pressable>
            {filter !== 'all' || fileTypeFilter !== 'all' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear vault filters"
                onPress={() => { setFilter('all'); setFileTypeFilter('all'); }}
                style={[styles.clearFiltersButton, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.clearFiltersText, { color: colors.primary }]}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.typeGrid}>
            {recordTypes.map((type) => (
              <Pressable key={type.value} accessibilityRole="button" onPress={() => openForm(type.value)}
                style={[styles.typeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name={type.icon} size={18} color={colors.primary} />
                <Text style={[styles.typeText, { color: colors.text }]}>{type.title}</Text>
              </Pressable>
            ))}
          </View>
          {visibleRecords.length ? visibleRecords.map((record) => (
            <View key={record.id} style={[styles.recordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.recordHeader}>
                <View style={[styles.recordIcon, { backgroundColor: colors.primarySoft }]}>
                  <Ionicons name={record.type === 'document' ? 'document-lock-outline' : recordTypes.find((item) => item.value === record.type)?.icon ?? 'key-outline'} size={18} color={colors.primary} />
                </View>
                <View style={styles.recordTitleBlock}>
                  <Text style={[styles.recordTitle, { color: colors.text }]} numberOfLines={1}>{record.title}</Text>
                  <Text style={[styles.recordType, { color: colors.muted }]}>{record.documentCategory ?? typeTitle(record.type)}</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={revealedId === record.id ? `Hide ${record.title} secrets` : `Reveal ${record.title} secrets`}
                  onPress={() => setRevealedId(revealedId === record.id ? '' : record.id)} style={styles.recordAction}>
                  <Ionicons name={revealedId === record.id ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.primary} />
                </Pressable>
                {record.type !== 'document' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${record.title}`} onPress={() => openForm(record.type, record)} style={styles.recordAction}>
                    <Ionicons name="create-outline" size={19} color={colors.muted} />
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${record.title}`} onPress={() => deleteRecord(record)} style={styles.recordAction}>
                  <Ionicons name="trash-outline" size={18} color={colors.red} />
                </Pressable>
              </View>
              {record.type === 'document' ? (
                <>
                  <Text style={[styles.recordType, { color: colors.muted }]}>
                    {record.documentFilename} · {record.documentSize ? `${(record.documentSize / (1024 * 1024)).toFixed(2)} MB` : 'File'}
                    {record.extractedDocumentType ? ` · detected as ${record.extractedDocumentType}` : ''}
                  </Text>
                  <View style={styles.documentActions}>
                    <Pressable accessibilityRole="button" disabled={busy || ocrBusy} onPress={() => { setToolSession(vaultSession.current); setToolDocumentId(record.id); setToolsVisible(true); }}
                      style={[styles.documentAction, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name="contract-outline" size={16} color={colors.primary} />
                      <Text style={[styles.documentActionText, { color: colors.primary }]}>Compress / convert</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void openDocument(record)}
                      style={[styles.documentAction, { backgroundColor: colors.surfaceAlt }]}>
                      <Ionicons name="open-outline" size={16} color={colors.primary} />
                      <Text style={[styles.documentActionText, { color: colors.primary }]}>Open / export</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busy} onPress={() => confirmShareDocument(record)}
                      style={[styles.documentAction, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name="people-outline" size={16} color={colors.primary} />
                      <Text style={[styles.documentActionText, { color: colors.primary }]}>Share with family</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={busy || ocrBusy}
                      onPress={() => setOcrTarget(record)}
                      style={[styles.documentAction, { backgroundColor: colors.primarySoft }]}>
                      {ocrBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="scan-outline" size={16} color={colors.primary} />}
                      <Text style={[styles.documentActionText, { color: colors.primary }]}>{record.extractedFields ? 'Extract again' : 'Extract details'}</Text>
                    </Pressable>
                  </View>
                  {record.extractedFields?.map((field, index) => (
                    <View key={`${field.label}-${index}`} style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.muted }]}>{field.label}</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>
                        {revealedId === record.id ? field.value : '••••••••'}
                      </Text>
                      {revealedId === record.id ? (
                        <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${field.label}`} onPress={() => void copyDocumentField(field)} style={styles.copyButton}>
                          <Ionicons name="copy-outline" size={17} color={colors.primary} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </>
              ) : detailRows(record).map((row) => (
                <View key={row.label} style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.muted }]}>{row.label}</Text>
                  <Text selectable={false} style={[styles.detailValue, { color: colors.text }]} numberOfLines={2}>{row.value}</Text>
                </View>
              ))}
            </View>
          )) : (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="file-tray-outline" size={26} color={colors.muted} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{records.length ? 'No entries match these filters' : 'Your vault is empty'}</Text>
              <Text style={[styles.emptyCaption, { color: colors.muted }]}>Add logins, PINs, bank details, certificates, or identity documents.</Text>
            </View>
          )}
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
          {copyMessage ? <Text accessibilityLiveRegion="polite" style={[styles.copyMessage, { color: colors.primary }]}>{copyMessage}</Text> : null}
          {busy ? <ActivityIndicator style={styles.savingIndicator} color={colors.primary} /> : null}
        </ScrollView>
      )}

      <Modal visible={toolsVisible && unlocked} animationType="slide" onRequestClose={() => setToolsVisible(false)}>
        {toolsVisible && unlocked ? <DocumentToolsPanel
          records={records} vaultKey={vaultKey} initialDocumentId={toolDocumentId}
          onClose={() => setToolsVisible(false)} onPickerActive={(active) => { documentPickerActive.current = active; }}
          onSave={saveToolFiles}
        /> : null}
      </Modal>

      <Modal visible={filterModalVisible} transparent animationType="slide" onRequestClose={() => setFilterModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close filters"
            onPress={() => setFilterModalVisible(false)} />
          <View style={[styles.sheet, styles.filterSheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 18) }]} accessibilityViewIsModal>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Filter your vault</Text>
              <Text style={[styles.sheetCaption, { color: colors.muted }]}>Choose a type and file format to narrow your results.</Text>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Type</Text>
              <View style={styles.filters}>
                {[
                  { value: 'all', title: 'All' },
                  { value: 'documents', title: 'Documents' },
                  ...recordTypes.map(({ value, title }) => ({ value, title })),
                  ...documentCategoryFilters.map((title) => ({ value: `category:${title}`, title })),
                ].map((item) => (
                  <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: pendingFilter === item.value }}
                    onPress={() => setPendingFilter(item.value)}
                    style={[styles.filterChip, { backgroundColor: pendingFilter === item.value ? colors.primarySoft : colors.surfaceAlt, borderColor: pendingFilter === item.value ? colors.primary : colors.border }]}>
                    <Text style={[styles.filterText, { color: pendingFilter === item.value ? colors.primary : colors.text }]}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.fieldLabel, styles.filterFormatLabel, { color: colors.text }]}>File format</Text>
              <View style={styles.filters}>
                {([{ value: 'all', title: 'All formats' }, { value: 'pdf', title: 'PDF' }, { value: 'image', title: 'Images' }] as const).map((item) => (
                  <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: pendingFileTypeFilter === item.value }}
                    onPress={() => setPendingFileTypeFilter(item.value)}
                    style={[styles.filterChip, { backgroundColor: pendingFileTypeFilter === item.value ? colors.primarySoft : colors.surfaceAlt, borderColor: pendingFileTypeFilter === item.value ? colors.primary : colors.border }]}>
                    <Text style={[styles.filterText, { color: pendingFileTypeFilter === item.value ? colors.primary : colors.text }]}>{item.title}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.filterModalActions}>
                <Pressable accessibilityRole="button" onPress={() => { setPendingFilter('all'); setPendingFileTypeFilter('all'); }}
                  style={[styles.filterResetButton, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.filterText, { color: colors.text }]}>Reset</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => {
                  setFilter(pendingFilter);
                  setFileTypeFilter(pendingFileTypeFilter);
                  setFilterModalVisible(false);
                }} style={[styles.filterApplyButton, { backgroundColor: colors.primary }]}>
                  <Text style={styles.primaryText}>Apply filters</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={documentFormVisible} transparent animationType="slide" onRequestClose={() => !busy && setDocumentFormVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setDocumentFormVisible(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 18) }]} accessibilityViewIsModal>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>Save encrypted document</Text>
              <Text style={[styles.sheetCaption, { color: colors.muted }]}>
                {selectedDocument?.name} · saved encrypted on this device only. Nothing is sent to Gemini until you choose Extract details.
              </Text>
              <VaultInput label="Document name" value={documentTitle} onChangeText={setDocumentTitle} colors={colors} autoCapitalize="words" />
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Category</Text>
              <View style={styles.categoryOptions}>
                {[...documentCategories, 'Custom'].map((category) => (
                  <Pressable key={category} accessibilityRole="button" onPress={() => setDocumentCategory(category)}
                    style={[styles.categoryOption, { backgroundColor: documentCategory === category ? colors.primarySoft : colors.surfaceAlt, borderColor: colors.border }]}>
                    <Text style={[styles.filterText, { color: documentCategory === category ? colors.primary : colors.text }]}>{category}</Text>
                  </Pressable>
                ))}
              </View>
              {documentCategory === 'Custom' ? (
                <VaultInput label="Custom category name" value={customCategory} onChangeText={setCustomCategory} colors={colors} autoCapitalize="words" />
              ) : null}
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveDocument()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Encrypt and save</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!ocrTarget} transparent animationType="fade" onRequestClose={() => !ocrBusy && setOcrTarget(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Send document to Gemini?</Text>
            <Text style={[styles.sheetCaption, { color: colors.muted }]}>
              {ocrTarget?.title} contains sensitive personal information. If you continue, a decrypted copy is sent over HTTPS through your backend to Google Gemini to read visible text. The app backend does not save the file, but Google processes it under its own service terms. Only continue if you accept this disclosure. The returned text is an estimate and must be checked against the original.
            </Text>
            <View style={[styles.warningCard, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="warning-outline" size={18} color={colors.red} />
              <Text style={[styles.warningText, { color: colors.muted }]}>Do not rely on OCR for official, legal, or financial decisions. Verify every digit before copying or using it.</Text>
            </View>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" disabled={ocrBusy} onPress={() => setOcrTarget(null)}
                style={[styles.confirmButton, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.filterText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={ocrBusy} onPress={() => void confirmDocumentExtraction()}
                style={[styles.confirmButton, { backgroundColor: colors.primary }]}>
                {ocrBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Send to Gemini</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!formType} transparent animationType="slide" onRequestClose={() => !busy && closeForm()}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && closeForm()} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 18) }]} accessibilityViewIsModal>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>{editingId ? 'Edit entry' : `Add ${formType ? typeTitle(formType).toLowerCase() : 'entry'}`}</Text>
              {formType === 'card' ? (
                <Text style={[styles.cardNotice, { color: colors.red }]}>Only save the last four digits. Do not enter the full card number, CVV, PIN, or upload a card photo.</Text>
              ) : null}
              <VaultInput label="Entry name" value={draft.title ?? ''} onChangeText={(value) => setDraft((previous) => ({ ...previous, title: value }))} colors={colors} autoCapitalize="words" />
              {formType ? fieldsByType[formType].map((field) => (
                <VaultInput key={field.key} label={field.label} value={draft[field.key] ?? ''}
                  onChangeText={(value) => setDraft((previous) => ({ ...previous, [field.key]: value }))}
                  colors={colors} secure={field.secure} keyboard={field.keyboard}
                  autoCapitalize={field.key === 'ifsc' || field.key === 'lastFour' ? 'words' : 'none'} />
              )) : null}
              {formType !== 'card' ? <VaultInput label="Notes (optional)" value={draft.notes ?? ''} onChangeText={(value) => setDraft((previous) => ({ ...previous, notes: value }))} colors={colors} autoCapitalize="sentences" /> : null}
              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void saveRecord()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{editingId ? 'Save changes' : 'Encrypt and save'}</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !busy && setDeleteTarget(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Delete this entry?</Text>
            <Text style={[styles.sheetCaption, { color: colors.muted }]}>
              {deleteTarget?.title} will be permanently removed from this device.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDeleteTarget(null)}
                style={[styles.confirmButton, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.filterText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmDelete()}
                style={[styles.confirmButton, { backgroundColor: colors.red }]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Delete</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minWidth: 0, width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerSpacer: { width: 42, height: 42 },
  lockScroll: { flex: 1, width: '100%', minWidth: 0 },
  lockContent: { flexGrow: 1, padding: 20, alignItems: 'center' },
  lockPanel: { width: '100%', maxWidth: 520, minWidth: 0, borderRadius: 24, borderWidth: 1, padding: 22, alignItems: 'stretch' },
  lockIcon: { width: 62, height: 62, borderRadius: 21, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  lockTitle: { fontSize: 21, fontWeight: '800', textAlign: 'center' },
  lockCaption: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  field: { marginBottom: 12, minWidth: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inputContainer: { minHeight: 46, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingLeft: 12, paddingRight: 4 },
  input: { borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 12, fontSize: 14 },
  inputInContainer: { flex: 1, minWidth: 0, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, backgroundColor: 'transparent' },
  passwordVisibilityButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  warningCard: { flexDirection: 'row', gap: 9, padding: 12, borderRadius: 13, marginTop: 16 },
  warningText: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 16 },
  error: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 36 },
  safetyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 13, marginTop: 8 },
  safetyText: { flex: 1, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  addHeader: { alignItems: 'stretch', gap: 13, marginTop: 22, marginBottom: 3 },
  addHeading: { minWidth: 0 },
  addActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionCaption: { fontSize: 11, marginTop: 3 },
  addButton: { flex: 1, flexBasis: 145, minWidth: 0, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 12 },
  disabledButton: { opacity: 0.6 },
  addText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, marginTop: 18 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 46, paddingVertical: 8, fontSize: 14 },
  clearSearch: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  filterToolbar: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  filterButton: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12 },
  filterButtonText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700' },
  clearFiltersButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 13 },
  clearFiltersText: { fontSize: 12, fontWeight: '700' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  filterChip: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8 },
  filterText: { fontSize: 12, fontWeight: '700' },
  filterSheet: { maxHeight: '80%' },
  filterFormatLabel: { marginTop: 22 },
  filterModalActions: { flexDirection: 'row', gap: 10, marginTop: 26, marginBottom: 6 },
  filterResetButton: { minWidth: 88, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 16 },
  filterApplyButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, paddingHorizontal: 16 },
  categoryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  categoryOption: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, marginBottom: 14 },
  typeCard: { flexGrow: 1, flexBasis: '46%', minWidth: 0, minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  typeText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700' },
  recordCard: { borderWidth: 1, borderRadius: 18, padding: 13, marginBottom: 10 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  recordIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  recordTitleBlock: { flex: 1 },
  recordTitle: { fontSize: 14, fontWeight: '800' },
  recordType: { fontSize: 10, marginTop: 2 },
  recordAction: { minWidth: 28, height: 34, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
  detailLabel: { width: 100, fontSize: 11, fontWeight: '600' },
  detailValue: { flex: 1, fontSize: 12, fontWeight: '600' },
  documentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  documentAction: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  documentActionText: { fontSize: 11, fontWeight: '700' },
  copyButton: { minWidth: 30, alignItems: 'center', justifyContent: 'center' },
  copyMessage: { fontSize: 11, fontWeight: '700', textAlign: 'center', marginVertical: 8 },
  emptyCard: { borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center', marginTop: 2 },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginTop: 9 },
  emptyCaption: { fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 5 },
  savingIndicator: { margin: 12 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 21, paddingTop: 12 },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  sheetCaption: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  cardNotice: { fontSize: 12, lineHeight: 17, fontWeight: '600', marginBottom: 13 },
  confirmBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  confirmCard: { width: '100%', maxWidth: 390, borderRadius: 20, padding: 20 },
  confirmActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  confirmButton: { minWidth: 90, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
});
