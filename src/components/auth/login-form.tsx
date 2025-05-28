
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useRouter } from "next/navigation";
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
import { useState } from "react";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  email: z.string().email({
    message: "Invalid email or username.",
  }),
  password: z.string().min(1, {
    message: "Password is required.",
  }),
});

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { theme } = useTheme(); 
  const { keycloak, isLoading: authIsLoading, login: keycloakLoginMethod } = useAuth(); // Using login from context
  const [isSubmitting, setIsSubmitting] = useState(false);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "", 
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!keycloak) {
      toast({ title: "Authentication service not ready", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      // Attempting Direct Access Grant (Password Grant)
      // This sends username and password directly to Keycloak's token endpoint.
      // This approach is used to keep the custom UI for login.
      
      const tokenUrl = `${process.env.NEXT_PUBLIC_KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/token`;
      
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID!,
          username: values.email, // Keycloak uses 'username' field for this grant
          password: values.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Keycloak token exchange failed:", errorData);
        throw new Error(errorData.error_description || 'Login failed. Please check credentials.');
      }
      
      const tokenData = await response.json();

      // After successfully getting tokens, we need to inform keycloak-js about them.
      // This is a tricky part as keycloak-js is primarily designed for redirect-based flows.
      // Manually setting tokens can be complex. The `keycloak.init()` with new tokens is one way,
      // but its success in establishing a full session this way can vary.
      
      await keycloak.clearToken(); // Clear any existing tokens

      // Re-initialize keycloak with the new tokens.
      // This will attempt to establish the session based on the tokens obtained.
      // Note: `onLoad: 'login-required'` might trigger redirects if not handled carefully.
      // For a pure SPA flow after DAG, `check-sso` or a custom token storage might be better.
      // The `token`, `refreshToken`, `idToken` can be passed to init.
      await keycloak.init({ 
          onLoad: 'check-sso', // check-sso is safer here than login-required
          pkceMethod: 'S256',
          token: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          idToken: tokenData.id_token,
          timeSkew: tokenData.expires_in // Optional: provide timeSkew if available
      });

      if (keycloak.authenticated) {
        toast({
          title: "Login Successful",
          description: "Redirecting to your dashboard...",
        });
        router.push("/dashboard/my-videos");
      } else {
        // This path might be taken if keycloak.init() with tokens doesn't result in an authenticated state as expected.
        // This could be due to Keycloak server config or limitations of keycloak-js with manual token injection.
        toast({ title: "Login session could not be established.", description: "Please try again or contact support.", variant: "destructive" });
      }

    } catch (error: any) {
      console.error("Login error:", error);
      toast({
        title: "Login Failed",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username or Email</FormLabel>
                  <FormControl>
                    <Input placeholder="your_username or you@example.com" {...field} />
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
                    <Input type="password" placeholder="••••••••" {...field} />
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
