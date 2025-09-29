export function toId(input) {
  return (
    String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "inconnu"
  );
}
