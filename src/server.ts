// src/server.ts

import * as net from 'net';
import { HTTPError, HTTPRequest } from './types';
import { parseHttpRequest } from './http_parser';
import { writeHttpResponse } from './http_writer';
import { handleRequest } from './http_handler';
import { Readable } from 'stream';

const PORT = 1234;
const HOST = '127.0.0.1';
const K_MAX_HEADER_LEN = 8 * 1024; // 8KB

const server = net.createServer(handleConnection);

server.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
    console.log("Control Panel ready at: http://127.0.0.1:1234/");
    console.log("To stop the server, press Ctrl+C");
});

// --- Graceful Shutdown ---
const connections = new Set<net.Socket>();
server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
});

const gracefulShutdown = () => {
    console.log('\nReceived SIGINT. Shutting down gracefully...');
    for (const socket of connections) {
        socket.destroy(); // Forcefully destroy sockets
    }
    server.close(() => {
        console.log('Server is closed. Exiting.');
        process.exit(0);
    });
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// --- Connection Handling ---
function handleConnection(socket: net.Socket) {
    console.log(`\nNew connection from ${socket.remoteAddress}:${socket.remotePort}`);
    let buffer = Buffer.alloc(0);

    const onData = async (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);

        // This loop handles HTTP Keep-Alive and Pipelining
        while (true) {
            const headerEndIndex = buffer.indexOf('\r\n\r\n');
            if (headerEndIndex === -1) {
                if (buffer.length > K_MAX_HEADER_LEN) {
                    socket.end('HTTP/1.1 413 Header Too Large\r\n\r\n');
                }
                break;
            }

            const requestData = buffer.subarray(0, headerEndIndex + 4);
            const bodyAndNextRequestData = buffer.subarray(headerEndIndex + 4);

            let request: HTTPRequest;
            try {
                // Parse the headers to determine body length
                const parsed = parseHttpRequest(requestData);
                request = parsed.request;
                const contentLength = parseInt(request.headers.get('content-length') || '0', 10);

                // Check if we have the full body yet
                if (bodyAndNextRequestData.length < contentLength) {
                    break; // Wait for more data
                }

                // We have the full request, so we can process it.
                const bodyData = bodyAndNextRequestData.subarray(0, contentLength);
                buffer = bodyAndNextRequestData.subarray(contentLength); // The rest is the next request

                const bodyStream = Readable.from(bodyData);
                request.body = bodyStream;

                // Process the request and send the response
                const response = await handleRequest(request);
                await writeHttpResponse(socket, response);
                
                if (response.statusCode === 101) {
                    socket.removeListener('data', onData);
                    return;
                }
                
                if (response.headers.get('connection')?.toLowerCase() === 'close') {
                    socket.end();
                    return;
                }
                
                if (buffer.length === 0) {
                    break;
                }

            } catch (e) {
                // This catch block now only handles true unexpected errors,
                // because the handler returns 404 objects instead of throwing.
                console.error('Unhandled processing error:', e);
                socket.end();
                return;
            }
        }
    };

    socket.on('data', onData);
    socket.on('error', (err) => {
        console.error(`Socket error for ${socket.remoteAddress}:`, err.message);
        socket.destroy();
    });
    socket.on('end', () => console.log(`Connection closed by ${socket.remoteAddress}.`));
}