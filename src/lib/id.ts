export function makeId(_prefix = "id") {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ (Math.random() * 16) >> (Number(char) / 4)).toString(16)
  );
}

export function nowIso() {
  return new Date().toISOString();
}

export function localUserId() {
  return "local-user";
}
