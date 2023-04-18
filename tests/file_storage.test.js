const { Ed25519KeyIdentity } = require("@dfinity/identity");
const { AssetManager } = require("../dist/index.js");

// Identities
let motoko_identity = Ed25519KeyIdentity.generate();

const file_storage_canister_id = "tfuft-aqaaa-aaaaa-aaaoq-cai";

let asset_manager = {};

describe("Setup Actors", () => {
  beforeAll(async () => {
    console.log("=========== File Storage ===========");
    asset_manager = new AssetManager({
      actor_config: {
        canister_id: file_storage_canister_id,
        identity: motoko_identity,
        host: "http://127.0.0.1:8080/",
        is_prod: false,
      },
    });
  });

  // Test the getCanisterVersion method
  test("AssetManager.getCanisterVersion(): should return version number", async () => {
    // const response = await asset_manager.getCanisterVersion();
    // expect(response).toEqual(1n);
  });
});
