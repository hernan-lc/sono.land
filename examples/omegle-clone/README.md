# Omegle Clone Example

A simple Omegle-style random video chat example built with [sono.land](https://sono.land).

## Features

- Random partner matching
- WebRTC video/audio chat
- "Next" button to skip to new partner
- Real-time connection status

## How to Run

1. Make sure you have [Deno](https://deno.land/) installed

2. From the project root, run:
   ```bash
   deno run --allow-net --allow-read examples/omegle-clone/server.ts
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

4. Click "Start Chat" and allow camera/microphone access

5. Wait for a partner to connect, or open another browser tab to test with yourself

## How It Works

- Uses sono.land's WebSocket for signaling
- WebRTC for peer-to-peer video/audio
- Random matching algorithm with waiting queue

## Note

This is a simple example for testing and educational purposes. For production use, you would need:
- TURN servers for NAT traversal
- User authentication
- Rate limiting
- Better error handling
- HTTPS for camera access