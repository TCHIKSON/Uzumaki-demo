// src/schemas.js
import { z } from 'zod';

export const SourceSchema = z.object({
  type: z.enum(['hls','dash','iframe']),
  url: z.string().url()
});

export const EpisodeSchema = z.object({
  showTitle: z.string(),
  season: z.string(),
  number: z.number(),
  title: z.string(),
  sources: z.array(SourceSchema).min(1),
  subtitles: z.array(z.object({
    label: z.string(),
    lang: z.string().min(2).max(5),
    url: z.string().url()
  })).optional().default([])
});

export const DetailsSchema = z.object({
  id: z.string(),
  title: z.string(),
  lang: z.string(),
  season: z.string(),
  episodes: z.array(EpisodeSchema).min(1),
  updatedAt: z.number().int(),
  meta: z.record(z.any()).optional()
});
