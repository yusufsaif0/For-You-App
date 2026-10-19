import { Ionicons } from '@expo/vector-icons';
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/state/ThemeProvider';
import { useToolkitMenu } from '@/components/Layout/ToolkitSidebar';

function TabButton({ isFocused, children, icon, ...props }: TabTriggerSlotProps & {
  icon: 'home-outline' | 'camera-outline' | 'calendar-outline' | 'chatbubble-ellipses-outline';
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }}
      aria-selected={!!isFocused}
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {icon === 'camera-outline' ? (
        <View style={[styles.cameraIcon, { backgroundColor: isFocused ? colors.primary : colors.primarySoft }]}>
          <Ionicons name={icon} size={21} color={isFocused ? '#FFFFFF' : colors.primary} />
        </View>
      ) : <Ionicons name={icon} size={24} color={isFocused ? colors.primary : colors.muted} />}
      <Text style={[styles.label, { color: colors.muted }, isFocused && { color: colors.primary }]}>{children}</Text>
    </Pressable>
  );
}

export default function PlannerTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { openMenu, isOpen, isDesktop } = useToolkitMenu();
  return (
    <Tabs style={[styles.container, { backgroundColor: colors.background }]} options={{ backBehavior: 'initialRoute' }}>
      <TabSlot style={styles.content} />
      <TabList style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TabTrigger name="home" href="/tabs" asChild>
          <TabButton icon="home-outline">Home</TabButton>
        </TabTrigger>
        <TabTrigger name="messages" href="/tabs/messages" asChild>
          <TabButton icon="chatbubble-ellipses-outline">Messages</TabButton>
        </TabTrigger>
        <TabTrigger name="camera" href="/tabs/camera" asChild>
          <TabButton icon="camera-outline">Camera</TabButton>
        </TabTrigger>
        <TabTrigger name="schedule" href="/tabs/schedule" asChild>
          <TabButton icon="calendar-outline">Schedule</TabButton>
        </TabTrigger>
        {!isDesktop ? <Pressable accessibilityRole="button" accessibilityLabel="Open menu" accessibilityState={{ expanded: isOpen }} aria-expanded={isOpen}
          onPress={openMenu} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Ionicons name="menu" size={25} color={isOpen ? colors.primary : colors.muted} />
          <Text style={[styles.label, { color: isOpen ? colors.primary : colors.muted }]}>Menu</Text>
        </Pressable> : null}
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F8FD' },
  content: { flex: 1 },
  bar: { flexDirection: 'row', paddingTop: 8, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  cameraIcon: { width: 33, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#64748B', fontSize: 12, fontWeight: '500' },
  selected: { color: '#1769E0', fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
