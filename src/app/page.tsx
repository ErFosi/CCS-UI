
"use client"; 

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    console.log(`[CLIENT] HomePage:useEffect - isLoading: ${isLoading}, isAuthenticated: ${isAuthenticated}`);
    if (!isLoading) {
      if (isAuthenticated) {
        console.log("[CLIENT] HomePage:useEffect - Authenticated, redirecting to /dashboard/my-videos");
        router.replace('/dashboard/my-videos');
      } else {
        console.log("[CLIENT] HomePage:useEffect - Not authenticated, redirecting to /login");
        router.replace('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-4 text-muted-foreground">Loading application...</p>
    </div>
  );
}
