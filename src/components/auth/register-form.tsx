
"use client";

import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"; // Added CardDescription
import { useTheme } from "@/context/theme-context";
import { useAuth } from "@/context/auth-context"; // Import useAuth
import { useState } from "react";
import { Loader2, ExternalLink } from "lucide-react"; // Added ExternalLink

export function RegisterForm() {
  const { theme } = useTheme();
  const { register, isLoading } = useAuth(); // Use register function from AuthContext
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleProceedToCreation = async () => {
    setIsRedirecting(true);
    try {
      // The register function from AuthContext should handle the redirect
      await register();
      // The page will redirect, so setIsRedirecting(false) might not be reached
      // if the redirect is immediate.
    } catch (error) {
      console.error("[CLIENT] RegisterForm: Error initiating redirect to Keycloak registration:", error);
      // Optionally, show a toast message for the error
      setIsRedirecting(false);
    }
  };

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
            priority
            key={theme}
            data-ai-hint="company logo"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-center">
        <CardDescription className="text-muted-foreground">
          You will be redirected to our secure server to create your account.
        </CardDescription>
        <Button
          onClick={handleProceedToCreation}
          className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground"
          disabled={isLoading || isRedirecting}
        >
          {(isLoading || isRedirecting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <ExternalLink className="mr-2 h-4 w-4" />
          Proceed to Account Creation
        </Button>
      </CardContent>
    </Card>
  );
}
