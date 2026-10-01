export type BookInfo = {
  id: string;
  title: string;
  author: string;
  createdAt: string;
};
export type Position = {
  bookId: string;
  cfi: string;
  updatedAt: number;
  version: 1;
  synced: boolean;
};
export type ReadingSettings = {
  fontSize: number;
  lineHeight: number;
  theme: "light" | "dark";
};
export type SelectionInfo = {
  text: string;
  bookId: string;
  title: string;
  chapter: string;
  cfi: string;
  context: string;
};
