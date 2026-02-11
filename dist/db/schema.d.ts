import Database from 'better-sqlite3';
export declare function getDbPath(): string;
export declare function createDatabase(dbPath?: string): Database.Database;
export declare function getOrCreateUser(db: Database.Database, name: string): number;
export declare function getUserId(db: Database.Database, name: string): number | null;
export declare function listUsers(db: Database.Database): Array<{
    id: number;
    name: string;
    createdAt: string;
}>;
export declare function createInMemoryDatabase(): Database.Database;
//# sourceMappingURL=schema.d.ts.map