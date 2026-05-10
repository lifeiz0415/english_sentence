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
let BASIC_WORD_QUIZ_DATA = [];
let ADVANCED_WORD_QUIZ_DATA = [];

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

const BASIC_SENTENCE_STORAGE_KEY = "const-english-sentences-v4";
const ADVANCED_SENTENCE_STORAGE_KEY = "const-english-sentences-advanced-v1";
const BASIC_WORD_QUIZ_STORAGE_KEY = "const-english-word-quiz-v1";
const ADVANCED_WORD_QUIZ_STORAGE_KEY = "const-english-word-quiz-advanced-v1";
const DATA_FILE_PATH = "./data.json";

const state = {
  mode: "sentence-basic",
  basicSentences: [],
  advancedSentences: [],
  basicIndex: 0,
  advancedIndex: 0,
  answer: "",
  feedback: "",
  isEnglishVisible: true,
  lastScrolledSentenceId: null,
  hasAutoSpokenOnFirstCardBasic: false,
  hasAutoSpokenOnFirstCardAdvanced: false,
  shouldSpeakAfterRender: false,
  shouldRefocusCardInput: false,
  isComposing: false,
  typingRafId: null,
  isRandomOn: true,
  isListenOn: true,
  isAutoplaying: false,
  autoplayTimerId: null,
  speechFallbackTimerId: null,
  basicWordQuizItems: [],
  advancedWordQuizItems: [],
  basicWordQuizIndex: 0,
  advancedWordQuizIndex: 0,
  wordQuizFeedback: "",
  selectedWordChoice: "",
  wordQuizAnsweredCorrectly: false,
  wordQuizChoiceMap: {},
  wordQuizAdvanceTimerId: null,
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

function mergeSavedWordQuizProgress(defaultItems, savedItems) {
  if (!Array.isArray(savedItems)) return defaultItems;

  const savedByWord = new Map(
    savedItems.map((item) => {
      const normalized = {
        word: String(item?.word || "").toLowerCase(),
        mastered: Boolean(item?.mastered),
      };
      return [normalized.word, normalized];
    }),
  );

  return defaultItems.map((item) => {
    const saved = savedByWord.get(item.word);
    if (!saved) return item;
    return {
      ...item,
      mastered: saved.mastered,
    };
  });
}

function loadSentences(storageKey) {
  const defaultSentences = parseLines(DEFAULT_LINES);

  try {
    const saved = window.localStorage.getItem(storageKey);
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

function isSentenceMode() {
  return state.mode === "sentence-basic" || state.mode === "sentence-advanced";
}

function isWordQuizMode() {
  return state.mode === "word-basic" || state.mode === "word-advanced";
}

function getSentenceStorageKey() {
  return state.mode === "sentence-advanced" ? ADVANCED_SENTENCE_STORAGE_KEY : BASIC_SENTENCE_STORAGE_KEY;
}

function getSentenceModeLabel() {
  return state.mode === "sentence-advanced" ? "심화" : "기초";
}

function getWordQuizModeLabel() {
  return state.mode === "word-advanced" ? "심화" : "기초";
}

function getSentenceProgressList() {
  return state.mode === "sentence-advanced" ? state.advancedSentences : state.basicSentences;
}

function setSentenceProgressList(nextSentences) {
  if (state.mode === "sentence-advanced") {
    state.advancedSentences = nextSentences;
  } else {
    state.basicSentences = nextSentences;
  }
}

function getSentenceIndex() {
  return state.mode === "sentence-advanced" ? state.advancedIndex : state.basicIndex;
}

function setSentenceIndex(nextIndex) {
  if (state.mode === "sentence-advanced") {
    state.advancedIndex = nextIndex;
  } else {
    state.basicIndex = nextIndex;
  }
}

function getWordQuizStorageKey() {
  return state.mode === "word-advanced" ? ADVANCED_WORD_QUIZ_STORAGE_KEY : BASIC_WORD_QUIZ_STORAGE_KEY;
}

function getWordQuizDataSource() {
  return state.mode === "word-advanced" ? ADVANCED_WORD_QUIZ_DATA : BASIC_WORD_QUIZ_DATA;
}

function getWordQuizItemsList() {
  return state.mode === "word-advanced" ? state.advancedWordQuizItems : state.basicWordQuizItems;
}

function setWordQuizItemsList(nextItems) {
  if (state.mode === "word-advanced") {
    state.advancedWordQuizItems = nextItems;
  } else {
    state.basicWordQuizItems = nextItems;
  }
}

function getWordQuizIndex() {
  return state.mode === "word-advanced" ? state.advancedWordQuizIndex : state.basicWordQuizIndex;
}

function setWordQuizIndex(nextIndex) {
  if (state.mode === "word-advanced") {
    state.advancedWordQuizIndex = nextIndex;
  } else {
    state.basicWordQuizIndex = nextIndex;
  }
}

function buildWordQuizItems(items) {
  return items.map((item, index) => {
    const escapedWord = item.word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const matchingSentence = state.basicSentences.find((sentence) => new RegExp(`\\b${escapedWord}\\b`, "i").test(sentence.english));

    return {
      id: index + 1,
      word: String(item.word || "").toLowerCase(),
      meaning: String(item.meaning || "").trim(),
      partOfSpeech: String(item.partOfSpeech || "").trim(),
      related: Array.isArray(item.related) ? item.related.map((word) => String(word || "").toLowerCase()).filter(Boolean) : [],
      opposites: Array.isArray(item.opposites) ? item.opposites.map((word) => String(word || "").toLowerCase()).filter(Boolean) : [],
      mastered: false,
    };
  }).filter((item) => item.word && item.partOfSpeech);
}

function loadWordQuizItems() {
  const defaultItems = buildWordQuizItems(getWordQuizDataSource());

  try {
    const saved = window.localStorage.getItem(getWordQuizStorageKey());
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length >= defaultItems.length) {
        return mergeSavedWordQuizProgress(defaultItems, parsed);
      }
    }
  } catch (error) {
    console.warn("Word quiz progress could not be loaded", error);
  }

  return defaultItems;
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
    if (!Array.isArray(data?.vocabulary)) throw new Error("data.json vocabulary must be an array");
    if (!Array.isArray(data?.advancedVocabulary)) throw new Error("data.json advancedVocabulary must be an array");
    DEFAULT_LINES = data.sentences.map((line) => String(line || ""));
    PRONUNCIATION_MAP = data.pronunciationMap;
    BASIC_WORD_QUIZ_DATA = data.vocabulary;
    ADVANCED_WORD_QUIZ_DATA = data.advancedVocabulary;
  } catch (error) {
    console.error("Data file could not be loaded", error);
    throw error;
  }
}

function initializeSentences() {
  state.basicSentences = loadSentences(BASIC_SENTENCE_STORAGE_KEY);
  if (state.basicSentences.length > 0) {
    const unmastered = state.basicSentences.filter((s) => !s.mastered);
    const initialPool = unmastered.length > 0 ? unmastered : state.basicSentences;
    const initial = initialPool[Math.floor(Math.random() * initialPool.length)];
    state.basicIndex = state.basicSentences.findIndex((s) => s.id === initial.id);
  }

  state.advancedSentences = loadSentences(ADVANCED_SENTENCE_STORAGE_KEY);
  if (state.advancedSentences.length > 0) {
    const unmastered = state.advancedSentences.filter((s) => !s.mastered);
    const initialPool = unmastered.length > 0 ? unmastered : state.advancedSentences;
    const initial = initialPool[Math.floor(Math.random() * initialPool.length)];
    state.advancedIndex = state.advancedSentences.findIndex((s) => s.id === initial.id);
  }

  state.mode = "word-basic";
  state.basicWordQuizItems = loadWordQuizItems();
  if (state.basicWordQuizItems.length > 0) {
    const quizPool = state.basicWordQuizItems.filter((item) => !item.mastered);
    const initialPool = quizPool.length > 0 ? quizPool : state.basicWordQuizItems;
    const initial = initialPool[Math.floor(Math.random() * initialPool.length)];
    state.basicWordQuizIndex = state.basicWordQuizItems.findIndex((item) => item.word === initial.word);
  }

  state.mode = "word-advanced";
  state.advancedWordQuizItems = loadWordQuizItems();
  if (state.advancedWordQuizItems.length > 0) {
    const quizPool = state.advancedWordQuizItems.filter((item) => !item.mastered);
    const initialPool = quizPool.length > 0 ? quizPool : state.advancedWordQuizItems;
    const initial = initialPool[Math.floor(Math.random() * initialPool.length)];
    state.advancedWordQuizIndex = state.advancedWordQuizItems.findIndex((item) => item.word === initial.word);
  }

  state.mode = "sentence-basic";
}

function persist() {
  try {
    window.localStorage.setItem(getSentenceStorageKey(), JSON.stringify(getSentenceProgressList()));
  } catch (error) {
    console.warn("Progress could not be saved", error);
  }
}

function persistWordQuizProgress() {
  try {
    window.localStorage.setItem(
      getWordQuizStorageKey(),
      JSON.stringify(getWordQuizItemsList().map((item) => ({ word: item.word, mastered: item.mastered }))),
    );
  } catch (error) {
    console.warn("Word quiz progress could not be saved", error);
  }
}

function getActiveSentences() {
  const sentenceList = getSentenceProgressList();
  const unmastered = sentenceList.filter((s) => !s.mastered);
  return unmastered.length > 0 ? unmastered : sentenceList;
}

function getCurrent() {
  const active = getActiveSentences();
  if (active.length === 0) return null;
  const currentById = active.find((s) => s.id === getSentenceIndex());
  return currentById || active[0] || null;
}

function getActiveWordQuizItems() {
  const wordQuizItems = getWordQuizItemsList();
  const unmastered = wordQuizItems.filter((item) => !item.mastered);
  return unmastered.length > 0 ? unmastered : wordQuizItems;
}

function getCurrentWordQuizItem() {
  const active = getActiveWordQuizItems();
  if (active.length === 0) return null;
  const currentByWord = active.find((item) => item.word === getWordQuizItemsList()[getWordQuizIndex()]?.word);
  return currentByWord || active[0] || null;
}

function safeSetIndex(nextIdOrOffset, useOffset = true) {
  const active = getActiveSentences();
  if (active.length === 0) {
    setSentenceIndex(0);
    return;
  }

  if (useOffset) {
    const currentPos = Math.max(0, active.findIndex((s) => s.id === getSentenceIndex()));
    const nextPos = (currentPos + nextIdOrOffset + active.length) % active.length;
    setSentenceIndex(active[nextPos].id);
  } else {
    const exact = active.find((s) => s.id === nextIdOrOffset);
    setSentenceIndex(exact ? exact.id : active[0].id);
  }

  state.answer = "";
  state.feedback = "";
}

function safeSetWordQuizIndex(nextWordOrOffset, useOffset = true) {
  const active = getActiveWordQuizItems();
  if (active.length === 0) {
    setWordQuizIndex(0);
    return;
  }

  if (useOffset) {
    const currentWord = getWordQuizItemsList()[getWordQuizIndex()]?.word;
    const currentPos = Math.max(0, active.findIndex((item) => item.word === currentWord));
    const nextPos = (currentPos + nextWordOrOffset + active.length) % active.length;
    const nextWord = active[nextPos].word;
    setWordQuizIndex(getWordQuizItemsList().findIndex((item) => item.word === nextWord));
  } else {
    const exact = active.find((item) => item.word === nextWordOrOffset);
    const targetWord = exact ? exact.word : active[0].word;
    setWordQuizIndex(getWordQuizItemsList().findIndex((item) => item.word === targetWord));
  }

  state.wordQuizFeedback = "";
  state.selectedWordChoice = "";
  state.wordQuizAnsweredCorrectly = false;
}

function updateCurrent(patch, current) {
  if (!current) return;
  setSentenceProgressList(getSentenceProgressList().map((s) => (s.id === current.id ? { ...s, ...patch } : s)));
  persist();
}

function updateWordQuizCurrent(patch, current) {
  if (!current) return;
  setWordQuizItemsList(getWordQuizItemsList().map((item) => (item.word === current.word ? { ...item, ...patch } : item)));
  persistWordQuizProgress();
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

function clearWordQuizAdvanceTimer() {
  if (state.wordQuizAdvanceTimerId) {
    window.clearTimeout(state.wordQuizAdvanceTimerId);
    state.wordQuizAdvanceTimerId = null;
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

  const currentPos = Math.max(0, active.findIndex((s) => s.id === getSentenceIndex()));
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

      if (!state.isRandomOn && activeNow.findIndex((s) => s.id === getSentenceIndex()) >= activeNow.length - 1) {
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

function getWordQuizChoices(current) {
  if (!current) return [];
  if (state.wordQuizChoiceMap[current.word]) {
    return state.wordQuizChoiceMap[current.word];
  }

  const candidatePool = getWordQuizItemsList().filter(
    (item) => item.word !== current.word && item.meaning !== current.meaning && item.partOfSpeech === current.partOfSpeech,
  );
  const preferredWords = [...new Set([...current.related, ...current.opposites])];
  const preferredDistractors = preferredWords
    .map((word) => candidatePool.find((item) => item.word === word))
    .filter(Boolean)
    .map((item) => item.meaning);
  const fallbackDistractors = candidatePool
    .filter((item) => !preferredWords.includes(item.word))
    .sort(() => Math.random() - 0.5)
    .map((item) => item.meaning);
  const distractors = [...new Set([...preferredDistractors, ...fallbackDistractors])].slice(0, 3);

  const choices = [current.meaning, ...distractors].sort(() => Math.random() - 0.5);
  state.wordQuizChoiceMap[current.word] = choices;
  return choices;
}

function speakWordQuizItem(item) {
  if (!item || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance === "undefined") return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(item.word);
    utterance.lang = "en-US";
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn("Word quiz speech is unavailable in this browser context", error);
  }
}

function handleWordQuizAnswer(choice) {
  const current = getCurrentWordQuizItem();
  if (!current) return;

  clearWordQuizAdvanceTimer();

  state.selectedWordChoice = choice;

  if (choice !== current.meaning) {
    state.wordQuizFeedback = "";
    state.wordQuizAnsweredCorrectly = false;
    render();
    return;
  }

  state.wordQuizFeedback = "정답!";
  state.wordQuizAnsweredCorrectly = true;
  if (state.isRandomOn) {
    const pool = getActiveWordQuizItems();
    if (pool.length > 0) {
      let nextWord = pool[Math.floor(Math.random() * pool.length)].word;
      if (pool.length > 1 && nextWord === current.word) {
        nextWord = pool.find((item) => item.word !== current.word)?.word || nextWord;
      }
      state.wordQuizAdvanceTimerId = window.setTimeout(() => {
        updateWordQuizCurrent({ mastered: true }, current);
        safeSetWordQuizIndex(nextWord, false);
        state.wordQuizAdvanceTimerId = null;
        render();
      }, 1000);
    }
  } else {
    state.wordQuizAdvanceTimerId = window.setTimeout(() => {
      updateWordQuizCurrent({ mastered: true }, current);
      safeSetWordQuizIndex(1, true);
      state.wordQuizAdvanceTimerId = null;
      render();
    }, 1000);
  }
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
  setSentenceProgressList(getSentenceProgressList().map((s) => ({ ...s, mastered: false, starred: false })));
  setSentenceIndex(0);
  state.answer = "";
  state.feedback = "";
  persist();
}

function resetWordQuizProgress() {
  setWordQuizItemsList(getWordQuizItemsList().map((item) => ({ ...item, mastered: false })));
  setWordQuizIndex(0);
  state.wordQuizFeedback = "";
  state.selectedWordChoice = "";
  state.wordQuizAnsweredCorrectly = false;
  state.wordQuizChoiceMap = {};
  clearWordQuizAdvanceTimer();
  persistWordQuizProgress();
}

function handleActionClick(el) {
  if (!el) return;
  const action = el.getAttribute("data-action");
  if (!action) return;

  if (state.isAutoplaying && action !== "toggle-autoplay") {
    stopAutoplay();
  }
  clearWordQuizAdvanceTimer();

  if (action.startsWith("set-mode-")) {
    state.mode = action.replace("set-mode-", "");
    state.answer = "";
    state.feedback = "";
    state.wordQuizFeedback = "";
    state.selectedWordChoice = "";
    state.wordQuizAnsweredCorrectly = false;
    state.wordQuizChoiceMap = {};
    state.shouldRefocusCardInput = isSentenceMode();
    render();
    return;
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
      if (isWordQuizMode()) {
        safeSetWordQuizIndex(-1, true);
      } else {
        safeSetIndex(-1, true);
      }
      break;
    case "next":
      if (isWordQuizMode()) {
        const currentWord = getCurrentWordQuizItem();
        if (state.isRandomOn) {
          const pool = getActiveWordQuizItems();
          if (pool.length > 0) {
            let nextWord = pool[Math.floor(Math.random() * pool.length)].word;
            if (pool.length > 1 && nextWord === currentWord?.word) {
              nextWord = pool.find((item) => item.word !== currentWord?.word)?.word || nextWord;
            }
            safeSetWordQuizIndex(nextWord, false);
          }
        } else {
          safeSetWordQuizIndex(1, true);
        }
      } else if (state.isRandomOn) {
        safeSetIndex(getAdvanceIndex(), false);
      } else {
        safeSetIndex(1, true);
      }
      break;
    case "reset-progress":
      if (isWordQuizMode()) {
        resetWordQuizProgress();
      } else {
        resetProgress();
      }
      break;
    case "toggle-autoplay":
      toggleAutoplay();
      break;
    case "pick": {
      const id = Number(el.getAttribute("data-sentence-id"));
      safeSetIndex(id, false);
      break;
    }
    case "pick-word": {
      const word = String(el.getAttribute("data-word") || "");
      safeSetWordQuizIndex(word, false);
      break;
    }
    case "answer-word-quiz":
      handleWordQuizAnswer(String(el.getAttribute("data-meaning") || ""));
      return;
    default:
      break;
  }

  if (isWordQuizMode()) {
    if ((action === "prev" || action === "next" || action === "pick-word") && state.isListenOn) {
      const currentWord = getCurrentWordQuizItem();
      if (currentWord) {
        speakWordQuizItem(currentWord);
      }
    }
  } else if ((action === "prev" || action === "next" || action === "pick") && state.isListenOn) {
    state.shouldSpeakAfterRender = true;
  }

  render();
}

function render() {
  cancelTypingRaf();
  const root = document.getElementById("root");
  const wordQuizModeActive = isWordQuizMode();
  const isSentenceModeActive = isSentenceMode();
  const currentSentence = getCurrent();
  const currentWordQuiz = getCurrentWordQuizItem();

  if ((!isSentenceModeActive && !wordQuizModeActive) || (isSentenceModeActive && !currentSentence) || (wordQuizModeActive && !currentWordQuiz)) {
    root.innerHTML = `<div class="min-h-screen p-6">학습할 문장이 없습니다.</div>`;
    return;
  }

  const sentenceList = getSentenceProgressList();
  const progressSource = wordQuizModeActive ? getWordQuizItemsList() : sentenceList;
  const masteredCount = progressSource.filter((item) => item.mastered).length;
  const progress = progressSource.length ? Math.round((masteredCount / progressSource.length) * 100) : 0;
  const hasWordQuizMeaning = wordQuizModeActive ? Boolean(currentWordQuiz.meaning) : false;
  const wordQuizChoices = wordQuizModeActive && hasWordQuizMeaning ? getWordQuizChoices(currentWordQuiz) : [];

  const leftControls = wordQuizModeActive
    ? `
      <span class="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900">${getWordQuizModeLabel()} #${currentWordQuiz.id}</span>
      <button data-action="reset-progress" class="rounded-2xl px-4 py-2 text-sm font-bold transition bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-900 hover:text-white">진도초기화</button>
    `
    : `
      <span class="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900">${getSentenceModeLabel()} #${currentSentence.id}</span>
      <button data-action="reset-progress" class="rounded-2xl px-4 py-2 text-sm font-bold transition bg-slate-100 text-slate-900 shadow-sm hover:bg-slate-900 hover:text-white">진도초기화</button>
      ${currentSentence.mastered ? '<span class="rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">암기완료</span>' : ""}
    `;

  const rightControls = `
    ${state.mode === "sentence-advanced" ? `<button data-action="toggle-english-visible" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isEnglishVisible ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-rose-100 text-rose-800 hover:bg-rose-200"}">${state.isEnglishVisible ? "문장 보임" : "문장 숨김"}</button>` : ""}
    ${wordQuizModeActive ? "" : `<button data-action="toggle-autoplay" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isAutoplaying ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-rose-100 text-rose-800 hover:bg-rose-200"}">${state.isAutoplaying ? "자동재생 on" : "자동재생 off"}</button>`}
    <button data-action="toggle-random" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isRandomOn ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-rose-100 text-rose-800 hover:bg-rose-200"}">${state.isRandomOn ? "랜덤 on" : "랜덤 off"}</button>
    <button data-action="toggle-listen" class="rounded-2xl px-4 py-2 text-sm font-bold transition ${state.isListenOn ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-rose-100 text-rose-800 hover:bg-rose-200"}">${state.isListenOn ? "듣기 on" : "듣기 off"}</button>
  `;

  const mainContent = wordQuizModeActive
    ? `
      <div class="min-h-[330px] rounded-3xl bg-slate-100 p-6 md:p-10">
        <div class="min-h-[148px] overflow-visible rounded-2xl bg-white/50 p-3 pb-5 md:min-h-[172px] md:p-4 md:pb-6">
          <p class="text-3xl font-extrabold leading-normal tracking-tight pb-1 md:text-5xl">${escapeHtml(currentWordQuiz.word)}</p>
        </div>
        ${hasWordQuizMeaning ? `
          <div class="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
            ${wordQuizChoices
              .map((meaning) => {
                const isSelected = state.selectedWordChoice === meaning;
                const isCorrect = meaning === currentWordQuiz.meaning;
                const resultClass = isSelected
                  ? isCorrect
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : "bg-rose-100 text-rose-800 border-rose-300"
                  : "bg-white text-slate-800 border-slate-200 hover:bg-slate-50";
                return `<button data-action="answer-word-quiz" data-meaning="${escapeHtml(meaning)}" class="rounded-2xl border p-4 text-left text-lg font-bold transition ${resultClass}">${escapeHtml(meaning)}</button>`;
              })
              .join("")}
          </div>
        ` : `<div class="mt-8 rounded-2xl bg-white p-4 text-lg font-semibold text-slate-500 shadow-sm">뜻 준비중</div>`}
      </div>
    `
    : `
      <div class="min-h-[330px] rounded-3xl bg-slate-100 p-6 md:p-10">
        <div class="min-h-[148px] overflow-visible rounded-2xl bg-white/50 p-3 pb-5 md:min-h-[172px] md:p-4 md:pb-6">
          <p id="english-display" class="text-3xl font-extrabold leading-normal tracking-tight pb-1 md:text-5xl">${state.isEnglishVisible ? buildTypingMarkup(currentSentence.english, state.answer) : '<span class="text-slate-300">문장이 숨겨져 있습니다.</span>'}</p>
        </div>
        <div class="mt-4 max-h-[64px] overflow-hidden rounded-2xl bg-white/40 p-1.5">
          <div class="flex flex-wrap gap-2 ${state.isEnglishVisible ? "" : "opacity-0 select-none"}">${buildPronunciationMarkup(currentSentence.english)}</div>
        </div>
        <div class="mt-8 space-y-5">
          <p class="rounded-3xl bg-white p-5 text-2xl font-bold leading-relaxed text-slate-700 shadow-sm">${currentSentence.korean}</p>
          <input id="card-answer-input" value="${state.answer.replaceAll('"', '&quot;')}" placeholder="영어 문장을 정확히 입력하면 자동으로 다음 문장으로 이동합니다" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" class="w-full rounded-2xl border-2 border-slate-900 bg-white p-4 text-lg outline-none focus:ring-0" />
          ${state.feedback ? `<p class="rounded-2xl bg-white p-4 font-semibold text-slate-700 shadow-sm">${state.feedback}</p>` : ""}
        </div>
      </div>
    `;

  const sidebarItems = wordQuizModeActive
    ? getWordQuizItemsList()
        .map((item) => `
          <button data-action="pick-word" data-word="${escapeHtml(item.word)}" class="w-full rounded-2xl p-3 text-left transition ${item.word === currentWordQuiz.word ? "border-2 border-slate-900 bg-white text-slate-900" : item.mastered ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-slate-50 hover:bg-slate-100"}">
            <div>
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold">#${item.id}</span>
                <span class="text-xs">${item.mastered ? " 암기완료" : ""}</span>
              </div>
              <p class="mt-1 text-sm font-semibold">${escapeHtml(item.word)}</p>
              <p class="mt-1 text-xs ${item.word === currentWordQuiz.word ? "text-slate-500" : item.mastered ? "text-emerald-700" : "text-slate-500"}">${item.mastered ? "암기완료" : "준비됨"}</p>
            </div>
          </button>
        `)
        .join("")
    : sentenceList
        .map((s) => `
          <button data-action="pick" data-sentence-id="${s.id}" class="w-full rounded-2xl p-3 text-left transition ${s.id === currentSentence.id ? "border-2 border-slate-900 bg-white text-slate-900" : s.mastered ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-slate-50 hover:bg-slate-100"}">
            <div class="${state.isEnglishVisible ? "" : "text-transparent select-none"}">
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs font-bold">#${s.id}</span>
                <span class="text-xs">${s.starred ? "★" : ""}${s.mastered ? " 암기완료" : ""}</span>
              </div>
              <p class="mt-1 text-sm font-semibold">${s.english}</p>
              <p class="mt-1 text-xs ${s.id === currentSentence.id ? "text-slate-500" : s.mastered ? "text-emerald-700" : "text-slate-500"}">${s.korean}</p>
            </div>
          </button>
        `)
        .join("");

  root.innerHTML = `
    <div class="min-h-screen px-[5vw] py-[2.5vh] text-slate-900">
      <div class="mx-auto w-full space-y-5">
        <header class="rounded-3xl bg-white p-5 shadow-sm">
          <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p class="text-sm font-semibold text-slate-500">Master English with 365 Sentences</p>
              <h1 class="text-2xl font-bold md:text-4xl">🎯 365문장으로 영어 마스터하기</h1>
            </div>
            <div class="grid grid-cols-2 gap-2 md:min-w-[320px] md:grid-cols-4">
              <button data-action="set-mode-sentence-basic" class="aspect-square rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-sm leading-tight transition ${state.mode === "sentence-basic" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}">기초<br />문장</button>
              <button data-action="set-mode-sentence-advanced" class="aspect-square rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-sm leading-tight transition ${state.mode === "sentence-advanced" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}">심화<br />문장</button>
              <button data-action="set-mode-word-basic" class="aspect-square rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-sm leading-tight transition ${state.mode === "word-basic" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}">기초<br />단어</button>
              <button data-action="set-mode-word-advanced" class="aspect-square rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-sm leading-tight transition ${state.mode === "word-advanced" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}">심화<br />단어</button>
            </div>
          </div>
        </header>

        <section class="grid items-start gap-4 md:grid-cols-[1fr_320px]">
          <main id="main-panel" class="rounded-3xl bg-white p-5 shadow-sm md:p-8">
            <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">${leftControls}</div>
              <div class="flex items-center gap-2">${rightControls}</div>
            </div>
            ${mainContent}
            <div class="mt-5 flex flex-wrap justify-between gap-2">
              <button data-action="prev" class="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-100">이전</button>
              <div class="flex gap-2"></div>
              <button data-action="next" class="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-slate-900 shadow-sm hover:bg-slate-100">다음</button>
            </div>
          </main>

          <aside id="sidebar-panel" class="flex min-h-0 flex-col gap-4 self-stretch">
            <div class="space-y-3 rounded-3xl bg-white p-3 shadow-sm">
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-2xl bg-slate-100 px-3 py-3 text-center"><div class="text-xs font-semibold text-slate-500">전체</div><div class="text-xl font-extrabold">${progressSource.length}</div></div>
                <div class="rounded-2xl bg-slate-100 px-3 py-3 text-center"><div class="text-xs font-semibold text-slate-500">암기</div><div class="text-xl font-extrabold">${masteredCount}</div></div>
                <div class="rounded-2xl bg-slate-100 px-3 py-3 text-center"><div class="text-xs font-semibold text-slate-500">진도</div><div class="text-xl font-extrabold">${progress}%</div></div>
              </div>
              <div class="h-3 overflow-hidden rounded-full bg-slate-100"><div class="h-full rounded-full bg-slate-900" style="width:${progress}%"></div></div>
            </div>
            <div class="min-h-0 flex-1 space-y-2 overflow-auto rounded-3xl bg-white p-3 shadow-sm" id="list-wrap">
              ${sidebarItems}
            </div>
          </aside>
        </section>
      </div>
    </div>
  `;

  const cardAnswerInput = document.getElementById("card-answer-input");
  const englishDisplay = document.getElementById("english-display");

  if (!wordQuizModeActive && cardAnswerInput) {
    cardAnswerInput.addEventListener("paste", (e) => {
      e.preventDefault();
    });

    cardAnswerInput.addEventListener("compositionstart", () => {
      state.isComposing = true;
    });

    cardAnswerInput.addEventListener("compositionend", (e) => {
      state.isComposing = false;
      state.answer = e.target.value;
      scheduleTypingHighlightUpdate(englishDisplay, currentSentence);
      const didAdvance = checkCardTypingAndAdvance(currentSentence);
      if (didAdvance) {
        render();
        return;
      }
    });

    cardAnswerInput.addEventListener("input", (e) => {
      state.answer = e.target.value;
      if (!state.isComposing) {
        scheduleTypingHighlightUpdate(englishDisplay, currentSentence);
      }
      const didAdvance = checkCardTypingAndAdvance(currentSentence);
      if (didAdvance) {
        render();
      }
    });

    if (state.shouldRefocusCardInput && document.activeElement !== cardAnswerInput) {
      cardAnswerInput.focus({ preventScroll: true });
    }
    if (state.shouldRefocusCardInput) {
      const endIndex = cardAnswerInput.value.length;
      cardAnswerInput.setSelectionRange(endIndex, endIndex);
      state.shouldRefocusCardInput = false;
    }
  }

  const syncListHeightToMainPanel = () => {
    const sidebarPanel = document.getElementById("sidebar-panel");
    const mainPanel = document.getElementById("main-panel");
    if (!sidebarPanel || !mainPanel) return;
    const mainVisibleHeight = mainPanel.offsetHeight;
    const targetHeight = `${mainVisibleHeight}px`;
    if (mainVisibleHeight > 0 && sidebarPanel.style.height !== targetHeight) {
      sidebarPanel.style.height = targetHeight;
    }
  };

  const scrollCurrentItemToTop = (force = false) => {
    const currentKey = wordQuizModeActive ? `${state.mode}:${currentWordQuiz.word}` : `${state.mode}:${currentSentence.id}`;
    if (!force && state.lastScrolledSentenceId === currentKey) return;
    const listWrap = document.getElementById("list-wrap");
    if (!listWrap) return;
    const selector = wordQuizModeActive
      ? `[data-word="${currentWordQuiz.word}"]`
      : `[data-sentence-id="${currentSentence.id}"]`;
    const activeItem = listWrap.querySelector(selector);
    if (!activeItem) return;
    const targetTop = activeItem.offsetTop - listWrap.offsetTop;
    listWrap.scrollTop = Math.max(0, targetTop);
    state.lastScrolledSentenceId = currentKey;
  };

  syncListHeightToMainPanel();
  scrollCurrentItemToTop();
  window.requestAnimationFrame(() => {
    syncListHeightToMainPanel();
    scrollCurrentItemToTop(true);
  });

  if (wordQuizModeActive) {
    if (state.isListenOn) {
      speakWordQuizItem(currentWordQuiz);
    }
    return;
  }

  const autoSpokenKey = state.mode === "sentence-advanced" ? "hasAutoSpokenOnFirstCardAdvanced" : "hasAutoSpokenOnFirstCardBasic";
  if (!state[autoSpokenKey]) {
    state[autoSpokenKey] = true;
    if (state.isListenOn) speak(currentSentence);
  }

  if (state.shouldSpeakAfterRender) {
    state.shouldSpeakAfterRender = false;
    if (state.isListenOn) speak(currentSentence);
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
