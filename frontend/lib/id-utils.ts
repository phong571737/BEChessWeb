/** Base64-encode a gameID for safe URL use */
export function encodeGameID(id: string): string {
  return btoa(id).replace(/=/g, "");
}

/** Decode a base64-encoded gameID from URL */
export function decodeGameID(hash: string): string {
  const padded = hash + "==".slice(0, (4 - (hash.length % 4)) % 4);
  return atob(padded);
}
