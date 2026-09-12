/**
 * Exercises better-auth's origin middleware for each deployment shape without
 * needing a server. Sends a real Request through auth.handler with a given
 * Origin header; a sign-in for a nonexistent account passes the origin check
 * and then fails on credentials, so nothing is written.
 *
 * One scenario per process: auth.ts computes baseURL at module scope.
 *
 *   node --conditions=react-server --env-file=.env --import tsx/esm \
 *     scripts/check-origins.mts <scenario>
 */
const scenarios: Record<
  string,
  { env: Record<string, string | undefined>; origin: string; expect: "accept" | "reject" }
> = {
  local: {
    env: { BETTER_AUTH_URL: "http://localhost:3000" },
    origin: "http://localhost:3000",
    expect: "accept",
  },
  "prod-derived": {
    env: {
      BETTER_AUTH_URL: undefined,
      VERCEL_ENV: "production",
      VERCEL_PROJECT_PRODUCTION_URL: "radar-clone-six.vercel.app",
      VERCEL_URL: "radar-clone-xyz123.vercel.app",
    },
    origin: "https://radar-clone-six.vercel.app",
    expect: "accept",
  },
  "prod-trailing-slash": {
    env: { BETTER_AUTH_URL: "https://radar-clone-six.vercel.app/" },
    origin: "https://radar-clone-six.vercel.app",
    expect: "accept",
  },
  preview: {
    env: {
      BETTER_AUTH_URL: undefined,
      VERCEL_ENV: "preview",
      VERCEL_URL: "radar-clone-git-feat-x.vercel.app",
      VERCEL_PROJECT_PRODUCTION_URL: "radar-clone-six.vercel.app",
    },
    origin: "https://radar-clone-git-feat-x.vercel.app",
    expect: "accept",
  },
  "foreign-origin": {
    env: { BETTER_AUTH_URL: "https://radar-clone-six.vercel.app" },
    origin: "https://attacker.example.com",
    expect: "reject",
  },
};

const name = process.argv[2];
const scenario = scenarios[name];
if (!scenario) {
  console.error(`unknown scenario. options: ${Object.keys(scenarios).join(", ")}`);
  process.exit(1);
}

for (const [key, value] of Object.entries(scenario.env)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

const { auth } = await import("../src/lib/auth");

const response = await auth.handler(
  new Request(`${scenario.origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: scenario.origin },
    body: JSON.stringify({
      email: "nobody-here@radar.local",
      password: "not-a-real-password",
    }),
  }),
);

const body = await response.text();
const rejectedForOrigin = body.toLowerCase().includes("invalid origin");
const outcome = rejectedForOrigin ? "reject" : "accept";
const pass = outcome === scenario.expect;

console.log(
  `${pass ? "PASS" : "FAIL"}  ${name.padEnd(20)} origin=${scenario.origin}`,
);
console.log(
  `      expected ${scenario.expect}, got ${outcome} (HTTP ${response.status})`,
);
if (!pass) console.log(`      body: ${body.slice(0, 200)}`);

process.exit(pass ? 0 : 1);
