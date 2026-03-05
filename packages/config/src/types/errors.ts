import { Data } from "effect";

class ConfigNotFound extends Data.TaggedError("ConfigNotFound")<{
  readonly searchPath: string;
  readonly message: string;
}> {}

class ConfigImportFailed extends Data.TaggedError("ConfigImportFailed")<{
  readonly path: string;
  readonly message: string;
}> {}

class ConfigDecodeFailed extends Data.TaggedError("ConfigDecodeFailed")<{
  readonly issues: ReadonlyArray<unknown>;
  readonly message: string;
}> {}

class VaultPathInvalid extends Data.TaggedError("VaultPathInvalid")<{
  readonly vaultId: string;
  readonly path: string;
  readonly message: string;
}> {}

class VaultIdNotFound extends Data.TaggedError("VaultIdNotFound")<{
  readonly vaultId: string;
  readonly message: string;
}> {}

type ConfigError =
  | ConfigNotFound
  | ConfigImportFailed
  | ConfigDecodeFailed
  | VaultPathInvalid
  | VaultIdNotFound;

export {
  ConfigNotFound,
  ConfigImportFailed,
  ConfigDecodeFailed,
  VaultPathInvalid,
  VaultIdNotFound,
  type ConfigError,
};
