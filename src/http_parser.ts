// src/http_parser.ts

import { Readable } from 'stream';
import { HTTPError, HTTPRequest } from './types';

// Parses only the header part of a request from a buffer
export function parseHttpRequest(requestData: Buffer): { request: HTTPRequest } {
    const headerEndIndex = requestData.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
        throw new Error('Incomplete HTTP header');
    }

    const headerData = requestData.subarray(0, headerEndIndex);
    const lines = headerData.toString('latin1').split('\r\n');
    const requestLine = lines[0];
    const [method, uri, version] = parseRequestLine(requestLine);

    const headers = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
        const [key, value] = parseHeader(lines[i]);
        headers.set(key, value);
    }
    
    // The body is just a placeholder here; the server will handle the actual stream.
    const request: HTTPRequest = { method, uri, version, headers, body: new Readable() };
    return { request };
}

function parseRequestLine(line: string): [string, string, string] {
    const parts = line.split(' ');
    if (parts.length !== 3) throw new HTTPError(400, 'Malformed request line');
    return [parts[0].toUpperCase(), parts[1], parts[2].toUpperCase()];
}

function parseHeader(line: string): [string, string] {
    const index = line.indexOf(':');
    if (index === -1) throw new HTTPError(400, 'Malformed header');
    const key = line.substring(0, index).trim().toLowerCase();
    const value = line.substring(index + 1).trim();
    return [key, value];
}