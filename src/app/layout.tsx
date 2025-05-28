
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
        <ThemeProvider>
          <AuthProvider> {/* Wrap with AuthProvider */}
            <VideoProvider>
              {children}
              <Toaster />
            </VideoProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
