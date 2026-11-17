import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.number().nonnegative(),
  rating: z.number().min(0).max(5),
  stock: z.number().int(),
  brand: z.string().optional(),
  thumbnail: z.url(),
});

export const ProductsResponseSchema = z.object({
  products: z.array(ProductSchema),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
});

export const CategoryListSchema = z.array(z.string());

export type Product = z.infer<typeof ProductSchema>;
export type ProductsResponse = z.infer<typeof ProductsResponseSchema>;
