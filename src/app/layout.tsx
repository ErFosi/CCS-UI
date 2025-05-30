
"use client"; 

import { Inter } from 'next/font/google'; 
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { VideoProvider } from '@/context/video-context';
import { ThemeProvider } from '@/context/theme-context';
import { AuthProvider } from '@/context/auth-context'; // Import AuthProvider

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans', 
});


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning> 
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider> {/* AuthProvider now wraps ThemeProvider */}
          <ThemeProvider>
            <VideoProvider>
              {children}
              <Toaster />
            </VideoProvider>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
