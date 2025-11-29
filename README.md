# Twitch Listener Microservice

## Overview

This project is a high-performance, scalable microservice designed to ingest real-time events from Twitch and dispatch them to downstream services. It acts as a centralized gateway for all Twitch interactions, normalizing data from various sources into a unified format.

The service supports:

- **EventSub (Webhooks)**: For reliable, server-to-server notifications like follows, subscriptions, stream status changes, and channel point redemptions.
- **IRC (Chat)**: For real-time chat monitoring and interaction.
- **Mock Mode**: For local development without needing real Twitch credentials.

## Features

### 1. Unified Event Normalization

Regardless of the source (EventSub or IRC), all incoming data is transformed into a standardized `TwitchEvent` object. This simplifies downstream processing, as your API only needs to handle one consistent data structure.

### 2. Reliable Dispatching

The service includes a robust `DispatcherService` that forwards normalized events to your configured `DISPATCHER_URL`. It implements:

- **Exponential Backoff**: If your downstream service is down, it retries with increasing delays (1s, 2s, 4s, 8s, 16s).
- **Error Handling**: Gracefully handles connection refusals and HTTP errors without crashing.
- **Dev Mode Safety**: In development, events are logged to the console instead of being sent to the API to prevent connection errors.

### 3. Dynamic Configuration

- **Development**: Loads channel configurations from a local `channels.json` file.
- **Production**: Periodically synchronizes with an external `AUTH_SERVICE_URL` to fetch the list of channels to listen to. This allows for hot-swapping and scaling without restarting the service.

### 4. Security

- **HMAC Verification**: Automatically verifies the cryptographic signature of incoming EventSub webhooks to ensure authenticity.
- **Secure Defaults**: Uses standard security practices for Express.js.

## Architecture

The service is built with Node.js and TypeScript, following a modular architecture:

- **`src/index.ts`**: Entry point. Initializes services and starts the Express server.
- **`src/services/twitch/`**: Contains specific implementations for Twitch protocols.
  - `eventsubService.ts`: Handles webhook subscriptions and incoming notifications.
  - `ircService.ts`: Manages WebSocket connections to Twitch Chat.
- **`src/services/dispatcherService.ts`**: Handles sending events to your external API.
- **`src/services/ingestService.ts`**: The central hub that receives raw events, normalizes them, and passes them to the dispatcher.
- **`src/services/schedulerService.ts`**: (Production only) Manages the periodic syncing of channel lists.

## Setup and Installation

### Prerequisites

- Node.js v18+
- npm or yarn
- A Twitch Developer Application (Client ID and Secret)
- A public-facing URL (e.g., via `ngrok`) for EventSub webhooks in development.

### Environment Variables

Create a `.env` file in the root directory:

```env
# Environment (development, production, test)
NODE_ENV=development

# Mock Mode (true = generate fake events, false = connect to real Twitch)
USE_MOCK=false

# Server Port
PORT=3000

# Twitch Credentials (Required for real mode)
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_APP_ACCESS_TOKEN=your_app_access_token
TWITCH_WEBHOOK_SECRET=your_secret_string
PUBLIC_EVENTSUB_CALLBACK=https://your-ngrok-url.app/eventsub/callback

# Dispatcher (Where to send events)
DISPATCHER_URL=http://localhost:4000/events

# Auth Service (Production only - source of channel config)
AUTH_SERVICE_URL=http://localhost:5000/listeners
SYNC_INTERVAL_MS=60000
```

### Running the Project

1.  **Install Dependencies**:

    ```bash
    npm install
    ```

2.  **Development Mode**:

    ```bash
    npm run dev
    ```

    This starts the server with hot-reloading. If `USE_MOCK=false`, it will attempt to create EventSub subscriptions for channels defined in `src/config/development/channels.json`.

3.  **Production Build**:

    ```bash
    npm run build
    npm start
    ```

4.  **Running Tests**:
    ```bash
    npm test
    ```

## Configuration

### Channel List (Development)

Modify `src/config/development/channels.json` to define which channels to listen to:

```json
[
  {
    "twitch_user_id": "12345678",
    "login": "streamer_name",
    "scopes": ["channel:read:subscriptions"],
    "listen_eventsub": true,
    "listen_chat_irc": true,
    "eventsub_topics": ["stream.online", "stream.offline", "channel.follow"]
  }
]
```

## API Endpoints

- **`GET /health`**: Health check endpoint.
- **`GET /metrics`**: Returns internal metrics (event counts).
- **`POST /eventsub/callback`**: The webhook endpoint Twitch calls.
- **`POST /admin/channels`**: (Admin) Add a new channel listener dynamically.

## License

MIT
