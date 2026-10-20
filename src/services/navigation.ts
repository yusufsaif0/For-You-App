import { router } from 'expo-router';

// A refreshed or directly opened URL may have no previous route in the stack.
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/tabs');
}
