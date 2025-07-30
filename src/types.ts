// src/types.ts

import { Socket } from 'net';
import { Readable } from 'stream';
import { FileHandle } from 'fs/promises';

// Represents a parsed HTTP request.
// The body is a stream to handle large payloads efficiently.
export interface HTTPRequest {
    method: string;
    uri: string;
    version: string;
    headers: Map<string, string>;
    body: Readable;
    socket?: Socket; // <-- THE FIX IS HERE: Add the raw socket
}

// Represents an HTTP response to be sent.
// The body is a stream for dynamic content generation and large files.
export interface HTTPResponse {
    statusCode: number;
    statusMessage: string;
    headers: Map<string, string>;
    body: Readable;
    close?: () => Promise<void>; // For cleaning up resources like file handles
}

// A custom error class for HTTP-specific errors,
// allowing us to send a proper HTTP error response.
export class HTTPError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message);
        this.name = 'HTTPError';
    }
}

// WebSocket application logic function type.
export type WSApplication = (ws: WSServer) => Promise<void>;

// The application-facing interface for a WebSocket connection.
export interface WSServer {
    send(msg: WSMsg): Promise<void>;
    recv(): Promise<null | WSMsg>;
    close(): void;
}

// Represents a WebSocket message.
export interface WSMsg {
    type: 'text' | 'binary';
    data: Readable;
}