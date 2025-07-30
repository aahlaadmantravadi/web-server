// src/server.ts

import * as net from 'net';
import { HTTPRequest } from './types';
import { parseHttpRequest } from './http_parser';
import { writeHttpResponse } from './http_writer';
import { handleRequest } from './http_handler';
import { Readable } from 'stream';

const PORT = 1234;
const HOST = '127.0.0.1';

const server = net.createServer(handleConnection);

server.listen(PORT, HOST, () => {
    console.log(`Server listening on ${HOST}:${PORT}`);
    console.log("Control Panel ready at: http://127.0.0.1:1234/");
    console.log("To stop the server, press Ctrl+C");
});

const connections = new Set<net.Socket>();
server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => connections.delete(socket));
});

const gracefulShutdown = () => {
    console.log('\nReceived SIGINT. Shutting down gracefully...');
    for (const socket of connections) socket.destroy();
    server.close(() => {
        console.log('Server is closed. Exiting.');
        process.exit(0);
    });
};
process.on('SIGINT', gracefulShutdown);

function handleConnection(socket: net.Socket) {
    let buffer = Buffer.alloc(0);

    const onData = async (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        
        while (true) {
            const headerEndIndex = buffer.indexOf('\r\n\r\n');
            if (headerEndIndex === -1) break;

            const headerData = buffer.subarray(0, headerEndIndex + 4);
            const { request } = parseHttpRequest(headerData);
            request.socket = socket; // Pass the raw socket for WebSocket upgrades

            const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
            const totalRequestLength = headerData.length + contentLength;

            if (buffer.length < totalRequestLength) break;
            
            const bodyData = buffer.subarray(headerData.length, totalRequestLength);
            buffer = buffer.subarray(totalRequestLength);

            request.body = Readable.from(bodyData);

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
            if (buffer.length === 0) break;
        }
    };

    socket.on('data', onData);
    socket.on('error', (err) => console.error('Socket error:', err.message));
    socket.on('end', () => console.log('Connection closed.'));
}