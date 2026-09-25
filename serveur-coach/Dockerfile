# Le serveur du Coach Vethos. Construit depuis la RACINE du dépôt :
#   docker build -f serveur-coach/Dockerfile -t vethos-coach .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.node.json ./
COPY src/shared ./src/shared
COPY serveur-coach ./serveur-coach
RUN npx esbuild serveur-coach/src/serveur.ts --bundle --platform=node --target=node20 --format=cjs \
      --tsconfig=tsconfig.node.json --outfile=serveur-coach/dist/serveur.js

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/serveur-coach/dist/serveur.js ./serveur.js
USER node
ENV PORT=8787
EXPOSE 8787
CMD ["node", "serveur.js"]
