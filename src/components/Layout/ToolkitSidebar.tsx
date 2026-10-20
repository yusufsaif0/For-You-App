import { Ionicons } from '@expo/vector-icons';
import { router, usePathname, type Href } from 'expo-router';
import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/state/AuthProvider';
import { useAppTheme } from '@/state/ThemeProvider';

const toolkit = [
  { title: 'Messages', icon: 'chatbubble-ellipses', color: '#1689D5', route: '/tabs/messages' },
  { title: 'Schedule', icon: 'calendar', color: '#0866FF', route: '/tabs/schedule' },
  { title: 'Camera', icon: 'camera', color: '#C34FA7', route: '/tabs/camera' },
  { title: 'Wishes', icon: 'heart', color: '#DC5688', route: '/tabs/wishes' },
  { title: 'Meals', icon: 'restaurant', color: '#E78024', route: '/meals' },
  { title: 'Office tasks', icon: 'briefcase', color: '#159CA9', route: '/tasks' },
  { title: 'Weight', icon: 'scale', color: '#DC5688', route: '/weight' },
  { title: 'Events', icon: 'calendar-number', color: '#9261DD', route: '/events' },
  { title: 'Daily steps', icon: 'walk', color: '#19A672', route: '/steps' },
  { title: 'Screen time', icon: 'time', color: '#4086E3', route: '/screen-time' },
  { title: 'Weather', icon: 'partly-sunny', color: '#E29A2D', route: '/weather' },
  { title: 'Private vault', icon: 'shield-checkmark', color: '#8260D8', route: '/vault' },
  { title: 'Document tools', icon: 'construct', color: '#159CA9', route: '/document-tools' },
  { title: 'Family', icon: 'people', color: '#D45A8C', route: '/family' },
] as const;

const palettes = {
  light: { background: '#F0F2F5', surface: '#FFFFFF', text: '#050505', muted: '#65676B', hover: '#E4E6E9', border: '#DADDE1', blue: '#0866FF', selected: '#E7F3FF', input: '#E4E6E9' },
  dark: { background: '#18191A', surface: '#242526', text: '#E4E6EB', muted: '#B0B3B8', hover: '#303031', border: '#3A3B3C', blue: '#75B6FF', selected: '#263951', input: '#303031' },
};

interface MenuContextValue {
  isOpen: boolean;
  isDesktop: boolean;
  openMenu: () => void;
  closeMenu: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export function useToolkitMenu() {
  const context = useContext(MenuContext);
  if (!context) throw new Error('useToolkitMenu requires ToolkitLayout');
  return context;
}

function SidebarContent({ onClose, drawer = false }: { onClose: () => void; drawer?: boolean }) {
  const { theme, toggleTheme } = useAppTheme();
  const colors = palettes[theme];
  const { user } = useAuth();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const name = user?.displayName?.trim() || user?.email?.split('@')[0] || 'Your profile';
  const filtered = toolkit.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  const navigate = (href: Href) => { onClose(); router.navigate(href); };

  return <SafeAreaView style={[styles.sidebar, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left']}>
    <View style={styles.menuHeader}>
      <Text accessibilityRole="header" style={[styles.menuTitle, { color: colors.text }]}>Menu</Text>
      {drawer ? <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose}
        style={({ pressed }) => [styles.roundButton, { backgroundColor: colors.hover }, pressed && styles.pressed]}>
        <Ionicons name="close" size={23} color={colors.text} />
      </Pressable> : <View style={[styles.appMark, { backgroundColor: '#0866FF' }]}><Ionicons name="sunny" size={19} color="#FFFFFF" /></View>}
    </View>
    <View style={[styles.search, { backgroundColor: colors.input }]}>
      <Ionicons name="search" size={19} color={colors.muted} />
      <TextInput accessibilityLabel="Search toolkit" placeholder="Search menu" placeholderTextColor={colors.muted}
        nativeID="toolkit-menu-search" inputMode="search" autoComplete="off" importantForAutofill="no" textContentType="none"
        value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" spellCheck={false} returnKeyType="search"
        style={[styles.searchInput, { color: colors.text }]} />
      {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear menu search" onPress={() => setQuery('')} style={styles.clearSearch}>
        <Ionicons name="close-circle" size={18} color={colors.muted} />
      </Pressable> : null}
    </View>
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.menuBody}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open profile for ${name}`} onPress={() => navigate('/account')}
        style={({ pressed }) => [styles.profile, { backgroundColor: pressed ? colors.hover : colors.surface, borderColor: colors.border }]}>
        <View style={styles.avatar}><Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text></View>
        <View style={styles.profileCopy}>
          <Text numberOfLines={1} style={[styles.profileName, { color: colors.text }]}>{name}</Text>
          <Text numberOfLines={1} style={[styles.profileDetail, { color: colors.muted }]}>{user?.email || 'Your account'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Home" accessibilityState={{ selected: pathname === '/tabs' || pathname === '/' }}
        onPress={() => navigate('/tabs')}
        style={({ pressed }) => [styles.navRow, { backgroundColor: pathname === '/tabs' || pathname === '/' ? colors.selected : pressed ? colors.hover : 'transparent' }]}>
        <View style={[styles.navIcon, { backgroundColor: `${colors.blue}18` }]}><Ionicons name="home" size={23} color={colors.blue} /></View>
        <Text style={[styles.navText, { color: pathname === '/tabs' || pathname === '/' ? colors.blue : colors.text }]}>Home</Text>
      </Pressable>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text accessibilityRole="header" style={[styles.sectionLabel, { color: colors.muted }]}>Your toolkit</Text>
      {filtered.map((item) => {
        const active = pathname === item.route;
        return <Pressable key={item.route} accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected: active }}
          onPress={() => navigate(item.route)}
          style={({ pressed }) => [styles.navRow, { backgroundColor: active ? colors.selected : pressed ? colors.hover : 'transparent' }]}>
          <View style={[styles.navIcon, { backgroundColor: `${item.color}18` }]}><Ionicons name={item.icon} size={24} color={theme === 'dark' && item.color === '#0866FF' ? colors.blue : item.color} /></View>
          <Text style={[styles.navText, { color: active ? colors.blue : colors.text }]}>{item.title}</Text>
          {active ? <View style={[styles.activeDot, { backgroundColor: colors.blue }]} /> : null}
        </Pressable>;
      })}
      {filtered.length === 0 ? <Text accessibilityLiveRegion="polite" style={[styles.noResults, { color: colors.muted }]}>No tools found.</Text> : null}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Settings and privacy" accessibilityState={{ expanded: settingsOpen }} aria-expanded={settingsOpen}
        onPress={() => setSettingsOpen((current) => !current)}
        style={({ pressed }) => [styles.navRow, pressed && { backgroundColor: colors.hover }]}>
        <View style={[styles.navIcon, { backgroundColor: colors.hover }]}><Ionicons name="settings-sharp" size={23} color={colors.text} /></View>
        <Text style={[styles.navText, { color: colors.text }]}>Settings & privacy</Text>
        <Ionicons name={settingsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>
      {settingsOpen ? <View style={[styles.settingsGroup, { backgroundColor: colors.surface }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Account settings" onPress={() => navigate('/account')}
          style={({ pressed }) => [styles.settingRow, pressed && { backgroundColor: colors.hover }]}>
          <Ionicons name="person-circle-outline" size={23} color={colors.text} />
          <Text style={[styles.settingText, { color: colors.text }]}>Account settings</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
        <View style={styles.settingRow}>
          <Ionicons name="moon" size={20} color={colors.text} />
          <Text style={[styles.settingText, { color: colors.text }]}>Dark mode</Text>
          <Switch accessibilityLabel="Dark mode" value={theme === 'dark'} onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: '#0866FF' }} thumbColor="#FFFFFF" />
        </View>
      </View> : null}
      <Text style={[styles.brand, { color: colors.muted }]}>Daily Life</Text>
    </ScrollView>
  </SafeAreaView>;
}

export default function ToolkitLayout({ children }: PropsWithChildren) {
  const { width, fontScale } = useWindowDimensions();
  const { theme, colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const isDesktop = width >= Math.max(1024, 900 * fontScale);
  const isOpen = open && !isDesktop;
  const context = useMemo(() => ({ isOpen, isDesktop, openMenu: () => setOpen(true), closeMenu: () => setOpen(false) }), [isOpen, isDesktop]);
  return <MenuContext.Provider value={context}>
    <View style={[styles.layout, { backgroundColor: colors.background }]}>
      {isDesktop ? <View style={[styles.desktopSidebar, { borderRightColor: palettes[theme].border }]}>
        <SidebarContent onClose={context.closeMenu} />
      </View> : null}
      <View style={styles.content}>{children}</View>
    </View>
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={context.closeMenu}>
      <View style={styles.modal}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss menu" onPress={context.closeMenu}
          style={[StyleSheet.absoluteFill, styles.backdrop]} />
        <View accessibilityViewIsModal style={[styles.drawer, { width: Math.min(360, Math.max(width - 32, 0)) }]}>
          <SidebarContent drawer onClose={context.closeMenu} />
        </View>
      </View>
    </Modal>
  </MenuContext.Provider>;
}

const styles = StyleSheet.create({
  layout: { flex: 1, flexDirection: 'row', minWidth: 0, width: '100%' },
  content: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' },
  desktopSidebar: { width: 286, flexShrink: 0, borderRightWidth: 1 },
  sidebar: { flex: 1 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16 },
  menuTitle: { fontSize: 28, fontWeight: '700', letterSpacing: -0.7 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  appMark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, borderRadius: 22, paddingLeft: 14, paddingRight: 8, marginHorizontal: 16, marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, fontSize: 14 },
  clearSearch: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  menuBody: { paddingHorizontal: 10, paddingBottom: 20 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginHorizontal: 4, marginBottom: 14, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0866FF', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 15, fontWeight: '600' },
  profileDetail: { fontSize: 11, marginTop: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, marginBottom: 3 },
  navIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  navText: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  activeDot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 10, marginVertical: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginHorizontal: 10, marginBottom: 10 },
  noResults: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
  settingsGroup: { borderRadius: 12, marginHorizontal: 4, padding: 4, marginTop: 4 },
  settingRow: { minHeight: 50, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8 },
  settingText: { flex: 1, fontSize: 13, fontWeight: '500' },
  brand: { fontSize: 11, marginHorizontal: 12, marginTop: 20 },
  modal: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  pressed: { opacity: 0.7 },
});
