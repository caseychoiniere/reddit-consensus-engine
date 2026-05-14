import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

let _prisma: PrismaClient | null = null;

export const getPrisma = (): PrismaClient => {
    if (_prisma) return _prisma;

    const dbUrlRaw = process.env.DATABASE_URL;
    if (!dbUrlRaw) {
        throw new Error("DATABASE_URL is missing. Please set it in AI Studio Secrets as a postgresql:// URL.");
    }

    const dbUrl = dbUrlRaw.trim().replace(/^["']|["']$/g, "");

    if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
        throw new Error("DATABASE_URL must start with 'postgresql://' or 'postgres://'. Found: " + dbUrl.substring(0, 10) + "...");
    }

    _prisma = new PrismaClient({
        log: ["error"],
    });

    return _prisma;
};

// For backward compatibility and easy export
export const prisma = new Proxy({} as PrismaClient, {
    get: (target, prop) => {
        const client = getPrisma();
        return (client as any)[prop];
    }
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
