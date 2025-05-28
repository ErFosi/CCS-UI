
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
  const { keycloak, isLoading: authIsLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);


  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "", 
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);

    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
    const keycloakRealm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
    const keycloakClientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;

    if (!keycloakUrl || !keycloakRealm || !keycloakClientId) {
      toast({
        title: "Configuration Error",
        description: "Keycloak configuration (URL, Realm, Client ID) is missing. Please check .env file.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!keycloak) {
      toast({ title: "Authentication service not ready", description: "Keycloak instance is not available.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }
    
    const tokenUrl = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: keycloakClientId,
          username: values.email,
          password: values.password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error_description: `HTTP error ${response.status} from Keycloak. No further details.` }));
        console.error("Keycloak token exchange failed:", errorData, "Status:", response.status);
        throw new Error(errorData.error_description || `Login failed. Keycloak responded with status ${response.status}.`);
      }
      
      const tokenData = await response.json();
      
      await keycloak.clearToken(); 

      await keycloak.init({ 
          onLoad: 'check-sso', 
          pkceMethod: 'S256',
          token: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          idToken: tokenData.id_token,
          timeSkew: tokenData.expires_in 
      });

      if (keycloak.authenticated) {
        toast({
          title: "Login Successful",
          description: "Redirecting to your dashboard...",
        });
        router.push("/dashboard/my-videos");
      } else {
        // This part might be tricky. If init succeeds with tokens but authenticated is false,
        // it could mean the tokens are invalid or session couldn't be established.
        toast({ title: "Login session could not be established.", description: "Keycloak did not confirm authentication after token init.", variant: "destructive" });
      }

    } catch (error: any) {
      console.error("Login error (raw object):", error);
      let description = "An unexpected error occurred during login.";
      if (error && error.message) {
        description = error.message;
        // Check if the error is specifically a "Failed to fetch"
        if (error.name === 'TypeError' && error.message.toLowerCase().includes('failed to fetch')) {
          description = `Failed to fetch from Keycloak token endpoint: ${tokenUrl}. This is often due to:
1. Network Connectivity: Ensure Keycloak server at ${keycloakUrl} is reachable.
2. CORS (Cross-Origin Resource Sharing): Verify Keycloak's 'Web Origins' for client '${keycloakClientId}' includes your app's origin (e.g., http://localhost:9002).
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
