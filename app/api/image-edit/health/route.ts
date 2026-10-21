import { NextResponse } from "next/server";
import { gatewayToken } from "@/lib/gateway";

export async function GET(req: Request) {
  return NextResponse.json({ available: !!gatewayToken(req.headers) });
}
