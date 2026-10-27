/**
 * Database client configuration and connection helper.
 * Configure your preferred ORM/database client (e.g. Prisma, Drizzle, Mongoose, PostgreSQL) here.
 */

export interface DatabaseConfig {
  url?: string;
  maxConnections: number;
  ssl: boolean;
}

export const dbConfig: DatabaseConfig = {
  url: process.env.DATABASE_URL,
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "10", 10),
  ssl: process.env.NODE_ENV === "production",
};

export async function getDbConnection() {
  // In a real application, initialize or return your connection pool or ORM instance
  return {
    status: "configured",
    maxConnections: dbConfig.maxConnections,
    ssl: dbConfig.ssl,
    isProduction: process.env.NODE_ENV === "production",
  };
}
