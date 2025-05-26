# Dockerfile

# Stage 1: Build the application
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./
RUN npm install

# Copy the rest of the application code
COPY . .

# Define build arguments for environment variables required at build time
# These will be baked into the client-side JavaScript bundles or used by the build process.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ARG GOOGLE_API_KEY
ENV GOOGLE_API_KEY=${GOOGLE_API_KEY}

# Build the Next.js application
# The `output: 'standalone'` in next.config.ts will prepare the app for this.
RUN npm run build

# Stage 2: Production environment
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV production

# Copy the standalone output from the builder stage
# This includes only the necessary files to run the application
COPY --from=builder /app/.next/standalone ./

# Copy the public folder from the build stage
COPY --from=builder /app/public ./public

# Copy the static assets from .next/static (needed for standalone output)
COPY --from=builder /app/.next/static ./.next/static

# Expose the port the app runs on (default 3000 for Next.js standalone)
EXPOSE 3000

# Set runtime environment variables.
# GOOGLE_API_KEY is needed at runtime for server-side Genkit flows.
# This should be provided when running the container, e.g., `docker run -e GOOGLE_API_KEY=your_key ...`
# ENV GOOGLE_API_KEY will be set by the `docker run -e` command.

# Command to run the application
# The standalone output includes a server.js file to start the server.
CMD ["node", "server.js"]
