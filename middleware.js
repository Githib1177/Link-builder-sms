// middleware.js – Basic Auth pro celou aplikaci
import { NextResponse } from "next/server";

export const config = {
  matcher: ["/((?!favicon.ico|manifest.json|linkbuilder-180.png|sw.js).*)"],
};

export function middleware(req) {
  const user = "falconi";
  const pass = "Falconi1";

  const auth = req.headers.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");

  if (scheme === "Basic" && encoded) {
    const [u, p] = Buffer.from(encoded, "base64").toString().split(":");
    if (u === user && p === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Falconi Link Builder"' },
  });
}
