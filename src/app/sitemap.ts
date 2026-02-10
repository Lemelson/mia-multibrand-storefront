import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/server-data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const products = await getProducts();

  const staticPages = [
    "",
    "/catalog",
    "/catalog/women",
    "/catalog/men",
    "/catalog/kids",
    "/cart",
    "/checkout",
    "/contacts",
    "/delivery"
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date()
  }));

  const productPages = products
    .filter((product) => product.isActive)
    .map((product) => ({
      url: `${baseUrl}/product/${product.slug}`,
      lastModified: new Date(product.updatedAt)
    }));

  return [...staticPages, ...productPages];
}
