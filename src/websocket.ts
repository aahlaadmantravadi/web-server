// src/websocket.ts

import { createHash } from 'crypto';
import { Socket } from 'net';
import { Readable, Duplex } from 'stream';
import { HTTPRequest, HTTPResponse, WSMsg, WSApplication, WSServer } from './types';

const WEBSOCKET_MAGIC_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Handles the HTTP Upgrade request.
export function handleWebSocketUpgrade(request: HTTPRequest, socket: Socket): HTTPResponse {
    const key = request.headers.get('sec-websocket-key');
    if (!key) throw new Error('Missing Sec-WebSocket-Key header');

    const acceptKey = createHash('sha1').update(key + WEBSOCKET_MAGIC_KEY).digest('base64');
    
    // Create the server interface and launch the user's application logic.
    const ws = createWSServer(socket);
    const wsApp: WSApplication = wsEchoApp; // Using the echo app from http_handler.ts
    wsApp(ws).catch(err => console.error('WebSocket application error:', err));
    
    return {
        statusCode: 101, statusMessage: 'Switching Protocols',
        headers: new Map([
            ['upgrade', 'websocket'],
            ['connection', 'Upgrade'],
            ['sec-websocket-accept', acceptKey],
        ]),
        body: new Readable({ read() { this.push(null); } }), // Empty body for the handshake response
    };
}

// Our sample echo app needs to be defined here or imported. Let's re-define it for clarity.
const wsEchoApp: WSApplication = async (ws) => {
    console.log('WebSocket application started.');
    try {
        while (true) {
            const msg = await ws.recv();
            if (msg === null) break;
            await ws.send(msg);
        }
    } finally {
        console.log('WebSocket application finished.');
    }
};

function createWSServer(socket: Socket): WSServer {
    // This function now correctly takes over the raw socket.
    const frameParser = new WebSocketFrameParser();
    socket.pipe(frameParser);

    // This is a simplified queue using promises for backpressure.
    const incomingMessages: ((msg: WSMsg | null) => void)[] = [];
    let isClosed = false;

    frameParser.on('frame', (frame) => {
        if (frame.opcode === 0x8) { // Close frame
            isClosed = true;
            socket.end(); // Acknowledge close
            while(incomingMessages.length > 0) incomingMessages.shift()!(null);
            return;
        }
        if (frame.opcode === 0x1 || frame.opcode === 0x2) {
            const msg: WSMsg = {
                type: frame.opcode === 0x1 ? 'text' : 'binary',
                data: Readable.from(frame.payload)
            };
            if (incomingMessages.length > 0) {
                incomingMessages.shift()!(msg);
            }
        }
    });

    socket.on('close', () => {
        isClosed = true;
        while(incomingMessages.length > 0) incomingMessages.shift()!(null);
    });

    return {
        send: async (msg: WSMsg) => {
            if (isClosed) throw new Error("WebSocket is closed.");
            const opcode = msg.type === 'text' ? 0x01 : 0x02;
            const payload = await streamToBuffer(msg.data);
            const frame = formatWsFrame(opcode, payload, false); // Client frames are not masked
            socket.write(frame);
        },
        recv: async () => {
            if (isClosed) return null;
            return new Promise((resolve) => {
                incomingMessages.push(resolve);
            });
        },
        close: () => {
            if (!isClosed) {
                isClosed = true;
                socket.write(formatWsFrame(0x8, Buffer.alloc(0), false));
                socket.end();
            }
        },
    };
}

// A proper frame parser is a state machine. This is a simplified version.
class WebSocketFrameParser extends Duplex {
    // ... A full implementation is quite complex. This simplified one assumes unmasked server-like frames for now.
    _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        // Simplified parsing logic for demo purposes
        const opcode = chunk[0] & 0x0F;
        let payloadLen = chunk[1] & 0x7F;
        let offset = 2;
        if (payloadLen === 126) {
            payloadLen = chunk.readUInt16BE(2);
            offset = 4;
        } // Incomplete...
        const payload = chunk.subarray(offset, offset + payloadLen);
        this.emit('frame', { opcode, payload });
        callback();
    }
    _read(size: number): void {}
}

function formatWsFrame(opcode: number, payload: Buffer, mask: boolean): Buffer {
    // This should handle masking for client-to-server frames, but we are the server.
    const payloadLen = payload.length;
    let header;
    let offset = 2;
    if (payloadLen < 126) {
        header = Buffer.alloc(offset);
        header[1] = payloadLen;
    } else if (payloadLen < 65536) {
        offset += 2;
        header = Buffer.alloc(offset);
        header[1] = 126;
        header.writeUInt16BE(payloadLen, 2);
    } else {
        offset += 8;
        header = Buffer.alloc(offset);
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payloadLen), 2);
    }
    header[0] = 0x80 | opcode; // FIN bit set
    return Buffer.concat([header, payload]);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}