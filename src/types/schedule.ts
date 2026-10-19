export type ScheduleCategory = string;

export interface ScheduleCreateInput {
  title: string;
  category: ScheduleCategory;
  starts_at: string;
  reminder_at?: string | null;
  icon?: string;
  color?: string;
  notes?: string;
}

export interface Schedule extends ScheduleCreateInput {
  id: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
}

export type ScheduleUpdateInput = Partial<Omit<ScheduleCreateInput, 'notes'> & {
  notes: string | null;
  reminder_at: string | null;
  completed: boolean;
}>;

export interface ScheduleListItem {
  id: string;
  title: string;
  notes?: string;
  time: string;
  icon: string;
  iconColor: string;
  iconBackground: string;
}

const categoryStyles: Record<ScheduleCategory, Omit<ScheduleListItem, 'id' | 'title' | 'notes' | 'time'>> = {
  Workout: { icon: 'barbell-outline', iconColor: '#176B38', iconBackground: '#B9F0C8' },
  Work: { icon: 'briefcase-outline', iconColor: '#805500', iconBackground: '#FFD77A' },
  Food: { icon: 'restaurant-outline', iconColor: '#FFFFFF', iconBackground: '#F36B62' },
  Study: { icon: 'book-outline', iconColor: '#FFFFFF', iconBackground: '#3488ED' },
  Social: { icon: 'call-outline', iconColor: '#FFFFFF', iconBackground: '#3D82E8' },
  Sleep: { icon: 'moon-outline', iconColor: '#FFFFFF', iconBackground: '#5942B7' },
};

export function toScheduleListItem(schedule: Schedule): ScheduleListItem {
  const date = new Date(schedule.starts_at);
  const fallback = getScheduleCategoryStyle(schedule.category);

  return {
    id: schedule.id,
    title: schedule.title,
    notes: schedule.notes,
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    icon: schedule.icon ?? fallback.icon,
    iconColor: fallback.iconColor,
    iconBackground: schedule.color ?? fallback.iconBackground,
  };
}

export const defaultScheduleCategories = Object.keys(categoryStyles);

export function getScheduleCategoryStyle(category: string) {
  return Object.hasOwn(categoryStyles, category) ? categoryStyles[category] : {
    icon: 'pricetag-outline', iconColor: '#244878', iconBackground: '#DDE8FF',
  };
}
