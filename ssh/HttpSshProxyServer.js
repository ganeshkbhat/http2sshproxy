const { createSshClient } = require('../../hssh');
const { createHttpServer, sendHttpRequest } = require('../../httpm');

const SSH_BACKEND_PORT = 8022;
const HTTP_PROXY_PORT = 9018;
const SHARED_CREDENTIALS = 'ssh-secret-token';

async function startReverseProxyGateway() {
  console.log('================================================================');
  console.log('  HTTP Reverse Proxy Gateway Server (Forwarding to SSH Server B)');
  console.log('================================================================\n');

  // 1. Initialize SSH Client pointing to SSH Server B
  const sshProxyClient = createSshClient({
    port: SSH_BACKEND_PORT,
    username: 'root',
    credentials: SHARED_CREDENTIALS
  });

  // 2. Bridge incoming HTTP requests to SSH command payload executions
  const sshProxyHandler = async (httpRequestDetails) => {
    console.log(`[HTTP Server B Proxy] Forwarding ${httpRequestDetails.method} ${httpRequestDetails.url} -> SSH Server B:${SSH_BACKEND_PORT}`);

    const sshResponse = await sshProxyClient.sendHttpRequestPayload(httpRequestDetails);

    return {
      protocolClient: sshProxyClient,
      response: sshResponse
    };
  };

  // 3. Start HTTP Reverse Proxy Gateway Server B
  const httpServer = createHttpServer(
    { httpPort: HTTP_PROXY_PORT },
    sshProxyHandler
  );

  console.log(`[HTTP Server B Proxy] Active and listening on http://127.0.0.1:${HTTP_PROXY_PORT}`);

  // Wait brief duration for server bindings
  await new Promise((resolve) => setTimeout(resolve, 500));

  // 4. Test execution representing HTTP Client A
  console.log('\n--- Initiating Request from HTTP Client A to HTTP Server B Proxy ---');
  try {
    const response = await sendHttpRequest({
      targetUrl: `http://127.0.0.1:${HTTP_PROXY_PORT}/api/v1/ssh/exec`,
      method: 'POST',
      body: {
        command: 'uname -a'
      }
    });

    console.log('\n[HTTP Client A] Received Response Status:', response.statusCode);
    console.log('[HTTP Client A] Received Response Body:\n', JSON.stringify(response.body, null, 2));
  } catch (err) {
    console.error('[HTTP Client A] Reverse Proxy Request Failed:', err.message);
  }

  process.on('SIGINT', () => {
    console.log('\nShutting down HTTP Reverse Proxy Gateway Server B...');
    httpServer.server.close();
    process.exit(0);
  });
}

startReverseProxyGateway();