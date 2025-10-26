const http = require('http');
const Module = require('module');

const args = parseArgs(process.argv.slice(2));
const normalizedRemote = normalizeRemoteEndpoint({
  protocol: args['remote-protocol'],
  host: args['remote-host'],
  port: args['remote-port'],
  basePath: args['remote-base-path']
});

const options = {
  remoteProtocol: normalizedRemote.protocol,
  remoteHost: normalizedRemote.host,
  remotePort: normalizedRemote.port,
  remoteBasePath: normalizedRemote.basePath,
  remoteApiKey: args['remote-api-key'] || '',
  localHost: args['local-host'] || '127.0.0.1',
  localPort: Number(args['local-port'] || 18000),
  openaiBasePath: args['openai-base-path'] || '/v1',
  model: args.model || 'gpt-oss:20b',
  prompt: args.prompt || 'Sag Hallo und nenne den Host.',
  systemPrompt: args['system-prompt'] || 'Du bist ein Test',
  verbose: Boolean(args.verbose),
  timeout: Number(args.timeout || 30000)
};

const vscodeStub = createVSCodeStub();
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.apply(this, arguments);
};

const { ProxyManager } = require('../out/proxyServer');
const { ProxyLogService } = require('../out/logService');

(async () => {
  const output = {
    appendLine: (line) => console.log(line)
  };

  const manager = new ProxyManager(output, new ProxyLogService());
  const config = createConfig({
    'remote.protocol': options.remoteProtocol,
    'remote.host': options.remoteHost,
    'remote.port': options.remotePort,
    'remote.basePath': options.remoteBasePath,
    'remote.apiKey': options.remoteApiKey,
    'server.host': options.localHost,
    'server.port': options.localPort,
    'openai.basePath': options.openaiBasePath
  });

  await manager.startFromConfiguration(config);

  try {
    await hitModels();
    await hitChatCompletion();
    await hitRaw();
    console.log('✅ Proxy smoke test completed without errors.');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exitCode = 1;
  } finally {
    await manager.stopServer();
  }
})();

function createVSCodeStub() {
  class SimpleEventEmitter {
    constructor() {
      this.listeners = new Set();
      this.event = (listener) => {
        this.listeners.add(listener);
        return {
          dispose: () => this.listeners.delete(listener)
        };
      };
    }

    fire(value) {
      for (const listener of this.listeners) {
        try {
          listener(value);
        } catch (error) {
          console.error('Listener error', error);
        }
      }
    }

    dispose() {
      this.listeners.clear();
    }
  }

  return {
    EventEmitter: SimpleEventEmitter
  };
}

function createConfig(values) {
  return {
    get(key, defaultValue) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        return values[key];
      }
      return defaultValue;
    }
  };
}

async function hitModels() {
  const response = await fetchJson(`http://${options.localHost}:${options.localPort}${options.openaiBasePath}/models`);
  console.log('Models response:', response.data?.length ?? 0);
}

async function hitChatCompletion() {
  const payload = {
    model: options.model,
    messages: [
      { role: 'system', content: options.systemPrompt },
      { role: 'user', content: options.prompt }
    ],
    stream: false
  };

  const response = await fetchJson(
    `http://${options.localHost}:${options.localPort}${options.openaiBasePath}/chat/completions`,
    payload
  );
  console.log('Chat completion:', response.choices?.[0]?.message?.content);
}

async function hitRaw() {
  const response = await fetchJson(`http://${options.localHost}:${options.localPort}/api/tags`);
  console.log('Raw /api/tags:', response.models?.length ?? 0);
}

function fetchJson(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: body ? 'POST' : 'GET',
      headers: body
        ? {
            'Content-Type': 'application/json'
          }
        : {}
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (options.verbose) {
          console.log(`↩️  ${parsed.pathname} -> ${res.statusCode}`);
          console.log(text);
        }
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${text}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    let entry = argv[i];
    if (!entry.startsWith('--')) {
      continue;
    }

    entry = entry.slice(2);

    if (entry.includes('=')) {
      const [key, ...rest] = entry.split('=');
      result[key] = rest.join('=');
      continue;
    }

    const key = entry;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i++;
    } else {
      result[key] = true;
    }
  }

  return result;
}

function normalizeRemoteEndpoint(input) {
  const defaults = {
    protocol: 'http',
    host: '45.11.228.163',
    port: 11434,
    basePath: '/'
  };

  if (input.host && input.host.includes('://')) {
    try {
      const parsed = new URL(input.host);
      return {
        protocol: (parsed.protocol || defaults.protocol).replace(':', '') || defaults.protocol,
        host: parsed.hostname || defaults.host,
        port: ensurePort(parsed.port || input.port, defaults.port),
        basePath: normalizeBasePath(
          parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : input.basePath || defaults.basePath
        )
      };
    } catch (error) {
      console.warn(`Could not parse remote host "${input.host}", falling back to defaults.`, error);
    }
  }

  return {
    protocol: (input.protocol || defaults.protocol).replace(':', '') || defaults.protocol,
    host: input.host || defaults.host,
    port: ensurePort(input.port, defaults.port),
    basePath: normalizeBasePath(input.basePath || defaults.basePath)
  };
}

function ensurePort(value, fallback) {
  const num = Number(value);
  if (Number.isInteger(num) && num > 0 && num <= 65535) {
    return num;
  }
  return fallback;
}

function normalizeBasePath(path) {
  if (!path) {
    return '/';
  }
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}
