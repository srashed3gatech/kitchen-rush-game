// Tiny structured logger for Kitchen Rush server.
// DEBUG env-var: set DEBUG=kr* (or DEBUG=kr:anything) to enable debug logging.

const debugEnabled = (process.env.DEBUG ?? '').startsWith('kr');

function timestamp(): string {
  return new Date().toISOString();
}

export function info(msg: string, ...args: unknown[]): void {
  process.stderr.write(`[${timestamp()}] INFO  ${msg}${args.length ? ' ' + JSON.stringify(args) : ''}\n`);
}

export function warn(msg: string, ...args: unknown[]): void {
  process.stderr.write(`[${timestamp()}] WARN  ${msg}${args.length ? ' ' + JSON.stringify(args) : ''}\n`);
}

export function error(msg: string, ...args: unknown[]): void {
  process.stderr.write(`[${timestamp()}] ERROR ${msg}${args.length ? ' ' + JSON.stringify(args) : ''}\n`);
}

export function debug(msg: string, ...args: unknown[]): void {
  if (!debugEnabled) return;
  process.stderr.write(`[${timestamp()}] DEBUG ${msg}${args.length ? ' ' + JSON.stringify(args) : ''}\n`);
}
