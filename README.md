
# SecureGuard AI UI

This is the Next.js frontend application for SecureGuard AI, an AI-powered video censoring service. This UI allows users to interact with the SecureGuard AI backend, which is expected to be running in the cloud.

## Features

- User login and registration (mocked, no actual auth).
- Video upload (MP4).
- Video preview and AI-powered censoring of sensitive content (simulated).
- Display of original and censored videos.
- Download functionality for original and censored videos.
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
    NEXT_PUBLIC_FASTAPI_URL=http://localhost:8000 

    # Example for Genkit Google AI (replace with your actual key)
    GOOGLE_API_KEY=your_google_api_key

    # Keycloak variables
    NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
    NEXT_PUBLIC_KEYCLOAK_REALM=myrealm
    NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=myclient
    ```
    - `NEXT_PUBLIC_FASTAPI_URL`: The URL for your backend API. This is embedded in the client-side code at build time.
    - `GOOGLE_API_KEY`: Required if you are using Genkit flows that interact with Google AI services.
    - `NEXT_PUBLIC_KEYCLOAK_URL`, `NEXT_PUBLIC_KEYCLOAK_REALM`, `NEXT_PUBLIC_KEYCLOAK_CLIENT_ID`: Keycloak configuration for authentication.

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
    docker build -t secureguard-ai-ui \
      --build-arg NEXT_PUBLIC_FASTAPI_URL="http://your-production-backend-api-url.com" \
      --build-arg GOOGLE_API_KEY="your_production_google_api_key_for_build" \
      --build-arg NEXT_PUBLIC_KEYCLOAK_URL="https://your-keycloak-url.com" \
      --build-arg NEXT_PUBLIC_KEYCLOAK_REALM="your-keycloak-realm" \
      --build-arg NEXT_PUBLIC_KEYCLOAK_CLIENT_ID="your-keycloak-client-id" \
      .
    ```
    - Replace URLs and keys with your actual production values. `NEXT_PUBLIC_FASTAPI_URL` and Keycloak URLs will be baked into the client-side JavaScript. `GOOGLE_API_KEY` is passed here in case the build process itself needs it.

2.  **Run the Docker container:**
    ```bash
    docker run -p 8000:8000 \
           -e GOOGLE_API_KEY="your_production_google_api_key_for_runtime" \
           secureguard-ai-ui
    ```
    - The application inside the container will run on port 8000.
    - `-p 8000:8000` maps port 8000 of the container to port 8000 on your host.
    - `-e GOOGLE_API_KEY`: This sets the Google API key at runtime, which is necessary for server-side Genkit flows that run within the Next.js server.

    The application will be accessible on your host at `http://localhost:8000`.

## Backend Integration

This UI is designed to communicate with a backend service responsible for:
- Actual user authentication and session management (Keycloak).
- Securely storing user data and videos.
- Performing the AI-powered video censoring operations.
- Managing subscriptions and premium features.

The backend URL should be configured using the `NEXT_PUBLIC_FASTAPI_URL` environment variable, provided at build time for Docker images or in `.env.local` for local development.

## Project Structure

-   `src/app/`: Main application routes (App Router).
-   `src/components/`: Reusable UI components.
    -   `src/components/ui/`: ShadCN UI components.
    -   `src/components/layout/`: Layout components (header, sidebar).
    -   `src/components/auth/`: Authentication related forms.
    -   `src/components/videos/`: Video related components.
-   `src/ai/`: Genkit related code.
    -   `src/ai/flows/`: Genkit flow definitions.
-   `src/context/`: React context providers (Theme, Video, Auth).
-   `src/lib/`: Utility functions, type definitions, server actions, API client.
-   `public/`: Static assets (e.g., images, logos).
-   `Dockerfile`: For building the production Docker image.
-   `.dockerignore`: Specifies files to exclude from the Docker build context.
-   `next.config.ts`: Next.js configuration, including `output: 'standalone'`.
