import { useContext } from 'react';
import { ThemeContext, type ThemeContextValue } from './ThemeProvider';

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error('useTheme outside <ThemeProvider>');
  return ctx;
}
