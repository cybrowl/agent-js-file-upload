import { get_canister } from "./canisters/file_storage_actor";
import CRC32 from "crc-32";
import { v4 as uuidv4 } from "uuid";
import { Buffer } from "node:buffer";

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
  batch_id: string;
  checksum: number;
  content_type?: string;
  filename?: string;
}

export class AssetManager {
  private _actor: any;

  constructor(config: AssetManagerConfig) {
    const { actor_config } = config;

    this._actor = get_canister(actor_config);
  }

  async store(
    file: Uint8Array,
    { content_type, filename }: StoreOptions
  ): Promise<object> {
    this.validateFile(file);

    const batch_id = this.generateBatchId();
    const chunkSize = 2000000;
    const { promises, checksum } = this.createUploadPromises(
      file,
      chunkSize,
      batch_id
    );

    const chunk_ids = await Promise.all(promises);

    return await this.commit({
      batch_id,
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

  generateBatchId(): string {
    return uuidv4();
  }

  async uploadChunk({
    chunk,
    order,
    batchId,
  }: {
    chunk: Uint8Array;
    order: number;
    batchId: string;
  }): Promise<any> {
    return this._actor.create_chunk(batchId, chunk, order);
  }

  async uploadChunkWithRetry({
    chunk,
    order,
    batchId,
    retries = 3,
    delay = 1000,
  }: {
    chunk: Uint8Array;
    order: number;
    batchId: string;
    retries?: number;
    delay?: number;
  }): Promise<any> {
    try {
      return await this.uploadChunk({ chunk, order, batchId });
    } catch (error) {
      if (retries > 0) {
        console.log(
          `Retrying upload for chunk ${order} (${retries} retries remaining)`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.uploadChunkWithRetry({
          chunk,
          order,
          batchId,
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
    batchId: string
  ): { promises: Promise<any>[]; checksum: number } {
    const promises = [];
    let checksum = 0;

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
          batchId,
        })
      );
    }

    return { promises, checksum };
  }

  async commit({
    batch_id,
    checksum,
    content_type = "application/octet-stream",
    filename = "file",
  }: CommitOptions): Promise<object> {
    if (batch_id === "") {
      throw new Error("batch_id is required");
    }

    const response = await this._actor.commit_batch(batch_id, {
      filename,
      checksum: checksum,
      content_encoding: { Identity: null },
      content_type,
    });

    return response;
  }

  async listFiles(): Promise<any[]> {
    return this._actor.assets_list();
  }

  async getFile(key: string): Promise<object> {
    return this._actor.get(key);
  }

  async getTotalChunksSize(): Promise<number> {
    return this._actor.chunks_size();
  }

  async getCanisterVersion(): Promise<string> {
    return this._actor.version();
  }
}
