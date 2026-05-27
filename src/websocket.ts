import { IncomingMessage, Server } from 'http';
import type { RequestHandler } from 'express';
import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
const clients = new Map<WebSocket, Set<string>>();

export function initWebSocket(server: Server, sessionMiddleware?: RequestHandler): void {
    wss = new WebSocketServer({ noServer: true });

    // Authenticate the upgrade using the shared session middleware: only clients
    // with a valid logged-in session may open a WebSocket. Without it, anyone
    // could subscribe to arbitrary tournament channels and read live data.
    server.on('upgrade', (req, socket, head) => {
        if (!req.url || !req.url.startsWith('/ws')) return;
        const accept = () => wss!.handleUpgrade(req, socket, head, ws => wss!.emit('connection', ws, req));
        const reject = () => {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
        };
        if (!sessionMiddleware) return accept();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sessionMiddleware(req as any, {} as any, () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userId = (req as any).session?.passport?.user;
            if (userId) accept();
            else reject();
        });
    });

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
        clients.set(ws, new Set());

        ws.on('message', data => {
            try {
                const msg = JSON.parse(data.toString()) as { type: string; channel: string };
                if (msg.type === 'subscribe' && msg.channel) {
                    clients.get(ws)?.add(msg.channel);
                }
                if (msg.type === 'unsubscribe' && msg.channel) {
                    clients.get(ws)?.delete(msg.channel);
                }
            } catch {}
        });

        ws.on('close', () => clients.delete(ws));
    });
}

export function publishToChannel(channel: string, payload: unknown): void {
    if (!wss) return;
    const message = JSON.stringify({ channel, payload });
    for (const [ws, channels] of clients) {
        if (channels.has(channel) && ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    }
}
