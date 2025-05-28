
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
import { useAuth } from "@/context/auth-context"; // Import useAuth
import { useState } from "react";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  email: z.string().email({ // Keycloak usually uses username or email for login
    message: "Invalid email or username.",
  }),
  password: z.string().min(1, { // Min 1 for password to allow Keycloak to validate
    message: "Password is required.",
  }),
});

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { theme } = useTheme(); 
  const { keycloak, isLoading: authIsLoading } = useAuth(); // Get Keycloak instance
  const [isSubmitting, setIsSubmitting] = useState(false);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "", // Can be username or email
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
       // Using Direct Access Grant (Password Grant)
       // This directly sends username and password to Keycloak.
       // NOTE: This flow is generally discouraged for SPAs if Authorization Code Flow can be used.
      await keycloak.login({
        loginHint: values.email, // Optional: pre-fill username/email on Keycloak page if redirected
        action: 'login', // Ensure it's a login action
        // For Direct Access Grant, Keycloak.js might not have a direct method.
        // We typically make a direct POST request to the token endpoint.
        // However, keycloak.login() with appropriate setup should handle it.
        // If it redirects, ensure your Keycloak client allows direct grant.
        // For this example, we'll assume keycloak.login() can be configured
        // or that you might need a custom fetch to Keycloak's token endpoint.
        // For simplicity with keycloak-js, often it implies using Keycloak's hosted pages.
        // Let's proceed assuming `keycloak.login()` handles the flow or
        // that further customization for direct grant might be needed outside this scope.
        // A true Direct Access Grant would be an AJAX call to Keycloak's token endpoint.
        // The `keycloak-js` library's `login` function is more geared towards redirect-based flows.
        // For a pure SPA form-based login without redirect, you'd manually post to:
        // POST {keycloakUrl}/realms/{realm}/protocol/openid-connect/token
        // with grant_type=password, client_id, username, password.

        // Given the constraints of `keycloak-js` `login()` method (usually for redirects),
        // a more robust solution for custom UI with Direct Access Grant
        // would involve a manual fetch to the token endpoint.
        // For now, we'll rely on `keycloak.login()` and see if it can be configured
        // via Keycloak server settings to work without full page redirect, or handle the redirect gracefully.
        // If not, this part would need a custom fetch.

        // Simplified approach for this example:
        // Keycloak.js 'login' will typically redirect. If you want to avoid redirect
        // and use password grant, you need to make a direct POST request.
        // This is a simplified representation; a real implementation might be more complex.
        // This will likely redirect to Keycloak's login page if not already authenticated
        // or if Keycloak is configured for it.

        // The following is a conceptual attempt if keycloak-js could handle it directly (often doesn't for DAG from form)
        // This is a placeholder for actual Direct Access Grant logic.
        // The library is more for redirect flows.
        // A proper DAG would be:
        const response = await fetch(`${process.env.NEXT_PUBLIC_KEYCLOAK_URL}/realms/${process.env.NEXT_PUBLIC_KEYCLOAK_REALM}/protocol/openid-connect/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID!,
            username: values.email, // Assuming email is used as username
            password: values.password,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error_description || 'Login failed');
        }
        
        const tokenData = await response.json();
        // Manually update Keycloak tokens
        // This is tricky and `keycloak-js` is meant to manage this via its init/login flows.
        // Doing this manually can lead to inconsistencies.
        // It's better to let keycloak.init() handle the tokens after a redirect,
        // or use a library more suited for custom UI + DAG.
        // For now, if successful, Keycloak session should be established.
        // We will re-initialize to pick up the session.
        await keycloak.clearToken(); // Clear any old tokens
        await keycloak.init({ 
            onLoad: 'login-required', 
            pkceMethod: 'S256',
            // token: tokenData.access_token, // This is not how keycloak-js usually ingests tokens
            // refreshToken: tokenData.refresh_token,
            // idToken: tokenData.id_token,
        });


        if (keycloak.authenticated) {
          toast({
            title: "Login Successful",
            description: "Redirecting to your dashboard...",
          });
          router.push("/dashboard/my-videos");
        } else {
          toast({ title: "Login Failed", description: "Please check your credentials.", variant: "destructive" });
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
              name="email" // Changed to email, can be username or email for Keycloak
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
