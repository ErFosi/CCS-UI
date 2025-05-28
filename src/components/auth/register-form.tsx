
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

// Schema for user registration, matching typical Keycloak fields
const registerFormSchema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters." }),
  email: z.string().email({ message: "Invalid email address." }),
  firstName: z.string().min(1, { message: "First name is required." }),
  lastName: z.string().min(1, { message: "Last name is required." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }) 
    .regex(/[a-z]/, { message: "Password must contain at least one lowercase letter."})
    .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter."})
    .regex(/[0-9]/, { message: "Password must contain at least one number."})
    .regex(/[^a-zA-Z0-9]/, { message: "Password must contain at least one special character."}), // Example for special char
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"], 
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export function RegisterForm() {
  const { toast } = useToast();
  const { theme } = useTheme(); 
  const { keycloak, isLoading: authIsLoading, register } = useAuth(); // Using register from useAuth
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
    console.log("[CLIENT] RegisterForm: Attempting registration. Form values:", values);

    // Option 1: Redirect to Keycloak's own registration page (recommended for simplicity if acceptable)
    if (keycloak && register) { 
        console.log("[CLIENT] RegisterForm: Initiating Keycloak standard registration flow (redirect).");
        try {
            // You could pass email and username as hints if your Keycloak registration page theme is customized to use them.
            // The `register` function from AuthContext will call keycloak.register().
            await register({
                // loginHint: values.username, // Example: if Keycloak page uses it
            });
            // If successful, this will redirect the browser to Keycloak's registration page.
            // Code below this point might not execute if the redirect happens immediately.
        } catch (error: any) {
            console.error("[CLIENT] RegisterForm: Error initiating Keycloak registration redirect:", error);
            toast({
                title: "Registration Error",
                description: error.message || "Could not redirect to Keycloak registration page. Ensure user registration is enabled in your Keycloak realm settings.",
                variant: "destructive",
            });
            setIsSubmitting(false); // Only set if redirect fails to initiate
        }
        return; // Exit after attempting redirect-based registration
    }

    // Option 2: (Placeholder for custom backend integration if redirect is not used)
    // This part is a simulation if you don't use Keycloak's registration page.
    // For actual user creation with this custom form, your backend MUST securely call Keycloak's Admin API.
    console.warn("[CLIENT] RegisterForm: Keycloak instance or register function not available for redirect. Falling back to simulation.");
    console.log("[CLIENT] RegisterForm: Registration Data to send to backend (simulation):", {
      username: values.username,
      email: values.email,
      firstName: values.firstName,
      lastName: values.lastName,
      password: values.password, // Password should ONLY be sent to YOUR secure backend over HTTPS.
    });

    toast({
      title: "Registration Data Collected (Simulation)",
      description: "To complete registration with this custom form, your application backend needs to securely call Keycloak's Admin API. Using Keycloak's own registration page (triggered by 'Sign Up') is generally recommended for simpler integration if enabled in your Keycloak realm.",
      variant: "default",
      duration: 10000, // Longer duration for this important message
    });
    
    // form.reset(); // Optionally reset form after "simulated submission"
    setIsSubmitting(false);
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
            priority // Added priority
            key={theme} 
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto max-h-[calc(100vh-22rem)] space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3"> {/* Reduced space-y */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> {/* Reduced gap */}
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
