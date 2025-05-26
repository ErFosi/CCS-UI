// 'use server';
/**
 * @fileOverview An AI agent that suggests the best enhancement operations for video upscaling.
 *
 * - suggestUpscaleEnhancements - A function that handles the suggestion of video upscaling enhancements.
 * - SuggestUpscaleEnhancementsInput - The input type for the suggestUpscaleEnhancements function.
 * - SuggestUpscaleEnhancementsOutput - The return type for the suggestUpscaleEnhancements function.
 */

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestUpscaleEnhancementsInputSchema = z.object({
  videoDataUri: z
    .string()
    .describe(
      "A video to be upscaled, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  originalWidth: z.number().describe('The original width of the video.'),
  originalHeight: z.number().describe('The original height of the video.'),
  targetWidth: z.number().describe('The target width of the video after upscaling.'),
  targetHeight: z.number().describe('The target height of the video after upscaling.'),
});

export type SuggestUpscaleEnhancementsInput = z.infer<typeof SuggestUpscaleEnhancementsInputSchema>;

const SuggestUpscaleEnhancementsOutputSchema = z.object({
  suggestedEnhancements: z
    .array(z.string())
    .describe(
      'An array of suggested enhancement operations (e.g., sharpness, denoise) to apply during upscaling.'
    ),
  reasoning: z
    .string()
    .describe('The AI agents reasoning for suggesting these particular enhancements.'),
});

export type SuggestUpscaleEnhancementsOutput = z.infer<typeof SuggestUpscaleEnhancementsOutputSchema>;

export async function suggestUpscaleEnhancements(
  input: SuggestUpscaleEnhancementsInput
): Promise<SuggestUpscaleEnhancementsOutput> {
  return suggestUpscaleEnhancementsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestUpscaleEnhancementsPrompt',
  input: {schema: SuggestUpscaleEnhancementsInputSchema},
  output: {schema: SuggestUpscaleEnhancementsOutputSchema},
  prompt: `You are an expert video upscaling specialist.

You are given a video and its dimensions, along with the target dimensions after upscaling. Your task is to suggest the best enhancement operations to apply during the upscaling process to achieve the highest quality result.

Consider factors such as the video's original quality, resolution, and any potential artifacts or noise that may be present.

Based on your analysis, suggest a list of enhancement operations (e.g., sharpness, denoise, contrast adjustment) that should be applied during upscaling.

Video: {{media url=videoDataUri}}
Original Width: {{{originalWidth}}}
Original Height: {{{originalHeight}}}
Target Width: {{{targetWidth}}}
Target Height: {{{targetHeight}}}

Output ONLY a JSON object with the keys "suggestedEnhancements" and "reasoning" according to the schema description. The reasoning should briefly explain why you chose these enhancements.
`,
});

const suggestUpscaleEnhancementsFlow = ai.defineFlow(
  {
    name: 'suggestUpscaleEnhancementsFlow',
    inputSchema: SuggestUpscaleEnhancementsInputSchema,
    outputSchema: SuggestUpscaleEnhancementsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
