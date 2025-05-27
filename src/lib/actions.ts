
"use server";

import { censorVideo, type CensorVideoInput } from '@/ai/flows/censor-video';
import { z } from 'zod';

const CensorActionInputSchema = z.object({
  videoId: z.string(),
  videoDataUri: z.string().startsWith('data:video/mp4;base64,', { message: "Video must be a base64 encoded MP4 data URI." }),
  fileName: z.string(),
  originalWidth: z.number(), // May or may not be used by censor flow, but good to have
  originalHeight: z.number(),// May or may not be used by censor flow, but good to have
});

export type CensorActionInput = z.infer<typeof CensorActionInputSchema>;

interface CensorActionResult {
  success: boolean;
  videoId: string;
  originalDataUri?: string;
  censoredDataUri?: string;
  error?: string;
}

export async function performCensor(input: CensorActionInput): Promise<CensorActionResult> {
  try {
    const validatedInput = CensorActionInputSchema.parse(input);
    
    const aiInput: CensorVideoInput = {
      videoDataUri: validatedInput.videoDataUri,
    };

    const result = await censorVideo(aiInput);

    if (!result.censoredVideoDataUri) {
      throw new Error('AI censoring simulation did not return a video URI.');
    }
    
    return {
      success: true,
      videoId: validatedInput.videoId,
      originalDataUri: validatedInput.videoDataUri,
      censoredDataUri: result.censoredVideoDataUri,
    };

  } catch (error) {
    console.error("Censoring failed:", error);
    let errorMessage = "An unknown error occurred during censoring.";
    if (error instanceof z.ZodError) {
      errorMessage = error.errors.map(e => e.message).join(', ');
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      success: false,
      videoId: input.videoId, 
      error: errorMessage,
    };
  }
}

export async function readFileAsDataURI(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```