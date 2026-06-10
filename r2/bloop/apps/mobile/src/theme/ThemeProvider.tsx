import { createContext, useMemo, type ReactNode } from 'react';
import { lightTheme, type ColorTheme } from './colors';
import { tokens, type Tokens } from './index';

export interface ThemeContextValue { theme: ColorTheme; mode: 'light' | 'dark'; tokens: Tokens }

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Light-only in 3a. Night Pop Lite ships later as a token swap: thread `mode` from Appearance + a Settings override here. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ThemeContextValue>(() => ({ theme: lightTheme, mode: 'light', tokens }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
