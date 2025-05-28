
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
import { jwtDecode } from "jwt-decode"; // For inspecting token claims

const formSchema = z.object({
  username: z.string().min(1, {
    message: "Username is required.",
  }),
  password: z.string().min(1, {
    message: "Password is required.",
  }),
});

interface KeycloakTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_expires_in: number;
  refresh_token?: string;
  token_type: string;
  'not-before-policy': number;
  session_state: string;
  scope: string;
  id_token?: string; // id_token might not always be present with password grant
}

export function LoginForm() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const { keycloak } = useAuth(); // We won't call keycloak.login() directly here for DAG
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
    console.log(`[CLIENT] LoginForm: onSubmit - Attempting Direct Access Grant with username: ${values.username}`);

    const keycloakUrl = process.env.NEXT_PUBLIC_KEYCLOAK_URL;
    const keycloakRealm = process.env.NEXT_PUBLIC_KEYCLOAK_REALM;
    const keycloakClientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;

    if (!keycloakUrl || !keycloakRealm || !keycloakClientId) {
      toast({
        title: "Configuration Error",
        description: "Keycloak configuration is missing. Please check environment variables.",
        variant: "destructive",
      });
      console.error("[CLIENT] LoginForm: Missing Keycloak environment variables.");
      setIsSubmitting(false);
      return;
    }

    const tokenUrl = `${keycloakUrl}/realms/${keycloakRealm}/protocol/openid-connect/token`;
    const expectedIssuer = `${keycloakUrl}/realms/${keycloakRealm}`;
    console.log(`[CLIENT] LoginForm: Expected Issuer based on .env: ${expectedIssuer}`);

    const requestBody = new URLSearchParams({
      grant_type: 'password',
      client_id: keycloakClientId,
      username: values.username,
      password: values.password,
      // No explicit scope parameter, to mirror curl and get default client scopes
    });
    console.log("[CLIENT] LoginForm: Token request body (raw string):", requestBody.toString());


    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody,
      });

      const tokenData = await response.json() as KeycloakTokenResponse;
      console.log("[CLIENT] LoginForm: Keycloak token response:", tokenData);

      if (!response.ok || !tokenData.access_token) {
        throw new Error(tokenData.error_description || tokenData.error || "Failed to obtain tokens from Keycloak.");
      }
      
      // Decode and log claims for debugging
      if (tokenData.access_token) {
        try {
          const decodedToken: any = jwtDecode(tokenData.access_token);
          console.log("[CLIENT] LoginForm: Decoded access token payload from app:", decodedToken);
          console.log("[CLIENT] LoginForm: Decoded 'iss' claim from app's access token:", decodedToken.iss);
          console.log("[CLIENT] LoginForm: Decoded 'aud' claim from app's access token:", decodedToken.aud);
          if (decodedToken.iss !== expectedIssuer) {
            console.error(`[CLIENT] LoginForm: CRITICAL ISSUER MISMATCH! Token 'iss' is '${decodedToken.iss}', expected '${expectedIssuer}'. API will likely reject this token.`);
            toast({
                title: "Token Issuer Mismatch",
                description: `The token issuer '${decodedToken.iss}' does not match the expected '${expectedIssuer}'. Please check Keycloak URL configuration.`,
                variant: "destructive",
                duration: 10000,
            });
          }
        } catch (decodeError) {
          console.error("[CLIENT] LoginForm: Error decoding access token:", decodeError);
        }
      }

      // Store tokens for AuthProvider to pick up after hard reload
      localStorage.setItem('kc_access_token', tokenData.access_token);
      if (tokenData.refresh_token) {
        localStorage.setItem('kc_refresh_token', tokenData.refresh_token);
      } else {
        localStorage.removeItem('kc_refresh_token'); // Ensure it's cleared if not present
      }
      if (tokenData.id_token) {
        localStorage.setItem('kc_id_token', tokenData.id_token);
      } else {
        localStorage.removeItem('kc_id_token'); // Ensure it's cleared if not present
      }
      localStorage.setItem('kc_expires_in', tokenData.expires_in.toString());
      
      console.log("[CLIENT] LoginForm: Tokens received and stored in localStorage.");
      toast({ title: "Login Submitted", description: "Processing login..." });

      // Hard redirect to allow AuthProvider to initialize cleanly with new tokens
      window.location.href = "/dashboard/my-videos";
      // setIsSubmitting(false); // This line might not be reached due to redirect

    } catch (error: any) {
      console.error("[CLIENT] LoginForm: Direct Access Grant error:", error);
      toast({
        title: "Login Failed",
        description: error.message || "Could not connect to authentication server. Please check credentials or try again later.",
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
            <Button type="submit" className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
