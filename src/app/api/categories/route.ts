import { NextResponse } from "next/server";
import { getCategories } from "@/lib/server-data";

export async function GET() {
  const categories = await getCategories();
  const response = NextResponse.json(categories);

  // Categories change very rarely — cache for 5 minutes, allow stale for 1 hour.
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=3600"
  );

  return response;
}
