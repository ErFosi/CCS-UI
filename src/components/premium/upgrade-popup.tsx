
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, UploadCloud, ZapOff } from "lucide-react"; // Changed icons

interface UpgradePopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UpgradePopup({ isOpen, onClose }: UpgradePopupProps) {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border text-card-foreground shadow-xl rounded-lg">
        <DialogHeader className="p-6">
          <div className="flex items-center space-x-3 mb-2">
            <UploadCloud className="h-8 w-8 text-primary" /> {/* Kept UploadCloud as it's generic */}
            <DialogTitle className="text-3xl font-bold text-primary">Upgrade to SecureGuard AI Premium</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground">
            Unlock powerful features and enhance your video censoring experience.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 pb-2">
          {/* Plan 1: Basic */}
          <Card className="border-border shadow-lg hover:shadow-primary/20 transition-shadow duration-300 flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-semibold">Premium Basic</CardTitle>
              <CardDescription className="text-primary text-2xl font-bold mt-1">5€ <span className="text-sm font-normal text-muted-foreground">/ month</span></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-grow">
              <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Standard AI censoring</p>
              <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Censor up to 10 videos per month</p>
              <p className="flex items-start"><ZapOff className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Completely ad-free experience</p>
              <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Standard processing speed</p>
            </CardContent>
            <CardFooter className="mt-auto pt-4">
              <Button disabled className="w-full" variant="outline">Coming Soon</Button>
            </CardFooter>
          </Card>
          {/* Plan 2: Pro */}
          <Card className="border-primary shadow-xl ring-2 ring-primary bg-primary/5 hover:shadow-primary/40 transition-shadow duration-300 flex flex-col">
             <CardHeader className="pb-2">
              <CardTitle className="text-xl font-semibold text-primary">Premium Pro</CardTitle>
              <CardDescription className="text-primary text-2xl font-bold mt-1">15€ <span className="text-sm font-normal text-muted-foreground">/ month</span></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm flex-grow">
              <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Advanced AI censoring (more precise)</p>
              <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Unlimited video censoring</p>
              <p className="flex items-start"><ZapOff className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Completely ad-free experience</p>
              <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Priority processing queue</p>
            </CardContent>
            <CardFooter className="mt-auto pt-4">
              <Button disabled className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground">Coming Soon</Button>
            </CardFooter>
          </Card>
        </div>
        <DialogFooter className="p-6">
          <Button variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground">Maybe Later</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```