function randomHexDigit() {
  return Math.floor(Math.random() * 16).toString(16);
}

export function createSyncId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();

  if (randomUuid) {
    return randomUuid;
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const value = Number.parseInt(randomHexDigit(), 16);
    const next = token === "x" ? value : (value & 0x3) | 0x8;
    return next.toString(16);
  });
}
