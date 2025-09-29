// Gestion d'erreurs générique (JSON)
export function errorHandler(err, req, res, next) {
  const code = err.status || 500;
  res
    .status(code)
    .json({ error: true, message: err.message || "Erreur interne" });
}
