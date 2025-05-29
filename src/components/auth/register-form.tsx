// "use client";

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
    // Exclude confirmPassword before sending to backend
    const { confirmPassword, ...registrationData } = values;
    
    console.log("[CLIENT] RegisterForm: Attempting registration with (data to be sent):", registrationData);
    
    const backendRegisterUrl = `${process.env.NEXT_PUBLIC_FASTAPI_URL}/auth/register`;
    console.log(`[CLIENT] RegisterForm: Will attempt to POST to backend URL: ${backendRegisterUrl}`);

    try {
      const response = await fetch(backendRegisterUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationData),
      });

      if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (parseError) {
            errorData = { detail: response.statusText || "Registration failed on the server." };
        }
        throw new Error(errorData.detail || `Server responded with ${response.status}`);
      }
      
      // const responseData = await response.json(); // Assuming backend sends back some useful data
      // console.log("[CLIENT] RegisterForm: Backend registration successful (response from backend):", responseData);

      toast({
        title: "Registration Submitted!",
        description: "Your account creation request has been sent. Please try logging in.",
        variant: "default", // Changed from "success" to "default" as success implies user is created
        duration: 7000,
      });
      form.reset();
      router.push('/login'); // Redirect to login page

    } catch (error: any) {
      console.error("[CLIENT] RegisterForm: Error during backend registration call:", error);
      let description = "Could not complete registration. Please check your details or contact support if the issue persists.";
      if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
        let attemptedHostname = "your backend server";
        try {
          attemptedHostname = new URL(backendRegisterUrl).hostname;
        } catch (e) { /* ignore parsing error if backendRegisterUrl is invalid */ }
        
        description = `Failed to connect to the registration server at ${backendRegisterUrl}. This could be due to network issues, CORS problems, or SSL certificate errors if using HTTPS (e.g., ERR_CERT_COMMON_NAME_INVALID for domain '${attemptedHostname}'). Please check the browser console for more details and ensure the backend server at ${attemptedHostname} is correctly configured and accessible.`;
      } else if (error.message) {
        description = error.message;
      }
      toast({
        title: "Registration Error",
        description: description,
        variant: "destructive",
        duration: 10000,
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
            width={160} // Restored original larger size
            height={90}  // Restored original larger size
            className="rounded-sm" // Removed w-auto h-auto as width/height props define size
            data-ai-hint="company logo"
            priority
            key={theme} // Ensures re-render on theme change if src depends on it
          />
        </div>
      </CardHeader>
      <CardContent className="overflow-y-auto max-h-[calc(100vh-22rem)] space-y-4">
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
