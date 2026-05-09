let DEFAULT_LINES = [];

function normalizeEnglishSentence(text) {
  return String(text || "")
    .replaceAll("’", "'")
    .replace(/\bI'm\b/g, "I am")
    .trim();
}

function parseLines(lines) {
  return lines
    .map((line, index) => {
      const separator = line.includes(" — ") ? " — " : " - ";
      const parts = line.split(separator);
      return {
        id: index + 1,
        english: normalizeEnglishSentence(parts[0]),
        korean: String(parts[1] || "").trim(),
        mastered: false,
        starred: false,
      };
    })
    .filter((item) => item.english && item.korean);
}

function stripPeriodsFromSentences(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => ({
      id: Number(item?.id) || index + 1,
      english: normalizeEnglishSentence(item?.english),
      korean: String(item?.korean || "").trim(),
      mastered: Boolean(item?.mastered),
      starred: Boolean(item?.starred),
    }))
    .filter((item) => item.english && item.korean);
}

function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTypingMarkup(targetText, typedText) {
  const target = String(targetText || "");
  const typed = String(typedText || "");
  const pieces = [];
  const max = Math.max(target.length, typed.length);

  for (let i = 0; i < max; i += 1) {
    const t = target[i];
    const u = typed[i];

    if (t == null && u != null) {
      continue;
    }
    if (t != null && u == null) {
      pieces.push(`<span class=\"text-slate-900\">${escapeHtml(t)}</span>`);
      continue;
    }
    if (t === u) {
      pieces.push(`<span class=\"text-emerald-600\">${escapeHtml(t)}</span>`);
    } else {
      pieces.push(`<span class=\"bg-red-100 text-red-600\">${escapeHtml(t)}</span>`);
    }
  }

  return pieces.join("");
}

let PRONUNCIATION_MAP = {};

function getWordPronunciation(word) {
  const lower = String(word || "").toLowerCase();
  if (!lower) return "";
  return PRONUNCIATION_MAP[lower] || "";
}

function getContextPronunciation(word, nextWord = "") {
  const lower = String(word || "").toLowerCase();
  if (lower === "the") {
    const next = String(nextWord || "").toLowerCase();
    const first = next.replace(/[^a-z]/g, "")[0] || "";
    return /[aeiou]/.test(first) ? "디" : "더";
  }
  return getWordPronunciation(word);
}

function buildPronunciationMarkup(sentence) {
  const tokens = String(sentence || "").match(/[A-Za-z]+(?:[''][A-Za-z]+)?/g) || [];
  return tokens
    .map((word, index) => {
      const nextWord = tokens[index + 1] || "";
      const pronunciation = getContextPronunciation(word, nextWord);
      if (!pronunciation) {
        return `<span class="inline-flex min-w-[32px] items-center rounded-lg bg-white/60 px-2 py-0.5"><span class="text-[10px] font-semibold text-slate-400">-</span></span>`;
      }
      return `<span class="inline-flex min-w-[32px] items-center rounded-lg bg-white/70 px-2 py-0.5"><span class="text-base font-semibold text-slate-600">${escapeHtml(pronunciation)}</span></span>`;
    })
    .join("");
}

function runSelfTests() {
  const parsed = parseLines(["Hello. — 안녕.", "I agree. - 동의해."]);
  console.assert(parsed.length === 2, "parseLines should parse both dash styles");
  console.assert(parsed[0].english === "Hello.", "parseLines should preserve periods in English text");
  console.assert(parsed[1].korean === "동의해.", "parseLines should preserve periods in Korean text");
  console.assert(normalize("I don't THINK so!") === "i dont think so", "normalize should clean punctuation");
  console.assert(parseLines(["Broken line"]).length === 0, "parseLines should ignore invalid lines");
  console.assert(parseLines(DEFAULT_LINES).length === DEFAULT_LINES.length, "all default lines should parse correctly");
  console.assert(DEFAULT_LINES.length === 365, "DEFAULT_LINES should contain all 365 sentences");
}

const STORAGE_KEY = "const-english-sentences-v4";
const DATA_FILE_PATH = "./data.json";

const state = {
  sentences: [],
  index: 0,
  answer: "",
  feedback: "",
  isEnglishVisible: true,
  lastScrolledSentenceId: null,
  hasAutoSpokenOnFirstCard: false,
  shouldSpeakAfterRender: false,
  shouldRefocusCardInput: false,
  isComposing: false,
  typingRafId: null,
  isRandomOn: true,
  isListenOn: true,
  isAutoplaying: false,
  autoplayTimerId: null,
  speechFallbackTimerId: null,
};

function mergeSavedProgress(defaultSentences, savedSentences) {
  if (!Array.isArray(savedSentences)) return defaultSentences;

  const savedById = new Map(
    savedSentences.map((item, index) => {
      const normalized = {
        id: Number(item?.id) || index + 1,
        mastered: Boolean(item?.mastered),
        starred: Boolean(item?.starred),
      };
      return [normalized.id, normalized];
    }),
  );

  return defaultSentences.map((sentence) => {
    const saved = savedById.get(sentence.id);
    if (!saved) return sentence;
    return {
      ...sentence,
      mastered: saved.mastered,
      starred: saved.starred,
    };
  });
}

function loadSentences() {
  const defaultSentences = parseLines(DEFAULT_LINES);

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length >= DEFAULT_LINES.length) {
        return mergeSavedProgress(defaultSentences, parsed);
      }
    }
  } catch (error) {
    console.warn("Saved data could not be loaded", error);
  }

  return defaultSentences;
}

async function loadDataFile() {
  try {
    const response = await fetch(DATA_FILE_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to load ${DATA_FILE_PATH}: ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.sentences)) throw new Error("data.json sentences must be an array");
    if (!data?.pronunciationMap || typeof data.pronunciationMap !== "object") {
      throw new Error("data.json pronunciationMap must be an object");
    }
    DEFAULT_LINES = data.sentences.map((line) => String(line || ""));
    PRONUNCIATION_MAP = data.pronunciationMap;
  } catch (error) {
    console.error("Data file could not be loaded", error);
    throw error;
  }
}

function initializeSentences() {
  state.sentences = loadSentences();
  if (state.sentences.length > 0) {
    const unmastered = state.sentences.filter((s) => !s.mastered);
    const initialPool = unmastered.length > 0 ? unmastered : state.sentences;
    const initial = initialPool[Math.floor(Math.random() * initialPool.length)];
    state.index = state.sentences.findIndex((s) => s.id === initial.id);
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sentences));
  } catch (error) {
    console.warn("Progress could not be saved", error);
  }
}

function getActiveSentences() {
  const unmastered = state.sentences.filter((s) => !s.mastered);
  return unmastered.length > 0 ? unmastered : state.sentences;
}

function getCurrent() {
  const active = getActiveSentences();
  if (active.length === 0) return null;
  const currentById = active.find((s) => s.id === state.index);
  return currentById || active[0] || null;
}

function safeSetIndex(nextIdOrOffset, useOffset = true) {
  const active = getActiveSentences();
  if (active.length === 0) {
    state.index = 0;
    return;
  }

  if (useOffset) {
    const currentPos = Math.max(0, active.findIndex((s) => s.id === state.index));
    const nextPos = (currentPos + nextIdOrOffset + active.length) % active.length;
    state.index = active[nextPos].id;
  } else {
    const exact = active.find((s) => s.id === nextIdOrOffset);
    state.index = exact ? exact.id : active[0].id;
  }

  state.answer = "";
  state.feedback = "";
}

function updateCurrent(patch, current) {
  if (!current) return;
  state.sentences = state.sentences.map((s) => (s.id === current.id ? { ...s, ...patch } : s));
  persist();
}

function clearAutoplayTimer() {
  if (state.autoplayTimerId) {
    window.clearTimeout(state.autoplayTimerId);
    state.autoplayTimerId = null;
  }
}

function clearSpeechFallbackTimer() {
  if (state.speechFallbackTimerId) {
    window.clearTimeout(state.speechFallbackTimerId);
    state.speechFallbackTimerId = null;
  }
}

function cancelTypingRaf() {
  if (state.typingRafId != null) {
    window.cancelAnimationFrame(state.typingRafId);
    state.typingRafId = null;
  }
}

function scheduleTypingHighlightUpdate(englishDisplay, current) {
  if (!state.isEnglishVisible) return;
  if (!englishDisplay || !current) return;
  cancelTypingRaf();
  state.typingRafId = window.requestAnimationFrame(() => {
    englishDisplay.innerHTML = buildTypingMarkup(current.english, state.answer);
    state.typingRafId = null;
  });
}

function stopAutoplay(options = {}) {
  const { keepSpeech = false } = options;
  state.isAutoplaying = false;
  clearAutoplayTimer();
  clearSpeechFallbackTimer();
  if (!keepSpeech && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function getAdvanceIndex() {
  const active = getActiveSentences();
  if (active.length < 2) return 1;
  if (!state.isRandomOn) return 1;

  const currentPos = Math.max(0, active.findIndex((s) => s.id === state.index));
  let randPos = Math.floor(Math.random() * active.length);
  if (randPos === currentPos) randPos = (randPos + 1) % active.length;
  return active[randPos].id;
}

function toggleListen() {
  state.isListenOn = !state.isListenOn;
  if (!state.isListenOn && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speak(current, options = {}) {
  const { onComplete = null } = options;
  if (!current || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === "undefined") return;
  try {
    window.speechSynthesis.cancel();
    clearSpeechFallbackTimer();

    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      clearSpeechFallbackTimer();
      if (typeof onComplete === "function") onComplete();
    };

    const englishUtterance = new window.SpeechSynthesisUtterance(current.english);
    englishUtterance.lang = "en-US";
    englishUtterance.rate = 0.85;

    const koreanUtterance = new window.SpeechSynthesisUtterance(current.korean);
    koreanUtterance.lang = "ko-KR";
    koreanUtterance.rate = 0.9;

    if (typeof onComplete === "function") {
      koreanUtterance.onend = () => {
        finish();
      };
      koreanUtterance.onerror = () => {
        finish();
      };

      const combinedText = `${current.english} ${current.korean}`;
      const estimatedMs = Math.max(2000, Math.min(12000, combinedText.length * 140));
      state.speechFallbackTimerId = window.setTimeout(() => {
        finish();
      }, estimatedMs);
    }

    window.speechSynthesis.speak(englishUtterance);
    window.speechSynthesis.speak(koreanUtterance);
  } catch (error) {
    console.warn("Speech playback is unavailable in this browser context", error);
    clearSpeechFallbackTimer();
    if (typeof onComplete === "function") onComplete();
  }
}

function playAutoplayStep() {
  if (!state.isAutoplaying) return;
  const current = getCurrent();
  if (!current || getActiveSentences().length === 0) {
    stopAutoplay();
    render();
    return;
  }

  const handleStepDone = () => {
    if (!state.isAutoplaying) return;
    clearAutoplayTimer();
    state.autoplayTimerId = window.setTimeout(() => {
      if (!state.isAutoplaying) return;
      const activeNow = getActiveSentences();
      if (activeNow.length === 0) {
        stopAutoplay();
        render();
        return;
      }

      if (!state.isRandomOn && activeNow.findIndex((s) => s.id === state.index) >= activeNow.length - 1) {
        stopAutoplay({ keepSpeech: true });
        render();
        return;
      }

      if (state.isRandomOn) {
        safeSetIndex(getAdvanceIndex(), false);
      } else {
        safeSetIndex(1, true);
      }
      render();
      playAutoplayStep();
    }, 100);
  };

  if (state.isListenOn) {
    speak(current, { onComplete: handleStepDone });
  } else {
    handleStepDone();
  }
}

function toggleAutoplay() {
  if (state.isAutoplaying) {
    stopAutoplay();
    render();
    return;
  }

  state.isListenOn = true;
  state.isAutoplaying = true;
  playAutoplayStep();
  render();
}

function checkCardTypingAndAdvance(current) {
  if (!current) return;
  if (state.isComposing) return false;
  const user = normalize(state.answer);
  const target = normalize(current.english);
  if (!user) {
    state.feedback = "";
    return false;
  }
  if (user !== target) {
    state.feedback = "";
    return false;
  }

  updateCurrent({ mastered: true }, current);
  if (state.isRandomOn) {
    safeSetIndex(getAdvanceIndex(), false);
  } else {
    safeSetIndex(1, true);
  }
  state.shouldSpeakAfterRender = true;
  state.shouldRefocusCardInput = true;
  return true;
}

function resetProgress() {
  state.sentences = state.sentences.map((s) => ({ ...s, mastered: false, starred: false }));
  state.index = 0;
  state.answer = "";
  state.feedback = "";
  persist();
}

function handleActionClick(el) {
  if (!el) return;
  const action = el.getAttribute("data-action");
  if (!action) return;

  if (state.isAutoplaying && action !== "toggle-autoplay") {
    stopAutoplay();
  }

  switch (action) {
    case "toggle-english-visible":
      state.isEnglishVisible = !state.isEnglishVisible;
      state.answer = "";
      state.feedback = "";
      state.shouldRefocusCardInput = true;
      break;
    case "toggle-listen":
      toggleListen();
      break;
    case "toggle-random":
      state.isRandomOn = !state.isRandomOn;
      break;
    case "prev":
      safeSetIndex(-1, true);
      break;
    case "next":
      if (state.isRandomOn) {
        safeSetIndex(getAdvanceIndex(), false);
      } else {
        safeSetIndex(1, true);
      }
      break;
    case "reset-progress":
      resetProgress();
      break;
    case "toggle-autoplay":
      toggleAutoplay();
      break;
    case "pick": {
      const id = Number(el.getAttribute("data-sentence-id"));
      safeSetIndex(id, false);
      break;
    }
    default:
      break;
  }

  if ((action === "prev" || action === "next" || action === "pick") && state.isListenOn) {
    state.shouldSpeakAfterRender = true;
  }

  render();
}

function render() {
  cancelTypingRaf();
  const root = document.getElementById("root");
  const current = getCurrent();

  if (!current) {
    root.innerHTML = `<div class=\"min-h-screen p-6\">학습할 문장이 없습니다.</div>`;
    return;
  }

  const masteredCount = state.sentences.filter((s) => s.mastered).length;
  const progress = state.sentences.length ? Math.round((masteredCount / state.sentences.length) * 100) : 0;

  root.innerHTML = `
    <div class="min-h-screen px-[5vw] py-[2.5vh] text-slate-900">
      <div class="mx-auto w-full space-y-5">
        <header class="rounded-3xl bg-white p-5 shadow-sm">
          <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm font-semibold text-slate-500">Master English with 365 Sentences</p>
              <h1 class="text-2xl font-bold md:text-4xl">🎯 365문장으로 영어 마스터하기</h1>
            </div>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div class="rounded-2xl bg-slate-100 px-4 py-3 text-center"><div class="text-xs font-semibold text-slate-500">전체</div><div class="text-xl font-extrabold">${state.sentences.length}</div></div>
                <div class="rounded-2xl bg-slate-100 px-4 py-3 text-center"><div class="text-xs font-semibold text-slate-500">암기</div><div class="text-xl font-extrabold">${masteredCount}</div></div>
                <div class="rounded-2xl bg-slate-100 px-4 py-3 text-center"><div class="text-xs font-semibold text-slate-500">진도</div><div class="text-xl font-extrabold">${progress}%</div></div>
                <button data-action="reset-progress" class="rounded-2xl bg-slate-100 px-4 py-3 text-center transition hover:bg-slate-200">
                  <div class="text-xs font-semibold text-slate-500">진도</div>
                  <div class="text-lg font-extrabold">초기화</div>
                </button>
              </div>
          </div>
          <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-slate-900" style="width:${progress}%"></div></div>
        </header>

        <section class="grid items-start gap-4 md:grid-cols-[1fr_320px]">
          <main id="main-panel" class="rounded-3xl bg-white p-5 shadow-sm md:p-8">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900">#${current.id}</span>
                <button data-action="toggle-english-visible" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isEnglishVisible ? "bg-slate-900 text-white" : "bg-white text-slate-900 shadow-sm hover:bg-slate-100"}">${state.isEnglishVisible ? "문장 보임" : "문장 숨김"}</button>
                ${current.mastered ? '<span class="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">암기완료</span>' : ""}
              </div>
              <div class="flex items-center gap-2">
                <button data-action="toggle-random" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isRandomOn ? "bg-slate-900 text-white" : "bg-white text-slate-900 shadow-sm hover:bg-slate-100"}">${state.isRandomOn ? "랜덤 on" : "랜덤 off"}</button>
                <button data-action="toggle-autoplay" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isAutoplaying ? "bg-slate-900 text-white" : "bg-white text-slate-900 shadow-sm hover:bg-slate-100"}">${state.isAutoplaying ? "자동재생 on" : "자동재생 off"}</button>
                <button data-action="toggle-listen" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isListenOn ? "bg-slate-900 text-white" : "bg-white text-slate-900 shadow-sm hover:bg-slate-100"}">${state.isListenOn ? "듣기 on" : "듣기 off"}</button>
              </div>
            </div>

            <div class="min-h-[330px] rounded-3xl bg-slate-100 p-6 md:p-10">
              <div class="min-h-[148px] overflow-visible rounded-2xl bg-white/50 p-3 pb-5 md:min-h-[172px] md:p-4 md:pb-6">
                <p id="english-display" class="text-3xl font-extrabold leading-normal tracking-tight pb-1 md:text-5xl">${state.isEnglishVisible ? buildTypingMarkup(current.english, state.answer) : '<span class="text-slate-300">문장이 숨겨져 있습니다.</span>'}</p>
              </div>
              <div class="mt-4 max-h-[64px] overflow-hidden rounded-2xl bg-white/40 p-1.5">
                <div class="flex flex-wrap gap-2 ${state.isEnglishVisible ? "" : "opacity-0 select-none"}">${buildPronunciationMarkup(current.english)}</div>
              </div>

              <div class="mt-8 space-y-5">
                <p class="rounded-3xl bg-white p-5 text-2xl font-bold leading-relaxed text-slate-700 shadow-sm">${current.korean}</p>
                <input id="card-answer-input" value="${state.answer.replaceAll('"', '&quot;')}" placeholder="영어 문장을 정확히 입력하면 자동으로 다음 문장으로 이동합니다" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" class="w-full rounded-2xl border-2 border-slate-900 bg-white p-4 text-lg outline-none focus:ring-0" />
                ${state.feedback ? `<p class=\"rounded-2xl bg-white p-4 font-semibold text-slate-700 shadow-sm\">${state.feedback}</p>` : ""}
              </div>
            </div>

            <div class="mt-5 flex flex-wrap justify-between gap-2">
              <button data-action="prev" class="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-100">이전</button>
              <div class="flex gap-2"></div>
              <button data-action="next" class="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-100">다음</button>
            </div>
          </main>

          <aside class="self-stretch">
            <div class="space-y-2 overflow-auto rounded-3xl bg-white p-3 shadow-sm" id="list-wrap">
              ${state.sentences
                .map((s) => `
                  <button data-action="pick" data-sentence-id="${s.id}" class="w-full rounded-2xl p-3 text-left transition ${s.id === current.id ? "bg-slate-900 text-white" : "bg-slate-50 hover:bg-slate-100"}">
                    <div class="${state.isEnglishVisible ? "" : "text-transparent select-none"}">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-bold">#${s.id}</span>
                        <span class="text-xs">${s.starred ? "★" : ""}${s.mastered ? " 암기완료" : ""}</span>
                      </div>
                      <p class="mt-1 text-sm font-semibold">${s.english}</p>
                      <p class="mt-1 text-xs ${s.id === current.id ? "text-slate-200" : "text-slate-500"}">${s.korean}</p>
                    </div>
                  </button>
                `)
                .join("")}
            </div>
          </aside>
        </section>
      </div>
    </div>
  `;

  const cardAnswerInput = document.getElementById("card-answer-input");
  const englishDisplay = document.getElementById("english-display");

  if (cardAnswerInput) {
    cardAnswerInput.addEventListener("paste", (e) => {
      e.preventDefault();
    });

    cardAnswerInput.addEventListener("compositionstart", () => {
      state.isComposing = true;
    });

    cardAnswerInput.addEventListener("compositionend", (e) => {
      state.isComposing = false;
      state.answer = e.target.value;
      scheduleTypingHighlightUpdate(englishDisplay, current);
      const didAdvance = checkCardTypingAndAdvance(current);
      if (didAdvance) {
        render();
        return;
      }
    });

    cardAnswerInput.addEventListener("input", (e) => {
      state.answer = e.target.value;
      if (!state.isComposing) {
        scheduleTypingHighlightUpdate(englishDisplay, current);
      }
      const didAdvance = checkCardTypingAndAdvance(current);
      if (didAdvance) {
        render();
      }
    });

    if (state.shouldRefocusCardInput && document.activeElement !== cardAnswerInput) {
      cardAnswerInput.focus({ preventScroll: true });
    }
    if (state.shouldRefocusCardInput) {
      const end = cardAnswerInput.value.length;
      cardAnswerInput.setSelectionRange(end, end);
      state.shouldRefocusCardInput = false;
    }
  }

  const syncListHeightToMainPanel = () => {
    const listWrap = document.getElementById("list-wrap");
    const mainPanel = document.getElementById("main-panel");
    if (!listWrap || !mainPanel) return;
    const mainVisibleHeight = mainPanel.offsetHeight;
    const targetHeight = `${mainVisibleHeight}px`;
    if (mainVisibleHeight > 0 && listWrap.style.height !== targetHeight) {
      listWrap.style.height = targetHeight;
    }
  };

  const scrollCurrentItemToTop = (force = false) => {
    if (!force && state.lastScrolledSentenceId === current.id) return;
    const listWrap = document.getElementById("list-wrap");
    if (!listWrap) return;
    const activeItem = listWrap.querySelector(`[data-sentence-id="${current.id}"]`);
    if (!activeItem) return;
    const targetTop = activeItem.offsetTop - listWrap.offsetTop;
    listWrap.scrollTop = Math.max(0, targetTop);
    state.lastScrolledSentenceId = current.id;
  };

  syncListHeightToMainPanel();
  scrollCurrentItemToTop();
  window.requestAnimationFrame(() => {
    syncListHeightToMainPanel();
    scrollCurrentItemToTop(true);
  });

  if (!state.hasAutoSpokenOnFirstCard) {
    state.hasAutoSpokenOnFirstCard = true;
    if (state.isListenOn) speak(current);
  }

  if (state.shouldSpeakAfterRender) {
    state.shouldSpeakAfterRender = false;
    if (state.isListenOn) speak(current);
  }
}

async function bootstrap() {
  try {
    await loadDataFile();
    runSelfTests();
    initializeSentences();

    const root = document.getElementById("root");
    root.addEventListener("click", (e) => {
      const actionElement = e.target.closest("[data-action]");
      if (!actionElement || !root.contains(actionElement)) return;
      handleActionClick(actionElement);
    });

    render();
  } catch (error) {
    const root = document.getElementById("root");
    root.innerHTML = `<div class="min-h-screen p-6 text-red-600 font-semibold">data.json 로드에 실패했습니다. 파일 경로와 JSON 형식을 확인해 주세요.</div>`;
  }
}

bootstrap();
