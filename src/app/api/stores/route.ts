import { NextResponse } from "next/server";
import { getStores } from "@/lib/server-data";

export async function GET() {
  const stores = await getStores();
  return NextResponse.json(stores);
}
