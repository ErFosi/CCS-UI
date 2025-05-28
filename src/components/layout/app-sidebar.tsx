
"use client";

import Link from "next/link";
import Image from 'next/image';
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Film, UploadCloud, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/theme-context";
import { useAuth } from "@/context/auth-context"; // Import useAuth

const navItems = [
  { href: "/dashboard/my-videos", label: "My Videos", icon: Film },
  { href: "/dashboard/upload", label: "Upload & Censor", icon: UploadCloud },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { theme } = useTheme();
  const { logout, isLoading: authIsLoading } = useAuth(); // Use logout from AuthContext

  const handleLogout = async () => {
    await logout();
  };

  const logoSrc = theme === 'dark' ? '/logo/logo_oscuro.png' : '/logo/logo.png';

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 flex items-center justify-center">
        <Link href="/dashboard/my-videos" className="group-data-[collapsible=icon]:hidden">
            <Image
              src={logoSrc}
              alt="SecureGuard AI Logo" 
              width={120}
              height={67.5}
              className="rounded-sm"
              priority
              key={theme}
              data-ai-hint="company logo"
            />
        </Link>
         <Link href="/dashboard/my-videos" className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
            <Image
              src={logoSrc}
              alt="SecureGuard AI Logo" 
              width={32}
              height={32}
              className="rounded-sm"
              priority
              key={theme + "-icon"}
              data-ai-hint="company logo small"
            />
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} legacyBehavior passHref>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.href}
                  tooltip={{ children: item.label, side: "right", align: "center" }}
                  className={pathname === item.href ?
                    "!bg-sidebar-primary !text-sidebar-primary-foreground hover:!bg-sidebar-primary/90" :
                    "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }
                >
                  <a>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t border-sidebar-border">
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
            title="Logout"
            aria-label="Logout"
            disabled={authIsLoading}
          >
            <LogOut className="h-5 w-5" />
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
