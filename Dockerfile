# EVERYONE HAS A SECRET — image de production (serveur + client compilé)
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=3001 EHAS_DB=/app/data/ehas.sqlite
EXPOSE 3001
# Les comptes, personnages, amis et l'historique vivent ici : montez un volume pour les conserver
VOLUME ["/app/data"]
CMD ["npm", "start"]
