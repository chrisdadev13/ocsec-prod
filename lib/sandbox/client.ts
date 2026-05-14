import "server-only";

import {
  SpritesClient,
  type ClientOptions,
  type SpriteConfig,
} from "@fly/sprites";

const DEFAULT_TIMEOUT_MS = 30_000;

function getSandboxToken() {
  const token = process.env.SPRITE_TOKEN;

  if (!token) {
    throw new Error("SPRITE_TOKEN is not configured");
  }

  return token;
}

function getSandboxClientOptions(): ClientOptions {
  const timeout = process.env.SPRITES_TIMEOUT_MS
    ? Number(process.env.SPRITES_TIMEOUT_MS)
    : undefined;

  return {
    baseURL: process.env.SPRITE_API_BASE_URL,
    timeout: Number.isFinite(timeout) && timeout && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

export function createSandboxClient() {
  return new SpritesClient(getSandboxToken(), getSandboxClientOptions());
}

export function getSandbox(name: string) {
  return createSandboxClient().sprite(name);
}

export async function createSandbox(name: string, config?: SpriteConfig) {
  return createSandboxClient().createSprite(name, config);
}

export async function ensureSandbox(name: string, config?: SpriteConfig) {
  const client = createSandboxClient();

  try {
    return await client.getSprite(name);
  } catch {
    return client.createSprite(name, config);
  }
}

export type { SpriteConfig };
