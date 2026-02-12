import { NextResponse } from "next/server";
import { getStores } from "@/lib/server-data";

export async function GET() {
  const stores = await getStores();
  const response = NextResponse.json(stores);

  // Stores change very rarely — cache for 5 minutes, allow stale for 1 hour.
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=3600"
  );

  return response;
}
