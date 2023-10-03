import { get_canister } from "./canisters/file_storage_actor";
import CRC32 from "crc-32";
import { Buffer } from "buffer";

interface ActorConfig {
  is_prod: any;
  canister_id: any;
  identity: any;
  host: any;
}

interface AssetManagerConfig {
  actor_config: ActorConfig;
}

interface StoreOptions {
  content_type: string;
  filename: string;
}

interface CommitOptions {
  chunk_ids: number[];
  checksum: number;
  content_type?: string;
  filename?: string;
}

type ProgressCallback = (progress: number) => void;

export class AssetManager {
  private _actor: any;

  constructor(config: AssetManagerConfig) {
    const { actor_config } = config;

    this._actor = get_canister(actor_config);
  }

  async store(
    file: Uint8Array,
    { content_type, filename }: StoreOptions,
    callback: ProgressCallback
  ): Promise<object> {
    callback(0);

    this.validateFile(file);

    const chunkSize = 2000000;
    const { promises, checksum } = this.createUploadPromises(file, chunkSize, callback);

    const chunk_ids = await Promise.all(promises);

    return await this.commit({
      chunk_ids,
      checksum,
      content_type,
      filename,
    });
  }

  validateFile(file: Uint8Array): void {
    if (file === undefined) {
      throw new Error("file is required");
    }

    if (!(file instanceof Uint8Array)) {
      throw new Error("file must be a Uint8Array");
    }
  }

  async uploadChunk({
    chunk,
    order,
  }: {
    chunk: Uint8Array;
    order: number;
  }): Promise<any> {
    return this._actor.create_chunk(chunk, order);
  }

  async uploadChunkWithRetry({
    chunk,
    order,
    retries = 3,
    delay = 1000,
  }: {
    chunk: Uint8Array;
    order: number;
    retries?: number;
    delay?: number;
  }): Promise<any> {
    try {
      return await this.uploadChunk({ chunk, order });
    } catch (error) {
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.uploadChunkWithRetry({
          chunk,
          order,
          retries: retries - 1,
          delay,
        });
      } else {
        console.log(`Failed to upload chunk ${order} after multiple retries`);
        throw error;
      }
    }
  }

  updateChecksum(chunk: Uint8Array, checksum: number): number {
    const moduloValue = 400000000;

    const signedChecksum = CRC32.buf(Buffer.from(chunk), 0);
    const unsignedChecksum = signedChecksum >>> 0;
    const updatedChecksum = (checksum + unsignedChecksum) % moduloValue;

    return updatedChecksum;
  }

  createUploadPromises(
    file: Uint8Array,
    chunkSize: number,
    callback: ProgressCallback
  ): { promises: Promise<any>[]; checksum: number } {
    const promises = [];
    let checksum = 0;

    const totalToStore = file.length;
    var totalStored = 0;

    for (
      let start = 0, index = 0;
      start < file.length;
      start += chunkSize, index++
    ) {
      const chunk = file.slice(start, start + chunkSize);
      checksum = this.updateChecksum(chunk, checksum);

      promises.push(
        this.uploadChunkWithRetry({
          chunk,
          order: index,
        }).then((promise: Promise<any>) => {
          totalStored += chunkSize;
          totalStored = Math.min(totalStored, totalToStore);
          callback(totalStored / totalToStore);
          return promise;
        }
        )
      );
    }

    return { promises, checksum };
  }

  async commit({
    chunk_ids,
    checksum,
    content_type = "application/octet-stream",
    filename = "file",
  }: CommitOptions): Promise<object> {
    if (chunk_ids.length < 1) {
      throw new Error("chunk_ids is required");
    }

    const response = await this._actor.commit_batch(chunk_ids, {
      filename,
      checksum: checksum,
      content_encoding: { Identity: null },
      content_type,
    });

    return response;
  }

  async getAllAssets(): Promise<any[]> {
    return this._actor.get_all_assets();
  }

  async getAsset(id: string): Promise<object> {
    return this._actor.get(id);
  }

  async getHealth(): Promise<object> {
    return this._actor.get_health();
  }

  async deleteAsset(id: string): Promise<object> {
    return this._actor.delete_asset(id);
  }

  async chunksSize(): Promise<number> {
    return this._actor.chunks_size();
  }

  async version(): Promise<string> {
    return this._actor.version();
  }
}
