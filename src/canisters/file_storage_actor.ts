import { Actor, HttpAgent, Identity } from "@dfinity/agent";
import { FileStorage } from "./file_storage_idl";
import { idlFactory } from "./file_storage_idl";

interface Config {
  is_prod: boolean;
  canister_id: string;
  identity: Identity;
  host: string;
}

/**
 * Create a file storage canister actor
 * @param config Configuration to make calls to the Replica.
 * @param config.is_prod
 * @param config.canister_id
 * @param config.identity
 * @param config.host
 */
export function get_canister(config: Config) {
  const { is_prod, canister_id, identity, host } = config;

  if (canister_id === undefined) {
    console.log("canister_id: ", canister_id);

    return null;
  }

  if (identity === undefined) {
    console.log("identity:", identity);

    return null;
  }

  const agent = new HttpAgent({
    host: host,
    identity: identity,
  });

  if (is_prod == false) {
    agent.fetchRootKey().catch((err) => {
      console.error(err);
    });
  }

  const actor = Actor.createActor<FileStorage>(idlFactory, {
    agent: agent,
    canisterId: canister_id,
  });

  return actor;
}
