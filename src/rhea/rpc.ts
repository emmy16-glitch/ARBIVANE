export interface NearViewResult<T = unknown> {
  blockHeight: string;
  value: T;
}
export type FetchLike = typeof fetch;

/** Read-only NEAR JSON-RPC adapter. No keys, wallet, or transaction methods. */
export class NearReadOnlyRpc {
  #nextId = 1;
  private readonly rpcUrl: string;
  private readonly fetcher: FetchLike;
  constructor(rpcUrl: string, fetcher: FetchLike = fetch) {
    this.rpcUrl = rpcUrl;
    this.fetcher = fetcher;
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("NEAR RPC must use HTTPS");
    }
  }

  /** Observe deployed contract identity at the same finalized block as protocol reads.
   * Never signs, changes state, or downloads potentially huge Wasm binaries.
   */
  async viewAccount(contractId: string, blockId?: number): Promise<{blockHeight: string; codeHash: string}> {
    if (!/^[a-z0-9._-]{2,64}$/.test(contractId)) throw new Error("invalid contract account ID");
    const params: Record<string, unknown> = {
      request_type: "view_account", account_id: contractId,
      ...(blockId === undefined ? {finality: "final"} : {block_id: blockId}),
    };
    const resp = await this.fetcher(this.rpcUrl, {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({jsonrpc: "2.0", id: this.#nextId++, method: "query", params}),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) throw new Error(`NEAR RPC HTTP ${resp.status}`);
    const envelope: unknown = await resp.json();
    if (!envelope || typeof envelope !== "object") throw new Error("invalid RPC response");
    const response = envelope as Record<string, unknown>;
    if (response.error !== undefined) throw new Error(`NEAR RPC account query returned an error`);
    const result = response.result;
    if (!result || typeof result !== "object") throw new Error("invalid NEAR account response");
    const account = result as Record<string, unknown>;
    if (typeof account.block_height !== "number" || !Number.isSafeInteger(account.block_height)) throw new Error("missing block height");
    if (blockId !== undefined && account.block_height !== blockId) throw new Error("inconsistent snapshot block");
    // NEAR's zero code hash is the base58 representation of a 32-byte zero digest.
    if (typeof account.code_hash !== "string" || account.code_hash.length < 32 || account.code_hash.length > 64 ||
        !/^[1-9A-HJ-NP-Za-km-z]+$/.test(account.code_hash) || account.code_hash === "11111111111111111111111111111111") {
      throw new Error("account has no valid deployed contract code hash");
    }
    return {blockHeight: String(account.block_height), codeHash: account.code_hash};
  }

  async view<T>(contractId: string, method: string, args: Record<string, unknown> = {}, blockId?: number): Promise<NearViewResult<T>> {
    if (!/^[a-z0-9._-]{2,64}$/.test(contractId) || !/^[a-z][a-z0-9_]*$/.test(method)) throw new Error("invalid contract or method");
    const encoded = new TextEncoder().encode(JSON.stringify(args));
    const base64 = btoa(Array.from(encoded, b => String.fromCharCode(b)).join(""));
    const params: Record<string, unknown> = {
      request_type: "call_function", account_id: contractId, method_name: method,
      args_base64: base64, ...(blockId === undefined ? { finality: "final" } : { block_id: blockId }),
    };
    const resp = await this.fetcher(this.rpcUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.#nextId++, method: "query", params }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) throw new Error(`NEAR RPC HTTP ${resp.status}`);
    const parsed: unknown = await resp.json();
    if (!parsed || typeof parsed !== "object") throw new Error("invalid RPC response");
    const envelope = parsed as Record<string, unknown>;
    if (envelope.error !== undefined) throw new Error("NEAR RPC returned an error");
    const result = envelope.result as Record<string, unknown> | undefined;
    if (!result || !Array.isArray(result.result) || !result.result.every(v => Number.isSafeInteger(v) && v >= 0 && v <= 255)) throw new Error("invalid NEAR view result bytes");
    if (typeof result.block_height !== "number" || !Number.isSafeInteger(result.block_height)) throw new Error("missing final block height");
    if (blockId !== undefined && result.block_height !== blockId) throw new Error("inconsistent snapshot block");
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(result.result));
    let value: T;
    try { value = JSON.parse(decoded) as T; } catch { throw new Error("invalid JSON from NEAR view call"); }
    return { blockHeight: String(result.block_height), value };
  }
}
