// src/http_writer.ts

import { Socket } from 'net';
import { pipeline } from 'stream/promises';
import { HTTPResponse } from './types';
import { STATUS_CODES } from 'http';

// Writes an HTTP response to the socket.
export async function writeHttpResponse(socket: Socket, response: HTTPResponse) {
    // Set default headers
    if (!response.headers.has('date')) {
        response.headers.set('date', new Date().toUTCString());
    }
    if (!response.headers.has('connection')) {
        response.headers.set('connection', 'keep-alive');
    }

    const headerLines: string[] = [];
    // Status line
    const statusMessage = response.statusMessage || STATUS_CODES[response.statusCode] || 'Unknown Status';
    headerLines.push(`HTTP/1.1 ${response.statusCode} ${statusMessage}`);

    // Headers
    for (const [key, value] of response.headers.entries()) {
        headerLines.push(`${key}: ${value}`);
    }

    const headerString = headerLines.join('\r\n') + '\r\n\r\n';
    
    // Write headers synchronously
    socket.write(headerString);
    
    // Pipe the body stream to the socket
    await pipeline(response.body, socket, { end: false });

    // Clean up response resources if a close method is provided
    if (response.close) {
        await response.close();
    }
}