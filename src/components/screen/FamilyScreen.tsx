import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createFamilyTask, createFamilyWish, contributeToFamilyWish, deleteFamilyDocument,
  deleteFamilyTask, deleteFamilyWish, getFamilyDocuments, getFamilyDocumentContent,
  getFamilyDocumentRequests, getFamilyOverview, getFamilyTasks, getFamilyWishes,
  getOwnFamilyPublicKey, inviteFamilyMember, registerFamilyPublicKey,
  removeFamilyMember, requestFamilyDocumentAccess, respondToDocumentRequest,
  respondToFamilyInvitation, updateFamilyTask, updateFamilyWish,
  type FamilyDocument, type FamilyDocumentRequest, type FamilyMember, type FamilyOverview,
  type FamilyTask, type FamilyWish,
} from '@/services/api/family';
import {
  activateFamilyRecoveryKey, createFamilyRecoveryKey, getLocalFamilyPublicKey,
} from '@/services/family-encryption';
import { openSharedFamilyDocument, approveFamilyDocumentRequest } from '@/services/family-documents';
import { syncReminderNotifications } from '@/services/notifications/reminders';
import { useAuth } from '@/state/AuthProvider';
import { useAppTheme } from '@/state/ThemeProvider';
import { getWishProgress, localDateKey } from '@/utils/wishSavings';

type KeyStatus = 'loading' | 'ready' | 'create' | 'restore' | 'error';

function displayDate(value: string): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function localMorning(date: string, hour = 9): string {
  const local = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  if (!Number.isFinite(local.getTime())) throw new Error('Enter a valid date in YYYY-MM-DD format.');
  return local.toISOString();
}

function formDateIsValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localDateKey(new Date(`${value}T00:00:00`)) === value;
}

function sharedWishProgress(wish: FamilyWish) {
  return getWishProgress({
    id: wish.id,
    title: wish.title,
    targetAmount: wish.target_amount,
    targetDate: wish.target_date,
    createdDate: localDateKey(new Date(wish.created_at)),
    contributions: wish.contributions.map((item) => ({
      date: localDateKey(new Date(item.created_at)),
      amount: item.amount,
    })),
  });
}

export default function FamilyScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const uid = user?.uid ?? '';
  const [overview, setOverview] = useState<FamilyOverview>({ members: [], requests: [], public_keys: {} });
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [wishes, setWishes] = useState<FamilyWish[]>([]);
  const [documents, setDocuments] = useState<FamilyDocument[]>([]);
  const [documentRequests, setDocumentRequests] = useState<{ incoming: FamilyDocumentRequest[]; outgoing: FamilyDocumentRequest[] }>({ incoming: [], outgoing: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading');
  const [pendingRecoveryKey, setPendingRecoveryKey] = useState('');
  const [recoveryConfirmation, setRecoveryConfirmation] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskNotes, setTaskNotes] = useState('');
  const [taskDate, setTaskDate] = useState(() => localDateKey(new Date()));
  const [taskReminderDate, setTaskReminderDate] = useState(() => localDateKey(new Date()));
  const [taskAssignee, setTaskAssignee] = useState('');
  const [wishTitle, setWishTitle] = useState('');
  const [wishAmount, setWishAmount] = useState('');
  const [wishDate, setWishDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 3);
    return localDateKey(date);
  });
  const [editingWish, setEditingWish] = useState<FamilyWish | null>(null);
  const [wishMembers, setWishMembers] = useState<string[]>([]);
  const [contributionAmounts, setContributionAmounts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setError('');
    setKeyError('');
    try {
      const [family, nextTasks, nextWishes, nextDocuments, nextRequests, ownKey] = await Promise.all([
        getFamilyOverview(),
        getFamilyTasks(),
        getFamilyWishes(),
        getFamilyDocuments(),
        getFamilyDocumentRequests(),
        getOwnFamilyPublicKey(),
      ]);
      setOverview(family);
      setTasks(nextTasks);
      setWishes(nextWishes);
      setDocuments(nextDocuments);
      setDocumentRequests(nextRequests);
      setTaskAssignee((current) => current || uid);
      setWishMembers((current) => current.length ? current : family.members.map((member) => member.uid));
      setContributionAmounts((current) => Object.fromEntries(nextWishes.map((wish) => [
        wish.id, current[wish.id] ?? '',
      ])));

      try {
        const localPublicKey = await getLocalFamilyPublicKey(uid);
        if (localPublicKey && ownKey.public_key && localPublicKey === ownKey.public_key) {
          setKeyStatus('ready');
        } else if (localPublicKey && !ownKey.public_key) {
          await registerFamilyPublicKey(localPublicKey);
          setKeyStatus('ready');
        } else if (ownKey.public_key) {
          setKeyStatus('restore');
        } else {
          setKeyStatus('create');
        }
      } catch (failure) {
        setKeyStatus(ownKey.public_key ? 'restore' : 'error');
        setKeyError(failure instanceof Error ? failure.message : 'Could not unlock your family encryption key.');
      }

      try {
        const assigned = nextTasks.filter((task) => task.assignee_uid === uid);
        const notificationsEnabled = await syncReminderNotifications(`family-tasks-${uid}`, assigned);
        if (!notificationsEnabled && assigned.some((task) => task.reminder_at && !task.completed && Date.parse(task.reminder_at) > Date.now())) {
          setError('Family reminders are saved, but local notifications are unavailable or not allowed on this device.');
        }
      } catch (failure) {
        setError(failure instanceof Error ? `Family reminders could not be synchronized: ${failure.message}` : 'Family reminders could not be synchronized.');
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load family data.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The change could not be saved.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const beginKeySetup = async () => {
    setError('');
    try {
      const created = await createFamilyRecoveryKey();
      setPendingRecoveryKey(created.recoveryKey);
      setRecoveryConfirmation('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create your family recovery key.');
    }
  };

  const confirmKeySetup = async () => {
    if (!pendingRecoveryKey || recoveryConfirmation.trim().toLowerCase() !== pendingRecoveryKey) {
      setError('Enter the recovery key exactly as shown before continuing.');
      return;
    }
    await runAction(async () => {
      const publicKey = await activateFamilyRecoveryKey(uid, pendingRecoveryKey);
      await registerFamilyPublicKey(publicKey);
      setPendingRecoveryKey('');
      setRecoveryConfirmation('');
      setKeyStatus('ready');
    });
  };

  const restoreKey = async () => {
    setError('');
    setBusy(true);
    try {
      const { public_key: expected } = await getOwnFamilyPublicKey();
      if (!expected) throw new Error('This account has no registered family key. Refresh and create one instead.');
      const publicKey = await activateFamilyRecoveryKey(uid, recoveryInput.trim(), expected);
      await registerFamilyPublicKey(publicKey);
      setRecoveryInput('');
      setKeyError('');
      setKeyStatus('ready');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not restore the family encryption key.');
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return setError('Enter the verified email address used by your family member in Daily Life.');
    if (await runAction(() => inviteFamilyMember(email))) setInviteEmail('');
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) return setError('Enter a reminder title.');
    if (!formDateIsValid(taskDate) || !formDateIsValid(taskReminderDate)) return setError('Use valid dates in YYYY-MM-DD format.');
    if (!taskAssignee || (taskAssignee !== uid && !overview.members.some((member) => member.uid === taskAssignee))) {
      return setError('Choose yourself or a connected family member for this reminder.');
    }
    if (await runAction(() => createFamilyTask({
      assignee_uid: taskAssignee,
      title: taskTitle.trim(),
      notes: taskNotes.trim() || undefined,
      due_at: localMorning(taskDate, 9),
      reminder_at: localMorning(taskReminderDate, 8),
    }))) {
      setTaskTitle('');
      setTaskNotes('');
    }
  };

  const saveWish = async () => {
    const amount = Number(wishAmount.replace(/,/g, '').trim());
    if (!wishTitle.trim()) return setError('Enter a wish name.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a target amount greater than zero.');
    if (!formDateIsValid(wishDate) || wishDate < localDateKey(new Date())) return setError('Choose a valid target date that is today or later.');
    const action = editingWish
      ? () => updateFamilyWish(editingWish.id, { title: wishTitle.trim(), target_amount: amount, target_date: wishDate })
      : () => createFamilyWish({
        title: wishTitle.trim(),
        target_amount: amount,
        target_date: wishDate,
        member_uids: wishMembers,
      });
    if (await runAction(action)) {
      setWishTitle('');
      setWishAmount('');
      setEditingWish(null);
    }
  };

  const editWish = (wish: FamilyWish) => {
    setEditingWish(wish);
    setWishTitle(wish.title);
    setWishAmount(String(wish.target_amount));
    setWishDate(wish.target_date);
  };

  const confirmRemoveMember = (member: FamilyMember) => {
    Alert.alert('Remove family connection?', `You and ${member.display_name || member.email} will no longer see each other’s shared items.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void runAction(() => removeFamilyMember(member.uid)) },
    ]);
  };

  const confirmDeleteTask = (task: FamilyTask) => {
    Alert.alert('Delete family reminder?', `“${task.title}” will be removed from Family.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void runAction(() => deleteFamilyTask(task.id)) },
    ]);
  };

  const confirmDeleteWish = (wish: FamilyWish) => {
    Alert.alert('Delete shared wish?', `“${wish.title}” and its contribution history will be removed for all participants.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void runAction(() => deleteFamilyWish(wish.id)) },
    ]);
  };

  const confirmDeleteDocument = (document: FamilyDocument) => {
    Alert.alert('Remove family document?', `“${document.title}” will no longer be available to family members. Copies already downloaded cannot be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void runAction(() => deleteFamilyDocument(document.id)) },
    ]);
  };

  const handleDocumentRequest = async (document: FamilyDocument) => {
    if (document.access_status === 'none') {
      await runAction(() => requestFamilyDocumentAccess(document.id));
      return;
    }
    if (document.access_status !== 'approved') return;
    await runAction(async () => {
      const content = await getFamilyDocumentContent(document.id);
      await openSharedFamilyDocument(
        content.encrypted_content,
        content.wrapped_key,
        uid,
        document.id,
        content.filename,
        content.mime_type,
      );
    });
  };

  const handleDocumentApproval = async (request: FamilyDocumentRequest) => {
    const requesterKey = overview.public_keys[request.requester_uid];
    if (!requesterKey) {
      setError('This member must set up family document encryption before you can approve access.');
      return;
    }
    await runAction(() => approveFamilyDocumentRequest(request, uid, requesterKey));
  };

  const requestLabel = (request: FamilyDocumentRequest) => request.requester_name || request.requester_uid;
  const textInputStyle = [styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }];
  const cardStyle = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/tabs');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
          <View style={[styles.headerIcon, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="people-outline" size={25} color={colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Family</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>Connect people you trust and choose what to share.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh family data" onPress={() => void refresh()} style={styles.refresh}>
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </Pressable>
        </View>

        <View style={[styles.privacyBanner, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={[styles.caption, { color: colors.text }]}>
            Your private vault stays on this device. Family documents are shared as end-to-end encrypted copies only after you publish them and approve each access request. Recipients can download an approved document; removing access cannot erase copies they already saved.
          </Text>
        </View>

        <View style={cardStyle}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Secure document sharing</Text>
          {keyStatus === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
          {keyStatus === 'ready' ? (
            <Text style={[styles.caption, { color: colors.muted }]}>Encryption is set up on this device. Keep your recovery key private and safe.</Text>
          ) : null}
          {keyStatus === 'create' && !pendingRecoveryKey ? (
            <>
              <Text style={[styles.caption, { color: colors.muted }]}>Create an account encryption key before sharing or requesting documents. The backend stores only public keys and encrypted files.</Text>
              <ActionButton title="Create recovery key" onPress={() => void beginKeySetup()} />
            </>
          ) : null}
          {pendingRecoveryKey ? (
            <>
              <Text style={[styles.warningText, { color: colors.red }]}>Save this recovery key somewhere private. Anyone who has it may be able to decrypt documents shared with your account. It cannot be recovered if lost.</Text>
              <Text selectable style={[styles.recoveryKey, { color: colors.text, backgroundColor: colors.surfaceAlt }]}>{pendingRecoveryKey}</Text>
              <TextInput accessibilityLabel="Confirm recovery key" value={recoveryConfirmation} onChangeText={setRecoveryConfirmation}
                autoCapitalize="none" autoCorrect={false} style={textInputStyle} placeholder="Type the recovery key to confirm" placeholderTextColor={colors.muted} />
              <ActionButton title="Save key and enable sharing" onPress={() => void confirmKeySetup()} disabled={busy} />
            </>
          ) : null}
          {keyStatus === 'restore' && !pendingRecoveryKey ? (
            <>
              <Text style={[styles.caption, { color: colors.muted }]}>This account already has an encryption key. Enter the recovery key you saved during setup; a new key would make existing shared documents unreadable.</Text>
              <TextInput accessibilityLabel="Family recovery key" value={recoveryInput} onChangeText={setRecoveryInput}
                autoCapitalize="none" autoCorrect={false} secureTextEntry style={textInputStyle} placeholder="64-character recovery key" placeholderTextColor={colors.muted} />
              <ActionButton title="Restore secure sharing" onPress={() => void restoreKey()} disabled={busy} />
            </>
          ) : null}
          {keyError ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{keyError}</Text> : null}
        </View>

        <View style={cardStyle}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Connect a family member</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>Send an in-app request to an existing account using its verified email address.</Text>
          <View style={styles.inline}>
            <TextInput accessibilityLabel="Family member verified email" value={inviteEmail} onChangeText={setInviteEmail}
              autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={[textInputStyle, styles.flexInput]}
              placeholder="name@example.com" placeholderTextColor={colors.muted} />
            <ActionButton title="Send" onPress={() => void sendInvite()} disabled={busy} />
          </View>
          {overview.requests.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <View style={styles.flexCopy}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{request.email}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>{request.direction === 'incoming' ? 'Wants to connect with you' : 'Request sent'}</Text>
              </View>
              {request.direction === 'incoming' ? (
                <>
                  <SmallButton title="Accept" onPress={() => void runAction(() => respondToFamilyInvitation(request.id, true))} />
                  <SmallButton title="Decline" onPress={() => void runAction(() => respondToFamilyInvitation(request.id, false))} />
                </>
              ) : null}
            </View>
          ))}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Connected members ({overview.members.length})</Text>
          {overview.members.length ? overview.members.map((member) => (
            <View key={member.uid} style={styles.requestRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primarySoft }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>{(member.display_name || member.email).charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.flexCopy}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{member.display_name || member.email}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>{member.email}</Text>
              </View>
              <SmallButton title="Remove" onPress={() => confirmRemoveMember(member)} />
            </View>
          )) : <Text style={[styles.caption, { color: colors.muted }]}>No members connected yet.</Text>}
        </View>

        <View style={cardStyle}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Family reminders</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>Assign a task to yourself or a connected member. Only the assignee and creator can see it; the assignee marks it complete.</Text>
          <TextInput accessibilityLabel="Reminder title" value={taskTitle} onChangeText={setTaskTitle} style={textInputStyle} placeholder="What needs to be done?" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Reminder notes" value={taskNotes} onChangeText={setTaskNotes} style={textInputStyle} placeholder="Notes (optional)" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Reminder due date" value={taskDate} onChangeText={setTaskDate} style={textInputStyle} placeholder="Due date: YYYY-MM-DD" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Reminder notification date" value={taskReminderDate} onChangeText={setTaskReminderDate} style={textInputStyle} placeholder="Notification date: YYYY-MM-DD" placeholderTextColor={colors.muted} />
          <Text style={[styles.caption, { color: colors.muted }]}>Notification is scheduled for 8:00 AM local time on the selected date, on the assignee’s device after they open Family.</Text>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>Assign to</Text>
          <View style={styles.chips}>
            <ChoiceChip title="Me" selected={taskAssignee === uid} onPress={() => setTaskAssignee(uid)} />
            {overview.members.map((member) => <ChoiceChip key={member.uid} title={member.display_name || member.email} selected={taskAssignee === member.uid} onPress={() => setTaskAssignee(member.uid)} />)}
          </View>
          <ActionButton title="Create reminder" onPress={() => void saveTask()} disabled={busy} />
          {tasks.map((task) => {
            const canComplete = task.assignee_uid === uid;
            const assignee = task.assignee_uid === uid ? 'You' : overview.members.find((member) => member.uid === task.assignee_uid)?.display_name || 'Family member';
            return (
              <View key={task.id} style={[styles.itemCard, { borderColor: colors.border }]}>
                <View style={styles.flexCopy}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{task.title}</Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>{assignee} · due {displayDate(task.due_at)}{task.completed ? ' · done' : ''}</Text>
                  {task.notes ? <Text style={[styles.caption, { color: colors.muted }]}>{task.notes}</Text> : null}
                </View>
                {canComplete ? <SmallButton title={task.completed ? 'Undo' : 'Done'} onPress={() => void runAction(() => updateFamilyTask(task.id, !task.completed))} /> : null}
                {task.creator_uid === uid ? <SmallButton title="Delete" onPress={() => confirmDeleteTask(task)} /> : null}
              </View>
            );
          })}
          {!tasks.length ? <Text style={[styles.caption, { color: colors.muted }]}>No family reminders yet.</Text> : null}
        </View>

        <View style={cardStyle}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{editingWish ? 'Edit shared wish' : 'Shared wishes'}</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>Choose who participates. Everyone can add contributions and see contributor names and amounts; only the creator can remove the wish.</Text>
          <TextInput accessibilityLabel="Shared wish name" value={wishTitle} onChangeText={setWishTitle} style={textInputStyle} placeholder="What does the family want to save for?" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Shared wish target amount" value={wishAmount} onChangeText={setWishAmount} keyboardType="decimal-pad" style={textInputStyle} placeholder="Target amount" placeholderTextColor={colors.muted} />
          <TextInput accessibilityLabel="Shared wish target date" value={wishDate} onChangeText={setWishDate} style={textInputStyle} placeholder="Target date: YYYY-MM-DD" placeholderTextColor={colors.muted} />
          {!editingWish ? (
            <>
              <Text style={[styles.fieldLabel, { color: colors.text }]}>Participants</Text>
              <View style={styles.chips}>
                {overview.members.map((member) => (
                  <ChoiceChip key={member.uid} title={member.display_name || member.email} selected={wishMembers.includes(member.uid)}
                    onPress={() => setWishMembers((current) => current.includes(member.uid) ? current.filter((id) => id !== member.uid) : [...current, member.uid])} />
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.inline}>
            <ActionButton title={editingWish ? 'Save changes' : 'Create shared wish'} onPress={() => void saveWish()} disabled={busy} />
            {editingWish ? <SmallButton title="Cancel edit" onPress={() => {
              setEditingWish(null);
              setWishTitle('');
              setWishAmount('');
            }} /> : null}
          </View>
          {wishes.map((wish) => {
            const progress = sharedWishProgress(wish);
            const canContribute = wish.creator_uid === uid || wish.member_uids.includes(uid);
            return (
              <View key={wish.id} style={[styles.itemCard, { borderColor: colors.border }]}>
                <View style={styles.flexCopy}>
                  <Text style={[styles.itemTitle, { color: colors.text }]}>{wish.title}</Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    {progress.totalSaved.toLocaleString()} saved · {progress.remaining.toLocaleString()} remaining · {progress.dueToday.toLocaleString()} due today · target {displayDate(wish.target_date)}
                  </Text>
                  {wish.contributions.map((contribution, index) => (
                    <Text key={`${wish.id}-${index}`} style={[styles.caption, { color: colors.muted }]}>{contribution.contributor_name}: {contribution.amount.toLocaleString()} ({displayDate(contribution.created_at)})</Text>
                  ))}
                  {canContribute ? (
                    <View style={styles.inline}>
                      <TextInput accessibilityLabel={`Contribution to ${wish.title}`} value={contributionAmounts[wish.id] ?? ''}
                        onChangeText={(value) => setContributionAmounts((current) => ({ ...current, [wish.id]: value }))}
                        keyboardType="decimal-pad" style={[textInputStyle, styles.flexInput]} placeholder="Contribution amount" placeholderTextColor={colors.muted} />
                      <SmallButton title="Save" onPress={() => {
                        const amount = Number((contributionAmounts[wish.id] ?? '').replace(/,/g, '').trim());
                        if (!Number.isFinite(amount) || amount <= 0) return setError('Enter a contribution greater than zero.');
                        void runAction(() => contributeToFamilyWish(wish.id, amount)).then((saved) => {
                          if (saved) setContributionAmounts((current) => ({ ...current, [wish.id]: '' }));
                        });
                      }} />
                    </View>
                  ) : null}
                </View>
                {wish.creator_uid === uid ? (
                  <View style={styles.ownerActions}>
                    <SmallButton title="Edit" onPress={() => editWish(wish)} />
                    <SmallButton title="Delete" onPress={() => confirmDeleteWish(wish)} />
                  </View>
                ) : null}
              </View>
            );
          })}
          {!wishes.length ? <Text style={[styles.caption, { color: colors.muted }]}>No shared wishes yet.</Text> : null}
        </View>

        <View style={cardStyle}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Family documents</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>Documents you publish from Private vault appear here. A connected member must request access, and you approve each request individually.</Text>
          {documents.map((document) => (
            <View key={document.id} style={[styles.itemCard, { borderColor: colors.border }]}>
              <View style={styles.flexCopy}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{document.title}</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>{document.category} · {document.owner_name}{document.access_status === 'pending' ? ' · request pending' : ''}</Text>
              </View>
              {document.access_status === 'owner' ? (
                <SmallButton title="Remove" onPress={() => confirmDeleteDocument(document)} />
              ) : document.access_status === 'approved' ? (
                <SmallButton title="Open" onPress={() => void handleDocumentRequest(document)} />
              ) : document.access_status === 'pending' ? (
                <Text style={[styles.caption, { color: colors.muted }]}>Pending</Text>
              ) : (
                <SmallButton title="Request access" onPress={() => void handleDocumentRequest(document)} />
              )}
            </View>
          ))}
          {!documents.length ? <Text style={[styles.caption, { color: colors.muted }]}>No documents have been shared with your family yet.</Text> : null}
          {documentRequests.incoming.map((request) => (
            <View key={request.id} style={[styles.itemCard, { borderColor: colors.border }]}>
              <View style={styles.flexCopy}>
                <Text style={[styles.itemTitle, { color: colors.text }]}>{requestLabel(request)} requests “{request.document_title}”</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>Approving lets this person view and download an encrypted copy.</Text>
              </View>
              <SmallButton title="Approve" onPress={() => void handleDocumentApproval(request)} />
              <SmallButton title="Decline" onPress={() => void runAction(() => respondToDocumentRequest(request.id))} />
            </View>
          ))}
          {documentRequests.outgoing.filter((request) => request.status === 'pending').map((request) => (
            <Text key={request.id} style={[styles.caption, { color: colors.muted }]}>Access request for “{request.document_title}” is pending.</Text>
          ))}
        </View>
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.red }]}>{error}</Text> : null}
        {loading || busy ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}
      </ScrollView>
    </SafeAreaView>
  );

  function ActionButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
    return (
      <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress}
        style={[styles.actionButton, { backgroundColor: colors.primary, opacity: disabled || busy ? 0.6 : 1 }]}>
        <Text style={styles.actionButtonText}>{title}</Text>
      </Pressable>
    );
  }

  function SmallButton({ title, onPress }: { title: string; onPress: () => void }) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.smallButton, { backgroundColor: colors.primarySoft }]}>
        <Text style={[styles.smallButtonText, { color: colors.primary }]}>{title}</Text>
      </Pressable>
    );
  }

  function ChoiceChip({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
        style={[styles.chip, { backgroundColor: selected ? colors.primarySoft : colors.surfaceAlt, borderColor: selected ? colors.primary : colors.border }]}>
        <Text style={[styles.chipText, { color: selected ? colors.primary : colors.text }]}>{title}</Text>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 18, paddingBottom: 44, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  backButton: { width: 40, height: 40, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 25, fontWeight: '700' },
  caption: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  refresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  privacyBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13, borderRadius: 14 },
  card: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  warningText: { fontSize: 13, lineHeight: 19 },
  recoveryKey: { padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 18, fontFamily: 'monospace' },
  input: { minHeight: 45, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flexInput: { flex: 1, minWidth: 0 },
  flexCopy: { flex: 1, minWidth: 0, gap: 2 },
  actionButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  actionButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  smallButton: { minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  smallButtonText: { fontSize: 12, fontWeight: '700' },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#00000018' },
  itemTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '600' },
  itemCard: { borderWidth: 1, borderRadius: 11, padding: 11, marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 8 },
  ownerActions: { gap: 6 },
  error: { fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  spinner: { marginVertical: 10 },
});
