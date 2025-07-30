// src/http_handler.ts

import * as net from 'net';
import { Readable } from 'stream';
import { HTTPRequest, HTTPResponse } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createReadStream } from 'fs';
import { handleWebSocketUpgrade } from './websocket';

export async function handleRequest(request: HTTPRequest): Promise<HTTPResponse> {
    console.log(`> ${request.method} ${request.uri}`);

    // WebSocket upgrade is a special protocol switch, handle it first.
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        return handleWebSocketUpgrade(request, request.socket as net.Socket);
    }
    
    // API endpoint for POST echo
    if (request.uri === '/echo' && request.method === 'POST') {
        return {
            statusCode: 200, statusMessage: 'OK',
            headers: new Map([
                ['content-type', request.headers.get('content-type') || 'application/octet-stream'],
                ['content-length', request.headers.get('content-length') || '0'],
                ['connection', 'close'],
            ]),
            body: request.body,
        };
    }

    // For any other GET request, we will try to serve a file from the 'public' directory.
    // This is the correct, robust way to handle static assets.
    if (request.method === 'GET') {
        // Route the root URI to index.html
        const requestedPath = request.uri === '/' ? '/index.html' : request.uri;
        return await serveStaticFile(requestedPath);
    }
    
    // If no route matches (e.g., a POST to a non-existent URL), return a 404.
    return {
        statusCode: 404, statusMessage: 'Not Found',
        headers: new Map([['connection', 'close']]),
        body: Readable.from(`404 Not Found: ${request.uri}`),
    };
}

async function serveStaticFile(uri: string): Promise<HTTPResponse> {
    // Security: Prevent accessing files outside of the 'public' directory.
    const safePath = path.normalize(uri).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(process.cwd(), 'public', safePath);

    try {
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) throw new Error("Not a file");

        return {
            statusCode: 200, statusMessage: 'OK',
            headers: new Map([
                ['content-type', getMimeType(filePath)],
                ['content-length', stats.size.toString()],
            ]),
            body: createReadStream(filePath),
        };
    } catch (e) {
        // If the file doesn't exist or isn't a file, this is a 404.
        return {
            statusCode: 404, statusMessage: 'Not Found',
            headers: new Map([['connection', 'close']]),
            body: Readable.from(`404 Not Found: ${safePath}`),
        };
    }
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript'
    };
    return mimeTypes[ext as keyof typeof mimeTypes] || 'application/octet-stream';
} 