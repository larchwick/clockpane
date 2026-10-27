// Small Firefox Remote Debugging Protocol client for the e2e test. Messages are "length:json".
import { connect } from 'node:net';

export class Rdp {
  /** @param {import('node:net').Socket} sock */
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    /** @type {Array<{ match: (m: any) => boolean, resolve: (m: any) => void }>} */
    this.waiters = [];
    /** @type {any[]} */
    this.backlog = [];
    sock.on('data', (d) => this.onData(d));
  }

  /** @param {number} port */
  static async open(port) {
    for (let i = 0; i < 100; i++) {
      try {
        const sock = await new Promise((res, rej) => {
          const s = connect(port, '127.0.0.1');
          s.once('connect', () => res(s));
          s.once('error', rej);
        });
        const rdp = new Rdp(sock);
        await rdp.wait((m) => m.from === 'root' && m.applicationType);
        return rdp;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    throw new Error('Firefox debugger server did not start');
  }

  /** @param {Buffer} d */
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const colon = this.buf.indexOf(':');
      if (colon < 0) return;
      const len = Number(this.buf.subarray(0, colon).toString());
      if (this.buf.length < colon + 1 + len) return;
      const msg = JSON.parse(this.buf.subarray(colon + 1, colon + 1 + len).toString());
      this.buf = this.buf.subarray(colon + 1 + len);
      const i = this.waiters.findIndex((w) => w.match(msg));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(msg);
      else this.backlog.push(msg);
    }
  }

  /** @param {(m: any) => boolean} match @param {number} [timeout] */
  wait(match, timeout = 15000) {
    const i = this.backlog.findIndex(match);
    if (i >= 0) return Promise.resolve(this.backlog.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('RDP timeout')), timeout);
      this.waiters.push({ match, resolve: (m) => { clearTimeout(t); resolve(m); } });
    });
  }

  /** Sends a request and waits for the first reply from that actor. */
  async request(to, type, params = {}) {
    const s = JSON.stringify({ to, type, ...params });
    // Replies carry no "type" field. Events (tabListChanged, evaluationResult) do.
    const reply = this.wait((m) => m.from === to && !('type' in m));
    this.sock.write(`${Buffer.byteLength(s)}:${s}`);
    const m = await reply;
    if (m.error) throw new Error(`${type}: ${m.error} ${m.message ?? ''}`);
    return m;
  }

  /** Installs an unpacked add-on as a temporary add-on, like web-ext run. */
  async installTemporaryAddon(path) {
    const root = await this.request('root', 'getRoot');
    return (await this.request(root.addonsActor, 'installTemporaryAddon', { addonPath: path })).addon;
  }

  /** Console actor of the tab showing a URL that starts with prefix. */
  async consoleFor(prefix) {
    for (let i = 0; i < 100; i++) {
      const { tabs } = await this.request('root', 'listTabs');
      const tab = tabs.find((t) => String(t.url).startsWith(prefix));
      if (tab) {
        const { frame } = await this.request(tab.actor, 'getTarget');
        return frame.consoleActor;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`no tab for ${prefix}`);
  }

  /** Evaluates one expression in the page and returns its value (strings and plain values only). */
  async evalOnce(consoleActor, text) {
    const { resultID } = await this.request(consoleActor, 'evaluateJSAsync', { text });
    const res = await this.wait((m) => m.type === 'evaluationResult' && m.resultID === resultID, 30000);
    if (res.exceptionMessage) throw new Error(res.exceptionMessage);
    const r = res.result;
    if (r && typeof r === 'object' && r.type === 'longString') throw new Error('result too long');
    return r && typeof r === 'object' && r.type === 'undefined' ? undefined : r;
  }

  /** Runs a promise-returning expression in the page, polls until it settles, returns its value. */
  async evaluate(consoleActor, text) {
    await this.evalOnce(consoleActor, `void (window.__e2e = undefined, Promise.resolve(${text}).then((v) => { window.__e2e = JSON.stringify({ ok: v ?? null }); }, (e) => { window.__e2e = JSON.stringify({ err: String(e) }); }))`);
    for (let i = 0; i < 300; i++) {
      const raw = await this.evalOnce(consoleActor, 'window.__e2e');
      if (typeof raw === 'string') {
        const out = JSON.parse(raw);
        if ('err' in out) throw new Error(out.err);
        return out.ok;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('page evaluation did not finish');
  }

  close() {
    this.sock.end();
  }
}
