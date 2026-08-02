import type { ApiEndpoint } from "./core.ts";

const searchQueries = {
  description: "Concise keyword queries. Provide 2-3 diverse queries of roughly 3-6 words.",
  items: { maxLength: 200, minLength: 1, type: "string" },
  maxItems: 5,
  type: "array",
};

const fetchPolicy = {
  additionalProperties: false,
  properties: {
    disable_cache_fallback: { default: false, type: "boolean" },
    max_age_seconds: { minimum: 600, type: "integer" },
    timeout_seconds: { exclusiveMinimum: 0, type: "number" },
  },
  type: "object",
};

const excerptSettings = {
  additionalProperties: false,
  properties: {
    max_chars_per_result: { minimum: 1, type: "integer" },
  },
  type: "object",
};

const commonProperties = {
  advanced_settings: { type: "object" },
  client_model: {
    description: "Model generating the request and consuming the results.",
    minLength: 1,
    type: "string",
  },
  max_chars_total: {
    description: "Upper bound on total characters across excerpts.",
    minimum: 1,
    type: "integer",
  },
  objective: {
    description: "Self-contained natural-language goal used to focus results.",
    maxLength: 5000,
    minLength: 1,
    type: "string",
  },
  search_queries: searchQueries,
  session_id: {
    description: "Identifier reused across Search and Extract calls for one logical task.",
    maxLength: 1000,
    minLength: 1,
    type: "string",
  },
};

const searchSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description: "Request body accepted by `parallel-search search --body`.",
  properties: {
    ...commonProperties,
    advanced_settings: {
      additionalProperties: false,
      properties: {
        excerpt_settings: excerptSettings,
        fetch_policy: fetchPolicy,
        location: {
          description: "ISO 3166-1 alpha-2 country code.",
          pattern: "^[A-Za-z]{2}$",
          type: "string",
        },
        max_results: { maximum: 20, minimum: 1, type: "integer" },
        source_policy: {
          additionalProperties: false,
          description:
            "Use include_domains or exclude_domains, not both; at most 200 domains combined.",
          properties: {
            after_date: { format: "date", type: "string" },
            exclude_domains: {
              items: { minLength: 1, type: "string" },
              maxItems: 200,
              type: "array",
            },
            include_domains: {
              items: { minLength: 1, type: "string" },
              maxItems: 200,
              type: "array",
            },
          },
          type: "object",
        },
      },
      type: "object",
    },
    mode: { enum: ["turbo", "basic", "advanced"], type: "string" },
    search_queries: { ...searchQueries, minItems: 1 },
  },
  required: ["search_queries"],
  title: "Parallel Search request",
  type: "object",
};

const extractSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  additionalProperties: false,
  description: "Request body accepted by `parallel-search extract --body`.",
  properties: {
    ...commonProperties,
    advanced_settings: {
      additionalProperties: false,
      properties: {
        excerpt_settings: excerptSettings,
        fetch_policy: fetchPolicy,
        full_content: {
          anyOf: [
            { type: "boolean" },
            {
              additionalProperties: false,
              properties: {
                max_chars_per_result: { minimum: 1, type: "integer" },
              },
              type: "object",
            },
          ],
        },
      },
      type: "object",
    },
    urls: {
      items: { format: "uri", pattern: "^https?://", type: "string" },
      maxItems: 20,
      minItems: 1,
      type: "array",
    },
  },
  required: ["urls"],
  title: "Parallel Extract request",
  type: "object",
};

export function requestSchema(endpoint: ApiEndpoint): Record<string, unknown> {
  return endpoint === "search" ? searchSchema : extractSchema;
}
