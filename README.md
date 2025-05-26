# VideoRevive UI

This is the Next.js frontend application for VideoRevive, an AI-powered video upscaling service. This UI allows users to interact with the VideoRevive backend, which is expected to be running in the cloud.

## Features

- User login and registration (mocked, no actual auth).
- Video upload (MP4) and image upload (JPEG, PNG, GIF).
- Video preview and AI-powered upscaling from 480p to 1080p (simulated).
- Display of original and upscaled videos.
- Download functionality for videos.
- Light and Dark theme support, with theme-specific logos.

## Tech Stack

- **Framework**: Next.js (App Router)
- **UI Components**: ShadCN UI
- **Styling**: Tailwind CSS
- **AI Integration (Simulated)**: Genkit (for flow definitions)
- **Language**: TypeScript

## Prerequisites

- Node.js (v20.x recommended)
- npm (comes with Node.js)
- Docker (for containerized deployment)

## Getting Started / Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-directory-name>
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env.local` file in the root of the project. This file is used for local development.
    ```env
    # Example for client-side API URL (replace with your actual backend URL)
    NEXT_PUBLIC_API_URL=http://localhost:8080/api

    # Example for Genkit Google AI (replace with your actual key)
    GOOGLE_API_KEY=your_google_api_key
    ```
    - `NEXT_PUBLIC_API_URL`: The URL for your backend API. This is embedded in the client-side code at build time.
    - `GOOGLE_API_KEY`: Required if you are using Genkit flows that interact with Google AI services.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The application will be available at `http://localhost:9002`.

5.  **(Optional) Run Genkit development server (if working on AI flows):**
    In a separate terminal:
    ```bash
    npm run genkit:dev
    ```
    This starts the Genkit development server (usually on port 3400), allowing you to inspect and test Genkit flows via the Genkit Developer UI.

## Running with Docker

This application includes a `Dockerfile` for easy containerization. The Docker build utilizes Next.js's standalone output feature for optimized images.

1.  **Build the Docker image:**
    From the root of the project, run:
    ```bash
    docker build -t videorevive-ui \
      --build-arg NEXT_PUBLIC_API_URL="http://your-production-backend-api-url.com" \
      --build-arg GOOGLE_API_KEY="your_production_google_api_key_for_build" \
      .
    ```
    - Replace URLs and keys with your actual production values. `NEXT_PUBLIC_API_URL` will be baked into the client-side JavaScript. `GOOGLE_API_KEY` is passed here in case the build process itself needs it (e.g., for Genkit schema generation or validation).

2.  **Run the Docker container:**
    ```bash
    docker run -p 3000:3000 \
           -e GOOGLE_API_KEY="your_production_google_api_key_for_runtime" \
           videorevive-ui
    ```
    - The application inside the container will run on port 3000.
    - `-p 3000:3000` maps port 3000 of the container to port 3000 on your host.
    - `-e GOOGLE_API_KEY`: This sets the Google API key at runtime, which is necessary for server-side Genkit flows that run within the Next.js server (e.g., via Server Actions).

    The application will be accessible on your host at `http://localhost:3000`.

## Backend Integration

This UI is designed to communicate with a backend service responsible for:
- Actual user authentication and session management.
- Securely storing user data and videos.
- Performing the AI-powered video upscaling operations.
- Managing subscriptions and premium features.

The backend URL should be configured using the `NEXT_PUBLIC_API_URL` environment variable, provided at build time for Docker images or in `.env.local` for local development.

## Project Structure

-   `src/app/`: Main application routes (App Router).
-   `src/components/`: Reusable UI components.
    -   `src/components/ui/`: ShadCN UI components.
    -   `src/components/layout/`: Layout components (header, sidebar).
    -   `src/components/auth/`: Authentication related forms.
    -   `src/components/videos/`: Video related components.
-   `src/ai/`: Genkit related code.
    -   `src/ai/flows/`: Genkit flow definitions.
-   `src/context/`: React context providers (Theme, Video).
-   `src/lib/`: Utility functions, type definitions, server actions.
-   `public/`: Static assets (e.g., images, logos).
-   `Dockerfile`: For building the production Docker image.
-   `.dockerignore`: Specifies files to exclude from the Docker build context.
-   `next.config.ts`: Next.js configuration, including `output: 'standalone'`.
