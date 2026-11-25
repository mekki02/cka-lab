import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { parse as parseCookies } from 'cookie';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { PassThrough, Writable } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { TOKEN_VERIFIER, type TokenVerifier } from '@cka/auth-kit';
import { COOKIE_ACCESS_TOKEN, LABS_TERMINAL_PATH, type TerminalServerMessage } from '@cka/contracts';
import { Env } from '../config/env';
import { KubeService } from '../kube/kube.service';
import { ANN, SHELL_CONTAINER, TOOLBOX_POD } from '../sessions/model';
import { SessionsService } from '../sessions/sessions.service';
import { originAllowed, parseClientMessage } from './protocol';

const MAX_TERMINALS_PER_USER = 4;

/** stdout for the exec stream that also tells client-node the terminal size. */
class ResizableOutput extends Writable {
  columns = 80;
  rows = 24;
  constructor(private readonly sink: (chunk: Buffer) => void) {
    super();
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.sink(chunk);
    cb();
  }
  resize(cols: number, rows: number): void {
    this.columns = cols;
    this.rows = rows;
    this.emit('resize');
  }
}

const reject = (socket: Duplex, status: number, text: string): void => {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};

/**
 * Browser terminal: a WebSocket bridged to `kubectl exec -it` into the
 * session's toolbox Pod (`shell` container).
 *
 * The handshake is authenticated like any API call (the access-token cookie,
 * verified with ms-identity's public keys) and Origin-checked. The user can
 * only reach their own session: the Pod is looked up from the token's user
 * id, never from anything in the request.
 */
@Injectable()
export class TerminalServer implements OnModuleDestroy {
  private readonly logger = new Logger(TerminalServer.name);
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  private readonly perUser = new Map<string, number>();

  constructor(
    private readonly env: Env,
    private readonly sessions: SessionsService,
    private readonly kube: KubeService,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== LABS_TERMINAL_PATH) return reject(socket, 404, 'Not Found');
      void this.handleUpgrade(req, socket, head).catch(err => {
        this.logger.error(`Terminal handshake failed: ${(err as Error).message}`);
        reject(socket, 500, 'Internal Server Error');
      });
    });
  }

  onModuleDestroy(): void {
    for (const c of this.wss.clients) c.close(1001, 'Server restarting');
    this.wss.close();
  }

  private async handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    if (!originAllowed(req.headers.origin, this.env.PUBLIC_URL)) return reject(socket, 403, 'Forbidden');
    const token = parseCookies(req.headers.cookie ?? '')[COOKIE_ACCESS_TOKEN];
    if (!token) return reject(socket, 401, 'Unauthorized');
    let userId: string;
    try {
      userId = (await this.verifier.verify(token)).id;
    } catch {
      return reject(socket, 401, 'Unauthorized');
    }
    if ((this.perUser.get(userId) ?? 0) >= MAX_TERMINALS_PER_USER) return reject(socket, 429, 'Too Many Requests');
    const ns = await this.sessions.findNamespace(userId);
    if (!ns || ns.metadata?.annotations?.[ANN.phase] !== 'Ready') return reject(socket, 409, 'Conflict');
    const namespace = ns.metadata!.name!;

    this.wss.handleUpgrade(req, socket, head, ws => this.bridge(ws, userId, namespace));
  }

  private bridge(ws: WebSocket, userId: string, namespace: string): void {
    this.perUser.set(userId, (this.perUser.get(userId) ?? 0) + 1);
    const control = (m: TerminalServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
    const stdin = new PassThrough();
    const stdout = new ResizableOutput(chunk => ws.readyState === ws.OPEN && ws.send(chunk, { binary: true }));
    let execSocket: { close: () => void } | undefined;
    let closed = false;

    const cleanup = (reason: string) => {
      if (closed) return;
      closed = true;
      this.perUser.set(userId, Math.max(0, (this.perUser.get(userId) ?? 1) - 1));
      stdin.end();
      execSocket?.close();
      control({ type: 'exit', reason });
      ws.close(1000, reason.slice(0, 120));
    };

    // Proxies (nginx, cloud load balancers) close idle connections; pings keep
    // a quiet terminal open and detect dead browsers.
    let alive = true;
    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 25_000);
    ws.on('pong', () => (alive = true));

    ws.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const msg = parseClientMessage(data.toString());
      if (!msg) return;
      if (msg.type === 'input') {
        stdin.write(msg.data);
        void this.sessions.touch(namespace);
      } else {
        stdout.resize(msg.cols, msg.rows);
      }
    });
    ws.on('close', () => {
      clearInterval(ping);
      cleanup('closed');
    });
    ws.on('error', () => cleanup('error'));

    this.kube
      .interactive(namespace, TOOLBOX_POD, SHELL_CONTAINER, ['start-shell'], stdout, stdin, () => cleanup('The shell exited'))
      .then(s => {
        execSocket = s;
        s.on('close', () => cleanup('The shell exited'));
        if (closed) s.close();
      })
      .catch(err => {
        control({ type: 'error', message: 'Could not open a shell in your lab environment' });
        this.logger.warn(`exec into ${namespace} failed: ${(err as Error).message}`);
        cleanup('exec failed');
      });
  }
}
