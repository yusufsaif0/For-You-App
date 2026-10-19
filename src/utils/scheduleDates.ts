export type ScheduleFilter = 'Today' | 'Week' | 'Month' | 'All';

export function isInSelectedPeriod(startsAt: string, filter: ScheduleFilter, now: Date) {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return false;
  if (filter === 'All') return true;
  if (filter === 'Today') return date.toDateString() === now.toDateString();
  if (filter === 'Week') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return date >= start && date < end;
  }
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

// Preserve the chosen time when changing the date and vice versa.
export function mergeDatePart(current: Date, picked: Date) {
  const next = new Date(current);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

export function mergeTimePart(current: Date, picked: Date) {
  const next = new Date(current);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

export function localDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
