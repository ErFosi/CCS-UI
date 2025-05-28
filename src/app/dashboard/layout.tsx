
"use client"; 

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useAuth } from "@/context/auth-context";
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log(`[CLIENT] DashboardLayout:useEffect - isLoading: ${isLoading}, isAuthenticated: ${isAuthenticated}`);
    if (!isLoading && !isAuthenticated) {
      console.log("[CLIENT] DashboardLayout:useEffect - Not authenticated and not loading, redirecting to /login");
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    console.log("[CLIENT] DashboardLayout: Rendering loading spinner (isLoading is true)");
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Authenticating...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log("[CLIENT] DashboardLayout: Rendering redirecting to login (isAuthenticated is false, isLoading is false)");
    // This helps prevent flicker before redirect effect runs
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
         <p className="ml-4 text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  console.log("[CLIENT] DashboardLayout: Rendering dashboard content (isAuthenticated is true)");
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset className="flex flex-col">
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-secondary/50">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
