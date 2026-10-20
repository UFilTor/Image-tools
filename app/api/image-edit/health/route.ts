import { NextResponse } from "next/server";
import { gatewayToken } from "@/lib/gateway";

export async function GET() {
  return NextResponse.json({ available: !!gatewayToken() });
}
