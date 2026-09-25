const { execSync } = require('child_process');

// Auto-install and load ssh2 dependency if missing
let ssh2;
try {
  ssh2 = require('ssh2');
} catch (err) {
  console.log('[Dependency Manager] "ssh2" module not found. Installing via npm...');
  try {
    execSync('npm install ssh2', { stdio: 'inherit' });
    ssh2 = require('ssh2');
    console.log('[Dependency Manager] Successfully installed "ssh2".');
  } catch (installErr) {
    console.error('[Dependency Manager] Fatal Error: Failed to install "ssh2" package via npm.');
    console.error(installErr.message);
    process.exit(1);
  }
}

const { Server, Client } = ssh2;

function createSshServer(config, requestHandler, authValidator) {
  const server = new Server(
    {
      hostKeys: [config.hostKey]
    },
    (client) => {
      let authenticated = false;

      client.on('authentication', async (ctx) => {
        let isValid = false;

        if (ctx.method === 'password') {
          isValid = await authValidator(ctx.password, config.credentials);
        } else if (ctx.method === 'publickey') {
          isValid = await authValidator(ctx.key, config.credentials);
        }

        if (isValid) {
          authenticated = true;
          return ctx.accept();
        }
        return ctx.reject(['password', 'publickey']);
      });

      client.on('ready', () => {
        client.on('session', (accept, reject) => {
          const session = accept();

          session.on('exec', async (accept, reject) => {
            if (!authenticated) {
              return reject();
            }

            const stream = accept();
            let rawData = '';

            stream.on('data', (chunk) => {
              rawData += chunk.toString('utf8');
            });

            stream.on('end', async () => {
              try {
                const reqPayload = JSON.parse(rawData);
                const responsePayload = await requestHandler(reqPayload);
                stream.write(JSON.stringify(responsePayload));
                stream.exit(0);
                stream.end();
              } catch (err) {
                const errorPayload = {
                  status: 500,
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ error: err.message })
                };
                stream.write(JSON.stringify(errorPayload));
                stream.exit(1);
                stream.end();
              }
            });
          });
        });
      });
    }
  );

  server.listen(config.port || 2222, config.host || '127.0.0.1', () => {
    console.log(`[SSH Server] Listening on ${config.host || '127.0.0.1'}:${config.port || 2222}`);
  });

  return server;
}

function createSshClient(config) {
  return {
    sendHttpRequestPayload: async (httpRequestDetails) => {
      return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on('ready', () => {
          conn.exec('rpc-exec', (err, stream) => {
            if (err) {
              conn.end();
              return reject(err);
            }

            let responseData = '';

            stream.on('data', (data) => {
              responseData += data.toString('utf8');
            });

            stream.stderr.on('data', (data) => {
              console.error('[SSH Client Stderr]:', data.toString('utf8'));
            });

            stream.on('close', () => {
              conn.end();
              try {
                const parsedResponse = JSON.parse(responseData);
                resolve(parsedResponse);
              } catch (parseErr) {
                reject(new Error(`Failed to parse SSH response: ${parseErr.message}`));
              }
            });

            stream.write(JSON.stringify(httpRequestDetails));
            stream.end();
          });
        });

        conn.on('error', (err) => {
          reject(err);
        });

        conn.connect({
          host: config.host || '127.0.0.1',
          port: config.port || 2222,
          username: config.username || 'root',
          password: config.password || config.credentials,
          privateKey: config.privateKey,
          readyTimeout: 10000
        });
      });
    },
    close: () => {}
  };
}

module.exports = {
  createSshServer,
  createSshClient
};