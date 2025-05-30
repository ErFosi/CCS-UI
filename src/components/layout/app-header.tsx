
"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, UserCircle, Moon, Sun, CreditCard, Trash2, Loader2 } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/context/theme-context"; 
import { useAuth } from "@/context/auth-context";
import { AccountDeletionDialog } from "@/components/auth/account-deletion-dialog";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { deleteAllUserVideosApi, setPreferenceApi } from "@/lib/apiClient"; // Import setPreferenceApi

export function AppHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme: toggleThemeContext } = useTheme(); 
  const { logout, user, getToken, isLoading: authIsLoading, isAuthenticated } = useAuth(); // Added isAuthenticated
  const { toast } = useToast();
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleToggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    toggleThemeContext(); // This updates local state and localStorage

    if (isAuthenticated) {
      try {
        const token = await getToken();
        if (token) {
          console.log(`[AppHeader] Attempting to save theme preference: ${newTheme} to backend.`);
          await setPreferenceApi({ theme: newTheme }, token);
          // Optional: toast success for saving preference, though might be too noisy
          // toast({ title: "Theme Saved", description: `Theme preference '${newTheme}' saved to server.` });
        } else {
          console.warn("[AppHeader] Could not get token to save theme preference.");
        }
      } catch (error) {
        console.error("[AppHeader] Failed to save theme preference to backend:", error);
        toast({
          title: "Theme Preference Error",
          description: "Could not save theme preference to the server.",
          variant: "destructive",
        });
      }
    }
  };

  const handleLogout = async () => {
    await logout(); 
  };

  const getPageTitle = () => {
    if (pathname === "/dashboard/my-videos") return "My Videos";
    if (pathname === "/dashboard/upload") return "Upload & Censor";
    if (pathname === "/dashboard/subscription") return "Subscription";
    return "Dashboard"; 
  };

  const displayName = user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.username || "User";

  const handleAccountDeletionConfirm = async () => {
    setIsDeletingAccount(true);
    const token = await getToken();
    if (!token) {
      toast({ title: "Error", description: "Authentication token not available.", variant: "destructive" });
      setIsDeletingAccount(false);
      setIsDeleteDialogOpen(false);
      return;
    }

    try {
      await deleteAllUserVideosApi(token);
      toast({ title: "Videos Deleted", description: "All your videos have been successfully deleted.", variant: "default" });
      
      toast({
        title: "Account Deletion Requested",
        description: "Account deletion initiated on the server. You will now be logged out.",
        duration: 7000,
      });
      
      setIsDeleteDialogOpen(false); 
      await logout(); 
      
    } catch (error) {
      console.error("Error during account deletion process:", error);
      toast({
        title: "Account Deletion Failed",
        description: error instanceof Error ? error.message : "Could not complete account deletion process.",
        variant: "destructive",
      });
    } finally {
        setIsDeletingAccount(false); 
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background px-4 sm:px-6 shadow-sm">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <h1 className="text-xl font-semibold text-primary hidden md:block">
            {getPageTitle()}
          </h1>
        </div>
        
        <h1 className="text-lg font-semibold text-primary md:hidden flex-1 text-center truncate">
          {getPageTitle()}
        </h1>

        <div className="flex items-center gap-2 sm:gap-4">
          {!authIsLoading && user && (
            <span className="text-sm font-medium text-foreground hidden sm:inline">
              {displayName}
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" disabled={authIsLoading}>
                {authIsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserCircle className="h-6 w-6" />}
                <span className="sr-only">User Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleToggleTheme} className="cursor-pointer">
                {theme === "light" ? (
                  <Moon className="mr-2 h-4 w-4" />
                ) : (
                  <Sun className="mr-2 h-4 w-4" />
                )}
                <span>Toggle Theme</span>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/dashboard/subscription">
                  <CreditCard className="mr-2 h-4 w-4" />
                  <span>Subscription</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => setIsDeleteDialogOpen(true)} 
                className="cursor-pointer text-destructive hover:!text-destructive/80 focus:!text-destructive/80 focus:!bg-destructive/10"
                disabled={isDeletingAccount}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete Account</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive hover:!text-destructive/80 focus:!text-destructive/80 focus:!bg-destructive/10">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <AccountDeletionDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirmDeletion={handleAccountDeletionConfirm}
        username={displayName}
      />
    </>
  );
}
