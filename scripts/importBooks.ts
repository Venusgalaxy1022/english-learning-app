// scripts/importBooks.ts
import * as fs from "fs";
import * as path from "path";
import * as admin from "firebase-admin";

type ImportBookConfig = {
  id: string;
  title: string;
  author: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  totalSegments: number; // 예: 30
  filePath: string; // txt 파일 경로
};

// 현재 작업 디렉토리(english-learning-app 루트)를 기준으로 사용
const ROOT_DIR = process.cwd();

// ✅ 여기에 임포트할 책들을 정의
const BOOKS_TO_IMPORT: ImportBookConfig[] = [
  {
    id: "little-women",
    title: "Little Women",
    author: "Louisa May Alcott",
    level: "Intermediate",
    totalSegments: 30,
    // texts 폴더에 little_women.txt 있는 걸로 보였으니까 이름 맞춰줌
    filePath: path.join(ROOT_DIR, "texts/little_women.txt")
  },
  {
    id: "anne-of-green-gables",
    title: "Anne of Green Gables",
    author: "L. M. Montgomery",
    level: "Intermediate",
    totalSegments: 30,
    filePath: path.join(ROOT_DIR, "texts/anne-of-green-gables.txt")
  }
  // TODO: 여기 나중에 책 더 추가하면 됨
];

// Firebase Admin 초기화 (에뮬레이터/실프로젝트 모두 지원)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// ------- 유틸 함수들 -------

// 빈 줄 기준으로 문단 분리
function splitIntoParagraphs(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n\r?\n+/) // 빈 줄 1개 이상
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

// 문단들을 totalSegments 개수만큼 균등하게 나누기
function splitParagraphsIntoSegments(
  paragraphs: string[],
  totalSegments: number
): string[][] {
  const total = paragraphs.length;
  if (total === 0 || totalSegments <= 0) return [];

  const perSegment = Math.ceil(total / totalSegments);

  const segments: string[][] = [];
  for (let i = 0; i < totalSegments; i++) {
    const start = i * perSegment;
    const end = Math.min(start + perSegment, total);
    if (start >= end) break;
    segments.push(paragraphs.slice(start, end));
  }
  return segments;
}

async function importOneBook(config: ImportBookConfig) {
  console.log(`\n=== Importing book: ${config.id} ===`);
  console.log(`Reading file from: ${config.filePath}`);

  if (!fs.existsSync(config.filePath)) {
    console.error(`❌ File not found: ${config.filePath}`);
    return;
  }

  const raw = fs.readFileSync(config.filePath, "utf-8");
  const paragraphs = splitIntoParagraphs(raw);

  console.log(`Total paragraphs: ${paragraphs.length}`);

  const segments = splitParagraphsIntoSegments(
    paragraphs,
    config.totalSegments
  );

  console.log(`Segments created: ${segments.length}`);

  if (segments.length === 0) {
    console.error("❌ No segments created. Check the input text or split logic.");
    return;
  }

  // 1) books 컬렉션에 메타데이터 저장
  const bookRef = db.collection("books").doc(config.id);
  await bookRef.set(
    {
      id: config.id,
      title: config.title,
      author: config.author,
      level: config.level,
      totalSegments: segments.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // 2) 각 세그먼트를 bookSegments에 저장
  const batch = db.batch();

  segments.forEach((paragraphsSegment, index) => {
    const segmentIndex = index + 1;
    const docId = `${config.id}_${segmentIndex}`;
    const segRef = db.collection("bookSegments").doc(docId);

    batch.set(
      segRef,
      {
        bookId: config.id,
        segmentIndex,
        title: `Part ${segmentIndex}`,
        paragraphs: paragraphsSegment,
        estimatedMinutes: 15,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log(`✅ Imported ${segments.length} segments for ${config.id}`);
}

async function main() {
  for (const book of BOOKS_TO_IMPORT) {
    await importOneBook(book);
  }
  console.log("\n🎉 All books imported.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
