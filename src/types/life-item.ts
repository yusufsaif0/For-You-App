export type LifeItemKind = 'meal' | 'weight' | 'task' | 'event';
export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export interface LifeItemInput {
  kind: LifeItemKind;
  title: string;
  occurred_at?: string | null;
  calories?: number | null;
  sugar_g?: number | null;
  fat_g?: number | null;
  meal_type?: MealType | null;
  weight_kg?: number | null;
  due_at?: string | null;
  starts_at?: string | null;
  reminder_at?: string | null;
  notes?: string | null;
  priority?: TaskPriority | null;
  completed?: boolean;
}

export interface LifeItem extends LifeItemInput {
  id: string;
  created_at: string;
  updated_at: string;
  completed: boolean;
}

export type LifeItemUpdate = Partial<Omit<LifeItemInput, 'kind'>>;
