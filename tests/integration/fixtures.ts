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

  const component = await db.component.create({
    data: { name: `${TEST_PREFIX}${suffix}`, path: `${TEST_PREFIX}${suffix}` },
    select: { id: true },
  });

  const milestone = await db.milestone.create({
    data: { name: `${TEST_PREFIX}${suffix}`, componentId: component.id },
    select: { id: true },
  });

  return { user, other, component, milestone };
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
