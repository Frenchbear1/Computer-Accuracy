const $ = (selector) => document.querySelector(selector);
const RUN_LOG_KEY = "computerAccuracyRunLog:v1";
const INCOMPLETE_TESTS_KEY = "computerAccuracyIncompleteTests:v1";
const INSTANT_REVEAL_KEY = "computerAccuracyInstantReveal:v1";
const AUTO_FINISH_KEY = "computerAccuracyAutoFinishHour:v1";
const SELECTED_TEST_KEY = "computerAccuracySelectedTest:v1";
const ONE_HOUR_MS = 60 * 60 * 1000;
const STATIC_DATA_ROOT = new URL("./data/", window.location.href);

const state = {
  tests: [],
  categories: [],
  selectedTestId: null,
  currentTest: null,
  currentIndex: 0,
  order: [],
  menuMode: "tests",
  reviewMode: false,
  started: false,
  headerCollapsed: false,
  timerStartedAt: null,
  timerInterval: null,
  timerElapsedMs: 0,
  activeRunId: null,
  activeRunSaved: false,
  instantReveal: true,
  autoFinishHour: false,
  runLog: [],
  incompleteTests: [],
  answers: new Map(),
  flags: new Map(),
  helpers: new Map(),
  contextCollapsed: false,
  contextTop: false,
  searchIndex: [],
  searchIndexLoaded: false,
  searchIndexLoading: null,
  searchIndexError: "",
};

const els = {
  homeScreen: $("#homeScreen"),
  practiceShell: $("#practiceShell"),
  practiceHeader: $("#practiceHeader"),
  testDrawer: $("#testDrawer"),
  drawerBackdrop: $("#drawerBackdrop"),
  logBackdrop: $("#logBackdrop"),
  searchBackdrop: $("#searchBackdrop"),
  resultsBackdrop: $("#resultsBackdrop"),
  chooseTestBtn: $("#chooseTestBtn"),
  selectedTestKicker: $("#selectedTestKicker"),
  homeLogBtn: $("#homeLogBtn"),
  homeSearchBtn: $("#homeSearchBtn"),
  startBtn: $("#startBtn"),
  instantRevealToggle: $("#instantRevealToggle"),
  autoFinishSetting: $("#autoFinishSetting"),
  autoFinishToggle: $("#autoFinishToggle"),
  resumePanel: $("#resumePanel"),
  resumeList: $("#resumeList"),
  closeMenuBtn: $("#closeMenuBtn"),
  practiceHomeBtn: $("#practiceHomeBtn"),
  selectedTestTitle: $("#selectedTestTitle"),
  selectedTestMeta: $("#selectedTestMeta"),
  menuFilters: $("#menuFilters"),
  testModeBtn: $("#testModeBtn"),
  categoryModeBtn: $("#categoryModeBtn"),
  yearFilter: $("#yearFilter"),
  eventFilter: $("#eventFilter"),
  testMenu: $("#testMenu"),
  testKicker: $("#testKicker"),
  testTitle: $("#testTitle"),
  timerText: $("#timerText"),
  statusStrip: $("#statusStrip"),
  progressText: $("#progressText"),
  scoreText: $("#scoreText"),
  answeredText: $("#answeredText"),
  toggleHeaderBtn: $("#toggleHeaderBtn"),
  questionTimeline: $("#questionTimeline"),
  timelineList: $("#timelineList"),
  timelinePicker: $("#timelinePicker"),
  timelinePickerLabel: $("#timelinePickerLabel"),
  timelinePickerMenu: $("#timelinePickerMenu"),
  questionNumber: $("#questionNumber"),
  flagBtn: $("#flagBtn"),
  questionText: $("#questionText"),
  answerArea: $("#answerArea"),
  feedback: $("#feedback"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  hintBtn: $("#hintBtn"),
  revealBtn: $("#revealBtn"),
  resetQuestionBtn: $("#resetQuestionBtn"),
  resetBtn: $("#resetBtn"),
  shuffleBtn: $("#shuffleBtn"),
  contextDock: $("#contextDock"),
  contextBody: $("#contextBody"),
  dockToggleBtn: $("#dockToggleBtn"),
  dockPositionBtn: $("#dockPositionBtn"),
  logModal: $("#logModal"),
  closeLogBtn: $("#closeLogBtn"),
  logList: $("#logList"),
  searchModal: $("#searchModal"),
  closeSearchBtn: $("#closeSearchBtn"),
  searchInput: $("#searchInput"),
  searchStatus: $("#searchStatus"),
  searchResults: $("#searchResults"),
  resultsModal: $("#resultsModal"),
  closeResultsBtn: $("#closeResultsBtn"),
  resultsTitle: $("#resultsTitle"),
  resultsSummary: $("#resultsSummary"),
  resultsList: $("#resultsList"),
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
}

function extractNumbers(value) {
  return String(value || "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/g)
    ?.map(Number) || [];
}

function answerMatches(input, correct) {
  const left = normalizeText(input);
  const right = normalizeText(correct);
  if (!left || !right) return false;
  if (left === right) return true;

  const inputNumbers = extractNumbers(input);
  const correctNumbers = extractNumbers(correct);
  if (!inputNumbers.length || !correctNumbers.length) return false;

  const value = inputNumbers[0];
  if (correctNumbers.length >= 2) {
    const low = Math.min(correctNumbers[0], correctNumbers[1]);
    const high = Math.max(correctNumbers[0], correctNumbers[1]);
    return value >= low - 0.02 && value <= high + 0.02;
  }

  return Math.abs(value - correctNumbers[0]) <= 0.02;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function shuffled(items) {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function questionNumber(question) {
  const number = Number.parseInt(question?.number, 10);
  return Number.isFinite(number) ? number : null;
}

function contextSignature(question) {
  const baseContext = String(question.context || "")
    .split("[[DIVIDER]]")[0]
    .replace(/\s+/g, " ")
    .trim();
  const tableContext = question.table ? JSON.stringify(question.table) : "";
  if (!baseContext && !tableContext) return "";
  return `${baseContext}::${tableContext}`;
}

function buildShuffleBlocks(questions) {
  const parent = questions.map((_, index) => index);
  const byNumber = new Map();
  const scopeKey = (question, number) =>
    `${String(question?.referenceScope || state.currentTest?.id || "")}:${String(number)}`;
  questions.forEach((question, index) => {
    const number = questionNumber(question);
    if (number !== null) byNumber.set(scopeKey(question, number), index);
  });

  const find = (index) => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (left, right) => {
    if (left === undefined || right === undefined) return;
    const rootLeft = find(left);
    const rootRight = find(right);
    if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
  };
  const unionByNumber = (sourceIndex, number, scope) => {
    const targetIndex = byNumber.get(`${scope}:${String(number)}`);
    if (targetIndex !== undefined) union(sourceIndex, targetIndex);
  };

  const contextGroups = new Map();
  questions.forEach((question, index) => {
    const signature = contextSignature(question);
    if (!signature) return;
    if (contextGroups.has(signature)) union(index, contextGroups.get(signature));
    else contextGroups.set(signature, index);
  });

  questions.forEach((question, index) => {
    const currentNumber = questionNumber(question);
    const referenceScope = String(question?.referenceScope || state.currentTest?.id || "");
    const combined = `${question.question || ""} ${question.context || ""}`;

    for (const match of combined.matchAll(/questions?\s+(\d{1,2})\s*(?:-|through|to)\s*(\d{1,2})/gi)) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        for (let number = Math.min(start, end); number <= Math.max(start, end); number += 1) {
          unionByNumber(index, number, referenceScope);
        }
      }
    }

    for (const match of combined.matchAll(/\b(?:referenced\s+question|question|problem|problems?)\s*#?\s*(\d{1,2})\b/gi)) {
      unionByNumber(index, Number(match[1]), referenceScope);
    }

    for (const match of combined.matchAll(/\b(?:questions?|problems?)\s+(\d{1,2})\s+and\s+(\d{1,2})\b/gi)) {
      unionByNumber(index, Number(match[1]), referenceScope);
      unionByNumber(index, Number(match[2]), referenceScope);
    }

    if (
      currentNumber !== null &&
      /\b(?:previous|preceding)\s+(?:question|problem)\b/i.test(combined)
    ) {
      unionByNumber(index, currentNumber - 1, referenceScope);
    }
  });

  const grouped = new Map();
  questions.forEach((question, index) => {
    const root = find(index);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(question);
  });

  return [...grouped.values()].sort(
    (left, right) => questions.indexOf(left[0]) - questions.indexOf(right[0])
  );
}

function selectedTestMeta() {
  return selectionMetaById(state.selectedTestId);
}

function supportsAutoFinish(selection) {
  return selection?.selectionType !== "category";
}

function selectionMetaById(id) {
  return (
    state.tests.find((test) => test.id === id) ||
    state.categories.find((category) => category.id === id) ||
    null
  );
}

function isCategorySelection(id = state.selectedTestId) {
  return state.categories.some((category) => category.id === id);
}

function questionId(question) {
  return String(question?.uid || question?.number || "");
}

function questionLabel(question) {
  if (state.currentTest?.selectionType === "category" && question?.sourceTestTitle) {
    return `${question.sourceTestTitle} - Question ${question.number}`;
  }
  return `Question ${question.number}`;
}

function createRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadRunLog() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(RUN_LOG_KEY) || "[]");
    state.runLog = Array.isArray(saved) ? saved : [];
  } catch {
    state.runLog = [];
  }
}

function saveRunLog() {
  try {
    window.localStorage.setItem(RUN_LOG_KEY, JSON.stringify(state.runLog));
  } catch {
    setFeedback("The run log could not be saved in this browser.", "bad");
  }
}

function loadIncompleteTests() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(INCOMPLETE_TESTS_KEY) || "[]");
    state.incompleteTests = Array.isArray(saved) ? saved : [];
  } catch {
    state.incompleteTests = [];
  }
}

function saveIncompleteTests() {
  try {
    window.localStorage.setItem(INCOMPLETE_TESTS_KEY, JSON.stringify(state.incompleteTests));
  } catch {
    setFeedback("Unfinished tests could not be saved in this browser.", "bad");
  }
}

function loadInstantRevealSetting() {
  const saved = window.localStorage.getItem(INSTANT_REVEAL_KEY);
  state.instantReveal = saved === null ? true : saved === "true";
  els.instantRevealToggle.checked = state.instantReveal;
}

function saveInstantRevealSetting() {
  window.localStorage.setItem(INSTANT_REVEAL_KEY, String(state.instantReveal));
}

function loadAutoFinishSetting() {
  const saved = window.localStorage.getItem(AUTO_FINISH_KEY);
  state.autoFinishHour = saved === "true";
  els.autoFinishToggle.checked = state.autoFinishHour;
}

function saveAutoFinishSetting() {
  window.localStorage.setItem(AUTO_FINISH_KEY, String(state.autoFinishHour));
}

function loadSelectedTestId() {
  const saved = window.localStorage.getItem(SELECTED_TEST_KEY);
  if (selectionMetaById(saved)) return saved;
  return state.tests[0]?.id || state.categories[0]?.id || null;
}

function saveSelectedTestId() {
  if (state.selectedTestId) {
    window.localStorage.setItem(SELECTED_TEST_KEY, state.selectedTestId);
  }
}

function setPracticeHeaderCollapsed(collapsed) {
  state.headerCollapsed = Boolean(collapsed);
  els.practiceHeader.classList.toggle("collapsed", state.headerCollapsed);
  els.toggleHeaderBtn.textContent = state.headerCollapsed ? "+" : "-";
  els.toggleHeaderBtn.setAttribute(
    "aria-label",
    state.headerCollapsed ? "Expand practice header" : "Minimize practice header"
  );
  els.toggleHeaderBtn.title = state.headerCollapsed
    ? "Expand practice header"
    : "Minimize practice header";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchCatalog() {
  try {
    return await fetchJson("/api/tests");
  } catch {
    return fetchJson(new URL("tests.json", STATIC_DATA_ROOT));
  }
}

async function fetchSelection(id, type) {
  const encodedId = encodeURIComponent(id);
  const apiPath = type === "category" ? `/api/categories/${encodedId}` : `/api/tests/${encodedId}`;
  const staticPath = new URL(`${type === "category" ? "categories" : "tests"}/${encodedId}.json`, STATIC_DATA_ROOT);

  try {
    return await fetchJson(apiPath);
  } catch {
    return fetchJson(staticPath);
  }
}

function shouldShowAnswerResults() {
  return state.instantReveal || state.activeRunSaved;
}

function formatCompletedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSavedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function completedTime(run) {
  const time = new Date(run.completedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

function attemptWord(count) {
  return count === 1 ? "attempt" : "attempts";
}

function scorePercent(run) {
  const total = Number(run.total) || 0;
  const correct = Number(run.correct) || 0;
  return total ? Math.round((correct / total) * 100) : 0;
}

function groupedRuns() {
  const groups = new Map();
  state.runLog.forEach((run) => {
    const key = run.testId || run.testTitle || "unknown-test";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: run.testTitle || "Practice run",
        runs: [],
      });
    }
    groups.get(key).runs.push(run);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      runs: group.runs.sort((left, right) => completedTime(right) - completedTime(left)),
    }))
    .sort((left, right) => completedTime(right.runs[0]) - completedTime(left.runs[0]));
}

function groupStats(group) {
  const runs = group.runs.filter((run) => Number(run.total) > 0);
  if (!runs.length) return { best: "Best 0%", average: "Avg 0%" };

  const best = runs.reduce((winner, run) => (scorePercent(run) > scorePercent(winner) ? run : winner));
  const average = Math.round(runs.reduce((sum, run) => sum + scorePercent(run), 0) / runs.length);
  return {
    best: `Best ${best.correct || 0}/${best.total || 0}`,
    average: `Avg ${average}%`,
  };
}

function addStat(target, text) {
  const pill = document.createElement("span");
  pill.className = "log-stat";
  pill.textContent = text;
  target.appendChild(pill);
}

function renderRunLog() {
  clearNode(els.logList);
  if (!state.runLog.length) {
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "No saved runs yet.";
    els.logList.appendChild(empty);
    return;
  }

  groupedRuns().forEach((group) => {
    const section = document.createElement("article");
    section.className = "log-group";

    const header = document.createElement("div");
    header.className = "log-group-header";

    const titleBlock = document.createElement("div");
    titleBlock.className = "log-group-title";

    const title = document.createElement("h3");
    title.textContent = group.title;

    const attempts = document.createElement("p");
    attempts.textContent = `${group.runs.length} ${attemptWord(group.runs.length)}`;

    titleBlock.append(title, attempts);

    const stats = document.createElement("div");
    stats.className = "log-group-stats";
    const summary = groupStats(group);
    addStat(stats, summary.best);
    addStat(stats, summary.average);

    header.append(titleBlock, stats);

    const attemptList = document.createElement("div");
    attemptList.className = "log-attempts";

    group.runs.forEach((run, index) => {
      const row = document.createElement("div");
      row.className = "log-item";
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-label", `View ${group.title} attempt ${group.runs.length - index} details`);
      row.addEventListener("click", () => openRunDetails(run));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRunDetails(run);
        }
      });

      const main = document.createElement("div");
      main.className = "log-main";

      const titleRow = document.createElement("div");
      titleRow.className = "log-title-row";

      const attemptTitle = document.createElement("h4");
      attemptTitle.textContent = `Attempt ${group.runs.length - index}`;

      const completedAt = document.createElement("span");
      completedAt.className = "log-date";
      completedAt.textContent = formatCompletedAt(run.completedAt);

      titleRow.append(attemptTitle, completedAt);

      const meta = document.createElement("div");
      meta.className = "log-meta";
      addStat(meta, `Time ${formatElapsed(run.elapsedMs || 0)}`);
      addStat(meta, `${run.correct || 0}/${run.total || 0} right`);
      addStat(meta, `${scorePercent(run)}%`);
      if (Number.isFinite(Number(run.answered))) {
        addStat(meta, `${run.answered || 0} answered`);
      }

      main.append(titleRow, meta);

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "log-delete";
      deleteButton.setAttribute("aria-label", `Delete ${group.title} attempt`);
      deleteButton.innerHTML = `<svg class="trash-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v10h6v-1h2v3H7V9Z"/></svg>`;
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteRun(run.id);
      });

      row.append(main, deleteButton);
      attemptList.appendChild(row);
    });

    section.append(header, attemptList);
    els.logList.appendChild(section);
  });
}

function openRunDetails(run) {
  setResultsOpen(true, run);
}

function choiceDisplay(question, letter) {
  if (!letter) return "";
  const choice = question.choices?.find((item) => item.letter === letter);
  return choice ? `${choice.letter}. ${choice.text}` : letter;
}

function userAnswerDisplay(question, answer) {
  if (!answer?.checked) return "No answer";
  if (question.questionType === "fill_in_blank") return answer.input || "Blank";
  return choiceDisplay(question, answer.selected);
}

function correctAnswerDisplay(question) {
  if (question.questionType === "fill_in_blank") {
    return question.correctChoice || question.answerKey || "Answer unavailable";
  }
  return choiceDisplay(question, question.answerKey) || question.correctChoice || question.answerKey;
}

function resultStatus(question) {
  const answer = state.answers.get(answerKey(question));
  if (!answer?.checked) return "unanswered";
  return answer.correct ? "correct" : "incorrect";
}

function questionTextForResults(question) {
  return String(question.question || "")
    .replace(/\[\[(?:TABLE|DIVIDER|NEXT_LINE)\]\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resultRecordFromQuestion(question) {
  const answer = state.answers.get(answerKey(question));
  const status = resultStatus(question);
  return {
    questionId: questionId(question),
    number: String(question.number || ""),
    questionText: questionTextForResults(question),
    userAnswer: userAnswerDisplay(question, answer),
    correctAnswer: correctAnswerDisplay(question),
    status,
    flagged: Boolean(state.flags.get(answerKey(question))),
  };
}

function runQuestionResults(run) {
  if (Array.isArray(run?.questions)) return run.questions;
  if (run) return [];
  if (!state.currentTest) return [];
  return state.currentTest.questions.map(resultRecordFromQuestion);
}

function renderResultsModal(run) {
  clearNode(els.resultsSummary);
  clearNode(els.resultsList);

  const questions = runQuestionResults(run);
  const total = run?.total || questions.length || state.currentTest?.questions.length || 0;
  const answered = run?.answered ?? scoreStats().answered;
  const correct = run?.correct ?? scoreStats().correct;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  const elapsed = run?.elapsedMs ?? elapsedMs();
  els.resultsTitle.textContent = run?.testTitle ? `${run.testTitle} results` : "Test results";

  [
    [`Score`, `${correct}/${total}`],
    [`Percent`, `${percent}%`],
    [`Answered`, `${answered}/${total}`],
    [`Time`, formatElapsed(elapsed)],
  ].forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "result-stat";
    const statLabel = document.createElement("span");
    statLabel.textContent = label;
    const statValue = document.createElement("strong");
    statValue.textContent = value;
    item.append(statLabel, statValue);
    els.resultsSummary.appendChild(item);
  });

  if (!questions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "Question-level details are available for runs saved from now on.";
    els.resultsList.appendChild(empty);
    return;
  }

  questions.forEach((result) => {
    const status = result.status || "unanswered";
    const row = document.createElement("button");
    row.type = "button";
    row.className = `result-row ${status}`;
    row.classList.toggle("flagged", Boolean(result.flagged));
    const canJumpToQuestion =
      state.currentTest?.questions?.length && (!run?.testId || state.currentTest.id === run.testId);
    if (canJumpToQuestion) {
      row.addEventListener("click", () => {
        setResultsOpen(false);
        state.reviewMode = false;
        state.order = [...state.currentTest.questions];
        state.currentIndex = state.order.findIndex(
          (item) =>
            questionId(item) === String(result.questionId || "") ||
            String(item.number) === String(result.number)
        );
        if (state.currentIndex < 0) state.currentIndex = 0;
        renderQuestion();
      });
    }

    const badge = document.createElement("span");
    badge.className = "result-badge";
    badge.textContent = result.number;

    const main = document.createElement("span");
    main.className = "result-main";
    const prompt = document.createElement("strong");
    prompt.textContent = result.questionText || "Question";
    const userAnswer = document.createElement("small");
    userAnswer.textContent = `Your answer: ${result.userAnswer || "No answer"}`;
    const correctAnswer = document.createElement("small");
    correctAnswer.textContent = `Correct answer: ${result.correctAnswer || "Answer unavailable"}`;
    main.append(prompt, userAnswer, correctAnswer);
    if (result.flagged) {
      const flagged = document.createElement("small");
      flagged.className = "result-flag";
      flagged.textContent = "Flagged";
      main.appendChild(flagged);
    }

    const stateLabel = document.createElement("span");
    stateLabel.className = "result-state";
    stateLabel.textContent = result.flagged ? `${status} - flagged` : status;

    row.append(badge, main, stateLabel);
    els.resultsList.appendChild(row);
  });
}

function setResultsOpen(open, run = null) {
  if (open) {
    setLogOpen(false);
    setSearchOpen(false);
    renderResultsModal(run);
    els.resultsModal.hidden = false;
    els.resultsBackdrop.hidden = false;
  } else {
    els.resultsModal.hidden = true;
    els.resultsBackdrop.hidden = true;
  }
}

function addResumeStat(target, text) {
  const pill = document.createElement("span");
  pill.className = "resume-stat";
  pill.textContent = text;
  target.appendChild(pill);
}

function renderResumePanel() {
  clearNode(els.resumeList);
  els.resumePanel.hidden = !state.incompleteTests.length;
  if (!state.incompleteTests.length) return;

  state.incompleteTests.forEach((saved) => {
    const item = document.createElement("article");
    item.className = "resume-item";

    const main = document.createElement("div");
    main.className = "resume-main";

    const title = document.createElement("h4");
    title.textContent = saved.testTitle || "Unfinished test";

    const meta = document.createElement("div");
    meta.className = "resume-meta";
    const total = Number(saved.total) || 0;
    const current = Math.min(Number(saved.currentIndex || 0) + 1, total || 1);
    addResumeStat(meta, total ? `Question ${current}/${total}` : "In progress");
    addResumeStat(meta, `Time ${formatElapsed(saved.elapsedMs || 0)}`);
    if (Number.isFinite(Number(saved.answered))) addResumeStat(meta, `${saved.answered || 0} answered`);
    addResumeStat(meta, formatSavedAt(saved.savedAt));

    main.append(title, meta);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "resume-play nav-btn primary";
    button.setAttribute("aria-label", `Resume ${saved.testTitle || "test"}`);
    button.innerHTML = `<svg class="play-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5Z"/></svg>`;
    button.addEventListener("click", () => resumeIncompleteTest(saved.id));

    const actions = document.createElement("div");
    actions.className = "resume-actions";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "resume-delete";
    deleteButton.setAttribute("aria-label", `Delete unfinished ${saved.testTitle || "test"}`);
    deleteButton.innerHTML = `<svg class="trash-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v9h-2V9Zm4 0h2v9h-2V9ZM7 9h2v10h6v-1h2v3H7V9Z"/></svg>`;
    deleteButton.addEventListener("click", () => removeIncompleteProgress(saved.id));

    actions.append(deleteButton, button);
    item.append(main, actions);
    els.resumeList.appendChild(item);
  });
}

function setLogOpen(open) {
  if (open) {
    setResultsOpen(false);
    setSearchOpen(false);
    renderRunLog();
    els.logModal.hidden = false;
    els.logBackdrop.hidden = false;
  } else {
    els.logModal.hidden = true;
    els.logBackdrop.hidden = true;
  }
}

function deleteRun(id) {
  state.runLog = state.runLog.filter((run) => run.id !== id);
  saveRunLog();
  renderRunLog();
}

function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value) => String(value).padStart(2, "0");
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

function elapsedMs() {
  if (!state.timerStartedAt) return state.timerElapsedMs;
  return Date.now() - state.timerStartedAt;
}

function updateTimer() {
  const elapsed = elapsedMs();
  if (!elapsed) {
    els.timerText.textContent = "00:00";
    return;
  }

  if (
    state.autoFinishHour &&
    state.started &&
    state.currentTest &&
    supportsAutoFinish(state.currentTest) &&
    state.timerStartedAt &&
    !state.activeRunSaved &&
    elapsed >= ONE_HOUR_MS
  ) {
    state.timerElapsedMs = ONE_HOUR_MS;
    state.timerStartedAt = Date.now() - ONE_HOUR_MS;
    els.timerText.textContent = formatElapsed(ONE_HOUR_MS);
    finishCurrentRun();
    return;
  }

  els.timerText.textContent = formatElapsed(elapsed);
}

function startTimer(initialElapsedMs = 0, runId = createRunId()) {
  stopTimer();
  state.timerElapsedMs = Math.max(0, Number(initialElapsedMs) || 0);
  state.timerStartedAt = Date.now() - state.timerElapsedMs;
  state.activeRunId = runId;
  state.activeRunSaved = false;
  updateTimer();
  state.timerInterval = window.setInterval(updateTimer, 1000);
}

function stopTimer() {
  if (state.timerInterval) window.clearInterval(state.timerInterval);
  if (state.timerStartedAt) {
    state.timerElapsedMs = Date.now() - state.timerStartedAt;
    state.timerStartedAt = null;
  }
  state.timerInterval = null;
}

function renderHomeSelection() {
  const selected = selectedTestMeta();
  renderResumePanel();
  if (!selected) {
    els.selectedTestKicker.textContent = "Selected test";
    els.selectedTestTitle.textContent = "No test selected";
    els.selectedTestMeta.textContent = "Open the menu to choose one.";
    els.autoFinishSetting.hidden = false;
    els.startBtn.disabled = true;
    return;
  }

  els.selectedTestKicker.textContent =
    selected.selectionType === "category" ? "Selected category" : "Selected test";
  els.selectedTestTitle.textContent = selected.title;
  els.selectedTestMeta.textContent = `${selected.count} questions`;
  els.autoFinishSetting.hidden = !supportsAutoFinish(selected);
  els.startBtn.disabled = false;
}

function setMenuOpen(open) {
  els.testDrawer.hidden = false;
  els.drawerBackdrop.hidden = !open;
  els.testDrawer.classList.toggle("open", open);
  if (!open) {
    window.setTimeout(() => {
      if (!els.testDrawer.classList.contains("open")) els.testDrawer.hidden = true;
    }, 220);
  }
}

function setMenuMode(mode) {
  state.menuMode = mode === "categories" ? "categories" : "tests";
  els.testModeBtn.classList.toggle("active", state.menuMode === "tests");
  els.categoryModeBtn.classList.toggle("active", state.menuMode === "categories");
  els.menuFilters.hidden = state.menuMode !== "tests";
  renderMenu();
}

function selectTest(id) {
  if (state.started && state.currentTest?.id !== id) {
    stopTimer();
    saveIncompleteProgress();
  }
  state.selectedTestId = id;
  saveSelectedTestId();
  renderHomeSelection();
  renderMenu();
  if (state.started) {
    startSelectedTest();
  } else {
    setMenuOpen(false);
  }
}

function lineToNode(line) {
  const div = document.createElement("div");
  div.className = "rich-line";
  div.textContent = line.trim();
  return div;
}

function labelSpan(text) {
  const span = document.createElement("span");
  span.className = "table-label";
  span.textContent = text;
  return span;
}

function appendMaybeLabeledText(target, text) {
  const value = String(text || "");
  const match = value.match(/^([^:=]{1,32})(\s*[:=]\s*)(.+)$/);
  if (!match) {
    target.textContent = value;
    return;
  }

  target.append(labelSpan(match[1].trim()), document.createTextNode(`${match[2]}${match[3]}`));
}

function renderTable(table) {
  if (!table || !Array.isArray(table.rows)) return null;
  const wrapper = document.createElement("div");
  wrapper.className = "data-table-wrap";

  const tableEl = document.createElement("table");
  tableEl.className = "data-table";

  if (Array.isArray(table.headers) && table.headers.length) {
    const thead = document.createElement("thead");
    const row = document.createElement("tr");
    table.headers.forEach((header) => {
      const th = document.createElement("th");
      th.appendChild(labelSpan(header));
      row.appendChild(th);
    });
    thead.appendChild(row);
    tableEl.appendChild(thead);
  }

  const tbody = document.createElement("tbody");
  table.rows.forEach((cells) => {
    const row = document.createElement("tr");
    (Array.isArray(cells) ? cells : [cells]).forEach((cell) => {
      const td = document.createElement("td");
      appendMaybeLabeledText(td, cell);
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  tableEl.appendChild(tbody);
  wrapper.appendChild(tableEl);

  if (Array.isArray(table.notes) && table.notes.length) {
    const notes = document.createElement("div");
    notes.className = "table-notes";
    table.notes.forEach((note) => {
      const item = document.createElement("span");
      item.className = "table-note";
      appendMaybeLabeledText(item, note);
      notes.appendChild(item);
    });
    wrapper.appendChild(notes);
  }

  return wrapper;
}

function appendTextSegment(target, segment) {
  segment
    .split("[[NEXT_LINE]]")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => target.appendChild(lineToNode(line)));
}

function renderRichText(target, text, table = null) {
  clearNode(target);
  const raw = String(text || "");
  if (!raw && !table) return;

  const blocks = raw.split("[[DIVIDER]]");
  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) {
      const divider = document.createElement("div");
      divider.className = "rich-divider";
      target.appendChild(divider);
    }

    const parts = block.split("[[TABLE]]");
    parts.forEach((part, index) => {
      appendTextSegment(target, part);
      if (index < parts.length - 1 && table) {
        const tableEl = renderTable(table);
        if (tableEl) target.appendChild(tableEl);
      }
    });
  });

  if (table && !raw.includes("[[TABLE]]")) {
    const tableEl = renderTable(table);
    if (tableEl) target.appendChild(tableEl);
  }
}

function searchPlainText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(searchPlainText).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(searchPlainText).filter(Boolean).join(" ");
  return String(value)
    .replace(/\[\[TABLE\]\]/g, " table ")
    .replace(/\[\[DIVIDER\]\]/g, " ")
    .replace(/\[\[NEXT_LINE\]\]/g, " ")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchValue(value) {
  return searchPlainText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00b0/g, " degrees ")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchValue(value) {
  return normalizeSearchValue(value).replace(/[^a-z0-9]+/g, "");
}

function searchChoiceLine(choice) {
  return `${choice.letter}. ${searchPlainText(choice.text)}`.trim();
}

function buildSearchRecord(test, question) {
  const choicesText = (question.choices || []).map(searchChoiceLine).join(" ");
  const tableText = searchPlainText(question.table);
  const correctChoice = (question.choices || []).find((choice) => choice.letter === question.answerKey);
  const correctAnswer = question.questionType === "fill_in_blank"
    ? searchPlainText(question.correctChoice || question.answerKey)
    : searchPlainText(correctChoice ? searchChoiceLine(correctChoice) : question.correctChoice || question.answerKey);
  const questionText = searchPlainText(question.question);
  const contextText = searchPlainText(question.context);
  const fields = [
    test.title,
    test.year,
    test.eventLabel,
    test.event,
    question.number,
    questionText,
    contextText,
    tableText,
    choicesText,
    question.answerKey,
    question.correctChoice,
  ].join(" ");

  return {
    id: `${test.id}:${question.number}`,
    testId: test.id,
    testTitle: test.title,
    number: String(question.number || ""),
    questionRaw: question.question,
    questionText,
    contextRaw: question.context,
    contextText,
    table: question.table,
    tableText,
    choices: question.choices || [],
    choicesText,
    answerKey: question.answerKey,
    correctAnswer,
    questionType: question.questionType,
    searchText: normalizeSearchValue(fields),
    compactText: compactSearchValue(fields),
  };
}

function ensureSearchIndex() {
  if (state.searchIndexLoaded) return Promise.resolve();
  if (state.searchIndexLoading) return state.searchIndexLoading;

  state.searchIndexError = "";
  state.searchIndexLoading = Promise.all(
    state.tests.map(async (test) => {
      const loadedTest = await fetchSelection(test.id, "test");
      return loadedTest.questions.map((question) => buildSearchRecord(loadedTest, question));
    })
  )
    .then((records) => {
      state.searchIndex = records.flat();
      state.searchIndexLoaded = true;
    })
    .catch((error) => {
      state.searchIndexError = error.message || "Search index could not load.";
      throw error;
    })
    .finally(() => {
      state.searchIndexLoading = null;
    });

  return state.searchIndexLoading;
}

function searchTerms(query) {
  return normalizeSearchValue(query)
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => /[a-z0-9]/.test(term));
}

function shouldUseCompactSearch(term) {
  return /[^a-z0-9]/i.test(term);
}

function matchesSearch(record, terms) {
  return terms.every((term) => {
    const compactTerm = term.replace(/[^a-z0-9]+/g, "");
    return record.searchText.includes(term) ||
      (shouldUseCompactSearch(term) && compactTerm && record.compactText.includes(compactTerm));
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchHighlightPattern(terms) {
  const directTerms = [...new Set(terms.filter((term) => term.length > 1))]
    .map(escapeRegExp)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  return directTerms.length ? new RegExp(`(${directTerms.join("|")})`, "ig") : null;
}

function appendMarkedText(target, text, terms) {
  const value = String(text || "");
  const pattern = searchHighlightPattern(terms);

  if (!value || !pattern) {
    target.textContent = value;
    return;
  }

  let lastIndex = 0;
  let match = pattern.exec(value);
  if (!match) {
    target.textContent = value;
    return;
  }

  while (match) {
    if (match.index > lastIndex) target.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
    const mark = document.createElement("mark");
    mark.textContent = match[0];
    target.appendChild(mark);
    lastIndex = match.index + match[0].length;
    match = pattern.exec(value);
  }

  if (lastIndex < value.length) target.appendChild(document.createTextNode(value.slice(lastIndex)));
}

function highlightSearchTerms(target, terms) {
  const pattern = searchHighlightPattern(terms);
  if (!pattern || !target) return;

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue?.trim()) textNodes.push(node);
    node = walker.nextNode();
  }

  textNodes.forEach((textNode) => {
    pattern.lastIndex = 0;
    const value = textNode.nodeValue || "";
    let match = pattern.exec(value);
    if (!match) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    while (match) {
      if (match.index > lastIndex) fragment.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
      const mark = document.createElement("mark");
      mark.textContent = match[0];
      fragment.appendChild(mark);
      lastIndex = match.index + match[0].length;
      match = pattern.exec(value);
    }
    if (lastIndex < value.length) fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

function renderSearchResult(record, terms, index) {
  const result = document.createElement("article");
  result.className = "search-result";
  result.style.animationDelay = `${Math.min(index, 12) * 16}ms`;

  const header = document.createElement("div");
  header.className = "search-result-head";

  const title = document.createElement("strong");
  title.className = "search-test";
  title.textContent = record.testTitle;

  const number = document.createElement("span");
  number.className = "search-chip";
  number.textContent = `Q${record.number}`;

  header.append(title, number);

  const questionWrap = document.createElement("div");
  questionWrap.className = "search-question-wrap";
  const questionLabel = document.createElement("span");
  questionLabel.className = "search-section-label";
  questionLabel.textContent = "Question";
  const questionBody = document.createElement("div");
  questionBody.className = "search-question rich-text";
  const tableInQuestion =
    Boolean(record.table && record.questionRaw?.includes("[[TABLE]]")) ||
    Boolean(record.table && !record.contextRaw);
  renderRichText(questionBody, record.questionRaw || record.questionText || "No text", tableInQuestion ? record.table : null);
  highlightSearchTerms(questionBody, terms);
  questionWrap.append(questionLabel, questionBody);

  const choices = document.createElement("div");
  choices.className = "search-choice-row";

  if (record.choices.length) {
    record.choices.forEach((choice) => {
      const pill = document.createElement("span");
      pill.className = "search-choice-pill";
      pill.classList.toggle("correct", choice.letter === record.answerKey);

      const letter = document.createElement("strong");
      letter.textContent = choice.letter;
      const text = document.createElement("span");
      appendMarkedText(text, choice.text, terms);
      pill.append(letter, text);
      choices.appendChild(pill);
    });
  } else {
    const pill = document.createElement("span");
    pill.className = "search-choice-pill correct";
    const letter = document.createElement("strong");
    letter.textContent = "Answer";
    const text = document.createElement("span");
    appendMarkedText(text, record.correctAnswer || record.answerKey || "Answer unavailable", terms);
    pill.append(letter, text);
    choices.appendChild(pill);
  }

  result.append(header, questionWrap, choices);

  const contextTable = !tableInQuestion ? record.table : null;
  if (record.contextRaw || contextTable) {
    const context = document.createElement("div");
    context.className = "search-context";
    const contextLabel = document.createElement("span");
    contextLabel.className = "search-section-label";
    contextLabel.textContent = "Context";
    const contextBody = document.createElement("div");
    contextBody.className = "search-context-body rich-text";
    renderRichText(contextBody, record.contextRaw || "", contextTable);
    highlightSearchTerms(contextBody, terms);
    context.append(contextLabel, contextBody);
    result.appendChild(context);
  }

  return result;
}

function renderSearchResults() {
  clearNode(els.searchResults);
  const query = els.searchInput.value.trim();

  if (state.searchIndexError) {
    els.searchStatus.textContent = state.searchIndexError;
    return;
  }

  if (!state.searchIndexLoaded) {
    els.searchStatus.textContent = state.searchIndexLoading
      ? "Indexing the question bank..."
      : "Search will index the question bank when opened.";
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "Type to search questions, choices, contexts, tables, and answers.";
    els.searchResults.appendChild(empty);
    return;
  }

  if (!query) {
    els.searchStatus.textContent = `${state.searchIndex.length} questions indexed.`;
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "Type to search questions, choices, contexts, tables, and answers.";
    els.searchResults.appendChild(empty);
    return;
  }

  const terms = searchTerms(query);
  if (!terms.length) {
    els.searchStatus.textContent = "Keep typing.";
    return;
  }

  const matches = state.searchIndex.filter((record) => matchesSearch(record, terms));
  const visible = matches.slice(0, 80);
  els.searchStatus.textContent = `${matches.length} ${matches.length === 1 ? "result" : "results"} for "${query}"`;

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent = "No matches yet.";
    els.searchResults.appendChild(empty);
    return;
  }

  visible.forEach((record, index) => {
    els.searchResults.appendChild(renderSearchResult(record, terms, index));
  });

  if (matches.length > visible.length) {
    const more = document.createElement("div");
    more.className = "search-more";
    more.textContent = `Showing first ${visible.length}. Add another keyword to narrow it down.`;
    els.searchResults.appendChild(more);
  }
}

function setSearchOpen(open) {
  if (open) {
    setLogOpen(false);
    setResultsOpen(false);
    setMenuOpen(false);
    els.searchModal.hidden = false;
    els.searchBackdrop.hidden = false;
    const indexing = ensureSearchIndex();
    renderSearchResults();
    indexing
      .then(renderSearchResults)
      .catch(renderSearchResults);
    window.requestAnimationFrame(() => els.searchInput.focus());
  } else {
    els.searchModal.hidden = true;
    els.searchBackdrop.hidden = true;
  }
}

function answerKey(question) {
  return `${state.currentTest?.id || "test"}:${questionId(question)}`;
}

function helperState(question) {
  const key = answerKey(question);
  if (!state.helpers.has(key)) {
    state.helpers.set(key, { hiddenChoices: [], hintCount: 0, poofChoices: [], revealed: false });
  }
  return state.helpers.get(key);
}

function flaggedQuestions() {
  if (!state.currentTest) return [];
  return state.currentTest.questions.filter((question) => state.flags.get(answerKey(question)));
}

function currentQuestion() {
  if (!state.currentTest) return null;
  return state.order[state.currentIndex] || null;
}

function setFeedback(message, type = "") {
  els.feedback.textContent = message;
  els.feedback.className = `feedback ${message ? "visible" : ""} ${type}`;
}

function scoreStats() {
  const answers = Array.from(state.answers.values()).filter(
    (answer) => answer.testId === state.currentTest?.id && answer.checked
  );
  const correct = answers.filter((answer) => answer.correct).length;
  return { answered: answers.length, correct };
}

function timelineStatus(question) {
  const key = answerKey(question);
  const answer = state.answers.get(key);
  if (state.flags.get(key)) return "flagged";
  if (!shouldShowAnswerResults() && answer?.checked) return "pending";
  if (answer?.checked && !answer.correct) return "incorrect";
  if (answer?.checked) return "complete";
  return "unanswered";
}

function timelineLabel(question) {
  if (state.currentTest?.selectionType === "category" && question?.sourceTestTitle) {
    return `${question.sourceTestTitle} - Question ${question.number}`;
  }
  return String(question.number);
}

function timelineOptionLabel(question) {
  return state.currentTest?.selectionType === "category" && question?.sourceTestTitle
    ? `${question.sourceTestTitle} - Question ${question.number}`
    : `Question ${question.number}`;
}

function jumpToQuestion(question) {
  state.reviewMode = false;
  state.order = [...state.currentTest.questions];
  state.currentIndex = state.order.findIndex((item) => questionId(item) === questionId(question));
  if (state.currentIndex < 0) state.currentIndex = 0;
  renderQuestion();
  saveIncompleteProgress();
}

function renderTimeline() {
  clearNode(els.timelineList);
  clearNode(els.timelinePickerMenu);
  const questions = state.currentTest?.questions || [];
  els.questionTimeline.hidden = !state.started || !questions.length;
  if (!state.started || !questions.length) return;

  const usePicker = questions.length > 40;
  els.questionTimeline.classList.toggle("compact", usePicker);
  els.timelineList.hidden = usePicker;
  els.timelinePicker.hidden = !usePicker;
  if (!usePicker) els.timelinePicker.open = false;

  if (usePicker) {
    const current = currentQuestion() || questions[0];
    els.timelinePicker.open = false;
    els.timelinePickerLabel.textContent = `Question ${current?.number || 1} of ${questions.length}`;

    questions.forEach((question) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `timeline-option ${timelineStatus(question)}`;
      button.classList.toggle("current", answerKey(question) === answerKey(current));
      button.textContent = timelineOptionLabel(question);
      button.setAttribute("aria-label", `Jump to ${timelineOptionLabel(question)}`);
      button.addEventListener("click", () => {
        els.timelinePicker.open = false;
        jumpToQuestion(question);
      });
      els.timelinePickerMenu.appendChild(button);
    });
    return;
  }

  els.timelineList.style.setProperty("--timeline-count", questions.length);
  questions.forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timeline-dot ${timelineStatus(question)}`;
    button.classList.toggle("current", answerKey(question) === answerKey(currentQuestion() || {}));
    button.dataset.tooltip = timelineLabel(question);
    button.setAttribute("aria-label", timelineLabel(question));
    button.title = timelineLabel(question);
    button.addEventListener("click", () => jumpToQuestion(question));
    els.timelineList.appendChild(button);
  });
}

function finishCurrentRun() {
  const question = currentQuestion();
  if (!state.currentTest || !question) return;

  if (state.activeRunSaved) {
    setResultsOpen(true);
    return;
  }

  const total = state.currentTest.questions.length;
  const { answered, correct } = scoreStats();
  const elapsed = elapsedMs();
  stopTimer();
  updateTimer();

  const run = {
    id: state.activeRunId || createRunId(),
    testId: state.currentTest.id,
    testTitle: state.currentTest.title,
    total,
    answered,
    correct,
    elapsedMs: elapsed,
    completedAt: new Date().toISOString(),
    questions: state.currentTest.questions.map(resultRecordFromQuestion),
  };

  state.runLog = [run, ...state.runLog].slice(0, 250);
  state.activeRunSaved = true;
  removeIncompleteProgress(run.id);
  saveRunLog();
  if (!els.logModal.hidden) renderRunLog();
  setFeedback(`Run saved: ${correct}/${total} right in ${formatElapsed(elapsed)}.`, "good");
  renderQuestion();
  updateControls(question);
  setResultsOpen(true, run);
}

function updateStatus() {
  const total = state.order.length;
  const { answered, correct } = scoreStats();
  els.progressText.textContent = total ? `${state.currentIndex + 1} / ${total}` : "0 / 0";
  els.answeredText.textContent = String(answered);
  els.scoreText.textContent =
    !shouldShowAnswerResults() && answered ? "Hidden" : answered ? `${Math.round((correct / answered) * 100)}%` : "0%";
  renderTimeline();
}

function renderMenu() {
  clearNode(els.testMenu);
  els.testModeBtn.classList.toggle("active", state.menuMode === "tests");
  els.categoryModeBtn.classList.toggle("active", state.menuMode === "categories");
  els.menuFilters.hidden = state.menuMode !== "tests";

  const items =
    state.menuMode === "tests"
      ? state.tests
        .filter((test) => els.yearFilter.value === "all" || String(test.year) === els.yearFilter.value)
        .filter((test) => els.eventFilter.value === "all" || test.event === els.eventFilter.value)
      : state.categories;

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-log";
    empty.textContent =
      state.menuMode === "categories"
        ? "No problem categories are available yet."
        : "No tests match the current filters.";
    els.testMenu.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `test-item ${state.selectedTestId === item.id ? "active" : ""}`;
    button.innerHTML = `<span>${item.title}</span><small>${item.count}</small>`;
    button.addEventListener("click", () => selectTest(item.id));
    els.testMenu.appendChild(button);
  });
}

function updateControls(question) {
  if (!question) return;
  const helper = helperState(question);
  const flagged = Boolean(state.flags.get(answerKey(question)));
  const flagCount = flaggedQuestions().length;
  const isChoiceQuestion = question.questionType !== "fill_in_blank";
  const visibleChoices = question.choices.length - helper.hiddenChoices.length;
  const answer = state.answers.get(answerKey(question));

  els.flagBtn.classList.toggle("active", flagged);
  els.flagBtn.textContent = flagged ? "Flagged" : "Flag";
  els.revealBtn.textContent = helper.revealed ? "Hide" : "Reveal";
  els.revealBtn.hidden = !shouldShowAnswerResults();
  els.hintBtn.hidden = !isChoiceQuestion || helper.hintCount >= 2 || visibleChoices <= 2 || Boolean(answer?.checked);
  els.resetQuestionBtn.hidden = !helper.revealed && !helper.hiddenChoices.length && !answer?.checked;

  if (state.reviewMode) {
    els.testKicker.textContent = `${state.currentTest.title} - flagged review`;
  } else {
    els.testKicker.textContent = `${state.currentTest.count} questions${flagCount ? ` - ${flagCount} flagged` : ""}`;
  }

  const atEnd = state.currentIndex === state.order.length - 1;
  if (!atEnd) {
    els.nextBtn.textContent = "Next";
  } else if (state.activeRunSaved) {
    els.nextBtn.textContent = "Saved";
  } else if (!state.reviewMode && flagCount) {
    els.nextBtn.textContent = "Review Flagged";
  } else {
    els.nextBtn.textContent = "Finish";
  }
}

function tableInQuestion(question) {
  if (!question?.table) return false;
  if (question.question?.includes("[[TABLE]]")) return true;
  if (question.context?.includes("[[TABLE]]")) return false;
  return !question.context;
}

function tableInContext(question) {
  return Boolean(question?.table && question.context?.includes("[[TABLE]]"));
}

function renderContext(question) {
  const contextTable = tableInContext(question) ? question.table : null;
  const hasContext = Boolean(question?.context || contextTable);
  els.contextDock.hidden = !hasContext;
  els.contextDock.classList.toggle("hidden", !hasContext);
  els.contextDock.classList.toggle("collapsed", state.contextCollapsed);
  els.contextDock.classList.toggle("top", state.contextTop);
  els.dockToggleBtn.textContent = state.contextCollapsed ? "+" : "-";
  els.dockPositionBtn.textContent = state.contextTop ? "v" : "^";
  renderRichText(els.contextBody, question?.context || "", contextTable);
}

function renderChoices(question, saved) {
  clearNode(els.answerArea);
  const helper = helperState(question);
  question.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-btn";
    button.dataset.letter = choice.letter;
    const isHidden = helper.hiddenChoices.includes(choice.letter);
    const isPoofing = helper.poofChoices?.includes(choice.letter);
    button.classList.toggle("hidden-choice", isHidden);
    button.classList.toggle("poof-out", isPoofing);
    button.disabled = isHidden;
    if (isHidden) button.setAttribute("aria-hidden", "true");

    const letter = document.createElement("span");
    letter.className = "choice-letter";
    letter.textContent = choice.letter;

    const text = document.createElement("span");
    text.textContent = choice.text;

    button.append(letter, text);
    button.addEventListener("click", () => chooseAnswer(question, choice.letter));
    els.answerArea.appendChild(button);
  });

  if (saved?.checked) applyChoiceState(question, saved);
  if (helper.revealed && shouldShowAnswerResults()) applyRevealState(question);
}

function renderFillBlank(question, saved) {
  clearNode(els.answerArea);
  const form = document.createElement("form");
  form.className = "blank-form";

  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = "Type your answer";
  input.value = saved?.input || "";

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "nav-btn primary";
  button.textContent = "Check";

  form.append(input, button);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    checkBlank(question, input.value);
  });

  els.answerArea.appendChild(form);
  if (saved?.checked) {
    if (shouldShowAnswerResults()) form.classList.add(saved.correct ? "correct" : "incorrect");
    else form.classList.add("pending");
  }
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) {
    els.questionText.innerHTML = `<div class="empty-state">Choose a test from the menu.</div>`;
    clearNode(els.answerArea);
    renderContext(null);
    updateStatus();
    return;
  }

  const saved = state.answers.get(answerKey(question));
  els.questionNumber.textContent = questionLabel(question);
  renderRichText(els.questionText, question.question, tableInQuestion(question) ? question.table : null);

  if (question.questionType === "fill_in_blank") {
    renderFillBlank(question, saved);
  } else {
    renderChoices(question, saved);
  }

  const helper = helperState(question);
  if (helper.revealed && shouldShowAnswerResults()) {
    setFeedback(`Answer: ${question.correctChoice || question.answerKey}`, saved?.correct ? "good" : "");
  } else if (saved?.checked && shouldShowAnswerResults()) {
    setFeedback(
      saved.correct
        ? "Correct."
        : `Not quite. Correct answer: ${question.answerKey || question.correctChoice}`,
      saved.correct ? "good" : "bad"
    );
  } else if (saved?.checked) {
    setFeedback("");
  } else {
    setFeedback("");
  }

  renderContext(question);
  updateControls(question);
  updateStatus();
}

function applyRevealState(question) {
  const correctLetter = question.answerKey;
  els.answerArea.querySelectorAll(".choice-btn").forEach((button) => {
    button.classList.toggle("correct", button.dataset.letter === correctLetter);
  });
}

function applyChoiceState(question, saved) {
  const correctLetter = question.answerKey;
  els.answerArea.querySelectorAll(".choice-btn").forEach((button) => {
    const letter = button.dataset.letter;
    const revealResults = shouldShowAnswerResults();
    button.classList.toggle("selected", !revealResults && letter === saved.selected && saved.checked);
    button.classList.toggle("correct", revealResults && letter === correctLetter && saved.checked);
    button.classList.toggle(
      "incorrect",
      revealResults && letter === saved.selected && letter !== correctLetter && saved.checked
    );
  });
}

function chooseAnswer(question, selected) {
  const correct = selected === question.answerKey;
  const saved = {
    testId: state.currentTest.id,
    checked: true,
    selected,
    correct,
  };
  state.answers.set(answerKey(question), saved);
  applyChoiceState(question, saved);
  if (shouldShowAnswerResults()) {
    setFeedback(
      correct ? "Correct." : `Not quite. Correct answer: ${question.answerKey}`,
      correct ? "good" : "bad"
    );
  } else {
    setFeedback("");
  }
  updateStatus();
  updateControls(question);
  saveIncompleteProgress();
}

function checkBlank(question, input) {
  const correct = answerMatches(input, question.correctChoice);
  state.answers.set(answerKey(question), {
    testId: state.currentTest.id,
    checked: true,
    input,
    correct,
  });
  renderQuestion();
  saveIncompleteProgress();
}

function revealAnswer() {
  const question = currentQuestion();
  if (!question) return;
  const helper = helperState(question);
  helper.revealed = !helper.revealed;
  if (helper.revealed) {
    if (question.questionType !== "fill_in_blank") applyRevealState(question);
    setFeedback(`Answer: ${question.correctChoice || question.answerKey}`);
  } else {
    renderQuestion();
    saveIncompleteProgress();
    return;
  }
  updateControls(question);
  saveIncompleteProgress();
}

function useHint() {
  const question = currentQuestion();
  if (!question || question.questionType === "fill_in_blank") return;
  const helper = helperState(question);
  const visibleChoices = question.choices.length - helper.hiddenChoices.length;
  if (helper.hintCount >= 2 || visibleChoices <= 2) return;

  const candidates = shuffled(
    question.choices
    .filter((choice) => choice.letter !== question.answerKey)
      .filter((choice) => !helper.hiddenChoices.includes(choice.letter))
  );
  if (!candidates.length) return;

  let newlyHidden = [];
  if (helper.hintCount === 0) {
    newlyHidden = [candidates[0].letter];
  } else {
    newlyHidden = candidates
      .slice(0, Math.max(0, visibleChoices - 2))
      .map((choice) => choice.letter);
  }
  helper.hiddenChoices.push(...newlyHidden);
  helper.poofChoices = newlyHidden;
  helper.hintCount += 1;
  renderQuestion();
  saveIncompleteProgress();

  const key = answerKey(question);
  window.setTimeout(() => {
    const current = currentQuestion();
    if (!current || answerKey(current) !== key) return;
    const latest = helperState(current);
    latest.poofChoices = [];
    renderQuestion();
  }, 560);
}

function resetQuestion() {
  const question = currentQuestion();
  if (!question) return;
  state.answers.delete(answerKey(question));
  state.helpers.set(answerKey(question), { hiddenChoices: [], hintCount: 0, poofChoices: [], revealed: false });
  renderQuestion();
  saveIncompleteProgress();
}

function clearProgressForTest(testId) {
  if (!testId) return;
  for (const key of Array.from(state.answers.keys())) {
    if (key.startsWith(`${testId}:`)) state.answers.delete(key);
  }
  for (const key of Array.from(state.helpers.keys())) {
    if (key.startsWith(`${testId}:`)) state.helpers.delete(key);
  }
  for (const key of Array.from(state.flags.keys())) {
    if (key.startsWith(`${testId}:`)) state.flags.delete(key);
  }
}

function entriesForTest(map, testId) {
  return Array.from(map.entries()).filter(([key]) => key.startsWith(`${testId}:`));
}

function numberLookup(questions) {
  const lookup = new Map();
  questions.forEach((question) => {
    lookup.set(questionId(question), question);
    if (!lookup.has(String(question.number))) lookup.set(String(question.number), question);
  });
  return lookup;
}

function orderFromNumbers(numbers, questions) {
  if (!Array.isArray(numbers) || !numbers.length) return [...questions];
  const lookup = numberLookup(questions);
  const seen = new Set();
  const ordered = numbers
    .map((number) => lookup.get(String(number)))
    .filter((question) => {
      if (!question) return false;
      const key = questionId(question);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return ordered.length ? ordered : [...questions];
}

function saveIncompleteProgress() {
  if (!state.started || !state.currentTest || state.activeRunSaved) return;
  const current = currentQuestion();
  const testId = state.currentTest.id;
  const { answered } = scoreStats();
  const snapshot = {
    id: state.activeRunId || createRunId(),
    testId,
    testTitle: state.currentTest.title,
    total: state.currentTest.questions.length,
    answered,
    savedAt: new Date().toISOString(),
    elapsedMs: elapsedMs(),
    currentIndex: state.currentIndex,
    currentQuestionId: questionId(current) || null,
    currentNumber: current?.number || null,
    reviewMode: state.reviewMode,
    orderQuestionIds: state.order.map((question) => questionId(question)),
    orderNumbers: state.order.map((question) => question.number),
    answerEntries: entriesForTest(state.answers, testId),
    helperEntries: entriesForTest(state.helpers, testId),
    flagEntries: entriesForTest(state.flags, testId),
  };

  state.activeRunId = snapshot.id;
  state.incompleteTests = [
    snapshot,
    ...state.incompleteTests.filter((saved) => saved.id !== snapshot.id),
  ];
  saveIncompleteTests();
  renderResumePanel();
}

function removeIncompleteProgress(id = state.activeRunId) {
  if (!id) return;
  state.incompleteTests = state.incompleteTests.filter((saved) => saved.id !== id);
  saveIncompleteTests();
  renderResumePanel();
}

function restoreEntries(entries, targetMap) {
  if (!Array.isArray(entries)) return;
  entries.forEach(([key, value]) => targetMap.set(key, value));
}

async function resumeIncompleteTest(id) {
  const saved = state.incompleteTests.find((item) => item.id === id);
  if (!saved) return;

  els.homeScreen.hidden = true;
  els.practiceShell.hidden = false;
  setMenuOpen(false);
  setLogOpen(false);
  setSearchOpen(false);
  setResultsOpen(false);

  state.started = false;
  await loadTest(saved.testId);
  clearProgressForTest(saved.testId);
  restoreEntries(saved.answerEntries, state.answers);
  restoreEntries(saved.helperEntries, state.helpers);
  restoreEntries(saved.flagEntries, state.flags);

  state.order = orderFromNumbers(saved.orderQuestionIds || saved.orderNumbers, state.currentTest.questions);
  const currentQuestionId = String(saved.currentQuestionId || saved.currentNumber || "");
  const numberIndex = state.order.findIndex(
    (question) => questionId(question) === currentQuestionId || String(question.number) === currentQuestionId
  );
  state.currentIndex =
    numberIndex >= 0
      ? numberIndex
      : Math.min(Math.max(Number(saved.currentIndex) || 0, 0), state.order.length - 1);
  state.reviewMode = Boolean(saved.reviewMode);
  state.started = true;
  state.activeRunSaved = false;
  state.activeRunId = saved.id;
  startTimer(saved.elapsedMs || 0, saved.id);
  renderQuestion();
  saveIncompleteProgress();
}

function goHome() {
  setResultsOpen(false);
  setLogOpen(false);
  setSearchOpen(false);
  if (state.started) {
    stopTimer();
    saveIncompleteProgress();
  }
  state.started = false;
  els.practiceShell.hidden = true;
  els.homeScreen.hidden = false;
  els.questionTimeline.hidden = true;
  renderContext(null);
  renderHomeSelection();
}

function toggleFlag() {
  const question = currentQuestion();
  if (!question) return;
  const key = answerKey(question);
  state.flags.set(key, !state.flags.get(key));
  updateControls(question);
  renderTimeline();
  saveIncompleteProgress();
}

function go(delta) {
  if (!state.order.length) return;
  if (delta > 0 && state.currentIndex === state.order.length - 1) {
    if (!state.reviewMode && flaggedQuestions().length) {
      state.reviewMode = true;
      state.order = flaggedQuestions();
      state.currentIndex = 0;
      renderQuestion();
      saveIncompleteProgress();
      return;
    }
    finishCurrentRun();
    return;
  }
  state.currentIndex = Math.min(Math.max(state.currentIndex + delta, 0), state.order.length - 1);
  renderQuestion();
  saveIncompleteProgress();
}

function resetCurrentTest() {
  if (!state.currentTest) return;
  setResultsOpen(false);
  const previousRunId = state.activeRunId;
  clearProgressForTest(state.currentTest.id);
  state.currentIndex = 0;
  state.reviewMode = false;
  state.order = [...state.currentTest.questions];
  if (state.started) {
    removeIncompleteProgress(previousRunId);
    startTimer();
  }
  renderQuestion();
  saveIncompleteProgress();
}

function shuffleCurrentTest() {
  if (!state.currentTest) return;
  state.order = shuffled(buildShuffleBlocks(state.currentTest.questions)).flat();
  state.currentIndex = 0;
  state.reviewMode = false;
  renderQuestion();
  saveIncompleteProgress();
}

async function loadTest(id) {
  state.currentTest = await fetchSelection(id, isCategorySelection(id) ? "category" : "test");
  state.selectedTestId = id;
  saveSelectedTestId();
  state.order = [...state.currentTest.questions];
  state.currentIndex = 0;
  state.reviewMode = false;

  els.testKicker.textContent = `${state.currentTest.count} questions`;
  els.testTitle.textContent = state.currentTest.title;
  renderHomeSelection();
  renderMenu();
  if (state.started) renderQuestion();
}

async function startSelectedTest() {
  if (!state.selectedTestId) return;
  els.homeScreen.hidden = true;
  els.practiceShell.hidden = false;
  setMenuOpen(false);
  setLogOpen(false);
  setSearchOpen(false);
  setResultsOpen(false);
  state.started = false;
  await loadTest(state.selectedTestId);
  clearProgressForTest(state.currentTest.id);
  state.currentIndex = 0;
  state.reviewMode = false;
  state.order = [...state.currentTest.questions];
  state.started = true;
  startTimer();
  renderQuestion();
  saveIncompleteProgress();
}

async function init() {
  const payload = await fetchCatalog();
  state.tests = payload.tests || [];
  state.categories = payload.categories || [];

  const years = ["all", ...Array.from(new Set(state.tests.map((test) => test.year)))];
  els.yearFilter.innerHTML = years
    .map((year) => `<option value="${year}">${year === "all" ? "All" : year}</option>`)
    .join("");

  els.yearFilter.addEventListener("change", renderMenu);
  els.eventFilter.addEventListener("change", renderMenu);
  els.testModeBtn.addEventListener("click", () => setMenuMode("tests"));
  els.categoryModeBtn.addEventListener("click", () => setMenuMode("categories"));
  els.homeLogBtn.addEventListener("click", () => setLogOpen(true));
  els.homeSearchBtn.addEventListener("click", () => setSearchOpen(true));
  els.closeLogBtn.addEventListener("click", () => setLogOpen(false));
  els.logBackdrop.addEventListener("click", () => setLogOpen(false));
  els.closeSearchBtn.addEventListener("click", () => setSearchOpen(false));
  els.searchBackdrop.addEventListener("click", () => setSearchOpen(false));
  els.searchInput.addEventListener("input", renderSearchResults);
  els.closeResultsBtn.addEventListener("click", () => setResultsOpen(false));
  els.resultsBackdrop.addEventListener("click", () => setResultsOpen(false));
  els.instantRevealToggle.addEventListener("change", () => {
    state.instantReveal = els.instantRevealToggle.checked;
    saveInstantRevealSetting();
    if (state.started) renderQuestion();
  });
  els.autoFinishToggle.addEventListener("change", () => {
    state.autoFinishHour = els.autoFinishToggle.checked;
    saveAutoFinishSetting();
    if (state.autoFinishHour && state.started) updateTimer();
  });
  els.toggleHeaderBtn.addEventListener("click", () => {
    setPracticeHeaderCollapsed(!state.headerCollapsed);
  });
  els.practiceHomeBtn.addEventListener("click", goHome);
  els.chooseTestBtn.addEventListener("click", () => setMenuOpen(true));
  els.closeMenuBtn.addEventListener("click", () => setMenuOpen(false));
  els.drawerBackdrop.addEventListener("click", () => setMenuOpen(false));
  els.startBtn.addEventListener("click", startSelectedTest);
  els.prevBtn.addEventListener("click", () => go(-1));
  els.nextBtn.addEventListener("click", () => go(1));
  els.hintBtn.addEventListener("click", useHint);
  els.revealBtn.addEventListener("click", revealAnswer);
  els.resetQuestionBtn.addEventListener("click", resetQuestion);
  els.flagBtn.addEventListener("click", toggleFlag);
  els.resetBtn.addEventListener("click", resetCurrentTest);
  els.shuffleBtn.addEventListener("click", shuffleCurrentTest);
  els.dockToggleBtn.addEventListener("click", () => {
    state.contextCollapsed = !state.contextCollapsed;
    renderContext(currentQuestion());
  });
  els.dockPositionBtn.addEventListener("click", () => {
    state.contextTop = !state.contextTop;
    renderContext(currentQuestion());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (els.timelinePicker.open) els.timelinePicker.open = false;
      else if (!els.resultsModal.hidden) setResultsOpen(false);
      else if (!els.searchModal.hidden) setSearchOpen(false);
      else if (!els.logModal.hidden) setLogOpen(false);
      else setMenuOpen(false);
      return;
    }
    if (event.target instanceof HTMLInputElement) return;
    if (!els.logModal.hidden || !els.searchModal.hidden || !els.resultsModal.hidden) return;
    if (!state.started) return;
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
    if (/^[a-e]$/i.test(event.key)) {
      const question = currentQuestion();
      if (question?.questionType === "multiple_choice") {
        const letter = event.key.toUpperCase();
        if (question.choices.some((choice) => choice.letter === letter)) chooseAnswer(question, letter);
      }
    }
  });

  document.addEventListener("click", (event) => {
    if (!els.timelinePicker.open) return;
    if (els.timelinePicker.contains(event.target)) return;
    els.timelinePicker.open = false;
  });

  window.addEventListener("beforeunload", () => {
    if (!state.started) return;
    stopTimer();
    saveIncompleteProgress();
  });

  loadRunLog();
  loadIncompleteTests();
  loadInstantRevealSetting();
  loadAutoFinishSetting();
  state.selectedTestId = loadSelectedTestId();
  setPracticeHeaderCollapsed(false);
  setMenuMode("tests");
  renderHomeSelection();
  window.setTimeout(() => ensureSearchIndex().catch(() => {}), 300);
}

init().catch((error) => {
  els.questionText.innerHTML = `<div class="empty-state">${error.message}</div>`;
});
