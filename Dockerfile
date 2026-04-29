FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN corepack pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["sh", "-c", "PORT=${PORT:-8080} corepack pnpm start"]
