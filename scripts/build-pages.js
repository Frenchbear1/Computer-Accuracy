const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CSV_DIR = path.join(ROOT, "Code E6-B");
const PUBLIC_DIR = path.join(ROOT, "public");
const DOCS_DIR = path.join(ROOT, "docs");

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((cells) => cells.some((cell) => String(cell || "").trim()))
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]))
    );
}

function parseMeta(fileName) {
  const match = fileName.match(/^(\d{4})_(regionals|nationals)_computer_accuracy_questions\.csv$/i);
  if (!match) return null;
  const event = match[2].toLowerCase();
  return {
    id: `${match[1]}_${event}`,
    year: Number(match[1]),
    event,
    eventLabel: event === "nationals" ? "Nationals" : "Regionals",
    title: `${match[1]} ${event === "nationals" ? "Nationals" : "Regionals"}`,
    fileName,
  };
}

function categoryLabel(value) {
  return String(value || "").trim();
}

function categoryKey(value) {
  return categoryLabel(value).toLowerCase();
}

function categoryId(value) {
  const slug = categoryKey(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `category--${slug || "uncategorized"}`;
}

function rowCategory(row) {
  return categoryLabel(
    row.problem_type ||
      row.problemType ||
      row.category ||
      row.type_of_problem ||
      row.typeOfProblem
  );
}

function parseTableField(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to pipe-delimited table parsing.
  }

  const lines = raw
    .split("[[NEXT_LINE]]")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length || !lines.some((line) => line.includes("|"))) return null;

  const cells = lines.map((line) => line.split("|").map((cell) => cell.trim()));
  const columnCount = Math.max(...cells.map((row) => row.length));
  const normalized = cells.map((row) => {
    const next = [...row];
    while (next.length < columnCount) next.push("");
    return next;
  });

  return {
    type: "table",
    headers: normalized[0],
    rows: normalized.slice(1),
  };
}

function listCsvFiles() {
  return fs
    .readdirSync(CSV_DIR)
    .filter((file) => parseMeta(file))
    .sort((a, b) => {
      const ma = parseMeta(a);
      const mb = parseMeta(b);
      if (ma.year !== mb.year) return mb.year - ma.year;
      return ma.event.localeCompare(mb.event);
    });
}

function buildQuestion(row, index, meta) {
  const uid = (row.number || String(index + 1)).trim() || String(index + 1);
  const choices = ["a", "b", "c", "d", "e"]
    .map((letter) => ({
      letter: letter.toUpperCase(),
      text: (row[`choice_${letter}`] || "").trim(),
    }))
    .filter((choice) => choice.text);

  return {
    index,
    uid,
    number: uid,
    question: (row.question || "").trim(),
    choices,
    answerKey: (row.answer_key || "").trim().toUpperCase(),
    correctChoice: (row.correct_choice || "").trim(),
    answerKeyType: (row.answer_key_type || "").trim(),
    questionType: (row.question_type || "multiple_choice").trim() || "multiple_choice",
    context: (row.context || "").trim(),
    table: parseTableField(row.table),
    category: rowCategory(row),
    sourceTestId: meta.id,
    sourceTestTitle: meta.title,
    sourceYear: meta.year,
    sourceEvent: meta.event,
    referenceScope: meta.id,
  };
}

function loadTest(fileName) {
  const meta = parseMeta(fileName);
  const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, fileName), "utf8"));
  const questions = rows.map((row, index) => buildQuestion(row, index, meta));
  return { ...meta, count: questions.length, selectionType: "test", questions };
}

function listCategories() {
  const categories = new Map();

  listCsvFiles().forEach((fileName) => {
    const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, fileName), "utf8"));
    rows.forEach((row) => {
      const title = rowCategory(row);
      const key = categoryKey(title);
      if (!key) return;
      if (!categories.has(key)) {
        categories.set(key, {
          id: categoryId(title),
          key,
          title,
          count: 0,
          selectionType: "category",
        });
      }
      categories.get(key).count += 1;
    });
  });

  return Array.from(categories.values())
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }))
    .map(({ key, ...category }) => category);
}

function loadCategory(id) {
  const category = listCategories().find((item) => item.id === id);
  if (!category) throw new Error(`Unknown category: ${id}`);

  const questions = [];
  listCsvFiles().forEach((fileName) => {
    const loadedTest = loadTest(fileName);
    loadedTest.questions.forEach((question) => {
      if (categoryKey(question.category) !== categoryKey(category.title)) return;
      questions.push({
        ...question,
        index: questions.length,
        uid: `${loadedTest.id}:${question.uid}`,
      });
    });
  });

  return {
    id: category.id,
    title: category.title,
    count: questions.length,
    selectionType: "category",
    questions,
  };
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function writeJson(target, value) {
  fs.writeFileSync(target, JSON.stringify(value));
}

function buildDocs() {
  const tests = listCsvFiles().map((fileName) => {
    const meta = parseMeta(fileName);
    const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, fileName), "utf8"));
    return { ...meta, count: rows.length, selectionType: "test" };
  });
  const categories = listCategories();

  fs.rmSync(DOCS_DIR, { recursive: true, force: true });
  ensureDir(DOCS_DIR);
  ensureDir(path.join(DOCS_DIR, "data", "tests"));
  ensureDir(path.join(DOCS_DIR, "data", "categories"));

  for (const file of ["index.html", "app.js", "styles.css"]) {
    fs.copyFileSync(path.join(PUBLIC_DIR, file), path.join(DOCS_DIR, file));
  }

  writeJson(path.join(DOCS_DIR, "data", "tests.json"), {
    csvDir: "./Code E6-B",
    tests,
    categories,
  });

  tests.forEach((test) => {
    writeJson(path.join(DOCS_DIR, "data", "tests", `${test.id}.json`), loadTest(test.fileName));
  });

  categories.forEach((category) => {
    writeJson(path.join(DOCS_DIR, "data", "categories", `${category.id}.json`), loadCategory(category.id));
  });

  fs.writeFileSync(path.join(DOCS_DIR, ".nojekyll"), "");
}

buildDocs();
console.log(`Built GitHub Pages site in ${DOCS_DIR}`);
