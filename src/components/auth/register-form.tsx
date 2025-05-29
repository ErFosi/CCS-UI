
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import Image from 'next/image';
import { useRouter } from "next/navigation";
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
    .regex(/[^a-zA-Z0-9]/, { message: "Password must contain at least one special character."}),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export function RegisterForm() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const router = useRouter();
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
    const registrationData = {
      username: values.username,
      email: values.email,
      firstName: values.firstName,
      lastName: values.lastName,
      password: values.password, // The backend will handle this securely with Keycloak
    };
    console.log("[CLIENT] RegisterForm: Attempting registration with (raw form values):", values);
    
    const backendRegisterUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/auth/register`;
    console.log(`[CLIENT] RegisterForm: Will attempt to POST to backend URL: ${backendRegisterUrl}`);
    console.log("[CLIENT] RegisterForm: Registration Data to send to backend:", registrationData);

    try {
      const response = await fetch(backendRegisterUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData),
      });

      if (!response.ok) {
        // Try to parse error from backend, otherwise use generic message
        let errorData;
        try {
            errorData = await response.json();
        } catch (parseError) {
            // If response is not JSON or empty
            errorData = { detail: response.statusText || "Registration failed on the server." };
        }
        throw new Error(errorData.detail || `Server responded with ${response.status}`);
      }

      // Assuming backend returns a success message or user object
      // const responseData = await response.json(); 
      // console.log("[CLIENT] RegisterForm: Backend registration response:", responseData);

      toast({
        title: "Account Creation Submitted!",
        description: "Your registration request has been sent to the backend. If successful, you will be able to log in shortly. Please try logging in now.",
        variant: "default",
        duration: 7000,
      });
      form.reset();
      router.push('/login'); // Redirect to login page after submission

    } catch (error: any) {
      console.error("[CLIENT] RegisterForm: Error during backend registration call:", error);
      let description = "Could not complete registration. Please check your details or contact support if the issue persists.";
      // Check for specific "Failed to fetch" which often indicates network/SSL/CORS issues
      if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        description = `Failed to connect to the registration server at ${backendRegisterUrl}. This could be due to network issues, CORS problems, or SSL certificate errors if using HTTPS (e.g., ERR_CERT_COMMON_NAME_INVALID). Please check the browser console for more details and ensure the backend server is correctly configured and accessible.`;
      } else if (error.message) {
        description = error.message;
      }
      toast({
        title: "Registration Error",
        description: description,
        variant: "destructive",
        duration: 10000, // Longer duration for important errors
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
      <CardContent className="overflow-y-auto max-h-[calc(100vh-22rem)] space-y-4"> {/* Adjusted max-h for scroll */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" {...field} autoComplete="email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} autoComplete="given-name" />
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
                      <Input placeholder="Doe" {...field} autoComplete="family-name" />
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
                    <Input type="password" placeholder="••••••••" {...field} autoComplete="new-password" />
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
                    <Input type="password" placeholder="••••••••" {...field} autoComplete="new-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full !bg-primary hover:!bg-primary/90 text-primary-foreground" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sign Up
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
