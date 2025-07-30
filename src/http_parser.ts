// src/http_parser.ts

import { Readable } from 'stream';
import { HTTPError, HTTPRequest } from './types';

const K_MAX_HEADER_LEN = 8 * 1024; // 8KB

// Parses the raw buffer from a TCP socket to extract an HTTP request.
export function parseHttpRequest(buffer: Buffer): { request: HTTPRequest; remaining: Buffer } {
    const headerEndIndex = buffer.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
        if (buffer.length > K_MAX_HEADER_LEN) {
            throw new HTTPError(413, 'Header is too large');
        }
        // Not enough data yet, need to wait for more.
        throw new Error('Incomplete HTTP header');
    }

    const headerData = buffer.subarray(0, headerEndIndex);
    const bodyData = buffer.subarray(headerEndIndex + 4);

    const lines = headerData.toString('latin1').split('\r\n');
    const requestLine = lines[0];
    const [method, uri, version] = parseRequestLine(requestLine);

    const headers = new Map<string, string>();
    for (let i = 1; i < lines.length; i++) {
        const [key, value] = parseHeader(lines[i]);
        headers.set(key, value);
    }

    if (version !== 'HTTP/1.1' && version !== 'HTTP/1.0') {
        throw new HTTPError(505, 'HTTP Version Not Supported');
    }

    const contentLengthStr = headers.get('content-length');
    const transferEncoding = headers.get('transfer-encoding');

    let body: Readable;

    if (transferEncoding === 'chunked') {
        body = createChunkedBodyStream(bodyData);
    } else if (contentLengthStr) {
        const contentLength = parseInt(contentLengthStr, 10);
        if (isNaN(contentLength) || contentLength < 0) {
            throw new HTTPError(400, 'Invalid Content-Length');
        }
        body = createLengthDelimitedBodyStream(bodyData, contentLength);
    } else {
        // No body
        body = Readable.from([]);
    }
    
    // We only create the body stream here. The caller (connection handler)
    // is responsible for piping the rest of the socket data into it.
    // The `remaining` buffer is the first part of the body.
    const request: HTTPRequest = { method, uri, version, headers, body };
    return { request, remaining: bodyData };
}

function parseRequestLine(line: string): [string, string, string] {
    const parts = line.split(' ');
    if (parts.length !== 3) {
        throw new HTTPError(400, 'Malformed request line');
    }
    const [method, uri, version] = parts;
    return [method.toUpperCase(), uri, version.toUpperCase()];
}

function parseHeader(line: string): [string, string] {
    // THIS IS THE CORRECTED LINE:
    const index = line.indexOf(':');
    if (index === -1) {
        throw new HTTPError(400, 'Malformed header');
    }
    const key = line.substring(0, index).trim().toLowerCase();
    const value = line.substring(index + 1).trim();
    return [key, value];
}

// The following are simplified stream implementations for demonstration.
// A real-world server would need more robust stream handling.

function createChunkedBodyStream(initialData: Buffer): Readable {
    // A proper implementation would parse the chunked encoding format.
    // For simplicity, we'll assume the body is not chunked in this example.
    // Implementing a full chunked decoder stream is complex.
    console.warn('Chunked transfer encoding not fully supported in this parser.');
    return Readable.from(initialData);
}

function createLengthDelimitedBodyStream(initialData: Buffer, totalLength: number): Readable {
    // This stream expects a certain number of bytes.
    let remainingLength = totalLength;
    const stream = new Readable({
        read() {}
    });

    const push = (data: Buffer) => {
        const toPush = data.subarray(0, remainingLength);
        stream.push(toPush);
        remainingLength -= toPush.length;
        if (remainingLength <= 0) {
            stream.push(null); // End of stream
        }
        return data.subarray(toPush.length); // Return leftover data
    };

    // Push initial data and update remaining length.
    const leftover = push(initialData);
    if (leftover.length > 0) {
        // This shouldn't happen if the connection handler is correct.
        console.error("Excess data in length-delimited stream constructor.");
    }
    
    // The connection handler will pipe socket data into this stream's `push` method.
    // This is a simplified pattern.
    return stream;
}