import { db } from "@/lib/db";

/**
 * Integration tests run against the real dev database, so every fixture is
 * namespaced and torn down. Hard deletes go through raw SQL on purpose: the
 * Prisma extension blocks `radar.delete` outright, and that guard should stay
 * in force for application code.
 */
export const TEST_PREFIX = "zz-test-";

export async function createFixtures(label: string) {
  const suffix = `${label}-${Date.now()}`;

  const user = await db.user.create({
    data: {
      name: `Test ${label}`,
      email: `${TEST_PREFIX}${suffix}@radar.local`,
      handle: `${TEST_PREFIX}${suffix}`,
    },
    select: { id: true },
  });

  const other = await db.user.create({
    data: {
      name: `Other ${label}`,
      email: `${TEST_PREFIX}other-${suffix}@radar.local`,
      handle: `${TEST_PREFIX}other-${suffix}`,
    },
    select: { id: true },
  });

  // Two users cannot express "originator, assignee, and someone who is neither",
  // which is the shape every access test needs.
  const third = await db.user.create({
    data: {
      name: `Third ${label}`,
      email: `${TEST_PREFIX}third-${suffix}@radar.local`,
      handle: `${TEST_PREFIX}third-${suffix}`,
    },
    select: { id: true },
  });

  const admin = await db.user.create({
    data: {
      name: `Admin ${label}`,
      email: `${TEST_PREFIX}admin-${suffix}@radar.local`,
      handle: `${TEST_PREFIX}admin-${suffix}`,
      isAdmin: true,
    },
    select: { id: true },
  });

  const component = await db.component.create({
    data: { name: `${TEST_PREFIX}${suffix}`, path: `${TEST_PREFIX}${suffix}` },
    select: { id: true },
  });

  const milestone = await db.milestone.create({
    data: { name: `${TEST_PREFIX}${suffix}`, componentId: component.id },
    select: { id: true },
  });

  return { user, other, third, admin, component, milestone };
}

export async function destroyFixtures() {
  // Order matters only for the tables without ON DELETE CASCADE.
  await db.$executeRaw`
    DELETE FROM "Radar"
    WHERE "componentId" IN (SELECT id FROM "Component" WHERE "path" LIKE ${TEST_PREFIX + "%"})`;
  await db.$executeRaw`
    DELETE FROM "Milestone" WHERE "name" LIKE ${TEST_PREFIX + "%"}`;
  await db.$executeRaw`
    DELETE FROM "Component" WHERE "path" LIKE ${TEST_PREFIX + "%"}`;
  await db.$executeRaw`
    DELETE FROM "user" WHERE "handle" LIKE ${TEST_PREFIX + "%"}`;
}
