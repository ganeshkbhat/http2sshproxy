const crypto = require('crypto');
const { createSshServer } = require('../../hssh');

const SSH_BACKEND_PORT = 8022;
const SHARED_CREDENTIALS = 'ssh-secret-token';

// Generate dummy RSA host key for standalone execution
const { privateKey: dummyHostKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// 1. Define SSH Request Handler (Executes command sent in body)
const sshRequestHandler = async (reqPayload) => {
  console.log(`[SSH Backend Server B] Handled Request: ${reqPayload.method} ${reqPayload.url}`);

  const requestBody = typeof reqPayload.body === 'string'
    ? JSON.parse(reqPayload.body)
    : (reqPayload.body || {});

  const command = requestBody.command || 'echo "No command supplied"';
  console.log(`[SSH Backend Server B] Executing Command: "${command}"`);

  // Simulate command execution output
  let stdoutResult = '';
  if (command.startsWith('uname')) {
    stdoutResult = 'Linux ssh-backend-node-b 5.15.0-generic x86_64\n';
  } else if (command.startsWith('uptime')) {
    stdoutResult = ' 20:25:01 up 12 days,  4:10,  1 user,  load average: 0.08, 0.03, 0.01\n';
  } else if (command.startsWith('ls')) {
    stdoutResult = 'bin  etc  home  lib  opt  usr  var\n';
  } else {
    stdoutResult = `[Executed Command]: ${command}\n[Exit Code]: 0\n`;
  }

  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      status: 'success',
      executedCommand: command,
      output: stdoutResult,
      executedAt: new Date().toISOString()
    })
  };
};

// 2. Define Authentication Validator
const authValidator = async (incomingCreds, configuredCreds) => {
  return incomingCreds === configuredCreds;
};

// 3. Start Standalone SSH Target Server B
const sshBackendServer = createSshServer(
  {
    port: SSH_BACKEND_PORT,
    credentials: SHARED_CREDENTIALS,
    hostKey: dummyHostKey
  },
  sshRequestHandler,
  authValidator
);

console.log('================================================================');
console.log(`  SSH Target Backend Server B running on port ${SSH_BACKEND_PORT}`);
console.log('================================================================');

process.on('SIGINT', () => {
  console.log('\nShutting down SSH Target Backend Server B...');
  sshBackendServer.close();
  process.exit(0);
});