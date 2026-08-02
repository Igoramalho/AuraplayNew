import { z } from "zod";

const optionalUrl = z.union([z.literal(""), z.url()]).optional();

const envSchema = z.object({
  SUPABASE_URL: z.url("SUPABASE_URL deve ser uma URL válida."),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY é obrigatória."),
  SYNC_SECRET: z.string().min(16, "SYNC_SECRET deve possuir ao menos 16 caracteres."),
  ANILIST_GRAPHQL_URL: z.url().default("https://graphql.anilist.co"),
  JIKAN_BASE_URL: z.url().default("https://api.jikan.moe/v4"),
  EPISODE_PROVIDER: z.string().optional(),
  EPISODE_PROVIDERS: z.string().optional(),
  EPISODE_PROVIDER_BASE_URL: optionalUrl,
  EPISODE_PROVIDER_API_KEY: z.string().optional(),
  EPISODE_PROVIDER_USERNAME: z.string().optional(),
  EPISODE_PROVIDER_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type AppEnv = z.infer<typeof envSchema>;

let parsedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!parsedEnv) {
    parsedEnv = envSchema.parse(process.env);
  }

  return parsedEnv;
}
