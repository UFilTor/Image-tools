import { NextResponse } from "next/server";

export async function GET() {
  const hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your-key-here";
  return NextResponse.json({ available: hasKey });
}
