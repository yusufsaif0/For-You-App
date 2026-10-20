import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  chatAboutApplication, extractApplicationDocument, getApplicationCapabilities,
  type ApplicationCapabilities, type ApplicationExtraction, type ApplicationMessage,
  type ApplicationPlan, type ApplicationRequirement,
} from '@/services/api/applications';
import {
  consumeStagedApplicationDraft, getStagedApplicationDraft, saveEncryptedApplicationDraft,
  type EncryptedApplicationDraft,
} from '@/services/application-drafts';
import { stageApplicationPortalSession } from '@/services/application-portal-session';
import { useAppTheme } from '@/state/ThemeProvider';
import { bytesToBase64 } from '@/utils/documentCrypto';

const blankPlan: ApplicationPlan = {
  title: 'New application',
  scope: { service: 'unknown', state: '', district: '', institution: '', session: '' },
  portal_url: '',
  requirements: [],
  fee: { value: 'Not verified', source_url: '' },
  deadline: { value: 'Not verified', source_url: '' },
  sources: [],
  research_id: '',
};

const supportedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;

function newDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function serviceDescription(plan: ApplicationPlan) {
  return [plan.scope.institution, plan.scope.district, plan.scope.state, plan.scope.session]
    .filter(Boolean)
    .join(' · ');
}

function sourceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Checked date unavailable' : `Checked ${date.toLocaleDateString()}`;
}

function requirementValueKey(requirement: ApplicationRequirement) {
  return requirement.key;
}

export default function ApplicationAssistantScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const chatRef = useRef<ScrollView>(null);
  const [restoredDraft] = useState(() => getStagedApplicationDraft());
  const draftId = useRef(restoredDraft?.id ?? newDraftId());
  const [capabilities, setCapabilities] = useState<ApplicationCapabilities | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [messages, setMessages] = useState<ApplicationMessage[]>(() => restoredDraft?.messages ?? [
    {
      role: 'assistant',
      content: 'Tell me which application you need help with. I can search for current official instructions, explain what is verified, and help prepare a draft. On mobile, a guided browser can help with some ordinary form fields; you review every value and confirm each form submission. Payments, passwords, OTP, and CAPTCHA stay manual.',
    },
  ]);
  const [plan, setPlan] = useState<ApplicationPlan>(() => restoredDraft?.plan ?? blankPlan);
  const [input, setInput] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(() => restoredDraft
    ? 'Encrypted draft opened from your private vault. Confirm processing consent before continuing.'
    : '');
  const [confirmedFields, setConfirmedFields] = useState<Record<string, string>>(
    () => restoredDraft?.confirmedFields ?? {},
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () => restoredDraft?.confirmedFields ?? {},
  );
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);
  const [portalReviewed, setPortalReviewed] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [documentConsent, setDocumentConsent] = useState(false);
  const [extraction, setExtraction] = useState<ApplicationExtraction | null>(null);
  const [selectedExtractedFields, setSelectedExtractedFields] = useState<number[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [webVaultPassword, setWebVaultPassword] = useState('');

  const loadCapabilities = useCallback(async () => {
    setLoadingCapabilities(true);
    setError('');
    try {
      setCapabilities(await getApplicationCapabilities());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not check assistant availability.');
    } finally {
      setLoadingCapabilities(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadCapabilities(); }, [loadCapabilities]));

  useEffect(() => {
    if (restoredDraft) consumeStagedApplicationDraft();
  }, [restoredDraft]);

  useEffect(() => {
    if (messages.length) chatRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

  const sendMessage = async (messageText = input, verifyRequirements = false) => {
    const content = messageText.trim();
    if (!content || busy) return;
    if (!consent) {
      setError('Review and accept the processing notice before sending chat messages.');
      return;
    }
    if (!capabilities?.processing_enabled) {
      setError('The backend reports the application assistant is disabled. Restart the backend after enabling it and configuring GEMINI_API_KEY, then check assistant status again.');
      return;
    }
    const userMessage: ApplicationMessage = { role: 'user', content };
    const outgoing: ApplicationMessage[] = [...messages, userMessage].slice(-24);
    setMessages(outgoing);
    setInput('');
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await chatAboutApplication({
        messages: outgoing,
        plan,
        confirmed_fields: confirmedFields,
        verify_requirements: verifyRequirements,
      });
      setPlan(result.plan);
      setFieldValues((current) => ({ ...current, ...result.suggested_values }));
      setPortalReviewed(false);
      const assistantMessage: ApplicationMessage = { role: 'assistant', content: result.reply };
      setMessages([...outgoing, assistantMessage].slice(-24));
    } catch (failure) {
      setMessages(messages);
      setInput(content);
      setError(failure instanceof Error ? failure.message : 'The assistant could not answer. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const chooseDocument = async () => {
    setError('');
    setNotice('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...supportedMimeTypes],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('The selected document could not be read.');
      const mimeType = asset.mimeType?.toLowerCase() ?? '';
      if (!supportedMimeTypes.has(mimeType)) throw new Error('Choose a PDF, JPG/JPEG, PNG, or WebP file.');
      if (asset.size !== undefined && asset.size > MAX_DOCUMENT_BYTES) {
        throw new Error('Choose a document no larger than 6 MB for text extraction.');
      }
      setSelectedDocument(asset);
      setDocumentConsent(false);
      setExtraction(null);
      setSelectedExtractedFields([]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not select this document.');
    }
  };

  const extractDocument = async () => {
    if (!selectedDocument || !documentConsent || !consent || !capabilities?.processing_enabled) return;
    setExtracting(true);
    setError('');
    setNotice('');
    try {
      let bytes: Uint8Array;
      if (Platform.OS === 'web' && selectedDocument.file) {
        bytes = new Uint8Array(await selectedDocument.file.arrayBuffer());
      } else {
        bytes = await new File(selectedDocument.uri).bytes();
      }
      if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) {
        throw new Error('Choose a non-empty document no larger than 6 MB.');
      }
      const result = await extractApplicationDocument(bytesToBase64(bytes), selectedDocument.mimeType ?? '');
      setExtraction(result);
      setSelectedExtractedFields([]);
      setNotice('Review the extracted text. Select only accurate fields you want to include in a later assistant message.');
      setSelectedDocument(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not extract document details.');
    } finally {
      setExtracting(false);
    }
  };

  const includeSelectedExtractedFields = () => {
    if (!extraction || !selectedExtractedFields.length) return;
    const fields = Object.fromEntries(selectedExtractedFields.map((index) => {
      const field = extraction.fields[index];
      return [field.label, field.value];
    }));
    setConfirmedFields((current) => ({ ...current, ...fields }));
    setNotice(`${selectedExtractedFields.length} reviewed document field(s) will be included in your next assistant request.`);
  };

  const includeEnteredFields = () => {
    const selected = Object.fromEntries(selectedFieldKeys
      .map((key) => [key, fieldValues[key]?.trim() ?? ''] as const)
      .filter(([, value]) => value));
    if (!Object.keys(selected).length) {
      setError('Select and complete at least one field before including it.');
      return;
    }
    setConfirmedFields((current) => ({ ...current, ...selected }));
    setNotice(`${Object.keys(selected).length} reviewed field(s) will be included in your next assistant request.`);
    setError('');
  };

  const openSource = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      setError('Could not open this official source link.');
    }
  };

  const continueToPortal = () => {
    try {
      const sessionId = stageApplicationPortalSession({
        url: plan.portal_url,
        confirmedFields: Platform.OS === 'web' ? {} : confirmedFields,
      });
      router.push({ pathname: '/application-portal', params: { sessionId } });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not prepare the portal session.');
    }
  };

  const saveDraft = async (password?: string) => {
    if (!messages.some((message) => message.role === 'user')) {
      setError('Send a message before saving an application draft.');
      return;
    }
    const draft: EncryptedApplicationDraft = {
      id: draftId.current,
      title: plan.title || 'Application draft',
      messages,
      plan,
      confirmedFields,
      savedAt: new Date().toISOString(),
    };
    setBusy(true);
    setError('');
    try {
      await saveEncryptedApplicationDraft(draft, password);
      setSaveModalVisible(false);
      setWebVaultPassword('');
      setNotice('Draft saved in your encrypted Private Vault on this device.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the encrypted application draft.');
    } finally {
      setBusy(false);
    }
  };

  const serviceLocation = serviceDescription(plan);
  const readyToContinue = plan.portal_url && plan.sources.some((source) => source.url === plan.portal_url);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home"
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/tabs'); }}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="sparkles" size={20} color={colors.primary} />
        </View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Application assistant</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Research and prepare · you stay in control</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Save encrypted application draft"
          onPress={() => Platform.OS === 'web' ? setSaveModalVisible(true) : void saveDraft()}
          disabled={busy} style={[styles.saveButton, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <ScrollView ref={chatRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.privacyCard, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} />
          <Text style={[styles.privacyText, { color: colors.text }]}>
            Chat text is processed by this app&apos;s backend and Google Gemini. A document is sent only after you select it and confirm extraction. Never share passwords, OTPs, CAPTCHA answers, or payment-card details.
          </Text>
        </View>

        {loadingCapabilities ? (
          <View style={styles.capabilityState}><ActivityIndicator color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>Checking assistant availability…</Text></View>
        ) : capabilities && !capabilities.processing_enabled ? (
          <View style={[styles.unavailableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
            <View style={styles.messageCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Assistant setup is not complete</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{capabilities.message}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>The backend reports that processing is unavailable. Confirm its application processing setting and server-side GEMINI_API_KEY, restart the backend so it reloads its environment, then check again. Enable personal-data processing only after reviewing Gemini billing and data-processing terms.</Text>
              <Pressable accessibilityRole="button" disabled={loadingCapabilities} onPress={() => void loadCapabilities()}
                style={[styles.secondaryAction, { backgroundColor: colors.surfaceAlt }, loadingCapabilities && styles.disabled]}>
                {loadingCapabilities ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={17} color={colors.primary} />}
                <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Check assistant status again</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {messages.map((message, index) => (
          <View key={`${index}-${message.role}`} style={[
            styles.messageRow,
            message.role === 'user' ? styles.userMessageRow : styles.assistantMessageRow,
          ]}>
            {message.role === 'assistant' ? (
              <View style={[styles.messageAvatar, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="sparkles" size={15} color={colors.primary} />
              </View>
            ) : null}
            <View style={[
              styles.messageBubble,
              message.role === 'user'
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
              <Text style={[styles.messageText, { color: message.role === 'user' ? '#FFFFFF' : colors.text }]}>{message.content}</Text>
            </View>
          </View>
        ))}

        {busy ? <View style={styles.thinking}><ActivityIndicator size="small" color={colors.primary} /><Text style={[styles.caption, { color: colors.muted }]}>Checking official sources…</Text></View> : null}

        {plan.requirements.length || plan.sources.length || plan.scope.service !== 'unknown' ? (
          <View style={[styles.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.planHeader}>
              <View style={styles.planIcon}><Ionicons name="document-text-outline" size={19} color={colors.primary} /></View>
              <View style={styles.messageCopy}>
                <Text style={[styles.planTitle, { color: colors.text }]}>{plan.title}</Text>
                {serviceLocation ? <Text style={[styles.caption, { color: colors.muted }]}>{serviceLocation}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Verify current requirements"
                disabled={busy || !capabilities?.processing_enabled}
                onPress={() => void sendMessage('Please check the current requirements again from official sources for this exact institution, authority, place and session.', true)}
                style={[styles.refreshButton, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              </Pressable>
            </View>

            <View style={styles.factGrid}>
              <View style={[styles.factCard, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.factLabel, { color: colors.muted }]}>FEE</Text>
                <Text style={[styles.factValue, { color: colors.text }]}>{plan.fee.value}</Text>
                {plan.fee.source_url ? <Pressable onPress={() => void openSource(plan.fee.source_url)}><Text style={[styles.sourceLink, { color: colors.primary }]}>Source</Text></Pressable> : null}
              </View>
              <View style={[styles.factCard, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.factLabel, { color: colors.muted }]}>DEADLINE</Text>
                <Text style={[styles.factValue, { color: colors.text }]}>{plan.deadline.value}</Text>
                {plan.deadline.source_url ? <Pressable onPress={() => void openSource(plan.deadline.source_url)}><Text style={[styles.sourceLink, { color: colors.primary }]}>Source</Text></Pressable> : null}
              </View>
            </View>

            {plan.requirements.length ? (
              <View style={styles.planSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Requirements from official sources</Text>
                {plan.requirements.map((requirement) => (
                  <View key={requirement.key} style={[styles.requirementCard, { borderColor: colors.border }]}>
                    {requirement.kind === 'field' ? (
                      <View style={styles.requirementHeading}>
                        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selectedFieldKeys.includes(requirementValueKey(requirement)) }}
                          onPress={() => setSelectedFieldKeys((keys) => keys.includes(requirement.key) ? keys.filter((key) => key !== requirement.key) : [...keys, requirement.key])}
                          style={[styles.fieldCheckbox, { borderColor: selectedFieldKeys.includes(requirement.key) ? colors.primary : colors.border, backgroundColor: selectedFieldKeys.includes(requirement.key) ? colors.primarySoft : colors.background }]}>
                          {selectedFieldKeys.includes(requirement.key) ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                        </Pressable>
                        <Text style={[styles.requirementLabel, { color: colors.text }]}>{requirement.label}{requirement.required ? ' · Required' : ' · Optional'}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.requirementLabel, { color: colors.text }]}>
                        {requirement.label}{requirement.required ? ' · Required document' : ' · Optional document'}
                      </Text>
                    )}
                    {requirement.description ? <Text style={[styles.caption, { color: colors.muted }]}>{requirement.description}</Text> : null}
                    {requirement.kind === 'field' ? (
                      <TextInput
                        accessibilityLabel={requirement.label}
                        value={fieldValues[requirement.key] ?? ''}
                        onChangeText={(value) => setFieldValues((current) => ({ ...current, [requirement.key]: value }))}
                        placeholder="Enter or confirm this value"
                        placeholderTextColor={colors.muted}
                        style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                      />
                    ) : null}
                    <Pressable onPress={() => void openSource(requirement.source_url)}>
                      <Text style={[styles.sourceLink, { color: colors.primary }]}>Open cited source</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable accessibilityRole="button" onPress={includeEnteredFields}
                  style={[styles.secondaryAction, { backgroundColor: colors.surfaceAlt }]}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={colors.primary} />
                  <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Include selected fields in next message</Text>
                </Pressable>
              </View>
            ) : null}

            {extraction ? (
              <View style={styles.planSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Review extracted details · {extraction.document_type}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>Nothing is included until you select it here. Check every value against the original document.</Text>
                {extraction.fields.map((field, index) => (
                  <View key={`${field.label}-${index}`} style={[styles.extractedRow, { borderColor: colors.border }]}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selectedExtractedFields.includes(index) }}
                      onPress={() => setSelectedExtractedFields((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}
                      style={[styles.fieldCheckbox, { borderColor: selectedExtractedFields.includes(index) ? colors.primary : colors.border, backgroundColor: selectedExtractedFields.includes(index) ? colors.primarySoft : colors.background }]}>
                      {selectedExtractedFields.includes(index) ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                    </Pressable>
                    <View style={styles.extractedCopy}>
                      <Text style={[styles.factLabel, { color: colors.muted }]}>{field.label}</Text>
                      <TextInput accessibilityLabel={`Confirm ${field.label}`} value={field.value}
                        onChangeText={(value) => setExtraction((current) => current ? ({
                          ...current,
                          fields: current.fields.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item),
                        }) : current)}
                        style={[styles.extractedInput, { color: colors.text, borderBottomColor: colors.border }]} />
                    </View>
                  </View>
                ))}
                <Pressable accessibilityRole="button" disabled={!selectedExtractedFields.length} onPress={includeSelectedExtractedFields}
                  style={[styles.secondaryAction, { backgroundColor: colors.surfaceAlt }, !selectedExtractedFields.length && styles.disabled]}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={colors.primary} />
                  <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Include selected details in next message</Text>
                </Pressable>
              </View>
            ) : null}

            {plan.sources.length ? (
              <View style={styles.planSection}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Sources checked</Text>
                {plan.sources.map((source) => (
                  <Pressable key={source.url} accessibilityRole="link" onPress={() => void openSource(source.url)}
                    style={styles.sourceRow}>
                    <Ionicons name="open-outline" size={16} color={colors.primary} />
                    <View style={styles.messageCopy}>
                      <Text numberOfLines={2} style={[styles.sourceTitle, { color: colors.primary }]}>{source.title}</Text>
                      <Text style={[styles.factLabel, { color: colors.muted }]}>{sourceDate(source.checked_at)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {readyToContinue ? (
              <View style={[styles.portalNotice, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.caption, { color: colors.text }]}>
                  On Android and iOS, the guided browser can detect some ordinary form fields and place only values you select after a separate confirmation. You must review every field. Login, OTP, CAPTCHA, file uploads, and payment stay manual. Standard form submissions ask for separate confirmation; some custom portal flows may require manual handling.
                </Text>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: portalReviewed }}
                  onPress={() => setPortalReviewed((value) => !value)} style={styles.reviewToggle}>
                  <View style={[styles.fieldCheckbox, { borderColor: portalReviewed ? colors.primary : colors.border, backgroundColor: portalReviewed ? colors.primarySoft : colors.background }]}>
                    {portalReviewed ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                  </View>
                  <Text style={[styles.caption, { color: colors.text }]}>I reviewed the listed sources and requirements.</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={!portalReviewed} onPress={continueToPortal}
                  style={[styles.primaryAction, { backgroundColor: colors.primary }, !portalReviewed && styles.disabled]}>
                  <Ionicons name="globe-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryActionText}>Continue in guided browser</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        {selectedDocument ? (
          <View style={[styles.documentConsentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.planHeader}>
              <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
              <View style={styles.messageCopy}>
                <Text style={[styles.requirementLabel, { color: colors.text }]}>{selectedDocument.name}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>Maximum 6 MB · PDF or image</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove selected document" onPress={() => setSelectedDocument(null)}>
                <Ionicons name="close-circle-outline" size={21} color={colors.muted} />
              </Pressable>
            </View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: documentConsent }}
              onPress={() => setDocumentConsent((value) => !value)} style={styles.reviewToggle}>
              <View style={[styles.fieldCheckbox, { borderColor: documentConsent ? colors.primary : colors.border, backgroundColor: documentConsent ? colors.primarySoft : colors.background }]}>
                {documentConsent ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
              </View>
              <Text style={[styles.caption, { color: colors.text }]}>I agree to send this document to Google Gemini through the backend for text extraction.</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={!documentConsent || !consent || extracting || !capabilities?.processing_enabled}
              onPress={() => void extractDocument()} style={[styles.primaryAction, { backgroundColor: colors.primary }, (!documentConsent || extracting || !capabilities?.processing_enabled) && styles.disabled]}>
              {extracting ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="scan-outline" size={17} color="#FFFFFF" />}
              <Text style={styles.primaryActionText}>{extracting ? 'Extracting…' : 'Send for extraction'}</Text>
            </Pressable>
          </View>
        ) : null}

        {notice ? <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: colors.primary }]}>{notice}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
      </ScrollView>

      {consent ? (
        <View style={[styles.consentBar, styles.acceptedConsentBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Text style={[styles.consentText, { color: colors.muted }]}>
            Chat processing consent accepted. Documents require separate confirmation.
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Withdraw chat processing consent"
            onPress={() => setConsent(false)} style={styles.withdrawConsentButton}>
            <Text style={[styles.withdrawConsentText, { color: colors.primary }]}>Withdraw</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.consentBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }}
            onPress={() => setConsent(true)} style={styles.consentToggle}>
            <View style={[styles.fieldCheckbox, { borderColor: colors.border, backgroundColor: colors.background }]} />
            <Text style={[styles.consentText, { color: colors.muted }]}>
              I agree to send my chat messages to the application assistant. Documents require a separate confirmation.
            </Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.composer, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Choose a document to extract"
          disabled={busy || extracting || !consent || !capabilities?.processing_enabled}
          onPress={() => void chooseDocument()} style={[styles.attachButton, { backgroundColor: colors.surface, borderColor: colors.border }, (!consent || !capabilities?.processing_enabled) && styles.disabled]}>
          <Ionicons name="attach-outline" size={20} color={colors.primary} />
        </Pressable>
        <View style={[styles.composerInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            accessibilityLabel="Message the application assistant"
            value={input}
            onChangeText={setInput}
            editable={!busy && !!consent}
            multiline
            maxLength={4000}
            placeholder={consent ? 'Describe the application you need…' : 'Accept the processing notice to begin'}
            placeholderTextColor={colors.muted}
            style={[styles.composerInput, { color: colors.text }]}
          />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Send message"
          disabled={busy || !input.trim() || !consent}
          onPress={() => void sendMessage()} style={[styles.sendButton, { backgroundColor: colors.primary }, (busy || !input.trim() || !consent) && styles.disabled]}>
          {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="arrow-up" size={21} color="#FFFFFF" />}
        </Pressable>
      </View>

      <Modal visible={saveModalVisible} transparent animationType="fade" onRequestClose={() => setSaveModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => !busy && setSaveModalVisible(false)} />
          <View style={[styles.saveModal, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <View style={[styles.modalIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="lock-closed-outline" size={23} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Save encrypted draft</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>The application draft is encrypted in your device’s Private Vault. It will not be uploaded or synced.</Text>
            <TextInput accessibilityLabel="Private vault password" value={webVaultPassword} onChangeText={setWebVaultPassword}
              secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Enter your vault password"
              placeholderTextColor={colors.muted} style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => { setSaveModalVisible(false); setError(''); }}
                style={[styles.secondaryAction, styles.modalCancel, { backgroundColor: colors.surfaceAlt }]}>
                <Text style={[styles.secondaryActionText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy || !webVaultPassword} onPress={() => void saveDraft(webVaultPassword)}
                style={[styles.primaryAction, styles.modalSave, { backgroundColor: colors.primary }, (busy || !webVaultPassword) && styles.disabled]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryActionText}>Encrypt and save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 10, marginTop: 3 },
  saveButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 15, paddingBottom: 18, gap: 12 },
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12, borderRadius: 14 },
  privacyText: { flex: 1, fontSize: 11, lineHeight: 17 },
  capabilityState: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  unavailableCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderWidth: 1, borderRadius: 15 },
  caption: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, maxWidth: '94%' },
  userMessageRow: { alignSelf: 'flex-end' },
  assistantMessageRow: { alignSelf: 'flex-start' },
  messageAvatar: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  messageBubble: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 10, maxWidth: '94%' },
  messageText: { fontSize: 13, lineHeight: 19 },
  thinking: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 5 },
  planCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 12 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#6558F51A', alignItems: 'center', justifyContent: 'center' },
  messageCopy: { flex: 1, minWidth: 0 },
  planTitle: { fontSize: 16, fontWeight: '800' },
  refreshButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  factGrid: { flexDirection: 'row', gap: 8 },
  factCard: { flex: 1, minWidth: 0, borderRadius: 12, padding: 10 },
  factLabel: { fontSize: 9, letterSpacing: 0.7, fontWeight: '800' },
  factValue: { fontSize: 13, fontWeight: '700', marginTop: 5 },
  sourceLink: { fontSize: 11, fontWeight: '700', marginTop: 7 },
  planSection: { gap: 8, marginTop: 3 },
  requirementCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 5 },
  requirementHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  requirementLabel: { flex: 1, fontSize: 12, fontWeight: '700' },
  fieldCheckbox: { width: 20, height: 20, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  fieldInput: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 13, marginTop: 4 },
  secondaryAction: { minHeight: 42, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  secondaryActionText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  extractedRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  extractedCopy: { flex: 1, minWidth: 0 },
  extractedInput: { borderBottomWidth: 1, minHeight: 34, paddingVertical: 4, fontSize: 13 },
  sourceRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceTitle: { fontSize: 12, fontWeight: '700' },
  portalNotice: { padding: 11, borderRadius: 12, gap: 9 },
  reviewToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 4 },
  primaryAction: { minHeight: 44, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 5 },
  primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  documentConsentCard: { marginHorizontal: 14, borderWidth: 1, borderRadius: 16, padding: 12, gap: 9 },
  notice: { fontSize: 12, lineHeight: 18, paddingHorizontal: 2 },
  error: { fontSize: 12, lineHeight: 18 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  attachButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 14 },
  composerInputWrap: { flex: 1, minWidth: 0, maxHeight: 110, borderWidth: 1, borderRadius: 15, paddingHorizontal: 11 },
  composerInput: { minHeight: 42, maxHeight: 100, paddingVertical: 10, fontSize: 13, lineHeight: 18 },
  sendButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  consentBar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, paddingTop: 7, paddingBottom: 7 },
  consentToggle: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  acceptedConsentBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consentText: { flex: 1, fontSize: 10, lineHeight: 15 },
  withdrawConsentButton: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 6 },
  withdrawConsentText: { fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.55)' },
  saveModal: { width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, gap: 11 },
  modalIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 4 },
  modalCancel: { flex: 1 },
  modalSave: { flex: 1, marginTop: 0 },
});
