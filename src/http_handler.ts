// src/http_handler.ts

import * as net from 'net';
import { Readable } from 'stream';
import { HTTPRequest, HTTPResponse, WSApplication } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream, Stats } from 'fs';
import { createGzip } from 'zlib';
import { handleWebSocketUpgrade } from './websocket';

// Main request handler (router)
export async function handleRequest(request: HTTPRequest): Promise<HTTPResponse> {
    console.log(`- Handling request: ${request.method} ${request.uri}`);

    try {
        if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
            return handleWebSocketUpgrade(request, request.body as net.Socket);
        }

        if (request.uri === '/' || request.uri === '/index.html') {
            return await serveStaticFile('/files/index.html');
        }

        if (request.uri.startsWith('/files/')) {
            return await serveStaticFile(request.uri);
        }
        
        // Gracefully handle favicon requests with a "No Content" response
        if (request.uri === '/favicon.ico') {
            return {
                statusCode: 204, statusMessage: 'No Content',
                headers: new Map(), body: Readable.from('')
            };
        }

        if (request.uri === '/echo' && request.method === 'POST') {
            return {
                statusCode: 200, statusMessage: 'OK',
                headers: new Map([
                    ['content-type', request.headers.get('content-type') || 'application/octet-stream'],
                    ['content-length', request.headers.get('content-length') || '0'],
                    ['connection', 'close']
                ]),
                body: request.body,
            };
        }

        // If no route matches, RETURN a 404 response object instead of throwing.
        return {
            statusCode: 404, statusMessage: 'Not Found',
            headers: new Map([['connection', 'close']]),
            body: Readable.from(`404 Not Found: ${request.uri}`)
        };
    } catch (e) {
        // Fallback for unexpected errors during file reads, etc.
        console.error("Error in handleRequest:", e);
        return {
            statusCode: 500, statusMessage: 'Internal Server Error',
            headers: new Map([['connection', 'close']]),
            body: Readable.from('500 Internal Server Error')
        };
    }
}

// Serves static files from a "public" directory
async function serveStaticFile(uri: string): Promise<HTTPResponse> {
    const fileRelativePath = uri.substring('/files/'.length);
    const safePath = path.normalize(fileRelativePath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), 'public', safePath);

    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
        // Return 404 if it's a directory or something else
        return {
            statusCode: 404, statusMessage: 'Not Found',
            headers: new Map([['connection', 'close']]),
            body: Readable.from(`404 Not Found: ${safePath}`)
        };
    }

    const headers = new Map<string, string>([
        ['content-type', getMimeType(filePath)],
        ['last-modified', stats.mtime.toUTCString()],
    ]);

    const bodyStream = createReadStream(filePath);
    let finalBody: Readable = bodyStream;

    // Note: Browser gzip negotiation is complex, simplifying for this example.
    // A real server would check request.headers.get('accept-encoding').
    headers.set('content-length', stats.size.toString());
    
    return {
        statusCode: 200, statusMessage: 'OK', headers, body: finalBody,
        close: async () => { if (!bodyStream.destroyed) bodyStream.destroy(); }
    };
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
        '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    };
    return mimeTypes[ext] || 'application/octet-stream';
}