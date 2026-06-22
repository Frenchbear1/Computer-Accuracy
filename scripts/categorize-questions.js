const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CSV_DIR = path.join(ROOT, "Code E6-B");
const DOCS_DATA_DIR = path.join(ROOT, "docs", "data");
const MISCELLANEOUS_THRESHOLD = 3;

const CATEGORY_TITLES = new Map(
  Object.entries({
    "60:1 rule": "60:1 Rule",
    acceleration: "Acceleration",
    "airspeed / mach": "Airspeed / Mach",
    "area / loading": "Area / Loading",
    "cg in % mac": "CG in % MAC",
    "climb/cruise/descent planning": "Climb/Cruise/Descent Planning",
    "climb gradient": "Climb Gradient",
    conversions: "Conversions",
    "courses and headings": "Courses and Headings",
    "crosswind component": "Crosswind Component",
    "density altitude": "Density Altitude",
    "distance to vor": "Distance to VOR",
    division: "Division",
    "dme arc": "DME Arc",
    "dme slant range": "DME Slant Range",
    "equal time point": "Equal Time Point",
    "equal time to point": "Equal Time Point",
    "fuel burn / fuel required": "Fuel Burn / Fuel Required",
    "geometry / trigonometry": "Geometry / Trigonometry",
    "glide performance": "Glide Performance",
    "interpolation / extrapolation": "Interpolation / Extrapolation",
    "load factor / bank angle": "Load Factor / Bank Angle",
    miscellaneous: "Miscellaneous",
    multiplication: "Multiplication",
    "multiplication / division": "Multiplication / Division",
    "off-course": "Off-Course",
    "operating cost": "Operating Cost",
    "overtaking aircraft": "Overtaking Aircraft",
    percentages: "Percentages",
    "pressure altitude": "Pressure Altitude",
    "radius of action": "Radius of Action",
    "rate of climb": "Rate of Climb",
    "rate of descent": "Rate of Descent",
    "ratios / proportions": "Ratios / Proportions",
    "rotational speed": "Rotational Speed",
    "square roots": "Square Roots",
    "standard atmosphere": "Standard Atmosphere",
    "takeoff/landing performance": "Takeoff/Landing Performance",
    "temperature change": "Temperature Change",
    "thrust / power ratios": "Thrust / Power Ratios",
    "time problems with hours/min/sec": "Time Problems with Hours/Min/Sec",
    "time to vor": "Time to VOR",
    "true altitude": "True Altitude",
    "weight change": "Weight Change",
    "weight shift": "Weight Shift",
    "wind correction": "Wind Correction",
  })
);

const CATEGORY_OVERRIDES = new Map(
  Object.entries({
    "2004_regionals:30": "Interpolation / Extrapolation",
    "2005_nationals:27": "Operating Cost",
    "2005_nationals:28": "Climb/Cruise/Descent Planning",
    "2005_nationals:29": "Climb/Cruise/Descent Planning",
    "2006_regionals:25": "Geometry / Trigonometry",
    "2007_regionals:11": "Glide Performance",
    "2007_regionals:29": "Climb/Cruise/Descent Planning",
    "2008_regionals:20": "Overtaking Aircraft",
    "2009_nationals:5": "Area / Loading",
    "2009_nationals:9": "Wind Correction",
    "2012_nationals:1": "Takeoff/Landing Performance",
    "2012_nationals:14": "True Altitude",
    "2012_regionals:6": "Equal Time Point",
    "2013_nationals:16": "Operating Cost",
    "2014_regionals:5": "Glide Performance",
    "2015_nationals:19": "Airspeed / Mach",
    "2015_nationals:27": "Glide Performance",
    "2016_nationals:5": "Weight Change",
    "2016_nationals:17": "Glide Performance",
    "2016_nationals:23": "Turn Performance",
    "2018_nationals:11": "True Altitude",
    "2018_regionals:1": "Ratios / Proportions",
    "2018_regionals:7": "Time Problems with Hours/Min/Sec",
    "2019_nationals:7": "Temperature Change",
    "2019_regionals:21": "Thrust / Power Ratios",
    "2020_regionals:1": "Geometry / Trigonometry",
    "2021_regionals:30": "Takeoff/Landing Performance",
    "2022_nationals:26": "Time to VOR",
    "2023_nationals:20": "Rotational Speed",
    "2025_nationals:19": "Conversions",
    "2025_regionals:29": "Airspeed / Mach",
  })
);

const CATEGORY_COLUMNS = ["problem_type", "problemType", "category", "type_of_problem", "typeOfProblem"];

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

function parseCsvText(text) {
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
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function parseCsvRecords(text) {
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;
  let fieldStart = text.startsWith("\uFEFF") ? 1 : 0;
  let recordStart = 0;

  function pushField(rawEnd) {
    row.push({ value: field, rawStart: fieldStart, rawEnd });
    field = "";
  }

  function pushRecord(rawEnd, nextStart) {
    pushField(rawEnd);
    records.push({ fields: row, rawStart: recordStart, rawEnd });
    row = [];
    recordStart = nextStart;
    fieldStart = nextStart;
  }

  for (let i = fieldStart; i < text.length; i += 1) {
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
      pushField(i);
      fieldStart = i + 1;
    } else if (char === "\r" || char === "\n") {
      const nextStart = char === "\r" && next === "\n" ? i + 2 : i + 1;
      pushRecord(i, nextStart);
      if (nextStart === i + 2) i += 1;
    } else {
      field += char;
    }
  }

  if (field.length || row.length || fieldStart < text.length) {
    pushRecord(text.length, text.length);
  }

  return records.filter((record) => record.fields.some((cell) => String(cell.value || "").trim()));
}

function escapeCsvField(value) {
  const text = String(value || "");
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
  const normalized = cells.map((line) => {
    const next = [...line];
    while (next.length < columnCount) next.push("");
    return next;
  });

  return {
    type: "table",
    headers: normalized[0],
    rows: normalized.slice(1),
  };
}

function canonicalCategory(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return CATEGORY_TITLES.get(text.toLowerCase()) || text;
}

function categoryLabel(value) {
  return canonicalCategory(value);
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
  for (const column of CATEGORY_COLUMNS) {
    const value = canonicalCategory(row[column]);
    if (value) return value;
  }
  return "";
}

function categorySort(left, right) {
  if (left.count !== right.count) return right.count - left.count;
  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
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

function loadBaselineCategories() {
  const categories = new Map();
  const testsDir = path.join(DOCS_DATA_DIR, "tests");
  if (!fs.existsSync(testsDir)) return categories;

  for (const fileName of fs.readdirSync(testsDir).filter((file) => file.endsWith(".json"))) {
    const test = JSON.parse(fs.readFileSync(path.join(testsDir, fileName), "utf8"));
    for (const question of test.questions || []) {
      categories.set(`${test.id}:${question.number}`, canonicalCategory(question.category));
    }
  }

  return categories;
}

function flattenQuestion(row) {
  return [
    row.answer_key_type,
    row.question,
    row.correct_choice,
    row.context,
    row.table,
    row.choice_a,
    row.choice_b,
    row.choice_c,
    row.choice_d,
    row.choice_e,
  ]
    .join(" ")
    .toLowerCase();
}

function has(value, pattern) {
  return pattern.test(value);
}

function classifyQuestion(row, meta) {
  const number = String(row.number || "").trim();
  const override = CATEGORY_OVERRIDES.get(`${meta.id}:${number}`);
  if (override) return override;

  const text = flattenQuestion(row);
  const question = String(row.question || "").toLowerCase();
  const answerType = String(row.answer_key_type || "").toLowerCase();

  if (has(question, /density altitude/) || has(answerType, /density altitude/)) return "Density Altitude";
  if (has(text, /glide ratio|gliding range|glide to shore|engine fails|engine failure|remain within gliding range|sailplane/)) return "Glide Performance";
  if (has(text, /turn around (a )?point|circle around|full circle|360.*turn|standard rate|diameter of your turn|radius in the turn|pivotal altitude|perfect circle|laps around/)) return "Turn Performance";
  if (has(question, /vmo|\bmach\b|speed of sound|sonic|indicated airspeed|calibrated airspeed|true airspeed equivalent|ram rise|temperature rise|recovery coefficient|indicated temperature/) || has(answerType, /mach|ias|tas/)) return "Airspeed / Mach";
  if (has(question, /pressure altitude/) && !has(question, /true altitude/)) return "Pressure Altitude";
  if (has(question, /standard temperature/)) return "Standard Atmosphere";
  if (has(question, /true altitude|actual altitude|indicated altitude|calibrated altitude|altimeter setting|altimeter read|terrain clearance|cold temperatures?|how far below indicated/)) return "True Altitude";
  if (has(text, /\bcg\b|weight and balance|station|moment|arm/) && has(text, /weight|loaded|passengers|fuel|bags|baggage|station|moment|\bcg\b/)) return "Weight Change";
  if (has(text, /load factor|bank angle|steep turn|\bg['’]?s\b|\d+(\.\d+)?g\b|wing loading/)) return "Load Factor / Bank Angle";
  if (has(text, /distance in cruise|miles of flight during cruise|how many nautical miles will you spend in cruise|route 1|route 2|change.*altitudes at the halfway|total time airborne|climb rate and descent fuel burn|climb.*descen/)) return "Climb/Cruise/Descent Planning";
  if (has(text, /temperature|brake|engine temperature|cooling|decelerating|reduction in airspeed/)) return "Temperature Change";
  if (has(text, /wheel speed|diameter tires|anti-skid/)) return "Rotational Speed";
  if (has(text, /thrust to weight|thrust-to-weight|vertical component of thrust/)) return "Thrust / Power Ratios";
  if (has(text, /takeoff|landing|ground roll|runway|poh|rotate|clear (the )?standard 50|obstacle|grass runway|upslope|wet/)) return "Takeoff/Landing Performance";
  if (has(text, /cross paths|intercept point|converging traffic|friend departs|same time|opposite flight path|pass each other|overtake|spacing|directly towards/)) return "Overtaking Aircraft";
  if (has(text, /dme|slant range|above the earth|directly below/)) return "DME Slant Range";
  if (has(text, /operat.*cost|costs? \$|taxpayer expense|cheaper to operate/)) return "Operating Cost";
  if (has(text, /square root/)) return "Square Roots";
  if (has(text, /pallet|floor load|pounds per square foot|pounds per square inch|pressure is being exerted|wing loading|area of|diameter comparison/)) return "Area / Loading";
  if (has(text, /latitude|longitude|distance between|angle from your eyes|radar.*tilt|beam width|tree|redwood|tie-down ropes|deviation|turn 60|course at|how far away from your friend|field of view/)) return "Geometry / Trigonometry";
  if (has(text, /parasite drag|square of an increase/)) return "Ratios / Proportions";
  if (has(text, /fuel|gph|burn|oil|avgas|drum|gallon|quarts|pints/)) return "Fuel Burn / Fuel Required";
  if (has(text, /percent|percentage|tax rate|tip|increase|decrease/)) return "Percentages";
  if (has(text, /radials|vor/)) return "Time to VOR";

  return "Miscellaneous";
}

function chooseCategory(row, meta, baselineCategories) {
  const number = String(row.number || "").trim();
  const current = rowCategory(row);
  const baseline = baselineCategories.get(`${meta.id}:${number}`) || "";
  const startingCategory = current || baseline;

  if (!startingCategory || categoryKey(startingCategory) === "miscellaneous") {
    return canonicalCategory(classifyQuestion(row, meta));
  }

  return canonicalCategory(startingCategory);
}

function getCategoryColumn(headers, fileName) {
  const categoryColumnIndex = headers.findIndex((header) => CATEGORY_COLUMNS.includes(header));
  if (categoryColumnIndex === -1) {
    throw new Error(`${fileName} does not have a category column`);
  }
  return {
    categoryColumnIndex,
    categoryColumn: headers[categoryColumnIndex],
  };
}

function consolidateCategory(category, categoryCounts) {
  const title = categoryLabel(category);
  if (categoryKey(title) === "miscellaneous") return "Miscellaneous";
  return (categoryCounts.get(title) || 0) <= MISCELLANEOUS_THRESHOLD ? "Miscellaneous" : title;
}

function collectProposedTests(baselineCategories) {
  const allTests = [];
  const categoryCounts = new Map();

  for (const fileName of listCsvFiles()) {
    const meta = parseMeta(fileName);
    const rows = parseCsvText(fs.readFileSync(path.join(CSV_DIR, fileName), "utf8"));
    const questions = rows.map((row, index) => {
      const category = chooseCategory(row, meta, baselineCategories);
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      return {
        row,
        question: buildQuestion({ ...row, problem_type: category }, index, meta),
      };
    });
    allTests.push({ meta, questions });
  }

  return { allTests, categoryCounts };
}

function buildFinalCategoryMap(allTests, categoryCounts) {
  const finalCategoryByQuestion = new Map();

  for (const test of allTests) {
    for (const { question } of test.questions) {
      finalCategoryByQuestion.set(
        `${test.meta.id}:${question.number}`,
        consolidateCategory(question.category, categoryCounts)
      );
    }
  }

  return finalCategoryByQuestion;
}

function updateCsvFile(fileName, finalCategoryByQuestion) {
  const filePath = path.join(CSV_DIR, fileName);
  const text = fs.readFileSync(filePath, "utf8");
  const records = parseCsvRecords(text);
  if (records.length < 2) return { changed: false, rows: [] };

  const meta = parseMeta(fileName);
  const headers = records[0].fields.map((field) => field.value);
  const { categoryColumnIndex, categoryColumn } = getCategoryColumn(headers, fileName);

  const rows = [];
  const replacements = [];
  for (const record of records.slice(1)) {
    const row = Object.fromEntries(headers.map((header, index) => [header, record.fields[index]?.value || ""]));
    const category = finalCategoryByQuestion.get(`${meta.id}:${String(row.number || "").trim()}`) || "Miscellaneous";
    row[categoryColumn] = category;
    rows.push(row);

    const field = record.fields[categoryColumnIndex];
    if (!field) throw new Error(`${fileName} row ${row.number || rows.length} is missing ${categoryColumn}`);
    if (field.value !== category) {
      replacements.push({ start: field.rawStart, end: field.rawEnd, value: escapeCsvField(category) });
    }
  }

  if (!replacements.length) return { changed: false, rows };

  let output = "";
  let cursor = 0;
  for (const replacement of replacements) {
    output += text.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }
  output += text.slice(cursor);
  fs.writeFileSync(filePath, output);

  return { changed: true, rows };
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

function buildDocsData(allTests) {
  const testsDir = path.join(DOCS_DATA_DIR, "tests");
  const categoriesDir = path.join(DOCS_DATA_DIR, "categories");
  fs.rmSync(testsDir, { recursive: true, force: true });
  fs.rmSync(categoriesDir, { recursive: true, force: true });
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(categoriesDir, { recursive: true });

  const tests = [];
  const categoryMap = new Map();

  for (const test of allTests) {
    tests.push({
      ...test.meta,
      count: test.questions.length,
      selectionType: "test",
    });

    fs.writeFileSync(
      path.join(testsDir, `${test.meta.id}.json`),
      JSON.stringify({
        ...test.meta,
        count: test.questions.length,
        selectionType: "test",
        questions: test.questions,
      })
    );

    for (const question of test.questions) {
      const title = categoryLabel(question.category);
      const key = categoryKey(title);
      if (!key) continue;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          id: categoryId(title),
          key,
          title,
          count: 0,
          selectionType: "category",
          questions: [],
        });
      }
      const category = categoryMap.get(key);
      category.count += 1;
      category.questions.push({
        ...question,
        index: category.questions.length,
        uid: `${question.sourceTestId}:${question.uid}`,
      });
    }
  }

  const categories = Array.from(categoryMap.values())
    .sort(categorySort);

  fs.writeFileSync(
    path.join(DOCS_DATA_DIR, "tests.json"),
    JSON.stringify({
      csvDir: "./Code E6-B",
      tests,
      categories: categories.map(({ key, questions, ...category }) => category),
    })
  );

  for (const { key, ...category } of categories) {
    fs.writeFileSync(path.join(categoriesDir, `${category.id}.json`), JSON.stringify(category));
  }
}

function main() {
  const baselineCategories = loadBaselineCategories();
  const proposed = collectProposedTests(baselineCategories);
  const finalCategoryByQuestion = buildFinalCategoryMap(proposed.allTests, proposed.categoryCounts);
  const changedFiles = [];
  const allTests = [];

  for (const fileName of listCsvFiles()) {
    const meta = parseMeta(fileName);
    const result = updateCsvFile(fileName, finalCategoryByQuestion);
    if (result.changed) changedFiles.push(fileName);

    const rows = parseCsvText(fs.readFileSync(path.join(CSV_DIR, fileName), "utf8"));
    const questions = rows.map((row, index) => buildQuestion(row, index, meta));
    allTests.push({ meta, questions });
  }

  buildDocsData(allTests);

  const counts = new Map();
  let total = 0;
  for (const test of allTests) {
    for (const question of test.questions) {
      total += 1;
      const category = categoryLabel(question.category);
      counts.set(category, (counts.get(category) || 0) + 1);
    }
  }

  const miscellaneousCount = counts.get("Miscellaneous") || 0;
  console.log(`Categorized ${total} questions across ${allTests.length} tests.`);
  console.log(`Updated ${changedFiles.length} CSV files.`);
  console.log(`Moved categories with ${MISCELLANEOUS_THRESHOLD} or fewer questions into Miscellaneous.`);
  console.log(`Miscellaneous total: ${miscellaneousCount}`);
  console.log("Top categories:");
  for (const [category, count] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`${String(count).padStart(4)}  ${category}`);
  }
}

main();
