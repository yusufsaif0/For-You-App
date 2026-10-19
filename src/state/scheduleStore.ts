import type { Schedule, ScheduleCreateInput, ScheduleUpdateInput } from '../types/schedule';

export interface ScheduleApi {
  getSchedules(): Promise<Schedule[]>;
  createSchedule(input: ScheduleCreateInput): Promise<Schedule>;
  updateSchedule(id: string, input: ScheduleUpdateInput): Promise<Schedule>;
  deleteSchedule(id: string): Promise<void>;
}

interface ScheduleState {
  schedules: Schedule[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string;
  busyIds: string[];
}

const sortSchedules = (items: Schedule[]) => [...items].sort(
  (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
);

export class ScheduleStore {
  private state: ScheduleState = { schedules: [], isLoading: true, isRefreshing: false, error: '', busyIds: [] };
  private serverState = this.state;
  private listeners = new Set<() => void>();
  private revision = 0;
  private changedAt = new Map<string, number>();
  private hasLoaded = false;
  private refreshPromise: Promise<void> | null = null;
  private api: ScheduleApi;

  constructor(api: ScheduleApi) { this.api = api; }

  getSnapshot = () => this.state;
  // Hydration must use the same initial data even if a request has already finished.
  getServerSnapshot = () => this.serverState;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private setState(patch: Partial<ScheduleState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  refresh = (): Promise<void> => {
    if (this.refreshPromise) return this.refreshPromise;
    const revision = this.revision;
    this.setState({ isLoading: !this.hasLoaded, isRefreshing: this.hasLoaded, error: '' });
    this.refreshPromise = (async () => {
      try {
        const schedules = await this.api.getSchedules();
        // Preserve changes made after this read began, while still loading other records.
        const changedIds = new Set([...this.changedAt].filter(([, version]) => version > revision).map(([id]) => id));
        this.setState({ schedules: sortSchedules([
          ...schedules.filter((schedule) => !changedIds.has(schedule.id)),
          ...this.state.schedules.filter((schedule) => changedIds.has(schedule.id)),
        ]), error: '' });
        this.hasLoaded = true;
      } catch (error) {
        if (revision === this.revision) {
          this.setState({ error: error instanceof Error ? error.message : 'Unable to load schedules. Please try again.' });
        }
      } finally {
        this.setState({ isLoading: false, isRefreshing: false });
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  };

  private async mutate<T>(id: string, operation: () => Promise<T>, commit: (result: T) => void) {
    if (this.state.busyIds.includes(id)) throw new Error('Please wait for the current change to finish.');
    this.setState({ busyIds: [...this.state.busyIds, id] });
    try {
      const result = await operation();
      this.revision++;
      commit(result);
      return result;
    } finally {
      this.setState({ busyIds: this.state.busyIds.filter((busyId) => busyId !== id) });
    }
  }

  create = (input: ScheduleCreateInput) => this.mutate('create', () => this.api.createSchedule(input), (schedule) => {
    this.changedAt.set(schedule.id, this.revision);
    this.setState({ schedules: sortSchedules([...this.state.schedules, schedule]) });
  });

  update = (id: string, input: ScheduleUpdateInput) => this.mutate(id, () => this.api.updateSchedule(id, input), (schedule) => {
    this.changedAt.set(id, this.revision);
    this.setState({ schedules: sortSchedules(this.state.schedules.map((item) => item.id === id ? schedule : item)) });
  });

  remove = (id: string) => this.mutate(id, () => this.api.deleteSchedule(id), () => {
    this.changedAt.set(id, this.revision);
    this.setState({ schedules: this.state.schedules.filter((item) => item.id !== id) });
  });
}
