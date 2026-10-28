import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  lastDbFailureTimestamp?: number;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export function markDatabaseUnreachable() {
  globalForPrisma.lastDbFailureTimestamp = Date.now();
}

export function markDatabaseReachable() {
  globalForPrisma.lastDbFailureTimestamp = 0;
}

export function isDatabaseExpectedOnline(): boolean {
  const lastFailure = globalForPrisma.lastDbFailureTimestamp || 0;
  if (lastFailure === 0) return true;
  return Date.now() - lastFailure > 30_000;
}

export default prisma;
