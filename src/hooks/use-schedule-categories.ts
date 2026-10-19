import { useCallback, useState } from 'react';
import { createScheduleCategory, getScheduleCategories } from '@/services/api/schedules';
import { defaultScheduleCategories, type Schedule } from '@/types/schedule';
import { mergeCategoryNames, normalizeCategoryName } from '@/utils/scheduleCategories';

export function useScheduleCategories(schedules: Schedule[]) {
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const names = await getScheduleCategories();
      // A delayed refresh must keep categories created while it was loading.
      setSaved((current) => mergeCategoryNames(current, names));
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to load saved categories.');
    }
  }, []);
  const create = useCallback(async (name: string) => {
    const savedName = await createScheduleCategory(normalizeCategoryName(name));
    setSaved((current) => mergeCategoryNames(current, [savedName]));
    setError('');
    return savedName;
  }, []);

  return {
    categories: mergeCategoryNames(defaultScheduleCategories, saved, schedules.map((schedule) => schedule.category)),
    error, refresh, create,
  };
}
