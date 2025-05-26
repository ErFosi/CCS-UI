"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { LogOut, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AppHeader() {
  const router = useRouter();

  const handleLogout = () => {
    // In a real app, clear session/token here
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 sm:px-6 shadow-sm">
      <SidebarTrigger className="md:hidden" />
      <div className="flex flex-1 items-center justify-between">
        <Link href="/dashboard/my-videos" className="text-xl font-semibold text-primary">
          VideoRevive
        </Link>
        <div className="flex items-center gap-4">
           {/* Placeholder for user profile/actions. Can be expanded later. */}
          <Button variant="ghost" size="icon" onClick={() => alert("User profile clicked!")}>
            <UserCircle className="h-6 w-6" />
            <span className="sr-only">User Profile</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-destructive hover:text-destructive/80">
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Logout</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
