
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

const formSchema = z.object({
  username: z.string().min(1, { // Changed from email to username
    message: "Username is required.",
  }),
  password: z.string().min(1, {
    message: "Password is required.",
  }),
});

export function LoginForm() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const { isLoading: authIsLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  // Debug log for env vars
  useEffect(() => {
    console.log("[CLIENT] LoginForm ENV CHECK:", {
      url: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
      realm: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
      clientId: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
    });
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    console.log(`[CLIENT] LoginForm: onSubmit - Username: ${values.username}`);

    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
    const keycloakRealm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
    const keycloakClientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;

    if (!keycloakUrl || !keycloakRealm || !keycloakClientId) {
      toast({
        title: "Configuration Error",
        description: "Keycloak configuration (URL, Realm, Client ID) is missing. Please check .env file.",
        variant: "destructive",
      });
      console.error("[CLIENT] LoginForm: Keycloak environment variables missing.");
      setIsSubmitting(false);
      return;
    }

    const tokenUrl = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`;
    console.log(`[CLIENT] LoginForm: Attempting Direct Access Grant to: ${tokenUrl}`);

    try {
      const requestBody = new URLSearchParams({
        grant_type: 'password',
        client_id: keycloakClientId,
        username: values.username,
        password: values.password,
        // Removed explicit scope to match the user's working curl command
      });
      
      console.log("[CLIENT] LoginForm: Token request body:", requestBody.toString());

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody,
      });

      const tokenData = await response.json();
      console.log("[CLIENT] LoginForm: Keycloak token response:", tokenData);


      if (!response.ok) {
        const errorDescription = tokenData.error_description || `HTTP error ${response.status} from Keycloak. No further details.`;
        console.error("[CLIENT] LoginForm: Keycloak token exchange failed:", tokenData, "Status:", response.status);
        throw new Error(errorDescription);
      }


      if (tokenData.access_token) {
        console.log("[CLIENT] LoginForm: Tokens received from Direct Access Grant.");
        localStorage.setItem('kc_access_token', tokenData.access_token);
        if (tokenData.refresh_token) localStorage.setItem('kc_refresh_token', tokenData.refresh_token);
        if (tokenData.id_token) localStorage.setItem('kc_id_token', tokenData.id_token);
        if (tokenData.expires_in) localStorage.setItem('kc_expires_in', tokenData.expires_in.toString());
        
        console.log("[CLIENT] LoginForm: Tokens stored in localStorage. Forcing full page navigation to /dashboard/my-videos", {
            accessStored: !!localStorage.getItem('kc_access_token'),
            refreshStored: !!localStorage.getItem('kc_refresh_token'),
            idStored: !!localStorage.getItem('kc_id_token'),
        });
        
        toast({
          title: "Login Successful",
          description: "Redirecting to dashboard...",
        });
        
        window.location.href = "/dashboard/my-videos"; // Force full page reload

      } else {
        console.error("[CLIENT] LoginForm: Access token not received from Keycloak despite 200 OK. Full response:", tokenData);
        throw new Error("Access token not received from Keycloak.");
      }

    } catch (error: any) {
      console.error("[CLIENT] LoginForm: Login error (raw object):", error);
      let description = "An unexpected error occurred during login.";
      if (error && error.message) {
        description = error.message;
        if (error.name === 'TypeError' && error.message.toLowerCase().includes('failed to fetch')) {
          description = `Failed to fetch from Keycloak token endpoint: ${tokenUrl}. This is often due to:
1. Network Connectivity: Ensure Keycloak server at ${keycloakUrl} is reachable.
2. CORS (Cross-Origin Resource Sharing): Verify Keycloak's 'Web Origins' for client '${keycloakClientId}' includes your app's origin (e.g., ${typeof window !== 'undefined' ? window.location.origin : 'your_app_origin'}).
3. SSL Certificate: If using HTTPS, your browser must trust Keycloak's SSL certificate. Self-signed certificates often cause this.
Please check your browser's Network tab for details on the failed request to the token endpoint.`;
        }
      } else if (typeof error === 'string') {
        description = error;
      }

      toast({
        title: "Login Failed",
        description: description,
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
            className="rounded-sm" // Removed w-auto h-auto as width/height props define aspect ratio
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
                    <Input placeholder="your_username" {...field} />
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
