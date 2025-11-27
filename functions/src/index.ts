import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

type Book = {
  id: string;
  title: string;
  author: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  totalChapters: number;
  tags: string[];
};

type Chapter = {
  id: string;
  index: number;
  title: string;
  estimatedMinutes: number;
};

type ReadingSession = {
  sessionIndex: number;
  weekIndex: number;
  chapterStart: number;
  chapterEnd: number;
};

const BOOKS: Book[] = [
  {
    id: "little-women",
    title: "Little Women",
    author: "Louisa May Alcott",
    level: "Intermediate",
    totalChapters: 30,
    tags: ["Classic", "Family", "Coming-of-age"]
  },
  {
    id: "anne-of-green-gables",
    title: "Anne of Green Gables",
    author: "L. M. Montgomery",
    level: "Intermediate",
    totalChapters: 30,
    tags: ["Classic", "Children", "School"]
  }
];

function buildChapters(book: Book): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 1; i <= book.totalChapters; i++) {
    chapters.push({
      id: `${book.id}-ch-${i}`,
      index: i,
      title: `Part ${i}`,
      estimatedMinutes: 15
    });
  }
  return chapters;
}

function buildReadingPlan(
  book: Book,
  sessionsPerWeek: number
): {
  bookId: string;
  totalChapters: number;
  sessionsPerWeek: number;
  totalWeeks: number;
  sessions: ReadingSession[];
} {
  const chaptersPerSession = 1;
  const totalSessions = Math.ceil(book.totalChapters / chaptersPerSession);
  const totalWeeks = Math.ceil(totalSessions / sessionsPerWeek);

  const sessions: ReadingSession[] = [];
  let currentChapter = 1;

  for (let s = 1; s <= totalSessions; s++) {
    const weekIndex = Math.ceil(s / sessionsPerWeek);
    const chapterStart = currentChapter;
    const chapterEnd = Math.min(
      currentChapter + chaptersPerSession - 1,
      book.totalChapters
    );

    sessions.push({
      sessionIndex: s,
      weekIndex,
      chapterStart,
      chapterEnd
    });

    currentChapter = chapterEnd + 1;
  }

  return {
    bookId: book.id,
    totalChapters: book.totalChapters,
    sessionsPerWeek,
    totalWeeks,
    sessions
  };
}

export const api = onRequest((req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const path = req.path || "/";

  logger.info("Request received at /api", {
    method: req.method,
    path,
    query: req.query
  });

  // GET /api
  if (req.method === "GET" && path === "/") {
    res.status(200).json({
      message: "API is up and running",
      ok: true,
      time: new Date().toISOString()
    });
    return;
  }

  // GET /api/books
  if (req.method === "GET" && path === "/books") {
    res.status(200).json({
      ok: true,
      count: BOOKS.length,
      items: BOOKS
    });
    return;
  }

  // GET /api/books/:id/chapters
  if (
    req.method === "GET" &&
    path.startsWith("/books/") &&
    path.endsWith("/chapters")
  ) {
    const segments = path.split("/").filter(Boolean);
    const bookId = segments[1];

    const book = BOOKS.find((b) => b.id === bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: "Book not found" });
      return;
    }

    const chapters = buildChapters(book);
    res.status(200).json({
      ok: true,
      book,
      chapters
    });
    return;
  }

  // GET /api/reading-plan?bookId=...&sessionsPerWeek=3
  if (req.method === "GET" && path === "/reading-plan") {
    const bookId = (req.query.bookId as string) || "little-women";
    const sessionsPerWeekRaw = (req.query.sessionsPerWeek as string) || "3";
    const sessionsPerWeek = Math.max(
      1,
      Math.min(7, parseInt(sessionsPerWeekRaw, 10) || 3)
    );

    const book = BOOKS.find((b) => b.id === bookId);
    if (!book) {
      res.status(404).json({ ok: false, error: "Book not found" });
      return;
    }

    const plan = buildReadingPlan(book, sessionsPerWeek);
    res.status(200).json({
      ok: true,
      plan
    });
    return;
  }

  res.status(404).json({
    ok: false,
    error: "Not found",
    path,
    method: req.method
  });
});
