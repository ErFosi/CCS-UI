
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
import { useState } from "react";
import { Loader2 } from "lucide-react";


const registerFormSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters." }),
  email: z.string().email({
    message: "Invalid email address.",
  }),
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  password: z.string().min(6, { // Keycloak typically has password policies
    message: "Password must be at least 6 characters.",
  }),
  confirmPassword: z.string().min(6, {
    message: "Password must be at least 6 characters.",
  }),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"], 
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export function RegisterForm() {
  const { toast } = useToast();
  const { theme } = useTheme(); 
  const { keycloak, isLoading: authIsLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: RegisterFormValues) {
    setIsSubmitting(true);
    console.log("[CLIENT] RegisterForm: Attempting registration with (raw form values):", values);

    // IMPORTANT: Direct user registration via Keycloak Admin API from a public client
    // (like this Next.js app) is NOT recommended and generally not possible without 
    // insecurely exposing admin credentials or using a backend proxy.
    // The `keycloak-js` library's `register()` method typically redirects to Keycloak's 
    // own registration page if user registration is enabled in the realm settings.

    // To use THIS custom UI form for registration that creates a user directly in Keycloak
    // with all these fields, you typically need:
    // 1. A backend API endpoint (e.g., in your FastAPI backend).
    // 2. This frontend form POSTs the data to your backend API.
    // 3. Your backend API (configured as a confidential client or using a service account for Keycloak) 
    //    then uses Keycloak's Admin REST API to create the user.
    // This is the secure and standard way to handle user creation from a custom UI.

    // For this frontend example, we will continue to simulate initiating the process.
    // In a real scenario, replace the console.log and toast below with an API call to YOUR backend.
    
    try {
      console.log("[CLIENT] RegisterForm: Registration Data to send to backend:", {
        username: values.username,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        // IMPORTANT: The password should ONLY be sent from this client to YOUR secure backend over HTTPS.
        // Your backend would then hash it or pass it to Keycloak as required by Keycloak's API.
        password: values.password, 
      });

      toast({
        title: "Registration Initiated (Simulation)",
        description: "Account creation request data collected. For actual user creation, backend integration with Keycloak Admin API is required via a secure backend endpoint.",
        duration: 7000, // Longer duration for this important message
      });
      
      // Example of how one *might* redirect to Keycloak's own registration page if it's enabled.
      // This would bypass your custom form data (firstName, lastName etc.) unless Keycloak's
      // registration flow is customized to ask for them.
      // if (keycloak && keycloak.authenticated === false) { // Check if not already authenticated
      //   keycloak.register(); // This redirects to Keycloak's page
      // } else {
      //   console.warn("[CLIENT] RegisterForm: Keycloak instance not available or user already authenticated, cannot redirect to Keycloak registration page.");
      // }

      form.reset(); // Reset form after "submission"
    } catch (error: any) {
      console.error("[CLIENT] RegisterForm: Registration submission error:", error);
      toast({
        title: "Registration Failed",
        description: error.message || "Could not process registration request.",
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground" disabled={isSubmitting || authIsLoading}>
              {isSubmitting || authIsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign Up
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
