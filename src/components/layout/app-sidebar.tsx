
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
import { useRouter } from "next/navigation";
import { useTheme } from "@/context/theme-context";

const navItems = [
  { href: "/dashboard/my-videos", label: "My Videos", icon: Film },
  { href: "/dashboard/upload", label: "Upload & Upscale", icon: UploadCloud },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme } = useTheme();

  const handleLogout = () => {
    router.push("/login");
  };

  const logoSrc = theme === 'dark' ? '/logo/logo_oscuro.png' : '/logo/logo.png';

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 flex items-center justify-center">
        <Link href="/dashboard/my-videos" className="group-data-[collapsible=icon]:hidden">
            <Image
              src={logoSrc}
              alt="VideoRevive Logo"
              width={120}
              height={67.5}
              className="rounded-sm"
              priority
              key={theme} // Add key to force re-render on theme change for next/image
            />
        </Link>
         <Link href="/dashboard/my-videos" className="hidden group-data-[collapsible=icon]:flex items-center justify-center">
            <Image
              src={logoSrc}
              alt="VideoRevive Logo"
              width={32}
              height={32}
              className="rounded-sm"
              priority
              key={theme + "-icon"} // Add key to force re-render
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
          >
            <LogOut className="h-5 w-5" />
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
