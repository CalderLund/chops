import { useEffect } from 'react';
import theme from '../themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    for (const [prop, value] of Object.entries(theme.vars)) {
      root.style.setProperty(prop, value);
    }
  }, []);

  return <>{children}</>;
}
