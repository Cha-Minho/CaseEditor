export function makeId(prefix = "id") {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function localUserId() {
  return "local-user";
}
