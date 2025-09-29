FROM node:20-alpine
WORKDIR /app
# 1) Manifests + scripts nécessaires au postinstall
COPY package*.json ./
COPY scripts ./scripts

# 2) Installe les deps (postinstall pourra s'exécuter car scripts/ est présent)
RUN npm ci --omit=dev
# ⬇️ on copie les données dans un dossier seed (PAS /app/data)
COPY data ./seed-data
COPY . .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# ⬇️ lance un script de start qui seed si /app/data est vide
CMD ["node","scripts/start.js"]
