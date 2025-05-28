
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/context/theme-context";
import { useAuth } from "@/context/auth-context";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
// Removed jwt-decode as it's no longer needed here

const formSchema = z.object({
  // Username and password fields are still needed for the form,
  // but Keycloak's page will handle the actual credential validation.
  // You might choose to remove them if you always redirect,
  // or keep them if you might re-introduce a direct grant attempt later for other reasons.
  // For now, we'll keep them but the primary action is keycloak.login().
  username: z.string().min(1, { // Kept for UI consistency, but won't be sent directly by this form
    message: "Username is required.",
  }),
  password: z.string().min(1, { // Kept for UI consistency
    message: "Password is required.",
  }),
});

export function LoginForm() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const { login, isLoading: authIsLoading, keycloak } = useAuth(); // Use login from AuthContext
  const [isSubmitting, setIsSubmitting] = useState(false); // To disable button during redirect initiation

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    console.log("[CLIENT] LoginForm ENV CHECK:", {
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
    });
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Values from the form (username, password) are not directly used here for token fetching.
    // We will redirect to Keycloak's login page.
    setIsSubmitting(true);
    console.log(`[CLIENT] LoginForm: onSubmit - Attempting to redirect to Keycloak login.`);

    if (!keycloak) {
      toast({
        title: "Initialization Error",
        description: "Keycloak is not yet initialized. Please wait a moment and try again.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      // This will redirect the user to Keycloak's login page.
      // Keycloak will handle credentials and then redirect back.
      await login(); // login function from useAuth now calls keycloak.login()
      // The page will redirect, so code here might not execute if redirect is immediate.
      // We don't expect to reach here if redirect is successful.
    } catch (error: any) {
      console.error("[CLIENT] LoginForm: Error during keycloak.login() initiation:", error);
      toast({
        title: "Login Initiation Failed",
        description: error.message || "Could not redirect to login page. Check console for details.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  }

  const logoSrc = theme === 'dark' ? '/logo/logo_oscuro.png' : '/logo/logo.png';

  return (
    <Card className="w-full shadow-xl border-border">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex items-center justify-center">
          <Image
            src={logoSrc}
            alt="SecureGuard AI Logo"
            width={160}
            height={90}
            className="rounded-sm"
            data-ai-hint="company logo"
            priority
            key={theme}
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto max-h-[calc(100vh-22rem)] space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="your_username" {...field} autoComplete="username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} autoComplete="current-password"/>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground" disabled={isSubmitting || authIsLoading}>
              {isSubmitting || authIsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
