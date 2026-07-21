import { defineCollection, z } from 'astro:content';

const mda = defineCollection({
  type: 'content',
  schema: z.object({
    company: z.string(),
    year: z.number(),
    title: z.string(),
    source: z.string().optional(),
    date: z.string().optional(),
  }),
});

const intros = defineCollection({
  type: 'content',
  schema: z.object({
    company: z.string(),
  }),
});

export const collections = { mda, intros };
