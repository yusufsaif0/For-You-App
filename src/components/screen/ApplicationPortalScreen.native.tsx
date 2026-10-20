import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import {
  discardApplicationPortalSession,
  getApplicationPortalSession,
  type ApplicationPortalSession,
} from '@/services/application-portal-session';
import { useAppTheme } from '@/state/ThemeProvider';

interface PortalField {
  index: number;
  label: string;
  type: string;
  required: boolean;
  options: string[];
}

type PortalMessage =
  | { type: 'fields'; fields: PortalField[] }
  | { type: 'submitRequested' };

const SAFE_PORTAL_SCRIPT = `
(function() {
  if (window.__dailyLifePortalBridgeInstalled) {
    if (window.__dailyLifeScanFields) window.__dailyLifeScanFields();
    return true;
  }
  window.__dailyLifePortalBridgeInstalled = true;
  window.__dailyLifeSubmitApproved = false;
  var send = function(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  };
  var requestSubmit = function(form, submitter) {
    window.__dailyLifePendingForm = form;
    window.__dailyLifePendingSubmitter = submitter || null;
    send({ type: 'submitRequested' });
  };
  window.__dailyLifeNativeSubmit = HTMLFormElement.prototype.submit;
  window.__dailyLifeNativeRequestSubmit = HTMLFormElement.prototype.requestSubmit;
  HTMLFormElement.prototype.submit = function() {
    if (window.__dailyLifeSubmitApproved) {
      window.__dailyLifeSubmitApproved = false;
      window.__dailyLifeNativeSubmit.call(this);
      return;
    }
    requestSubmit(this, null);
  };
  if (window.__dailyLifeNativeRequestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function(submitter) {
      if (window.__dailyLifeSubmitApproved) {
        window.__dailyLifeNativeRequestSubmit.call(this, submitter);
        setTimeout(function() { window.__dailyLifeSubmitApproved = false; }, 0);
        return;
      }
      requestSubmit(this, submitter);
    };
  }
  var blockedLabel = /password|passcode|one.?time|otp|captcha|verification code|security code|cvv|cvc|card|credit|debit|payment|secret/i;
  var allowedTypes = ['text', 'email', 'tel', 'url', 'number', 'date', 'month', 'search', ''];
  var scan = function() {
    var elements = Array.prototype.slice.call(document.querySelectorAll('input, textarea, select'));
    var fields = [];
    elements.forEach(function(element) {
      if (element.disabled || element.readOnly || !element.getClientRects().length) return;
      var tag = element.tagName.toLowerCase();
      var type = tag === 'input' ? (element.type || 'text').toLowerCase() : tag;
      if (tag === 'input' && allowedTypes.indexOf(type) === -1) return;
      var labels = element.labels ? Array.prototype.map.call(element.labels, function(label) {
        return label.innerText || label.textContent || '';
      }).join(' ') : '';
      var label = (labels || element.getAttribute('aria-label') || element.getAttribute('placeholder') ||
        element.getAttribute('name') || element.id || 'Form field').replace(/\\s+/g, ' ').trim().slice(0, 160);
      var identifier = [label, element.getAttribute('name') || '', element.id || ''].join(' ');
      if (blockedLabel.test(identifier)) return;
      var index = fields.length;
      element.setAttribute('data-dailylife-field-index', String(index));
      var options = [];
      if (tag === 'select') {
        options = Array.prototype.slice.call(element.options, 0, 30).map(function(option) {
          return (option.textContent || option.value || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
        }).filter(Boolean);
      }
      fields.push({ index: index, label: label, type: type, required: !!element.required, options: options });
    });
    send({ type: 'fields', fields: fields.slice(0, 80) });
  };
  window.__dailyLifeScanFields = scan;
  document.addEventListener('submit', function(event) {
    if (window.__dailyLifeSubmitApproved) {
      window.__dailyLifeSubmitApproved = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__dailyLifePendingForm = event.target;
    window.__dailyLifePendingSubmitter = event.submitter || null;
    send({ type: 'submitRequested' });
  }, true);
  document.addEventListener('click', function(event) {
    var button = event.target && event.target.closest ? event.target.closest('button[type=submit], button:not([type]), input[type=submit]') : null;
    if (!button || !button.form || window.__dailyLifeSubmitApproved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.__dailyLifePendingForm = button.form;
    window.__dailyLifePendingSubmitter = button;
    send({ type: 'submitRequested' });
  }, true);
  scan();
  var timer;
  new MutationObserver(function() {
    clearTimeout(timer);
    timer = setTimeout(scan, 350);
  }).observe(document.documentElement, { subtree: true, childList: true });
  true;
})();
true;
`;

function parsePortalMessage(raw: string): PortalMessage | null {
  if (raw.length > 30_000) return null;
  try {
    const message: unknown = JSON.parse(raw);
    if (typeof message !== 'object' || message === null || !('type' in message)) return null;
    if (message.type === 'submitRequested') return { type: 'submitRequested' };
    if (message.type !== 'fields' || !('fields' in message) || !Array.isArray(message.fields)) return null;
    const fields = message.fields.slice(0, 80).flatMap((field: unknown, index): PortalField[] => {
      if (typeof field !== 'object' || field === null) return [];
      if (
        !('label' in field) || typeof field.label !== 'string' ||
        !('type' in field) || typeof field.type !== 'string' ||
        !('required' in field) || typeof field.required !== 'boolean'
      ) return [];
      const options = 'options' in field && Array.isArray(field.options)
        ? field.options.filter((option): option is string => typeof option === 'string').slice(0, 30)
        : [];
      return [{
        index,
        label: field.label.slice(0, 160),
        type: field.type.slice(0, 24),
        required: field.required,
        options,
      }];
    });
    return { type: 'fields', fields };
  } catch {
    return null;
  }
}

function injectFillScript(values: Record<number, string>): string {
  const serialized = JSON.stringify(values);
  return `((values) => {
    Object.entries(values).forEach(([index, value]) => {
      const element = document.querySelector('[data-dailylife-field-index="' + index + '"]');
      if (!element || element.disabled || element.readOnly) return;
      if (element.tagName === 'SELECT') {
        const option = Array.from(element.options).find((item) => item.value === value || item.textContent.trim() === value);
        if (!option) return;
        element.value = option.value;
      } else {
        const prototype = Object.getPrototypeOf(element);
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(element, value);
        else element.value = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
    true;
  })(${serialized}); true;`;
}

function submitFormScript(): string {
  return `(() => {
    const form = window.__dailyLifePendingForm;
    const submitter = window.__dailyLifePendingSubmitter;
    if (!form) return false;
    window.__dailyLifeSubmitApproved = true;
    window.__dailyLifePendingForm = null;
    window.__dailyLifePendingSubmitter = null;
    if (submitter && submitter.form === form && typeof submitter.click === 'function') {
      submitter.click();
      setTimeout(() => { window.__dailyLifeSubmitApproved = false; }, 2000);
    } else if (window.__dailyLifeNativeRequestSubmit) {
      window.__dailyLifeNativeRequestSubmit.call(form);
      setTimeout(() => { window.__dailyLifeSubmitApproved = false; }, 0);
    } else {
      window.__dailyLifeSubmitApproved = false;
      window.__dailyLifeNativeSubmit.call(form);
    }
    true;
  })(); true;`;
}

export default function ApplicationPortalScreen() {
  const { colors } = useAppTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [session] = useState<ApplicationPortalSession | null>(
    () => getApplicationPortalSession(sessionId ?? ''),
  );
  const webView = useRef<WebView>(null);
  const baseHost = useMemo(() => {
    try {
      return session ? new URL(session.url).host : '';
    } catch {
      return '';
    }
  }, [session]);
  const [currentUrl, setCurrentUrl] = useState(session?.url ?? '');
  const [fields, setFields] = useState<PortalField[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [fillConsent, setFillConsent] = useState(false);
  const [submissionRequested, setSubmissionRequested] = useState(false);
  const [activeField, setActiveField] = useState<PortalField | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => () => {
    if (sessionId) discardApplicationPortalSession(sessionId);
  }, [sessionId]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parsePortalMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === 'submitRequested') {
      setSubmissionRequested(true);
      return;
    }
    setFields(message.fields);
    setValues((current) => Object.fromEntries(message.fields
      .filter((field) => current[field.index])
      .map((field) => [field.index, current[field.index]])));
    setSubmissionRequested(false);
  }, []);

  const onNavigationStateChange = useCallback((navigation: WebViewNavigation) => {
    setCurrentUrl(navigation.url);
    setSubmissionRequested(false);
  }, []);

  const currentHost = useMemo(() => {
    try {
      return new URL(currentUrl).host;
    } catch {
      return '';
    }
  }, [currentUrl]);
  const trustedHost = currentHost === baseHost;

  const fillPortalFields = () => {
    if (!fillConsent || !trustedHost || !fields.length) return;
    const selected = Object.fromEntries(Object.entries(values)
      .filter(([index, value]) => fields.some((field) => field.index === Number(index)) && value.trim())
      .map(([index, value]) => [index, value.slice(0, 2000)]));
    if (!Object.keys(selected).length) {
      setError('Choose or enter at least one reviewed value before filling the portal.');
      return;
    }
    webView.current?.injectJavaScript(injectFillScript(selected));
    setError('');
  };

  const confirmSubmission = () => {
    webView.current?.injectJavaScript(submitFormScript());
    setSubmissionRequested(false);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/applications');
  };

  if (!session) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Text style={[styles.heading, { color: colors.text }]}>Portal session expired</Text>
          <Text style={[styles.copy, { color: colors.muted }]}>Return to the assistant and open the reviewed official portal again.</Text>
          <Pressable accessibilityRole="button" onPress={goBack} style={[styles.action, { backgroundColor: colors.primary }]}>
            <Text style={styles.actionText}>Back to assistant</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaContextView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to application assistant" onPress={goBack}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Portal assistant</Text>
          <Text numberOfLines={1} style={[styles.subtitle, { color: colors.muted }]}>{currentHost || baseHost}</Text>
        </View>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
      </View>

      <View style={[styles.notice, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="shield-checkmark-outline" size={19} color={colors.primary} />
        <Text style={[styles.noticeText, { color: colors.text }]}>
          Password, OTP, CAPTCHA, file-upload, and payment-card fields are never auto-filled. Review the domain and every value. Standard form submits require confirmation; custom scripted flows may behave differently.
        </Text>
      </View>

      {!trustedHost ? (
        <View style={[styles.warning, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.copy, { color: colors.text }]}>
            This page is on a different host than the verified portal. For safety, automatic filling is disabled here. Login and continue manually; filling is available only after you return to {baseHost}.
          </Text>
        </View>
      ) : null}

      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}

      <WebView
        ref={webView}
        source={{ uri: session.url }}
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('https://')}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={SAFE_PORTAL_SCRIPT}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => {
          setLoading(false);
          webView.current?.injectJavaScript(SAFE_PORTAL_SCRIPT);
        }}
        onError={(event) => {
          setLoading(false);
          setError(`Could not load the portal: ${event.nativeEvent.description}`);
        }}
        injectedJavaScript={SAFE_PORTAL_SCRIPT}
        javaScriptEnabled
        domStorageEnabled
        incognito
        cacheEnabled={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false}
        mixedContentMode="never"
        style={styles.webView}
      />

      <View style={[styles.tools, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
          {fields.length ? (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Review detected fields ({fields.length})</Text>
              <Text style={[styles.copy, { color: colors.muted }]}>
                Detection is best-effort. Confirm each portal field and choose which value to place in it.
              </Text>
              {fields.map((field) => (
                <View key={`${field.index}-${field.label}`} style={styles.field}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{field.label}{field.required ? ' · Required' : ''}</Text>
                  <TextInput accessibilityLabel={`Value for portal field ${field.label}`}
                    value={values[field.index] ?? ''} onChangeText={(value) =>
                      setValues((current) => ({ ...current, [field.index]: value.slice(0, 2000) }))}
                    placeholder={field.options.length ? `Select or enter: ${field.options.join(', ')}` : `Enter ${field.label}`}
                    placeholderTextColor={colors.muted}
                    style={[styles.fieldInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]} />
                  {session.confirmedFields && Object.keys(session.confirmedFields).length ? (
                    <Pressable accessibilityRole="button" onPress={() => setActiveField(field)}>
                      <Text style={[styles.pickValue, { color: colors.primary }]}>Choose a reviewed assistant value</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: fillConsent }}
                onPress={() => setFillConsent((current) => !current)} style={styles.checkboxRow}>
                <Ionicons name={fillConsent ? 'checkbox' : 'square-outline'} size={20} color={fillConsent ? colors.primary : colors.muted} />
                <Text style={[styles.copy, { color: colors.text }]}>
                  I confirm this is the intended portal host and agree to place the values I selected into its form.
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={!fillConsent || !trustedHost}
                onPress={fillPortalFields} style={[styles.action, { backgroundColor: colors.primary }, (!fillConsent || !trustedHost) && styles.disabled]}>
                <Ionicons name="create-outline" size={17} color="#FFFFFF" />
                <Text style={styles.actionText}>Fill selected values</Text>
              </Pressable>
            </>
          ) : (
            <Text style={[styles.copy, { color: colors.muted }]}>
              No eligible form fields detected yet. You can still complete the portal manually. Some websites block form detection.
            </Text>
          )}
          {submissionRequested ? (
            <View style={[styles.submitCard, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>The page requested form submission</Text>
              <Text style={[styles.copy, { color: colors.text }]}>
                This action may submit an application or a login/next step. Confirm only after reviewing the page, every entry, and any declarations. Payment and verification remain manual.
              </Text>
              <Pressable accessibilityRole="button" onPress={confirmSubmission}
                style={[styles.action, { backgroundColor: colors.primary }]}>
                <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
                <Text style={styles.actionText}>Confirm and submit this page</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setSubmissionRequested(false)}
                style={[styles.cancel, { borderColor: colors.border }]}>
                <Text style={[styles.copy, { color: colors.text }]}>Cancel submission</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <Modal visible={!!activeField} transparent animationType="fade" onRequestClose={() => setActiveField(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveField(null)} />
          <View style={[styles.modal, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Choose a reviewed value</Text>
            <Text style={[styles.copy, { color: colors.muted }]}>
              Values are stored only in this screen’s memory and are sent to the current portal only when you fill the form.
            </Text>
            <ScrollView style={styles.choices}>
              {Object.entries(session.confirmedFields).map(([label, value]) => (
                <Pressable key={label} accessibilityRole="button"
                  onPress={() => {
                    if (activeField) setValues((current) => ({ ...current, [activeField.index]: value }));
                    setActiveField(null);
                  }} style={[styles.choice, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
                  <Text numberOfLines={2} style={[styles.copy, { color: colors.muted }]}>{value}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setActiveField(null)}
              style={[styles.cancel, { borderColor: colors.border }]}>
              <Text style={[styles.copy, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaContextView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 11, marginTop: 2 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 16 },
  warning: { padding: 9 },
  copy: { fontSize: 12, lineHeight: 17 },
  error: { paddingHorizontal: 12, paddingVertical: 5, fontSize: 12 },
  webView: { flex: 1, minHeight: 180 },
  tools: { maxHeight: 310, minHeight: 100, borderTopWidth: StyleSheet.hairlineWidth },
  formScroll: { padding: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  field: { paddingVertical: 8, gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  fieldInput: { minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  pickValue: { fontSize: 11, fontWeight: '700', paddingVertical: 3 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 8 },
  action: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 11, paddingHorizontal: 12, marginTop: 6 },
  actionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  submitCard: { padding: 11, borderRadius: 12, marginTop: 12, gap: 7 },
  cancel: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginTop: 6 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 19, fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0008' },
  modal: { maxHeight: '85%', padding: 16, borderRadius: 16, gap: 8 },
  choices: { maxHeight: 360 },
  choice: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
});
