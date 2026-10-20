import { Platform } from 'react-native';
import {
  isVaultInitialized, saveVaultRecords, unlockNativeVault, unlockWebVault,
  type VaultRecord, type VaultUnlockResult,
} from '@/services/vault';
import type { ApplicationMessage, ApplicationPlan } from '@/services/api/applications';

export interface EncryptedApplicationDraft {
  id: string;
  title: string;
  messages: ApplicationMessage[];
  plan: ApplicationPlan;
  confirmedFields: Record<string, string>;
  savedAt: string;
}

let pendingDraft: EncryptedApplicationDraft | null = null;

export function stageApplicationDraft(value: string): void {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' || parsed === null ||
    !('id' in parsed) || typeof parsed.id !== 'string' ||
    !('title' in parsed) || typeof parsed.title !== 'string' ||
    !('messages' in parsed) || !Array.isArray(parsed.messages) ||
    !('plan' in parsed) || typeof parsed.plan !== 'object' || parsed.plan === null ||
    !('confirmedFields' in parsed) || typeof parsed.confirmedFields !== 'object' || parsed.confirmedFields === null ||
    !('savedAt' in parsed) || typeof parsed.savedAt !== 'string'
  ) {
    throw new Error('This encrypted application draft has an invalid format.');
  }
  pendingDraft = parsed as EncryptedApplicationDraft;
}

export function consumeStagedApplicationDraft(): EncryptedApplicationDraft | null {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}

export function getStagedApplicationDraft(): EncryptedApplicationDraft | null {
  return pendingDraft;
}

export async function saveEncryptedApplicationDraft(
  draft: EncryptedApplicationDraft,
  webVaultPassword?: string,
): Promise<void> {
  if (!await isVaultInitialized()) {
    throw new Error('Create your private vault before saving an encrypted application draft.');
  }
  if (Platform.OS === 'web' && !webVaultPassword) {
    throw new Error('Enter your vault password to encrypt this draft.');
  }

  let unlocked: VaultUnlockResult;
  if (Platform.OS === 'web') {
    if (!webVaultPassword) throw new Error('Enter your vault password to encrypt this draft.');
    unlocked = await unlockWebVault(webVaultPassword, false);
  } else {
    unlocked = await unlockNativeVault();
  }
  const id = `application-${draft.id}`;
  const applicationData = JSON.stringify(draft);
  if (applicationData.length > 100_000) {
    throw new Error('This draft is too large to store in the private vault. Remove some chat messages and try again.');
  }
  const record: VaultRecord = {
    id,
    type: 'application',
    title: draft.title,
    notes: `Application draft · saved ${new Date(draft.savedAt).toLocaleDateString()}`,
    applicationData,
    createdAt: draft.savedAt,
    updatedAt: draft.savedAt,
  };
  await saveVaultRecords([...unlocked.records.filter((item) => item.id !== id), record], unlocked.key);
}
