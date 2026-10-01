import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { BookInfo } from "./types";
export const dataRoot = path.resolve(
  process.env.EPUB_DATA_DIR || path.join(process.cwd(), "data"),
);
let database: Database.Database | undefined;
export function db() {
  if (database) return database;
  mkdirSync(path.join(dataRoot, "books"), { recursive: true });
  database = new Database(path.join(dataRoot, "library.sqlite"));
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  // Numbered transactional migrations; future schema changes append another version.
  if (Number(database.pragma("user_version", { simple: true })) < 1) {
    database.transaction(() => {
      database!
        .exec(`CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, filePath TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL);
        CREATE TABLE positions (bookId TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE, cfi TEXT NOT NULL, updatedAt INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1);
        PRAGMA user_version = 1;`);
    })();
  }
  return database;
}
export type BookRow = BookInfo & { filePath: string; hash: string };
export function bookById(id: string) {
  return db().prepare("SELECT * FROM books WHERE id = ?").get(id) as
    BookRow | undefined;
}
export function publicBook(book: BookRow): BookInfo {
  const { id, title, author, createdAt } = book;
  return { id, title, author, createdAt };
}
