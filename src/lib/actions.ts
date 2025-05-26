"use server";

import { upscaleVideo, type UpscaleVideoInput } from '@/ai/flows/upscale-video';
import type { VideoAsset } from './types';
import { z } from 'zod';

const UpscaleActionInputSchema = z.object({
  videoId: z.string(),
  videoDataUri: z.string().startsWith('data:video/mp4;base64,', { message: "Video must be a base64 encoded MP4 data URI." }),
  fileName: z.string(),
  originalWidth: z.number(),
  originalHeight: z.number(),
});

export type UpscaleActionInput = z.infer<typeof UpscaleActionInputSchema>;

interface UpscaleActionResult {
  success: boolean;
  videoId: string;
  originalDataUri?: string;
  upscaledDataUri?: string;
  error?: string;
}

export async function performUpscale(input: UpscaleActionInput): Promise<UpscaleActionResult> {
  try {
    const validatedInput = UpscaleActionInputSchema.parse(input);
    
    // Prepare input for the AI flow
    const aiInput: UpscaleVideoInput = {
      videoDataUri: validatedInput.videoDataUri,
    };

    const result = await upscaleVideo(aiInput);

    if (!result.upscaledVideoDataUri) {
      throw new Error('AI upscaling did not return a video URI.');
    }
    
    return {
      success: true,
      videoId: validatedInput.videoId,
      originalDataUri: validatedInput.videoDataUri,
      upscaledDataUri: result.upscaledVideoDataUri,
    };

  } catch (error) {
    console.error("Upscaling failed:", error);
    let errorMessage = "An unknown error occurred during upscaling.";
    if (error instanceof z.ZodError) {
      errorMessage = error.errors.map(e => e.message).join(', ');
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      success: false,
      videoId: input.videoId, // return original videoId even on failure
      error: errorMessage,
    };
  }
}

// Helper function to read file as Data URI (client-side, but useful to have definition here)
// This function itself cannot be a server action if it uses browser APIs like FileReader.
// It's more of a utility that would be used on the client before calling a server action.
// For the sake of keeping server actions in this file, this is just a conceptual placeholder.
// Actual implementation will be on client.
export async function readFileAsDataURI(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
