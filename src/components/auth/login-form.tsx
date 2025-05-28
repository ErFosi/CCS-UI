
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
// Removed jwt-decode as it's not needed for redirect flow

const formSchema = z.object({
  username: z.string().min(1, {
    message: "Username is required.",
  }),
  password: z.string().min(1, { // Kept for UI, but Keycloak's page will validate
    message: "Password is required.",
  }),
});

export function LoginForm() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const { login, isLoading: authIsLoading, keycloak } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
    const keycloakRealm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
    const keycloakClientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;
    console.log("[CLIENT] LoginForm ENV CHECK:", {
      url: keycloakUrl,
      realm: keycloakRealm,
      clientId: keycloakClientId,
    });
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    console.log(`[CLIENT] LoginForm: onSubmit - Attempting Keycloak login redirect with username hint: ${values.username}`);

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
      // Initiate Keycloak's standard login flow (redirect to Keycloak's page)
      // Pass username as a hint. Keycloak handles actual password validation.
      // Specify redirectUri to come back to the dashboard after successful Keycloak login.
      const redirectUri = `${window.location.origin}/dashboard/my-videos`;
      console.log(`[CLIENT] LoginForm: Calling keycloak.login() via AuthContext with options: loginHint=${values.username}, redirectUri=${redirectUri}`);
      
      await login({ 
        loginHint: values.username,
        redirectUri: redirectUri 
      });
      // The page will redirect to Keycloak. Code here might not execute if redirect is immediate.
      // We don't expect to reach here if redirect to Keycloak is successful.
      console.log("[CLIENT] LoginForm: keycloak.login() was called. Waiting for redirect.");
    } catch (error: any) {
      console.error("[CLIENT] LoginForm: Error during keycloak.login() initiation:", error);
      toast({
        title: "Login Initiation Failed",
        description: error.message || "Could not redirect to Keycloak login page. Check console.",
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
              {(isSubmitting || authIsLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
