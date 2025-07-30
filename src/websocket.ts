// src/websocket.ts

import { createHash } from 'crypto';
import { Socket } from 'net';
import { Readable, Duplex } from 'stream';
import { HTTPRequest, HTTPResponse, WSMsg, WSApplication, WSServer } from './types';

const WEBSOCKET_MAGIC_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// This function is called by the http_handler to upgrade the connection.
export function handleWebSocketUpgrade(request: HTTPRequest, socket: Socket): HTTPResponse {
    const key = request.headers.get('sec-websocket-key');
    if (!key) {
        throw new Error('handleWebSocketUpgrade called without Sec-WebSocket-Key header');
    }

    const acceptKey = createHash('sha1').update(key + WEBSOCKET_MAGIC_KEY).digest('base64');
    
    // Create the WSServer instance which will take over the socket.
    const ws = createWSServer(socket);
    
    // Launch the user's application logic (the echo app).
    const wsApp: WSApplication = wsEchoApp;
    wsApp(ws).catch(err => console.error('WebSocket application error:', err));
    
    return {
        statusCode: 101, statusMessage: 'Switching Protocols',
        headers: new Map([
            ['upgrade', 'websocket'],
            ['connection', 'Upgrade'],
            ['sec-websocket-accept', acceptKey],
        ]),
        body: new Readable({ read() { this.push(null); } }), // The handshake response has no body.
    };
}

// Our sample echo app.
const wsEchoApp: WSApplication = async (ws) => {
    console.log('WebSocket application started.');
    try {
        while (true) {
            const msg = await ws.recv();
            if (msg === null) break; // Client closed the connection
            console.log('Echoing message back to client.');
            await ws.send(msg); // Echo the message
        }
    } catch (e) {
        console.error('Error in WebSocket app:', e);
    } finally {
        console.log('WebSocket application finished.');
    }
};

function createWSServer(socket: Socket): WSServer {
    const frameParser = new WebSocketFrameParser();
    socket.pipe(frameParser);

    const pendingMessages: WSMsg[] = [];
    let waitingResolver: ((msg: WSMsg | null) => void) | null = null;
    let isClosed = false;

    frameParser.on('frame', (frame) => {
        const msg: WSMsg = {
            type: frame.opcode === 0x1 ? 'text' : 'binary',
            data: Readable.from(frame.payload)
        };
        if (waitingResolver) {
            waitingResolver(msg);
            waitingResolver = null;
        } else {
            pendingMessages.push(msg);
        }
    });

    const handleClose = () => {
        if (isClosed) return;
        isClosed = true;
        if (waitingResolver) {
            waitingResolver(null);
            waitingResolver = null;
        }
        socket.end();
    };

    socket.on('close', handleClose);
    socket.on('error', handleClose);

    return {
        send: async (msg: WSMsg) => {
            if (isClosed) throw new Error("WebSocket is closed.");
            const opcode = msg.type === 'text' ? 0x01 : 0x02;
            const payload = await streamToBuffer(msg.data);
            const frame = formatFrame(opcode, payload);
            socket.write(frame);
        },
        recv: async () => {
            if (pendingMessages.length > 0) {
                return pendingMessages.shift()!;
            }
            if (isClosed) return null;
            return new Promise((resolve) => {
                waitingResolver = resolve;
            });
        },
        close: () => {
            if (!isClosed) {
                socket.write(formatFrame(0x8, Buffer.alloc(0))); // Send close frame
                handleClose();
            }
        },
    };
}

// Correctly formats a server-to-client WebSocket frame.
function formatFrame(opcode: number, payload: Buffer): Buffer {
    const payloadLen = payload.length;
    let header;
    let offset = 2;

    if (payloadLen <= 125) {
        header = Buffer.alloc(offset);
        header[1] = payloadLen; // MASK bit is 0
    } else if (payloadLen <= 65535) {
        offset += 2;
        header = Buffer.alloc(offset);
        header[1] = 126; // MASK bit is 0
        header.writeUInt16BE(payloadLen, 2);
    } else {
        offset += 8;
        header = Buffer.alloc(offset);
        header[1] = 127; // MASK bit is 0
        header.writeBigUInt64BE(BigInt(payloadLen), 2);
    }
    
    header[0] = 0x80 | opcode; // FIN bit is 1, RSV bits are 0
    return Buffer.concat([header, payload]);
}

// A stateful parser that correctly handles masked, client-to-server frames.
class WebSocketFrameParser extends Duplex {
    private buffer = Buffer.alloc(0);
    private waitingFor = 2; // Start by waiting for the first 2 bytes of the header

    _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.parse();
        callback();
    }

    parse() {
        while (this.buffer.length >= this.waitingFor) {
            if (this.waitingFor === 2) { // We have the first 2 bytes
                const byte1 = this.buffer[0];
                const byte2 = this.buffer[1];
                const fin = (byte1 & 0x80) === 0x80;
                const opcode = byte1 & 0x0F;
                const mask = (byte2 & 0x80) === 0x80;
                let payloadLen = byte2 & 0x7F;
                
                if (!mask) { // Client frames MUST be masked
                    this.destroy(new Error("Received unmasked frame from client."));
                    return;
                }

                if (payloadLen === 126) this.waitingFor = 2 + 2; // Wait for 16-bit length
                else if (payloadLen === 127) this.waitingFor = 2 + 8; // Wait for 64-bit length
                else this.waitingFor = 2 + 4 + payloadLen; // Wait for mask + payload
            } else { // We have the full header and potentially the payload
                let payloadLen = this.buffer[1] & 0x7F;
                let offset = 2;
                if (payloadLen === 126) {
                    payloadLen = this.buffer.readUInt16BE(2);
                    offset = 4;
                } else if (payloadLen === 127) {
                    payloadLen = Number(this.buffer.readBigUInt64BE(2));
                    offset = 10;
                }

                const totalFrameSize = offset + 4 + payloadLen;
                if (this.buffer.length < totalFrameSize) return; // Wait for full frame

                const frame = this.buffer.subarray(0, totalFrameSize);
                this.buffer = this.buffer.subarray(totalFrameSize);
                
                const maskingKey = frame.subarray(offset, offset + 4);
                const payload = frame.subarray(offset + 4);

                for (let i = 0; i < payload.length; i++) {
                    payload[i] ^= maskingKey[i % 4];
                }

                this.emit('frame', { opcode: this.buffer[0] & 0x0F, payload });
                this.waitingFor = 2; // Reset for the next frame
            }
        }
    }
    _read(size: number): void {}
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
}