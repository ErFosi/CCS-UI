"use client";

import Link from "next/link";
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
import { Film, UploadCloud, Home, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/dashboard/my-videos", label: "My Videos", icon: Film },
  { href: "/dashboard/upload", label: "Upload & Upscale", icon: UploadCloud },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    router.push("/login");
  };


  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 items-center justify-center">
         {/* Could add a small logo here if needed */}
        <Link href="/dashboard/my-videos" className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
            <Film className="h-8 w-8 text-sidebar-primary" />
            <h1 className="text-2xl font-bold text-sidebar-foreground">VideoRevive</h1>
        </Link>
         <Link href="/dashboard/my-videos" className="items-center gap-2 hidden group-data-[collapsible=icon]:flex">
            <Film className="h-8 w-8 text-sidebar-primary" />
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
