import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ScheduleEditor from '@/components/Layout/ScheduleEditor';
import ScheduleAgendaItem from '@/components/Layout/ScheduleAgendaItem';
import { useNow } from '@/hooks/use-now';
import { useScheduleColors } from '@/components/Layout/schedule-theme';
import { useSchedules } from '@/state/ScheduleProvider';
import { useScheduleCategories } from '@/hooks/use-schedule-categories';
import { categoryKey } from '@/utils/scheduleCategories';
import type { Schedule, ScheduleCreateInput } from '@/types/schedule';
import { isInSelectedPeriod, type ScheduleFilter } from '@/utils/scheduleDates';

const filters: ScheduleFilter[] = ['Today', 'Week', 'Month', 'All'];
const periodLabels: Record<ScheduleFilter, string> = { Today: 'Today', Week: 'This week', Month: 'This month', All: 'All dates' };

export default function ScheduleScreen() {
  const colors = useScheduleColors();
  const { schedules, isLoading, isRefreshing, error, busyIds, refresh, create, update, remove } = useSchedules();
  const { categories, error: categoryError, refresh: refreshCategories, create: createCategory } = useScheduleCategories(schedules);
  const now = useNow();
  const [filter, setFilter] = useState<ScheduleFilter>('Today');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [filterMenu, setFilterMenu] = useState<'category' | 'date'>('category');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState<Schedule | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  useFocusEffect(useCallback(() => { void refresh(); void refreshCategories(); }, [refresh, refreshCategories]));

  const save = async (input: ScheduleCreateInput) => {
    if (editing) await update(editing.id, input);
    else await create(input);
    if (!isInSelectedPeriod(input.starts_at, filter, now ?? new Date())) setFilter('All');
    if (categoryFilter !== null && categoryKey(categoryFilter) !== categoryKey(input.category)) setCategoryFilter(input.category);
    setNotice(editing ? 'Schedule updated.' : 'Schedule added.');
    setActionError('');
  };
  const toggle = async (schedule: Schedule) => {
    setActionError('');
    setNotice('');
    try { await update(schedule.id, { completed: !schedule.completed }); }
    catch (failure) { setActionError(failure instanceof Error ? failure.message : 'Change not saved. Please try again.'); }
  };
  const confirmDelete = async () => {
    if (!deleting || busyIds.includes(deleting.id)) return;
    setDeleteError('');
    try {
      await remove(deleting.id);
      setDeleting(null);
      setNotice('Schedule deleted.');
      setActionError('');
    } catch (failure) { setDeleteError(failure instanceof Error ? failure.message : 'Unable to delete. Please try again.'); }
  };

  const visible = schedules.filter((schedule) => now && isInSelectedPeriod(schedule.starts_at, filter, now));
  const deleteBusy = !!deleting && busyIds.includes(deleting.id);
  const periods = { Today: 'today', Week: 'this week', Month: 'this month', All: 'yet' };

  const openCreate = () => { setEditing(null); setEditorOpen(true); setNotice(''); };
  const displayedSchedules = visible
    .filter((schedule) => categoryFilter === null || categoryKey(schedule.category) === categoryKey(categoryFilter))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const completedCount = displayedSchedules.filter((item) => item.completed).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Schedule</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Add schedule" onPress={openCreate}
            style={({ pressed }) => [styles.add, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
            <Ionicons name="add" size={25} color={colors.onPrimary} />
          </Pressable>
        </View>
        <View style={styles.categoryFilters}>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter by category"
            accessibilityValue={{ text: categoryFilter ?? 'All categories' }} accessibilityState={{ expanded: filterMenuOpen && filterMenu === 'category' }}
            onPress={() => { setFilterMenu('category'); setFilterMenuOpen(true); }}
            style={({ pressed }) => [styles.categoryTrigger, { borderColor: categoryFilter === null ? colors.border : colors.primary,
              backgroundColor: categoryFilter === null ? colors.surface : colors.primarySoft }, pressed && styles.pressed]}>
            <Text numberOfLines={1} style={[styles.categoryTriggerText, { color: categoryFilter === null ? colors.text : colors.primary }]}>{categoryFilter ?? 'All categories'}</Text>
            <Ionicons name="chevron-down" size={15} color={categoryFilter === null ? colors.muted : colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter by date"
            accessibilityValue={{ text: periodLabels[filter] }} accessibilityState={{ expanded: filterMenuOpen && filterMenu === 'date' }}
            onPress={() => { setFilterMenu('date'); setFilterMenuOpen(true); }}
            style={({ pressed }) => [styles.categoryTrigger, styles.dateTrigger, { borderColor: filter === 'All' ? colors.border : colors.primary,
              backgroundColor: filter === 'All' ? colors.surface : colors.primarySoft }, pressed && styles.pressed]}>
            <Text numberOfLines={1} style={[styles.categoryTriggerText, { color: filter === 'All' ? colors.text : colors.primary }]}>{periodLabels[filter]}</Text>
            <Ionicons name="chevron-down" size={15} color={filter === 'All' ? colors.muted : colors.primary} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { void refresh(); void refreshCategories(); }} tintColor={colors.primary} colors={[colors.primary]} />}>
          {isLoading ? <ActivityIndicator accessibilityLabel="Loading schedules" size="large" color={colors.primary} style={styles.loader} /> : null}
          {error ? <View style={[styles.message, { backgroundColor: colors.redSoft }]}>
            <Text accessibilityRole="alert" style={[styles.messageText, { color: colors.red }]}>{error}{schedules.length ? ' Showing your last loaded schedules.' : ''}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.retry}><Text style={[styles.link, { color: colors.red }]}>Retry loading</Text></Pressable>
          </View> : null}
          {categoryError ? <View style={[styles.message, { backgroundColor: colors.redSoft }]}>
            <Text accessibilityRole="alert" style={[styles.messageText, { color: colors.red }]}>Saved categories could not be loaded. {categoryError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refreshCategories()} style={styles.retry}><Text style={[styles.link, { color: colors.red }]}>Retry categories</Text></Pressable>
          </View> : null}
          {actionError ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.red, backgroundColor: colors.redSoft }]}>{actionError} Tap the activity checkbox to try again.</Text> : null}
          {notice ? <View style={[styles.message, styles.notice, { backgroundColor: colors.greenSoft }]}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.green} />
            <Text accessibilityLiveRegion="polite" style={[styles.messageText, { color: colors.green }]}>{notice}</Text>
          </View> : null}
          {!isLoading && displayedSchedules.length ? <View style={styles.progressRow}>
            <Text style={[styles.progressText, { color: colors.muted }]}>{completedCount} of {displayedSchedules.length} completed</Text>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.green, width: `${completedCount / displayedSchedules.length * 100}%` }]} />
            </View>
          </View> : null}
          {!isLoading && !error && displayedSchedules.length === 0 ? <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="checkmark-done-outline" size={30} color={colors.primary} />
              <View style={[styles.emptySpark, { backgroundColor: colors.surface }]}><Ionicons name="sparkles" size={16} color={colors.primary} /></View>
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{categoryFilter !== null ? `No ${categoryFilter} activities` : `Nothing planned ${periods[filter]}`}</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>{categoryFilter !== null ? 'Try another category or plan something new.' : 'Your plans will appear here. Start with your first activity.'}</Text>
            <Pressable accessibilityRole="button" onPress={openCreate}
              style={({ pressed }) => [styles.emptyAction, { backgroundColor: colors.primarySoft }, pressed && styles.pressed]}>
              <Ionicons name="add" size={18} color={colors.primary} /><Text style={[styles.link, { color: colors.primary }]}>Plan an activity</Text>
            </Pressable>
          </View> : null}
          {displayedSchedules.map((schedule) => <ScheduleAgendaItem key={schedule.id} schedule={schedule} showDate={filter !== 'Today'}
            busy={busyIds.includes(schedule.id)} onToggle={() => void toggle(schedule)}
            onEdit={() => { setEditing(schedule); setEditorOpen(true); setNotice(''); }}
            onDelete={() => { setDeleting(schedule); setDeleteError(''); }} />)}
        </ScrollView>
      </View>
      <Modal visible={filterMenuOpen} transparent animationType="fade" onRequestClose={() => setFilterMenuOpen(false)}>
        <View style={styles.categoryOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${filterMenu} filter`} onPress={() => setFilterMenuOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[styles.categoryMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.categoryMenuHeader}>
              <Text accessibilityRole="header" style={[styles.categoryMenuTitle, { color: colors.text }]}>Filter by {filterMenu}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Close ${filterMenu} filter`} onPress={() => setFilterMenuOpen(false)} style={styles.categoryClose}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView style={styles.categoryOptions} accessibilityRole="radiogroup" accessibilityLabel={filterMenu === 'date' ? 'Date filter options' : 'Category filter options'}>
              {filterMenu === 'date' ? filters.map((item) => {
                const active = filter === item;
                return <Pressable key={item} accessibilityRole="radio" accessibilityLabel={periodLabels[item]}
                  accessibilityState={{ checked: active }} aria-checked={active}
                  onPress={() => { setFilter(item); setFilterMenuOpen(false); setNotice(''); }}
                  style={({ pressed }) => [styles.categoryOption, { backgroundColor: active || pressed ? colors.primarySoft : colors.surface }]}>
                  <Text style={[styles.categoryOptionText, { color: active ? colors.primary : colors.text }]}>{periodLabels[item]}</Text>
                  {active ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
                </Pressable>;
              }) : [null, ...categories].map((item) => {
                const active = item === null ? categoryFilter === null : categoryFilter !== null && categoryKey(item) === categoryKey(categoryFilter);
                return <Pressable key={item === null ? 'all-categories' : `category-${categoryKey(item)}`} accessibilityRole="radio"
                  accessibilityLabel={item ?? 'All categories'} accessibilityState={{ checked: active }} aria-checked={active}
                  onPress={() => { setCategoryFilter(item); setFilterMenuOpen(false); setNotice(''); }}
                  style={({ pressed }) => [styles.categoryOption, { backgroundColor: active || pressed ? colors.primarySoft : colors.surface }]}>
                  <Text style={[styles.categoryOptionText, { color: active ? colors.primary : colors.text }]}>{item ?? 'All categories'}</Text>
                  {active ? <Ionicons name="checkmark" size={19} color={colors.primary} /> : null}
                </Pressable>;
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ScheduleEditor visible={editorOpen} appearance="schedule" initialSchedule={editing}
        categories={categories} onCreateCategory={createCategory} initialCategory={categoryFilter ?? undefined}
        onClose={() => setEditorOpen(false)} onSave={save} />
      <Modal visible={!!deleting} transparent animationType="fade" onRequestClose={() => { if (!deleteBusy) setDeleting(null); }}>
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: colors.surface }]} accessibilityViewIsModal>
            <View style={[styles.deleteIcon, { backgroundColor: colors.redSoft }]}><Ionicons name="trash-outline" size={24} color={colors.red} /></View>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>Delete activity?</Text>
            <Text style={[styles.dialogBody, { color: colors.muted }]}>“{deleting?.title}” will be permanently deleted. This cannot be undone.</Text>
            {deleteError ? <Text accessibilityRole="alert" style={[styles.messageText, { color: colors.red }]}>{deleteError}</Text> : null}
            <View style={styles.dialogActions}>
              <Pressable accessibilityRole="button" disabled={deleteBusy} style={styles.retry} onPress={() => setDeleting(null)}>
                <Text style={[styles.link, { color: colors.primary }]}>Keep activity</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={deleteBusy} style={[styles.delete, { backgroundColor: colors.red }, deleteBusy && styles.disabled]} onPress={() => void confirmDelete()}>
                <Text style={[styles.addText, { color: colors.surface }]}>{deleteBusy ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  page: { flex: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 30, fontWeight: '600', letterSpacing: -1 },
  add: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  addText: { fontSize: 14, fontWeight: '600' },
  categoryFilters: { flexDirection: 'row', gap: 10, marginHorizontal: 24, marginBottom: 20, alignItems: 'center' },
  categoryTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, maxWidth: '100%', flexShrink: 1, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 12 },
  dateTrigger: { flexShrink: 0 },
  categoryTriggerText: { flexShrink: 1, fontSize: 13, fontWeight: '500' },
  categoryOverlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.55)' },
  categoryMenu: { width: '100%', maxWidth: 440, maxHeight: '70%', borderRadius: 24, padding: 12, borderWidth: 1 },
  categoryMenuHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, marginBottom: 8, gap: 8 },
  categoryMenuTitle: { flex: 1, fontSize: 17, fontWeight: '600' },
  categoryClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  categoryOptions: { flexGrow: 0 },
  categoryOption: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  categoryOptionText: { flex: 1, fontSize: 14 },
  list: { paddingHorizontal: 24, paddingBottom: 32, flexGrow: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  progressText: { fontSize: 11 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  loader: { marginVertical: 24 },
  message: { padding: 14, borderRadius: 14, marginBottom: 16 },
  messageText: { fontSize: 13, lineHeight: 20, flexShrink: 1 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  link: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28, borderWidth: 1, borderRadius: 22 },
  emptyIcon: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  emptySpark: { position: 'absolute', right: -5, top: -5, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '600', letterSpacing: -0.3, textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 21, textAlign: 'center', maxWidth: 260, marginTop: 8 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, paddingHorizontal: 17, borderRadius: 22, marginTop: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 28, padding: 24, maxWidth: 400, width: '100%' },
  deleteIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  dialogTitle: { fontSize: 23, fontWeight: '600', letterSpacing: -0.5 },
  dialogBody: { fontSize: 14, lineHeight: 22, marginTop: 12, marginBottom: 24 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end' },
  delete: { borderRadius: 22, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});
