import { useAppTheme } from '@/state/ThemeProvider';

// Local to Schedule so other pages keep their existing visual theme.
const palettes = {
  light: {
    background: '#F8FAFD', surface: '#FFFFFF', surfaceAlt: '#EFF3F9',
    text: '#1F2937', muted: '#596579', border: '#E3E8EF',
    primary: '#0B57D0', primarySoft: '#E8F0FE', onPrimary: '#FFFFFF',
    green: '#13734B', greenSoft: '#E6F4EA', red: '#B3261E', redSoft: '#FCEEEE',
  },
  dark: {
    background: '#111318', surface: '#1B1E25', surfaceAlt: '#252932',
    text: '#E8EAED', muted: '#A5AEBD', border: '#30353F',
    primary: '#A8C7FA', primarySoft: '#23334E', onPrimary: '#102C57',
    green: '#8ED8B0', greenSoft: '#19382C', red: '#F2B8B5', redSoft: '#432729',
  },
};

export function useScheduleColors() {
  const { theme } = useAppTheme();
  return palettes[theme];
}
