'use server';

/**
 * @fileOverview Upscales a video from 480p to 1080p using AI enhancement.
 *
 * - upscaleVideo - A function that handles the video upscaling process.
 * - UpscaleVideoInput - The input type for the upscaleVideo function.
 * - UpscaleVideoOutput - The return type for the upscaleVideo function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const UpscaleVideoInputSchema = z.object({
  videoDataUri: z
    .string()
    .describe(
      'A video to upscale, as a data URI that must include a MIME type and use Base64 encoding. Expected format: \'data:<mimetype>;base64,<encoded_data>\'.' // Ensure correct format
    ),
});
export type UpscaleVideoInput = z.infer<typeof UpscaleVideoInputSchema>;

const UpscaleVideoOutputSchema = z.object({
  upscaledVideoDataUri: z
    .string()
    .describe('The upscaled video, as a data URI with Base64 encoding.'),
});
export type UpscaleVideoOutput = z.infer<typeof UpscaleVideoOutputSchema>;

export async function upscaleVideo(input: UpscaleVideoInput): Promise<UpscaleVideoOutput> {
  return upscaleVideoFlow(input);
}

const upscaleVideoPrompt = ai.definePrompt({
  name: 'upscaleVideoPrompt',
  input: {schema: UpscaleVideoInputSchema},
  output: {schema: UpscaleVideoOutputSchema},
  prompt: [
    {media: {url: '{{{videoDataUri}}}'}},
    {
      text:
        'Upscale this video to 1080p, intelligently enhancing clarity and detail. Decide how many enhancement operations (sharpness, denoise) it uses to create an ideal upscale result.',
    },
  ],
  model: 'googleai/gemini-2.0-flash-exp',
  config: {
    responseModalities: ['TEXT', 'IMAGE'],
  },
});

const upscaleVideoFlow = ai.defineFlow(
  {name: 'upscaleVideoFlow', inputSchema: UpscaleVideoInputSchema, outputSchema: UpscaleVideoOutputSchema},
  async input => {
    const {media} = await upscaleVideoPrompt(input);
    return {upscaledVideoDataUri: media.url!};
  }
);
