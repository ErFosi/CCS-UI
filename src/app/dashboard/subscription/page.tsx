
"use client"; 

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreditCard, ShieldCheck } from "lucide-react"; // Changed Zap to ShieldCheck

export default function SubscriptionPage() {
  return (
    <div className="container mx-auto py-8">
      <Card className="w-full max-w-2xl mx-auto shadow-xl">
        <CardHeader className="text-center">
          <CreditCard className="mx-auto h-12 w-12 text-primary mb-4" />
          <CardTitle className="text-3xl font-bold">Manage Your SecureGuard AI Subscription</CardTitle>
          <CardDescription className="text-muted-foreground">
            Unlock premium censoring features and enhance your experience.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-lg">
              Subscription management features are coming soon!
            </p>
            <p className="text-muted-foreground mt-2">
              Currently, you can explore our premium plans for enhanced video censoring.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <Card className="border-border shadow-lg flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl font-semibold">Premium Basic</CardTitle>
                <CardDescription className="text-primary text-2xl font-bold mt-1">5€ <span className="text-sm font-normal text-muted-foreground">/ month</span></CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm flex-grow">
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Standard AI censoring</p>
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Censor up to 10 videos per month</p>
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Ad-free experience</p>
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-green-400 mr-2 shrink-0 mt-0.5" /> Standard processing speed</p>
              </CardContent>
              <CardFooter className="mt-auto pt-4">
                <Button disabled className="w-full" variant="outline">Coming Soon</Button>
              </CardFooter>
            </Card>
            
            <Card className="border-primary shadow-xl ring-2 ring-primary bg-primary/5 flex flex-col">
               <CardHeader className="pb-2">
                <CardTitle className="text-xl font-semibold text-primary">Premium Pro</CardTitle>
                <CardDescription className="text-primary text-2xl font-bold mt-1">15€ <span className="text-sm font-normal text-muted-foreground">/ month</span></CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm flex-grow">
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Advanced AI censoring (more precise)</p>
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Unlimited video censoring</p>
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Ad-free experience</p>
                <p className="flex items-start"><ShieldCheck className="h-5 w-5 text-yellow-400 mr-2 shrink-0 mt-0.5" /> Priority processing queue</p>
              </CardContent>
              <CardFooter className="mt-auto pt-4">
                <Button disabled className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground">Coming Soon</Button>
              </CardFooter>
            </Card>
          </div>

        </CardContent>
        <CardFooter className="flex justify-center pt-6">
          <Button asChild variant="link">
            <Link href="/dashboard/my-videos">Back to My Videos</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
