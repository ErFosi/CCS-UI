
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
// Removed useAuth and setPreferenceApi imports as ThemeProvider will no longer call the API directly
// import { useAuth } from './auth-context';
// import { setPreferenceApi } from '@/lib/apiClient';
// import { useToast } from '@/hooks/use-toast';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>('light');
  // const { toast } = useToast(); // Removed as API call is removed

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (systemPrefersDark ? 'dark' : 'light');
    
    console.log(`[ThemeContext] Initial theme load: storedTheme=${storedTheme}, systemPrefersDark=${systemPrefersDark}, applying=${initialTheme}`);
    setThemeState(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // This function no longer calls the backend API directly.
  // Backend persistence can be handled by a component that consumes both AuthContext and ThemeContext.
  const persistThemePreference = useCallback(async (newTheme: Theme) => {
    // This is now a placeholder. Actual API call should be elsewhere.
    console.log(`[ThemeContext] persistThemePreference (dummy): Theme set to ${newTheme}. API call to save preference would happen in a component like AppHeader.`);
    // Example of what would happen in AppHeader or similar:
    // if (isAuthenticated) {
    //   const token = await getToken();
    //   if (token) {
    //     try {
    //       await setPreferenceApi({ theme: newTheme }, token);
    //     } catch (error) {
    //       console.error("[ThemeContext] Failed to save theme preference to backend:", error);
    //     }
    //   }
    // }
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    console.log(`[ThemeContext] setTheme called with: ${newTheme}`);
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // persistThemePreference(newTheme); // Call to persist (now a dummy)
  }, []); // Removed persistThemePreference from dependencies as it's stable

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    console.log(`[ThemeContext] toggleTheme called. Current: ${theme}, New: ${newTheme}`);
    setTheme(newTheme);
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
