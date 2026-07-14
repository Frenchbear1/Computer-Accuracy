const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5177);
const HOST = process.env.HOST || "0.0.0.0";
const LIVE_RELOAD_ENABLED =
  process.env.LIVE_RELOAD !== "0" && process.env.NODE_ENV !== "production";
const CSV_DIR =
  process.env.COMPUTER_ACCURACY_CSV_DIR ||
  path.join(__dirname, "Code E6-B");
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

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

function categorySort(left, right) {
  if (left.count !== right.count) return right.count - left.count;
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
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
    // Some CSV rows store tables as: "Header | Header [[NEXT_LINE]] cell | cell".
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
    .sort(compareTestFiles);
}

function schoolYearSortKey(meta) {
  return meta.event === "nationals" ? meta.year * 2 : (meta.year + 1) * 2 - 1;
}

function compareTestFiles(a, b) {
  const ma = parseMeta(a);
  const mb = parseMeta(b);
  const keyDifference = schoolYearSortKey(mb) - schoolYearSortKey(ma);
  if (keyDifference) return keyDifference;
  return ma.title.localeCompare(mb.title, undefined, { sensitivity: "base" });
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
    .sort(categorySort)
    .map(({ key, ...category }) => category);
}

function loadTest(fileName) {
  const meta = parseMeta(fileName);
  if (!meta) throw new Error("Unknown test file");

  const csvPath = path.join(CSV_DIR, fileName);
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const questions = rows.map((row, index) => buildQuestion(row, index, meta));

  return { ...meta, count: questions.length, selectionType: "test", questions };
}

function loadCategory(id) {
  const category = listCategories().find((item) => item.id === id);
  if (!category) throw new Error("Unknown category");

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

function sendJson(res, body, status = 200) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": MIME[".json"],
    "cache-control": "no-store",
  });
  res.end(data);
}

const liveReloadClients = new Set();
let liveReloadStarted = false;
let liveReloadTimer = null;

function liveReloadClientScript() {
  return `(() => {
  if (!("EventSource" in window)) return;
  let opened = false;
  let disconnected = false;
  const source = new EventSource("/__live-reload/events");
  source.onopen = () => {
    if (opened && disconnected) {
      window.location.reload();
      return;
    }
    opened = true;
    disconnected = false;
  };
  source.addEventListener("reload", () => window.location.reload());
  source.onerror = () => {
    disconnected = true;
  };
})();`;
}

function handleLiveReload(req, res, url) {
  if (!LIVE_RELOAD_ENABLED) {
    res.writeHead(404);
    res.end("Not found");
    return true;
  }

  if (url.pathname === "/__live-reload.js") {
    res.writeHead(200, {
      "content-type": MIME[".js"],
      "cache-control": "no-store",
    });
    res.end(liveReloadClientScript());
    return true;
  }

  if (url.pathname !== "/__live-reload/events") return false;

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
  });
  res.write(": connected\n\n");

  liveReloadClients.add(res);
  req.on("close", () => {
    liveReloadClients.delete(res);
  });

  return true;
}

function notifyLiveReload(reason) {
  if (!LIVE_RELOAD_ENABLED || !liveReloadClients.size) return;

  clearTimeout(liveReloadTimer);
  liveReloadTimer = setTimeout(() => {
    const data = JSON.stringify({ reason, at: Date.now() });
    liveReloadClients.forEach((client) => {
      client.write(`event: reload\ndata: ${data}\n\n`);
    });
  }, 120);
}

function watchLiveReloadPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;

  try {
    fs.watch(targetPath, { recursive: true }, (_eventType, fileName) => {
      notifyLiveReload(fileName || targetPath);
    });
  } catch (error) {
    console.warn(`Live reload could not watch ${targetPath}: ${error.message}`);
  }
}

function startLiveReload() {
  if (!LIVE_RELOAD_ENABLED || liveReloadStarted) return;

  liveReloadStarted = true;
  watchLiveReloadPath(PUBLIC_DIR);
  watchLiveReloadPath(CSV_DIR);
  console.log("Live reload enabled for public files and CSV data.");
}

function injectLiveReload(html) {
  if (!LIVE_RELOAD_ENABLED) return html;

  const tag = '\n    <script src="/__live-reload.js"></script>';
  return html.includes("</body>")
    ? html.replace("</body>", `${tag}\n  </body>`)
    : `${html}${tag}`;
}

function serveStatic(res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path
    .normalize(decodeURIComponent(requested))
    .replace(/^[/\\]+/, "")
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html" && LIVE_RELOAD_ENABLED) {
    res.writeHead(200, {
      "content-type": MIME[ext],
      "cache-control": "no-store",
    });
    res.end(injectLiveReload(fs.readFileSync(filePath, "utf8")));
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "cache-control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleApi(req, res, url) {
  if (url.pathname === "/api/tests") {
    const tests = listCsvFiles().map((fileName) => {
      const meta = parseMeta(fileName);
      const rows = parseCsv(fs.readFileSync(path.join(CSV_DIR, fileName), "utf8"));
      return { ...meta, count: rows.length, selectionType: "test" };
    });
    sendJson(res, { csvDir: CSV_DIR, tests, categories: listCategories() });
    return;
  }

  const testMatch = url.pathname.match(/^\/api\/tests\/([^/]+)$/);
  if (testMatch) {
    const id = decodeURIComponent(testMatch[1]).toLowerCase();
    const fileName = listCsvFiles().find((file) => parseMeta(file).id === id);
    if (!fileName) {
      sendJson(res, { error: "Test not found" }, 404);
      return;
    }
    sendJson(res, loadTest(fileName));
    return;
  }

  const categoryMatch = url.pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (categoryMatch) {
    const id = decodeURIComponent(categoryMatch[1]).toLowerCase();
    try {
      sendJson(res, loadCategory(id));
    } catch {
      sendJson(res, { error: "Category not found" }, 404);
    }
    return;
  }

  sendJson(res, { error: "Not found" }, 404);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (handleLiveReload(req, res, url)) {
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url);
    } else {
      serveStatic(res, url.pathname);
    }
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
});

function lanUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${PORT}`);
}

server.listen(PORT, HOST, () => {
  startLiveReload();
  console.log(`Computer Accuracy Practice running at http://localhost:${PORT}`);
  if (HOST === "0.0.0.0") {
    lanUrls().forEach((url) => console.log(`Phone/LAN URL: ${url}`));
  }
  console.log(`Reading CSVs from ${CSV_DIR}`);
});
