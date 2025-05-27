
"use client"; // Make this a Client Component

import { Inter } from 'next/font/google'; // Using Inter as Geist is not standard, for broad compatibility.
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { VideoProvider } from '@/context/video-context';
import { ThemeProvider } from '@/context/theme-context';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans', // Keep variable name for consistency if ShadCN uses it
});

// Assuming Geist Mono might not be standard either, or not needed if Inter covers mono needs.
// If a specific mono font is required and Geist Mono is problematic, specify another or remove.
// For now, we'll rely on the sans-serif for general UI.

// Note: Static metadata cannot be exported from a Client Component.
// If you need to set dynamic metadata (e.g., document title),
// you can do so using `useEffect` hooks within your client components.

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning> {/* suppressHydrationWarning for next-themes like behavior */}
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <VideoProvider>
            {children}
            <Toaster />
          </VideoProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
