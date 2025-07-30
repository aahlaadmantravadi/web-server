document.addEventListener('DOMContentLoaded', () => {
    // --- HTTP POST Echo Logic ---
    const postInput = document.getElementById('post-input');
    const postButton = document.getElementById('post-button');
    const postResponse = document.getElementById('post-response');

    postButton.addEventListener('click', async () => {
        const data = postInput.value;
        postResponse.textContent = 'Sending...';
        try {
            const response = await fetch('/echo', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: data
            });
            const responseData = await response.text();
            postResponse.textContent = responseData;
        } catch (error) {
            postResponse.textContent = `Error: ${error.message}`;
        }
    });

    // --- WebSocket Echo Logic ---
    const wsConnectButton = document.getElementById('ws-connect-button');
    const wsControls = document.getElementById('ws-controls');
    const wsInput = document.getElementById('ws-input');
    const wsSendButton = document.getElementById('ws-send-button');
    const wsLog = document.getElementById('ws-log');
    
    let websocket = null;

    const log = (message, type) => {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
        wsLog.appendChild(entry);
        wsLog.scrollTop = wsLog.scrollHeight; // Auto-scroll
    };

    wsConnectButton.addEventListener('click', () => {
        if (websocket) { // If connected, disconnect
            websocket.close();
        } else { // If disconnected, connect
            const wsUrl = `ws://${window.location.host}/echo`;
            websocket = new WebSocket(wsUrl);

            websocket.onopen = () => {
                log('Connected to WebSocket server.', 'status');
                wsConnectButton.textContent = 'Disconnect';
                wsControls.classList.remove('hidden');
            };

            websocket.onmessage = (event) => {
                log(`[Received]: ${event.data}`, 'received');
            };

            websocket.onclose = () => {
                log('Disconnected from WebSocket server.', 'status');
                wsConnectButton.textContent = 'Connect';
                wsControls.classList.add('hidden');
                websocket = null;
            };

            websocket.onerror = (error) => {
                log('WebSocket error.', 'status');
                console.error('WebSocket Error:', error);
            };
        }
    });

    wsSendButton.addEventListener('click', () => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            const message = wsInput.value;
            if (message) {
                websocket.send(message);
                log(`[Sent]: ${message}`, 'sent');
                wsInput.value = '';
            }
        }
    });

    wsInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            wsSendButton.click();
        }
    });
});