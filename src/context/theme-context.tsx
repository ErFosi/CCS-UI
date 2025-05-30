
"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './auth-context'; // Import useAuth to get token
import { setPreferenceApi } from '@/lib/apiClient'; // Import API client function
import { useToast } from '@/hooks/use-toast'; // Optional: for showing API call status

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void; // Keep this for direct setting if needed
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>('light'); // Default to light
  const { isAuthenticated, getToken } = useAuth(); // Get auth state and token function
  const { toast } = useToast(); // Optional

  useEffect(() => {
    // This effect runs once on mount to set the initial theme from localStorage or system preference
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

  const persistThemePreference = useCallback(async (newTheme: Theme) => {
    if (isAuthenticated) {
      const token = await getToken();
      if (token) {
        try {
          console.log(`[ThemeContext] Persisting theme '${newTheme}' to backend.`);
          await setPreferenceApi({ theme: newTheme }, token);
          // toast({ // Optional: success feedback
          //   title: "Theme Saved",
          //   description: `Your theme preference (${newTheme}) has been saved.`,
          // });
        } catch (error) {
          console.error("[ThemeContext] Failed to save theme preference to backend:", error);
          // toast({ // Optional: error feedback
          //   title: "Theme Save Failed",
          //   description: "Could not save your theme preference to the server.",
          //   variant: "destructive",
          // });
        }
      } else {
        console.warn("[ThemeContext] Cannot save theme to backend: No token available.");
      }
    } else {
      console.log("[ThemeContext] User not authenticated. Theme preference not saved to backend.");
    }
  }, [isAuthenticated, getToken, toast]);

  const setTheme = useCallback((newTheme: Theme) => {
    console.log(`[ThemeContext] setTheme called with: ${newTheme}`);
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    persistThemePreference(newTheme);
  }, [persistThemePreference]);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    console.log(`[ThemeContext] toggleTheme called. Current: ${theme}, New: ${newTheme}`);
    setTheme(newTheme); // setTheme will handle localStorage, class, and API call
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
