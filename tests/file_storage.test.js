const { Ed25519KeyIdentity } = require("@dfinity/identity");
const fs = require("fs");
const path = require("path");
const mime = require("mime");

const { AssetManager } = require("../dist/index.js");

// Identities
let motoko_identity = Ed25519KeyIdentity.generate();

// Change Me
const file_storage_canister_id = "dqerg-34aaa-aaaaa-qaapq-cai";
let asset_manager;

beforeAll(() => {
  asset_manager = new AssetManager({
    actor_config: {
      canister_id: file_storage_canister_id,
      identity: motoko_identity,
      host: "http://127.0.0.1:8080/",
      is_prod: false,
    },
  });
});

test("AssetManager.version(): should return canister version number", async () => {
  const response = await asset_manager.version();
  expect(response).toEqual(4n);
});

test("AssetManager.store(): should store chunk data of video file to canister", async () => {
  const file_path = "tests/data/bots.mp4";
  const asset_buffer = fs.readFileSync(file_path);
  const asset_unit8Array = new Uint8Array(asset_buffer);
  const asset_file_name = path.basename(file_path);
  const asset_content_type = mime.getType(file_path);

  const { ok: asset_id, err: error } = await asset_manager.store(
    asset_unit8Array,
    {
      filename: asset_file_name,
      content_type: asset_content_type,
    }
  );

  const { ok: asset } = await asset_manager.getAsset(asset_id);

  expect(asset.filename).toEqual("bots.mp4");
  expect(asset.content_type).toEqual("video/mp4");
  expect(asset.content_size).toEqual(14272571n);
}, 20000);

test("AssetManager.store(): should call progress callback with increasing values", async () => {
  const file_path = "tests/data/bots.mp4";
  const asset_buffer = fs.readFileSync(file_path);
  const asset_unit8Array = new Uint8Array(asset_buffer);
  const asset_file_name = path.basename(file_path);
  const asset_content_type = mime.getType(file_path);

  const progress_received = [];

  await asset_manager.store(
    asset_unit8Array,
    {
      filename: asset_file_name,
      content_type: asset_content_type,
    },
    (progress) => {
      if (progress_received.length == 0) {
        expect(progress).toEqual(0);
      } else {
        expect(progress).toBeGreaterThan(progress_received[progress_received.length - 1]);
      }

      progress_received.push(progress);
    }
  );

  expect(progress_received[progress_received.length - 1]).toEqual(1);
}, 20000);

test("AssetManager.getAllAssets(): should return all assets without file content data since it would be too large", async () => {
  const asset_list = await asset_manager.getAllAssets();
  const hasAssets = asset_list.length > 0;
  expect(hasAssets).toBeTruthy();
});

test("AssetManager.store() with retry logic: should fail to store chunk data of image file to canister", async () => {
  const file_path = "tests/data/unicorn.jpeg";
  const asset_buffer = fs.readFileSync(file_path);
  const asset_unit8Array = new Uint8Array(asset_buffer);
  const asset_file_name = path.basename(file_path);
  const asset_content_type = mime.getType(file_path);

  const originalUploadChunk = asset_manager.uploadChunk;
  const failingChunkIndex = 1;
  asset_manager.uploadChunk = async function ({ chunk, order, batchId }) {
    if (order === failingChunkIndex) {
      throw new Error("Simulated upload failure");
    }
    return originalUploadChunk.call(this, { chunk, order, batchId });
  };

  await expect(
    asset_manager.store(asset_unit8Array, {
      filename: asset_file_name,
      content_type: asset_content_type,
    })
  ).rejects.toThrow("Simulated upload failure");

  asset_manager.uploadChunk = originalUploadChunk;

  const asset_list = await asset_manager.getAllAssets();
  const fileExists = asset_list.some(
    (asset) => asset.filename === asset_file_name
  );
  expect(fileExists).toBeFalsy();
});

test("AssetManager.store() with retry logic: should store chunk data of image file to canister", async () => {
  const file_path = "tests/data/pixels.jpeg";
  const asset_buffer = fs.readFileSync(file_path);
  const asset_unit8Array = new Uint8Array(asset_buffer);
  const asset_file_name = path.basename(file_path);
  const asset_content_type = mime.getType(file_path);

  const originalUploadChunk = asset_manager.uploadChunk;
  const failingChunkIndex = 1;
  const allowedRetries = 2;
  let retryCount = 0;
  asset_manager.uploadChunk = async function ({ chunk, order, batchId }) {
    if (order === failingChunkIndex && retryCount < allowedRetries) {
      retryCount++;
      throw new Error("Simulated upload failure");
    }
    return originalUploadChunk.call(this, { chunk, order, batchId });
  };

  const { ok: asset_id } = await asset_manager.store(asset_unit8Array, {
    filename: asset_file_name,
    content_type: asset_content_type,
  });

  asset_manager.uploadChunk = originalUploadChunk;

  const { ok: asset } = await asset_manager.getAsset(asset_id);

  expect(asset.filename).toEqual("pixels.jpeg");
  expect(asset.content_type).toEqual("image/jpeg");
  expect(asset.content_size).toEqual(4236788n);
}, 25000);
