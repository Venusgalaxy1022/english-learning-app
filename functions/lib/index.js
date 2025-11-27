"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const BOOKS = [
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
function buildChapters(book) {
    const chapters = [];
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
function buildReadingPlan(book, sessionsPerWeek) {
    const chaptersPerSession = 1;
    const totalSessions = Math.ceil(book.totalChapters / chaptersPerSession);
    const totalWeeks = Math.ceil(totalSessions / sessionsPerWeek);
    const sessions = [];
    let currentChapter = 1;
    for (let s = 1; s <= totalSessions; s++) {
        const weekIndex = Math.ceil(s / sessionsPerWeek);
        const chapterStart = currentChapter;
        const chapterEnd = Math.min(currentChapter + chaptersPerSession - 1, book.totalChapters);
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
exports.api = (0, https_1.onRequest)((req, res) => {
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
    if (req.method === "GET" &&
        path.startsWith("/books/") &&
        path.endsWith("/chapters")) {
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
        const bookId = req.query.bookId || "little-women";
        const sessionsPerWeekRaw = req.query.sessionsPerWeek || "3";
        const sessionsPerWeek = Math.max(1, Math.min(7, parseInt(sessionsPerWeekRaw, 10) || 3));
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
//# sourceMappingURL=index.js.map