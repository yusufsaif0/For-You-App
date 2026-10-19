import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function useNow() {
  // Static web exports must not bake the build machine's date or timezone into hydration.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = setInterval(update, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update();
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);
  return now;
}
