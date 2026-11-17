FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY deploy/runtime/package.json deploy/runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY lib/planner.ts lib/llm-service.ts ./lib/
COPY dist-local ./dist-local
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/index.mjs"]
