import { Sono } from '../../mod.ts';

const sono = new Sono();

// Store waiting users for random matching
const waitingUsers: Set<string> = new Set();

// Handle WebRTC signaling for video chat
sono.on('video-offer', (event) => {
    const { targetId, offer } = event.data;
    sono.send(targetId, 'video-offer', { offer, fromId: event.senderId });
});

sono.on('video-answer', (event) => {
    const { targetId, answer } = event.data;
    sono.send(targetId, 'video-answer', { answer, fromId: event.senderId });
});

sono.on('ice-candidate', (event) => {
    const { targetId, candidate } = event.data;
    sono.send(targetId, 'ice-candidate', { candidate, fromId: event.senderId });
});

// Handle "next" button to find new partner
sono.on('find-partner', (event) => {
    const userId = event.senderId;
    
    // Remove from waiting if already waiting
    waitingUsers.delete(userId);
    
    // If there's someone waiting, connect them
    if (waitingUsers.size > 0) {
        const partnerId = waitingUsers.values().next().value;
        waitingUsers.delete(partnerId);
        
        // Notify both users about the match
        sono.send(userId, 'partner-found', { partnerId });
        sono.send(partnerId, 'partner-found', { partnerId: userId });
    } else {
        // Add to waiting list
        waitingUsers.add(userId);
        sono.send(userId, 'waiting', { message: 'Waiting for a partner...' });
    }
});

// Handle disconnect
sono.on('disconnect', (event) => {
    const userId = event.senderId;
    waitingUsers.delete(userId);
    
    // Notify partner if exists
    if (event.partnerId) {
        sono.send(event.partnerId, 'partner-disconnected', {});
    }
});

// Serve static files
const staticFiles = new Map<string, string>();

async function loadStaticFiles() {
    const decoder = new TextDecoder();
    
    const files = [
        { path: '/static/index.html', contentType: 'text/html' },
        { path: '/static/style.css', contentType: 'text/css' },
        { path: '/static/script.js', contentType: 'application/javascript' }
    ];
    
    for (const file of files) {
        const content = decoder.decode(await Deno.readFile(new URL(file.path, import.meta.url)));
        staticFiles.set(file.path, content);
    }
}

await loadStaticFiles();

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    
    // Handle WebSocket connections
    if (url.pathname === '/ws') {
        return sono.connect(req);
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