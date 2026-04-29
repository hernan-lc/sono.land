import { Sono } from '../../mod.ts';
import { Client } from '../../src/client.ts';

const sono = new Sono();

// Store waiting users and partner mappings
const waitingUsers: Map<string, Client> = new Map();
const partnerMap: Map<string, string> = new Map();

// Custom message handler for the omegle protocol
function handleCustomMessage(data: any, sender: Client) {
    const protocol = data.protocol;
    const payload = data.payload;

    console.log(`[SERVER] Received from client ${sender.id}:`, protocol, payload);

    switch (protocol) {
        case 'find-partner':
            findPartner(sender);
            break;
        case 'video-offer':
            forwardToPartner(sender.id, payload.to, protocol, payload);
            break;
        case 'video-answer':
            forwardToPartner(sender.id, payload.to, protocol, payload);
            break;
        case 'ice-candidate':
            forwardToPartner(sender.id, payload.to, protocol, payload);
            break;
        case 'next-partner':
            disconnectFromPartner(sender);
            findPartner(sender);
            break;
        case 'stop-chat':
            disconnectFromPartner(sender);
            break;
    }
}

function findPartner(sender: Client) {
    console.log(`[SERVER] findPartner called by client ${sender.id}`);
    console.log(`[SERVER] Current waiting users:`, Array.from(waitingUsers.keys()));

    // Remove from waiting if already waiting
    waitingUsers.delete(sender.id.toString());

    // If there's someone waiting, connect them
    if (waitingUsers.size > 0) {
        const partner = waitingUsers.values().next().value;
        waitingUsers.delete(partner.id.toString());

        console.log(`[SERVER] Matching client ${sender.id} with partner ${partner.id}`);

        // Map partners to each other
        partnerMap.set(sender.id.toString(), partner.id.toString());
        partnerMap.set(partner.id.toString(), sender.id.toString());

        // Check socket states
        console.log(`[SERVER] Sender ${sender.id} socket readyState:`, sender.socket.readyState);
        console.log(`[SERVER] Partner ${partner.id} socket readyState:`, partner.socket.readyState);

        // Designate lower ID as initiator (creates the offer)
        const isSenderInitiator = sender.id < partner.id;

        // Notify both users about the match
        const senderMessage = JSON.stringify({
            protocol: 'partner-found',
            payload: { partnerId: partner.id.toString(), isInitiator: isSenderInitiator }
        });
        const partnerMessage = JSON.stringify({
            protocol: 'partner-found',
            payload: { partnerId: sender.id.toString(), isInitiator: !isSenderInitiator }
        });

        console.log(`[SERVER] Sending partner-found to sender ${sender.id}:`, senderMessage);
        sender.socket.send(senderMessage);

        console.log(`[SERVER] Sending partner-found to partner ${partner.id}:`, partnerMessage);
        partner.socket.send(partnerMessage);

        console.log(`[SERVER] Both users notified of match`);
    } else {
        // Add to waiting list
        waitingUsers.set(sender.id.toString(), sender);
        console.log(`[SERVER] Client ${sender.id} added to waiting list`);
        console.log(`[SERVER] Waiting users now:`, Array.from(waitingUsers.keys()));

        sender.socket.send(JSON.stringify({
            protocol: 'waiting',
            payload: { message: 'Waiting for a partner...' }
        }));
    }
}

function forwardToPartner(fromId: string, toId: string, protocol: string, payload: any) {
    console.log(`[SERVER] Forwarding ${protocol} from ${fromId} to ${toId}`);
    const toClient = sono.clients[toId];
    if (toClient && toClient.socket.readyState === WebSocket.OPEN) {
        const message = JSON.stringify({
            protocol: protocol,
            payload: { ...payload, from: fromId }
        });
        console.log(`[SERVER] Sending to client ${toId}:`, message.substring(0, 200));
        toClient.socket.send(message);
    } else {
        console.log(`[SERVER] Cannot forward - client ${toId} not found or socket not open`);
    }
}

function disconnectFromPartner(sender: Client) {
    console.log(`[SERVER] disconnectFromPartner called for client ${sender.id}`);
    const partnerId = partnerMap.get(sender.id.toString());
    if (partnerId) {
        const partner = sono.clients[partnerId];
        if (partner && partner.socket.readyState === WebSocket.OPEN) {
            partner.socket.send(JSON.stringify({
                protocol: 'partner-disconnected',
                payload: {}
            }));
        }
        partnerMap.delete(partnerId);
        partnerMap.delete(sender.id.toString());
    }
    waitingUsers.delete(sender.id.toString());
}

// Override the default message handler to handle custom protocols
const originalHandleWs = sono.handleWs.bind(sono);
sono.handleWs = function(socket: WebSocket) {
    console.log('[SERVER] handleWs called, socket readyState:', socket.readyState);

    // Call original handler
    originalHandleWs(socket);

    // Get the client that was just added
    const clientId = sono.lastClientId.toString();
    const client = sono.clients[clientId];

    console.log(`[SERVER] New client created with id: ${clientId}`);
    console.log(`[SERVER] All clients:`, Object.keys(sono.clients));

    if (client) {
        // Add custom message handler
        socket.addEventListener("message", (event) => {
            const message = event.data;
            try {
                const data = JSON.parse(message);
                console.log(`[SERVER] Raw message from client ${clientId}:`, data);

                // Handle our custom protocols
                if (['find-partner', 'video-offer', 'video-answer', 'ice-candidate', 'next-partner', 'stop-chat'].includes(data.protocol)) {
                    handleCustomMessage(data, client);
                }
            } catch (e) {
                console.log(`[SERVER] Parse error:`, e);
            }
        });

        // Handle disconnect
        socket.addEventListener("close", () => {
            console.log(`[SERVER] Client ${clientId} disconnected`);
            disconnectFromPartner(client);
        });

        console.log(`[SERVER] Message handlers attached to client ${clientId}`);
    }
};

// Serve static files
const staticFiles = new Map<string, string>();

async function loadStaticFiles() {
    const decoder = new TextDecoder();
    const basePath = new URL('.', import.meta.url).pathname;

    const files = [
        { path: 'static/index.html', contentType: 'text/html' },
        { path: 'static/style.css', contentType: 'text/css' },
        { path: 'static/script.js', contentType: 'application/javascript' }
    ];

    for (const file of files) {
        const content = decoder.decode(await Deno.readFile(`${basePath}${file.path}`));
        staticFiles.set(`/${file.path}`, content);
    }
}

await loadStaticFiles();

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);

    // Handle WebSocket connections
    if (url.pathname === '/ws') {
        console.log('[SERVER] WebSocket connection request');
        return sono.connect(req);
    }

    // Serve sonoClient.js from src directory
    if (url.pathname === '/src/sonoClient.js') {
        const basePath = new URL('../../src/', import.meta.url).pathname;
        const content = await Deno.readFile(`${basePath}sonoClient.js`);
        return new Response(content, {
            headers: { 'Content-Type': 'application/javascript' }
        });
    }

    // Serve static files
    if (staticFiles.has(url.pathname)) {
        const contentType = url.pathname.endsWith('.html') ? 'text/html' :
                           url.pathname.endsWith('.css') ? 'text/css' :
                           'application/javascript';

        return new Response(staticFiles.get(url.pathname), {
            headers: { 'Content-Type': contentType }
        });
    }

    // Default to index.html
    return new Response(staticFiles.get('/static/index.html'), {
        headers: { 'Content-Type': 'text/html' }
    });
});

console.log('Omegle Clone running on http://localhost:8000');