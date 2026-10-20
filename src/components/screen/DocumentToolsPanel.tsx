import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { decryptDocument, exportDecryptedDocument } from '@/services/document-vault';
import { processDocument } from '@/services/document-tools';
import { canRenderPdf } from '@/services/pdf-renderer';
import type { VaultRecord } from '@/services/vault';
import { useAppTheme } from '@/state/ThemeProvider';
import { base64ToBytes, documentBytesMatchMimeType } from '@/utils/documentCrypto';
import {
  checkProcessing, formatDocumentSize, MAX_DOCUMENT_BYTES, parseDimension, parseTargetSize,
  type CompressionMode, type DocumentOperation, type FileSizeUnit, type ProcessedDocument,
} from '@/utils/documentTools';

interface Props {
  records: VaultRecord[];
  vaultKey: string;
  initialDocumentId?: string;
  onClose: () => void;
  onPickerActive: (active: boolean) => void;
  onSave: (files: ProcessedDocument[], category: string, signal: AbortSignal) => Promise<VaultRecord[]>;
}

const operations: { value: DocumentOperation; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'compress', title: 'Compress', icon: 'contract-outline' },
  { value: 'resize', title: 'Resize image', icon: 'resize-outline' },
  { value: 'pdf-to-jpg', title: 'PDF to JPG', icon: 'images-outline' },
  { value: 'jpg-to-pdf', title: 'JPG to PDF', icon: 'document-outline' },
];

function ToolButton({ title, onPress, icon, disabled = false, color }: {
  title: string; onPress: () => void; icon: keyof typeof Ionicons.glyphMap; disabled?: boolean; color: string;
}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }]}>
    <Ionicons name={icon} color="#FFFFFF" size={18} /><Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}

export default function DocumentToolsPanel({ records, vaultKey, initialDocumentId, onClose, onPickerActive, onSave }: Props) {
  const { colors } = useAppTheme();
  const [selectedId, setSelectedId] = useState(initialDocumentId ?? '');
  const [operation, setOperation] = useState<DocumentOperation>('compress');
  const [mode, setMode] = useState<CompressionMode>('auto');
  const [targetSize, setTargetSize] = useState('1');
  const [sizeUnit, setSizeUnit] = useState<FileSizeUnit>('MB');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<VaultRecord[]>([]);
  const [originalSize, setOriginalSize] = useState(0);
  const controller = useRef(new AbortController());
  const working = useRef(false);
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);

  const documents = records.filter((record) => record.type === 'document');
  const selected = documents.find((record) => record.id === selectedId);
  const isPdf = selected?.documentMimeType === 'application/pdf';
  const compatible = !selected || (operation === 'pdf-to-jpg' ? isPdf : operation === 'resize' || operation === 'jpg-to-pdf' ? !isPdf : true);
  const supported = !selected || !isPdf || canRenderPdf;
  const filtered = documents.filter((record) => `${record.title} ${record.documentFilename} ${record.documentCategory}`.toLowerCase().includes(search.toLowerCase()));
  const resetResult = () => { setError(''); setNotice(''); setResults([]); };
  const reportFailure = (failure: unknown) => {
    if (!controller.current.signal.aborted) setError(failure instanceof Error ? failure.message : 'Could not process this document.');
  };

  const upload = async () => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    resetResult();
    const signal = controller.current.signal;
    let pickerUri: string | undefined;
    onPickerActive(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false, base64: false });
      onPickerActive(false);
      if (result.canceled) return;
      const asset = result.assets[0];
      pickerUri = asset.uri;
      checkProcessing(signal);
      if (asset.size && asset.size > MAX_DOCUMENT_BYTES) throw new Error('Choose a file up to 20 MB.');
      const extension = asset.name.split('.').pop()?.toLowerCase();
      const mimeType = ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[extension ?? ''] ?? asset.mimeType ?? '';
      const bytes = Platform.OS === 'web'
        ? asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : asset.base64 ? base64ToBytes(asset.base64) : new Uint8Array(await (await fetch(asset.uri)).arrayBuffer())
        : await new File(asset.uri).bytes();
      if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error('Choose a non-empty file up to 20 MB.');
      if (!documentBytesMatchMimeType(bytes, mimeType)) throw new Error('Choose a valid PDF, JPG, PNG, or WebP file.');
      checkProcessing(signal);
      setProgress('Saving the original securely to your vault…');
      const [saved] = await onSave([{ bytes, filename: asset.name, mimeType }], 'Other', signal);
      checkProcessing(signal);
      setSelectedId(saved.id);
      setNotice('Original auto-saved to Private vault. Choose an operation below.');
    } catch (failure) {
      reportFailure(failure);
    } finally {
      onPickerActive(false);
      if (Platform.OS !== 'web' && pickerUri) {
        try { const file = new File(pickerUri); if (file.exists) file.delete(); } catch { /* The system may already have removed its picker copy. */ }
      }
      working.current = false;
      if (!signal.aborted) { setBusy(false); setProgress(''); }
    }
  };

  const run = async () => {
    if (!selected?.documentStorageId || !selected.documentMimeType || working.current) return;
    resetResult();
    const signal = controller.current.signal;
    try {
      const options = {
        operation, mode,
        targetBytes: mode === 'manual' && operation !== 'pdf-to-jpg' ? parseTargetSize(targetSize, sizeUnit) : undefined,
        width: operation === 'resize' && mode === 'manual' ? parseDimension(width) : undefined,
        height: operation === 'resize' && mode === 'manual' ? parseDimension(height) : undefined,
      };
      working.current = true;
      setBusy(true);
      setProgress('Opening the encrypted document…');
      const bytes = await decryptDocument(selected.documentStorageId, vaultKey);
      checkProcessing(signal);
      setOriginalSize(bytes.length);
      const result = await processDocument({ bytes, filename: selected.documentFilename ?? selected.title, mimeType: selected.documentMimeType }, options, signal, setProgress);
      checkProcessing(signal);
      if (result.unchanged) {
        setResults([selected]);
        setNotice(options.targetBytes && bytes.length <= options.targetBytes
          ? 'This file is already below your target. Your original is ready to export.'
          : 'The original is smaller than the compressed version. Kept the original; no duplicate was saved.');
      } else {
        setProgress('Encrypting and saving the result…');
        const saved = await onSave(result.files, selected.documentCategory ?? 'Other', signal);
        checkProcessing(signal);
        setResults(saved);
        setNotice(`${saved.length === 1 ? 'Result' : `${saved.length} JPG pages`} saved to Private vault. Your original is preserved.`);
      }
    } catch (failure) {
      reportFailure(failure);
    } finally {
      working.current = false;
      if (!signal.aborted) { setBusy(false); setProgress(''); }
    }
  };

  const exportResult = async (record: VaultRecord) => {
    if (working.current || !record.documentStorageId || !record.documentMimeType) return;
    working.current = true;
    setBusy(true);
    setError('');
    // Sharing may background/lock the vault. Its existing export helper cleans the temporary file.
    try { await exportDecryptedDocument(record.documentStorageId, vaultKey, record.documentFilename ?? record.title, record.documentMimeType); }
    catch (failure) { reportFailure(failure); }
    finally { working.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  };

  const input = (label: string, value: string, change: (text: string) => void, placeholder: string) => <View style={styles.field}>
    <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    <TextInput accessibilityLabel={label} editable={!busy} keyboardType="decimal-pad" value={value} onChangeText={(text) => { change(text); resetResult(); }} placeholder={placeholder} placeholderTextColor={colors.muted}
      style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]} />
  </View>;

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close document tools" onPress={() => { controller.current.abort(); onClose(); }} style={styles.close}><Ionicons name="arrow-back" size={23} color={colors.text} /></Pressable>
      <View style={styles.grow}><Text style={[styles.title, { color: colors.text }]}>Document tools</Text><Text style={[styles.caption, { color: colors.muted }]}>Compress, resize & convert</Text></View>
      <Ionicons name="shield-checkmark-outline" size={24} color={colors.primary} />
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={[styles.banner, { backgroundColor: colors.primarySoft }]}><Ionicons name="lock-closed-outline" size={19} color={colors.primary} /><Text style={[styles.bannerText, { color: colors.text }]}>Processed on your device. New uploads and results are automatically encrypted in Private vault.</Text></View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>1. Choose your file</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>PDF, JPG, PNG or WebP · up to 20 MB · PDFs up to 60 pages</Text>
        <ToolButton title="Upload new file & auto-save" onPress={() => void upload()} icon="cloud-upload-outline" disabled={busy} color={colors.primary} />
        <Text style={[styles.label, { color: colors.text }]}>Or select from Private vault ({documents.length})</Text>
        <TextInput accessibilityLabel="Search vault documents" editable={!busy} value={search} onChangeText={setSearch} placeholder="Search documents" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceAlt }]} />
        <ScrollView nestedScrollEnabled style={styles.fileList}>
          {filtered.map((record) => <Pressable key={record.id} accessibilityRole="button" accessibilityState={{ selected: selectedId === record.id }} disabled={busy}
            onPress={() => { setSelectedId(record.id); resetResult(); }} style={[styles.fileRow, { backgroundColor: selectedId === record.id ? colors.primarySoft : colors.surface, borderColor: selectedId === record.id ? colors.primary : colors.border }]}>
            <Ionicons name={record.documentMimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'} size={22} color={colors.primary} />
            <View style={styles.grow}><Text numberOfLines={1} style={[styles.fileTitle, { color: colors.text }]}>{record.title}</Text><Text style={[styles.caption, { color: colors.muted }]}>{record.documentSize ? formatDocumentSize(record.documentSize) : ''} · {record.documentCategory}</Text></View>
            <Ionicons name={selectedId === record.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
          </Pressable>)}
          {!filtered.length ? <Text style={[styles.caption, { color: colors.muted }]}>No matching documents. Upload a file to get started.</Text> : null}
        </ScrollView>
        {selected ? <Text style={[styles.caption, { color: colors.primary }]}>Selected: {selected.documentFilename}</Text> : null}
      </View>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>2. Choose a tool</Text>
        <View style={styles.chips}>{operations.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: operation === item.value }} disabled={busy}
          onPress={() => { setOperation(item.value); resetResult(); }} style={[styles.chip, { backgroundColor: operation === item.value ? colors.primarySoft : colors.surfaceAlt, borderColor: operation === item.value ? colors.primary : colors.border }]}>
          <Ionicons name={item.icon} size={18} color={colors.primary} /><Text style={[styles.fileTitle, { color: colors.text }]}>{item.title}</Text>
        </Pressable>)}</View>
        {!compatible ? <Text accessibilityRole="alert" style={[styles.caption, { color: colors.red }]}>{operation === 'pdf-to-jpg' ? 'Select a PDF for this tool.' : 'Select an image for this tool.'}</Text> : null}
        {!supported ? <Text accessibilityRole="alert" style={[styles.caption, { color: colors.red }]}>{Platform.OS === 'android' ? 'Rebuild and reinstall the Android app to enable PDF processing.' : 'PDF compression and PDF to JPG are currently available on Android and web.'}</Text> : null}
        {operation !== 'pdf-to-jpg' ? <>
          <View style={styles.chips}>{(['auto', 'manual'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} disabled={busy}
            onPress={() => { setMode(value); resetResult(); }} style={[styles.mode, { backgroundColor: mode === value ? colors.primarySoft : colors.surfaceAlt, borderColor: mode === value ? colors.primary : colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>{value === 'auto' ? 'Auto' : 'Manual size'}</Text><Text style={[styles.caption, { color: colors.muted }]}>{value === 'auto' ? 'Balanced quality & size' : 'Choose a limit in KB or MB'}</Text>
          </Pressable>)}</View>
          {mode === 'manual' ? <>
            <View style={styles.sizeRow}>
              {input(`Maximum output size (${sizeUnit})`, targetSize, setTargetSize, sizeUnit === 'KB' ? 'e.g. 200 or 500' : 'e.g. 0.5 or 2')}
              <View accessibilityRole="radiogroup" accessibilityLabel="File size unit" style={styles.sizeUnits}>
                {(['KB', 'MB'] as const).map((unit) => <Pressable key={unit} accessibilityRole="radio" accessibilityLabel={unit === 'KB' ? 'Kilobytes' : 'Megabytes'} accessibilityState={{ checked: sizeUnit === unit, disabled: busy }} disabled={busy}
                  onPress={() => { setSizeUnit(unit); resetResult(); }} style={[styles.unitButton, { backgroundColor: sizeUnit === unit ? colors.primarySoft : colors.surfaceAlt, borderColor: sizeUnit === unit ? colors.primary : colors.border }]}>
                  <Text style={[styles.label, { color: sizeUnit === unit ? colors.primary : colors.text }]}>{unit}</Text>
                </Pressable>)}
              </View>
            </View>
            <Text style={[styles.caption, { color: colors.muted }]}>Choose KB or MB. Accepted range: 1 KB to 20 MB.</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>Output will be at or below this limit. Quality and dimensions may be reduced. A smaller file will not be enlarged.</Text>
            {operation === 'resize' ? <><View style={styles.chips}>{input('Max width (px)', width, setWidth, 'Optional')}{input('Max height (px)', height, setHeight, 'Optional')}</View><Text style={[styles.caption, { color: colors.muted }]}>Fits inside these dimensions and preserves aspect ratio. No upscaling.</Text></> : null}
          </> : <Text style={[styles.caption, { color: colors.muted }]}>Automatically balances quality and dimensions, with a maximum image edge of 2400 pixels.</Text>}
        </> : <Text style={[styles.caption, { color: colors.muted }]}>Each PDF page becomes a separate JPG, in page order. All pages are auto-saved to your vault.</Text>}
        {isPdf && operation === 'compress' ? <View style={[styles.banner, { backgroundColor: colors.surfaceAlt }]}><Text style={[styles.bannerText, { color: colors.text }]}>PDF compression creates image-based pages. Text selection, links, forms and digital signatures are removed from the new copy. Your original stays intact.</Text></View> : null}
        {!isPdf && operation !== 'jpg-to-pdf' ? <Text style={[styles.caption, { color: colors.muted }]}>Compressed and resized images are saved as JPG. Transparency is flattened.</Text> : null}
        <ToolButton title={busy ? 'Working…' : `${operations.find((item) => item.value === operation)?.title} & save to vault`} onPress={() => void run()} icon="sparkles-outline" disabled={busy || !selected || !compatible || !supported} color={colors.primary} />
        {busy ? <View style={styles.status}><ActivityIndicator color={colors.primary} /><Text accessibilityLiveRegion="polite" style={[styles.caption, { color: colors.text }]}>{progress || 'Preparing…'}</Text></View> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.red }]}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.green }]}>{notice}</Text> : null}
      </View>
      {results.length ? <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Saved in Private vault</Text>
        {results.length === 1 && originalSize ? <Text style={[styles.caption, { color: colors.muted }]}>{formatDocumentSize(originalSize)} → {formatDocumentSize(results[0].documentSize ?? 0)}{(operation === 'compress' || operation === 'resize') && (results[0].documentSize ?? 0) < originalSize ? ` · ${Math.round((1 - (results[0].documentSize ?? 0) / originalSize) * 100)}% smaller` : ''}</Text> : null}
        {results.map((record) => <View key={record.id} style={styles.result}>
          <View style={styles.grow}><Text style={[styles.fileTitle, { color: colors.text }]}>{record.documentFilename}</Text><Text style={[styles.caption, { color: colors.muted }]}>{formatDocumentSize(record.documentSize ?? 0)}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Export ${record.documentFilename}`} disabled={busy} onPress={() => void exportResult(record)} style={[styles.export, { backgroundColor: colors.primarySoft }]}><Ionicons name="download-outline" size={20} color={colors.primary} /><Text style={[styles.fileTitle, { color: colors.primary }]}>Export</Text></Pressable>
        </View>)}
        <Text style={[styles.caption, { color: colors.muted }]}>Export creates a decrypted copy outside your vault.</Text>
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16 }, close: { padding: 10 }, grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 23, fontWeight: '800' }, caption: { fontSize: 12, lineHeight: 19 }, content: { width: '100%', maxWidth: 840, alignSelf: 'center', padding: 18, gap: 16, paddingBottom: 40 },
  banner: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14 }, bannerText: { flex: 1, fontSize: 12, lineHeight: 19 }, card: { padding: 18, borderRadius: 20, borderWidth: 1, gap: 12 },
  heading: { fontSize: 18, fontWeight: '800' }, button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 9, padding: 12, borderRadius: 13 }, buttonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700' }, input: { borderWidth: 1, borderRadius: 11, minHeight: 46, paddingHorizontal: 13, fontSize: 14 }, fileList: { maxHeight: 230 }, fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 }, fileTitle: { fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, chip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 12, padding: 12 }, mode: { flex: 1, minWidth: 120, gap: 5, borderWidth: 1, borderRadius: 12, padding: 13 }, field: { flexGrow: 1, minWidth: 100, gap: 8 },
  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 }, sizeUnits: { flexDirection: 'row', gap: 6 }, unitButton: { minHeight: 46, minWidth: 48, paddingHorizontal: 12, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 }, message: { fontSize: 13, lineHeight: 20 }, result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, export: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 12, borderRadius: 10 },
});
