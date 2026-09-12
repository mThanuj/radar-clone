import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

const request = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "https://radar.example.com"), {
    headers: cookie ? { cookie } : {},
  });

// better-auth's default session cookie; the __Secure- prefix appears over HTTPS.
const SESSION = "better-auth.session_token=abc123";
const SECURE_SESSION = "__Secure-better-auth.session_token=abc123";

const locationOf = (response: Response) => response.headers.get("location");

describe("middleware", () => {
  it("sends anonymous traffic to sign-in", () => {
    const response = middleware(request("/"));
    expect(response.status).toBe(307);
    expect(locationOf(response)).toContain("/sign-in");
  });

  it("remembers where you were going", () => {
    const response = middleware(request("/radars/100000042?tab=activity"));
    const location = locationOf(response)!;
    expect(location).toContain("/sign-in");
    expect(decodeURIComponent(location)).toContain(
      "next=/radars/100000042?tab=activity",
    );
  });

  it("lets a session through", () => {
    for (const cookie of [SESSION, SECURE_SESSION]) {
      expect(middleware(request("/radars", cookie)).status).toBe(200);
    }
  });

  /**
   * The regression this file exists for.
   *
   * Middleware can only see that a cookie exists — it runs on the edge with no
   * database and no crypto. A stale cookie (rotated secret, expired session)
   * therefore looks valid here but is rejected by requireUser(), which
   * redirects to /sign-in. When middleware also redirected cookie-bearing
   * requests *away* from /sign-in, those two bounced off each other forever
   * and the browser gave up with "too many redirects".
   *
   * So: never redirect away from an auth page here. The (auth) layout does it,
   * where the session is actually verified.
   */
  it("never redirects away from an auth page, even with a cookie present", () => {
    for (const path of ["/sign-in", "/sign-up"]) {
      for (const cookie of [undefined, SESSION, SECURE_SESSION]) {
        const response = middleware(request(path, cookie));
        expect(
          locationOf(response),
          `${path} with ${cookie ?? "no cookie"} must not redirect`,
        ).toBeNull();
      }
    }
  });
});
