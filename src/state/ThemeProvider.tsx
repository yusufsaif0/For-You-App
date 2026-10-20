import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

const THEME_KEY = 'daily-life-theme';

const palettes = {
  light: {
    background: '#F4F6FB',
    surface: '#FFFFFF',
    surfaceAlt: '#EEF1F8',
    text: '#172033',
    muted: '#788198',
    border: '#E7EAF2',
    primary: '#6558F5',
    primarySoft: '#EFEDFF',
    green: '#17A873',
    red: '#E26A73',
  },
  dark: {
    background: '#10121A',
    surface: '#191C27',
    surfaceAlt: '#232635',
    text: '#F3F4FA',
    muted: '#A0A5B8',
    border: '#2D3141',
    primary: '#A49BFF',
    primarySoft: '#302D52',
    green: '#55D6A4',
    red: '#FF929A',
  },
} as const;

type ThemeName = keyof typeof palettes;

interface ThemeContextValue {
  theme: ThemeName;
  colors: (typeof palettes)[ThemeName];
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<ThemeName>('light');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.setProperty('--app-input-text', palettes[theme].text);
    document.documentElement.style.setProperty('--app-input-background', palettes[theme].surfaceAlt);
  }, [theme]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_KEY).then((saved) => {
      if (active && (saved === 'light' || saved === 'dark')) setTheme(saved);
    }).catch((error: unknown) => {
      console.error('Unable to load saved theme preference:', error);
    });
    return () => { active = false; };
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    colors: palettes[theme],
    toggleTheme: () => {
      const nextTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(nextTheme);
      AsyncStorage.setItem(THEME_KEY, nextTheme).catch((error: unknown) => {
        console.error('Unable to save theme preference:', error);
      });
    },
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useAppTheme requires ThemeProvider');
  return context;
}
