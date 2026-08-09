// ===================================================================
// Study Pet — Web
// Ported from the StudyPet.swiftpm SwiftUI app. All state persists to
// localStorage, mirroring the original's @AppStorage-backed models.
//
// Quizzim has three real chat sources: ChatGPT and Claude open as
// their own sites (new tab — they block being embedded, since they
// send X-Frame-Options/CSP frame-ancestors restrictions, so a truly
// embedded chat like the SwiftUI version's WKWebView isn't possible
// in a regular browser tab), and "Offline AI" which — unlike the
// Swift app's Apple-Intelligence-only On-Device source — is genuinely
// live on the web via WebLLM (see the OFFLINE AI section below): a
// real local model running in-browser over WebGPU, no account, no
// network calls once the model's cached. Apple's Private Cloud
// Compute ("Cloud") has no web equivalent and stays disabled.
// ===================================================================

const StorageKeys = {
  isLoggedIn: 'studypet.isLoggedIn',
  email: 'studypet.email',
  petData: 'studypet.petData',
  focusModeEnabled: 'studypet.focusModeEnabled',
  appearance: 'studypet.appearance',
  colorTheme: 'studypet.colorTheme',
  pingPongWins: 'studypet.pingpong.wins',
  tttWins: 'studypet.tictactoe.wins',
  quizzimThreads: 'studypet.quizzim.threads',
  quizzimModel: 'studypet.quizzim.model',
  offlineModelChoice: 'studypet.quizzim.offlineModel',
  aiLanguage: 'studypet.quizzim.language',
  flashcardCount: 'studypet.quizzim.flashcardCount',
  quizCount: 'studypet.quizzim.quizCount',
  flashcardDecks: 'studypet.quizzim.decks',
  quizScores: 'studypet.quizzim.scores',
};

const GameConstants = {
  feedCost: 15,
  feedHungerReduction: 20,
  feedHappinessIncrease: 15,
  maxStatValue: 100,
  minStatValue: 0,
  gameCost: 10,
  sessionDurationPresets: [15, 20, 25, 30, 45, 60, 90],
  defaultPomodoroWorkMinutes: 25,
  defaultPomodoroBreakMinutes: 5,
  defaultPomodoroLongBreakMinutes: 15,
  defaultPomodoroCyclesBeforeLongBreak: 4,
  defaultPomodoroTotalCycles: 4,
  coinsEarned(minutes) { return minutes; },
  level(totalCoinsEarned) { return Math.max(1, Math.floor(totalCoinsEarned / 100) + 1); },

  // Mood / happiness tuning — ported from Constants.swift's GameConstants.
  moodDecayTickSeconds: 30,
  hungerDecayPerTick: 1,
  happinessDecayPerTick: 1,
  gameParticipationHappiness: 6,
  gameWinHappinessBonus: 6,
  studyHappinessBoost(minutesStudied, method) {
    const base = minutesStudied * 0.6;
    const methodMultiplier = method === 'pomodoro' ? 1.25 : 1.0;
    return Math.max(1, Math.round(base * methodMultiplier));
  },
};

// ---------------------------------------------------------------
// Pet Shop — species the player can unlock with coins earned studying.
// Ported from PetSpecies.swift + PetShopConstants (Constants.swift).
//
// Note: the Swift package's 6th species ("Cinnamonroll") is a close
// likeness of Sanrio's copyrighted Cinnamoroll character, so it isn't
// reproduced here. "Puffball" fills the same price tier with an
// original cloud-critter concept instead.
// ---------------------------------------------------------------
// Pet artwork is embedded as base64 data URIs (instead of separate
// image files) so the whole app is self-contained in app.js — no
// separate asset upload step needed.
const PET_IMAGES = {
  cat: "cat.png",
  doggy: "doggy.png",
  birdie: "birdie.png",
  crab: "crab.png",
  axolotl: "axolotl.png",
};
const PET_SPECIES = [
  { id: 'cat', name: 'Cat', img: PET_IMAGES.cat, emoji: '🐱', cost: 0 },
  { id: 'doggy', name: 'Doggy', img: PET_IMAGES.doggy, emoji: '🐶', cost: 100 },
  { id: 'birdie', name: 'Birdie', img: PET_IMAGES.birdie, emoji: '🐦', cost: 150 },
  { id: 'crab', name: 'Crab', img: PET_IMAGES.crab, emoji: '🦀', cost: 200 },
  { id: 'axolotl', name: 'Axolotl', img: PET_IMAGES.axolotl, emoji: '🌸', cost: 300 },
  { id: 'puffball', name: 'Puffball', img: null, emoji: '☁️', cost: 450 },
];
function speciesById(id) { return PET_SPECIES.find(s => s.id === id) || PET_SPECIES[0]; }

const BuildInfo = { versionName: '1.1', buildNumber: '2 (Web)' };

// ---------------------------------------------------------------
// Color themes — ported 1:1 from AppColorTheme.swift / Theme.swift
// ---------------------------------------------------------------
const THEMES = {
  default: { name: 'Default', bgL:'#FAF0DE', bgD:'#1F1A14', cardL:'#FFFAF0', cardD:'#2E2621', priL:'#ED9E6B', priD:'#E09466', secL:'#8CBA8C', secD:'#759E78' },
  blue:    { name: 'Blue',    bgL:'#DEEBFA', bgD:'#121A2B', cardL:'#F0F7FF', cardD:'#1F293D', priL:'#73A1EB', priD:'#6B94D9', secL:'#94C2D9', secD:'#6B94AD' },
  green:   { name: 'Green',   bgL:'#E0F5E3', bgD:'#122417', cardL:'#F2FCF2', cardD:'#213324', priL:'#78BF8F', priD:'#66A87A', secL:'#ADD18F', secD:'#85A875' },
  yellow:  { name: 'Yellow',  bgL:'#FCF5D4', bgD:'#29210D', cardL:'#FFFCE6', cardD:'#383017', priL:'#EDCC6B', priD:'#D9B861', secL:'#DBB278', secD:'#B29461' },
  pink:    { name: 'Pink',    bgL:'#FCE6ED', bgD:'#2B171F', cardL:'#FFF2F5', cardD:'#38242B', priL:'#ED8FAB', priD:'#D9829E', secL:'#DBABC4', secD:'#AD8299' },
  red:     { name: 'Red',     bgL:'#FCE6E0', bgD:'#2E1412', cardL:'#FFF2F0', cardD:'#3B211F', priL:'#E68275', priD:'#D1756E', secL:'#E0A88F', secD:'#B28273' },
};
const CONST_COLORS = {
  coin:'#F0C759', heart:'#DE7882', bathroom:'#9E7852',
  textL:'#594538', textD:'#F2EBE0', text2L:'#8C786B', text2D:'#B8ADA3',
  dangerL:'#D16B6B', dangerD:'#DB7A7A',
};

function resolvedMode() {
  const pref = localStorage.getItem(StorageKeys.appearance) || 'system';
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  const themeKey = localStorage.getItem(StorageKeys.colorTheme) || 'default';
  const t = THEMES[themeKey] || THEMES.default;
  const dark = resolvedMode() === 'dark';
  const root = document.documentElement.style;
  root.setProperty('--bg', dark ? t.bgD : t.bgL);
  root.setProperty('--card', dark ? t.cardD : t.cardL);
  root.setProperty('--primary', dark ? t.priD : t.priL);
  root.setProperty('--secondary', dark ? t.secD : t.secL);
  root.setProperty('--coin', CONST_COLORS.coin);
  root.setProperty('--heart', CONST_COLORS.heart);
  root.setProperty('--bathroom', CONST_COLORS.bathroom);
  root.setProperty('--text', dark ? CONST_COLORS.textD : CONST_COLORS.textL);
  root.setProperty('--text2', dark ? CONST_COLORS.text2D : CONST_COLORS.text2L);
  root.setProperty('--danger', dark ? CONST_COLORS.dangerD : CONST_COLORS.dangerL);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

// ---------------------------------------------------------------
// Pet state
// ---------------------------------------------------------------
const starterPet = () => ({
  name: 'Pixel', level: 1, hunger: 80, happiness: 80, bathroom: 0,
  coins: 20, totalCoinsEarned: 0, totalMinutesStudied: 0,
  sessionsCompleted: 0, studyStreak: 0,
  species: 'cat', ownedSpecies: ['cat'],
});

let pet = loadPet();
function loadPet() {
  try {
    const raw = localStorage.getItem(StorageKeys.petData);
    if (!raw) return starterPet();
    const parsed = JSON.parse(raw);
    const merged = { ...starterPet(), ...parsed };
    // Pets saved before the Pet Shop existed won't have `species`/
    // `ownedSpecies` — default to Cat, and always count whatever
    // species the pet already is as owned (mirrors Pet.swift's init).
    if (!merged.species) merged.species = 'cat';
    const owned = new Set(Array.isArray(merged.ownedSpecies) ? merged.ownedSpecies : []);
    owned.add(merged.species);
    merged.ownedSpecies = Array.from(owned);
    return merged;
  } catch { return starterPet(); }
}
function savePet() { localStorage.setItem(StorageKeys.petData, JSON.stringify(pet)); }

// ---------------------------------------------------------------
// Pet Shop actions — ported from PetViewModel.swift
// ---------------------------------------------------------------
function isSpeciesOwned(id) { return pet.ownedSpecies.includes(id); }

function purchaseSpecies(id) {
  if (isSpeciesOwned(id)) return false;
  const species = speciesById(id);
  if (!spendCoins(species.cost)) return false;
  pet.ownedSpecies.push(id);
  savePet();
  return true;
}

function selectActiveSpecies(id) {
  if (!isSpeciesOwned(id)) return;
  pet.species = id;
  savePet();
  if (currentTab === 'home') renderHome();
}

function petMood() {
  if (pet.hunger < 25) return 'hungry';
  if (pet.happiness < 25) return 'sad';
  if (pet.happiness > 75 && pet.hunger > 60) return 'happy';
  return 'idle';
}
const MOOD_BADGE = { idle: null, happy: 'sparkles', hungry: 'drumstick', sad: 'droplet', eating: 'smile' };
let isEatingUI = false;

// Real artwork per species (embedded above as data URIs) with a small
// mood badge in the corner — ported from PixelPetView.swift's PixelPetPlaceholder.
function petFaceHTML() {
  const species = speciesById(pet.species);
  const mood = isEatingUI ? 'eating' : petMood();
  const badge = MOOD_BADGE[mood];
  const art = species.img
    ? `<img src="${species.img}" alt="${species.name}" class="pet-img" />`
    : `<span class="pet-emoji-art">${species.emoji}</span>`;
  return `${art}${badge ? `<span class="pet-mood-badge">${ic(badge)}</span>` : ''}`;
}

let feedbackTimer = null;
function showFeedback(msg) {
  const el = document.getElementById('feedback-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => el.classList.add('hidden'), 2000);
}

function feedPet() {
  if (pet.coins < GameConstants.feedCost) { showFeedback('Not enough coins.'); return; }
  pet.coins -= GameConstants.feedCost;
  pet.hunger = Math.min(100, pet.hunger + GameConstants.feedHungerReduction);
  pet.happiness = Math.min(100, pet.happiness + GameConstants.feedHappinessIncrease);
  savePet();
  isEatingUI = true;
  renderHome();
  document.getElementById('pet-face-wrap')?.classList.add('eating');
  setTimeout(() => {
    isEatingUI = false;
    renderHome();
  }, 600);
}

function useBathroom() { pet.bathroom = 0; savePet(); renderHome(); }

function renamePet() {
  const next = prompt('Give your pet a new name.', pet.name);
  if (next && next.trim()) { pet.name = next.trim(); savePet(); renderHome(); }
}

function spendCoins(amount) {
  if (pet.coins < amount) { showFeedback('Not enough coins.'); return false; }
  pet.coins -= amount;
  savePet();
  return true;
}

function applyStudyReward(minutesStudied, coinsEarned, method = 'standard') {
  pet.coins += coinsEarned;
  pet.totalCoinsEarned += coinsEarned;
  pet.totalMinutesStudied += minutesStudied;
  pet.sessionsCompleted += 1;
  pet.level = GameConstants.level(pet.totalCoinsEarned);
  // Happiness boost now scales with effort — longer sessions and the
  // more demanding Pomodoro method earn more than a flat bump.
  const boost = GameConstants.studyHappinessBoost(minutesStudied, method);
  pet.happiness = Math.min(100, pet.happiness + boost);
  savePet();
}

// Automatic mood decay — hunger and happiness drift down on their own
// over time, so mood becomes something the player actively maintains.
// Feeding, mini-games, and studying all push back against this drift.
let moodDecayInterval = null;
function startMoodDecayLoop() {
  clearInterval(moodDecayInterval);
  moodDecayInterval = setInterval(() => {
    pet.hunger = Math.max(0, pet.hunger - GameConstants.hungerDecayPerTick);
    pet.happiness = Math.max(0, pet.happiness - GameConstants.happinessDecayPerTick);
    savePet();
    if (currentTab === 'home') renderHome();
  }, GameConstants.moodDecayTickSeconds * 1000);
}

// Happiness boost for a completed mini-game round — participation pays
// off regardless of outcome, with a bonus for winning.
function applyGamePlayReward(won) {
  let boost = GameConstants.gameParticipationHappiness;
  if (won) boost += GameConstants.gameWinHappinessBonus;
  pet.happiness = Math.min(100, pet.happiness + boost);
  savePet();
}

// Bathroom fills over 15 real minutes, ticking every 10s — paused while studying.
let bathroomInterval = null;
let isStudyingNow = false;
function startBathroomLoop() {
  clearInterval(bathroomInterval);
  const tickSeconds = 10, fullCycleSeconds = 15 * 60;
  const inc = 100 * (tickSeconds / fullCycleSeconds);
  bathroomInterval = setInterval(() => {
    if (isStudyingNow) return;
    if (pet.bathroom >= 100) return;
    pet.bathroom = Math.min(100, pet.bathroom + Math.round(inc));
    savePet();
    if (currentTab === 'home') renderHome();
  }, tickSeconds * 1000);
}

// ---------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------
let currentTab = 'home';
const TABS = [
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'study', label: 'Study', icon: 'book-open' },
  { id: 'games', label: 'Games', icon: 'gamepad-2' },
  { id: 'quizzim', label: 'Quizzim', icon: 'brain' },
  { id: 'progress', label: 'Progress', icon: 'bar-chart-3' },
];

function renderTabbar() {
  const bar = document.getElementById('tabbar');
  bar.innerHTML = TABS.map(t => `
    <button class="tab-btn ${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}">
      <span class="tab-icon">${ic(t.icon)}</span>${t.label}
    </button>`).join('');
  bar.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  currentTab = tab;
  renderTabbar();
  renderScreen();
}

function renderScreen() {
  const screen = document.getElementById('screen');
  if (currentTab === 'home') { screen.innerHTML = homeTemplate(); afterRenderHome(); }
  else if (currentTab === 'study') { screen.innerHTML = studySetupTemplate(); afterRenderStudySetup(); }
  else if (currentTab === 'games') { screen.innerHTML = gamesTemplate(); afterRenderGames(); }
  else if (currentTab === 'quizzim') { screen.innerHTML = quizzimTemplate(); afterRenderQuizzim(); }
  else if (currentTab === 'progress') { screen.innerHTML = progressTemplate(); }
}

// ---------------------------------------------------------------
// HOME
// ---------------------------------------------------------------
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning!';
  if (h < 17) return 'Good afternoon!';
  return 'Good evening!';
}

function statBarHTML(iconName, label, value, colorVar) {
  return `
    <div class="stat-row">
      <span class="icon">${ic(iconName)}</span>
      ${label ? `<span class="label">${label}</span>` : '<span class="label"></span>'}
      <div class="stat-track"><div class="stat-fill" style="width:${value}%;background:${colorVar}"></div></div>
      <span class="stat-val">${value}</span>
    </div>`;
}

function homeTemplate() {
  return `
    <div class="top-row">
      <div>
        <p class="greeting">${greeting()}</p>
        <p class="streak">${ic('flame', 'ic-inline')} ${pet.studyStreak} day streak</p>
      </div>
      <div class="top-right">
        <div class="top-right-icons">
          <button class="icon-btn" id="shop-btn">${ic('shopping-bag')}</button>
          <button class="icon-btn" id="settings-btn">${ic('settings')}</button>
        </div>
        <span class="chip">${ic('coins', 'ic-inline')} ${pet.coins}</span>
      </div>
    </div>

    <div class="card pet-card">
      <div class="pet-face-wrap" id="pet-face-wrap">${petFaceHTML()}</div>
      <button class="pet-name-btn" id="rename-btn">${escapeHtml(pet.name)} ${ic('pencil', 'ic-inline ic-sm')}</button>
      <div class="pet-level">${ic('star', 'ic-inline')} Level ${pet.level} · ${speciesById(pet.species).name}</div>
    </div>

    <div class="card">
      ${statBarHTML('drumstick', 'Hunger', pet.hunger, 'var(--primary)')}
      ${statBarHTML('heart', 'Happiness', pet.happiness, 'var(--heart)')}
      ${statBarHTML('sparkles', 'Bathroom', pet.bathroom, 'var(--bathroom)')}
    </div>

    <div id="feedback-msg" class="feedback-msg hidden"></div>

    <button class="btn-primary" id="feed-btn">${ic('apple', 'ic-inline')} Feed Pet</button>
    <button class="btn-primary" id="bathroom-btn">${ic('bath', 'ic-inline')} Bathroom</button>
  `;
}

function afterRenderHome() {
  document.getElementById('shop-btn').addEventListener('click', openPetShop);
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('rename-btn').addEventListener('click', renamePet);
  document.getElementById('feed-btn').addEventListener('click', feedPet);
  document.getElementById('bathroom-btn').addEventListener('click', useBathroom);
}
function renderHome() { if (currentTab === 'home') { document.getElementById('screen').innerHTML = homeTemplate(); afterRenderHome(); } }

function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Icon helper — renders a Lucide icon placeholder that gets hydrated
// into real inline SVG by the MutationObserver below, wherever it
// ends up on the page (screen content, modals, tab bar, all of it).
function ic(name, cls = '') { return `<i data-lucide="${name}" class="ic ${cls}"></i>`; }
(function hydrateIconsForever() {
  let scheduled = false;
  const run = () => {
    scheduled = false;
    try { window.lucide?.createIcons(); } catch { /* best-effort */ }
  };
  // Batch with requestAnimationFrame instead of running synchronously on
  // every single mutation — avoids hammering the main thread when a
  // render swaps in a big chunk of HTML at once.
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(run); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule);
  else schedule();
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
})();


// Small reusable chip-row picker (used for flashcard/quiz counts, AI
// language, etc.) — renders buttons, and wireChipRow keeps exactly one
// active without needing a full screen re-render.
function chipRowHTML(id, items, selected) {
  return `<div class="chip-row" id="${id}">${items.map(it => `<button type="button" data-value="${it.value}" class="${String(it.value)===String(selected)?'active':''}">${it.label}</button>`).join('')}</div>`;
}
function wireChipRow(id, onSelect) {
  const row = document.getElementById(id);
  if (!row) return;
  row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    row.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    onSelect(b.dataset.value);
  }));
}

// ---------------------------------------------------------------
// STUDY
// ---------------------------------------------------------------
const study = {
  method: 'standard', // 'standard' | 'pomodoro'
  selectedDuration: 25,
  useCustom: false,
  customMinutes: 25,
  pomodoroWork: GameConstants.defaultPomodoroWorkMinutes,
  pomodoroBreak: GameConstants.defaultPomodoroBreakMinutes,
  pomodoroLongBreak: GameConstants.defaultPomodoroLongBreakMinutes,
  pomodoroCycles: GameConstants.defaultPomodoroTotalCycles,
};

function studySetupTemplate() {
  return `
    <div style="text-align:center;margin-bottom:18px;">
      <h2 style="margin:0 0 4px;font-size:22px;">${ic('book-open','ic-inline')} Study Session</h2>
      <p style="margin:0;color:var(--text2);font-size:13px;">Every minute studied earns a coin.</p>
    </div>

    <div class="segmented" id="method-seg">
      <button data-m="standard" class="${study.method==='standard'?'active':''}">Standard</button>
      <button data-m="pomodoro" class="${study.method==='pomodoro'?'active':''}">Pomodoro</button>
    </div>

    <div id="method-config"></div>

    <button class="btn-primary" id="start-session-btn">▶️ Start Session</button>
  `;
}

function methodConfigTemplate() {
  if (study.method === 'standard') {
    return `
      <div class="card">
        <h3 style="margin:0 0 12px;font-size:15px;">Choose a duration</h3>
        <div class="chip-grid" id="duration-grid">
          ${GameConstants.sessionDurationPresets.map(m => `
            <button class="duration-chip ${!study.useCustom && study.selectedDuration===m?'selected':''}" data-min="${m}">${m}m</button>
          `).join('')}
        </div>
        <div class="toggle-row">
          <span>Custom duration</span>
          <label class="switch"><input type="checkbox" id="custom-toggle" ${study.useCustom?'checked':''}><span class="slider-pill"></span></label>
        </div>
        ${study.useCustom ? `
          <div class="stepper-row">
            <span>${study.customMinutes} minutes</span>
            <div class="stepper-controls">
              <button data-step="custom" data-dir="-1">−</button>
              <button data-step="custom" data-dir="1">+</button>
            </div>
          </div>` : ''}
      </div>`;
  }
  return `
    <div class="card">
      <h3 style="margin:0 0 8px;font-size:15px;">Pomodoro settings</h3>
      <p style="font-size:12px;color:var(--text2);margin:0 0 8px;">Alternates focused work with short breaks, and a longer break every ${GameConstants.defaultPomodoroCyclesBeforeLongBreak} cycles. Only work time earns coins.</p>
      ${stepperRow('Focus', study.pomodoroWork, 'work', 'min')}
      ${stepperRow('Short break', study.pomodoroBreak, 'break', 'min')}
      ${stepperRow('Long break', study.pomodoroLongBreak, 'longbreak', 'min')}
      ${stepperRow('Cycles', study.pomodoroCycles, 'cycles', '')}
    </div>`;
}
function stepperRow(label, value, key, unit) {
  return `<div class="stepper-row"><span>${label}: ${value}${unit? ' '+unit:''}</span>
    <div class="stepper-controls">
      <button data-step="${key}" data-dir="-1">−</button>
      <button data-step="${key}" data-dir="1">+</button>
    </div></div>`;
}

function afterRenderStudySetup() {
  document.getElementById('method-config').innerHTML = methodConfigTemplate();
  wireStudySetupEvents();
  document.getElementById('start-session-btn').addEventListener('click', startSession);
}

function wireStudySetupEvents() {
  document.querySelectorAll('#method-seg button').forEach(b => b.addEventListener('click', () => {
    study.method = b.dataset.m;
    afterRenderStudySetup();
  }));
  const grid = document.getElementById('duration-grid');
  if (grid) grid.querySelectorAll('.duration-chip').forEach(b => b.addEventListener('click', () => {
    study.useCustom = false;
    study.selectedDuration = parseInt(b.dataset.min, 10);
    afterRenderStudySetup();
  }));
  const customToggle = document.getElementById('custom-toggle');
  if (customToggle) customToggle.addEventListener('change', () => {
    study.useCustom = customToggle.checked;
    if (study.useCustom) study.selectedDuration = study.customMinutes;
    afterRenderStudySetup();
  });
  document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const dir = parseInt(b.dataset.dir, 10);
    const key = b.dataset.step;
    if (key === 'custom') { study.customMinutes = clamp(study.customMinutes + dir*5, 5, 240); study.selectedDuration = study.customMinutes; }
    if (key === 'work') study.pomodoroWork = clamp(study.pomodoroWork + dir*5, 5, 60);
    if (key === 'break') study.pomodoroBreak = clamp(study.pomodoroBreak + dir*1, 1, 30);
    if (key === 'longbreak') study.pomodoroLongBreak = clamp(study.pomodoroLongBreak + dir*5, 5, 45);
    if (key === 'cycles') study.pomodoroCycles = clamp(study.pomodoroCycles + dir*1, 1, 12);
    afterRenderStudySetup();
  }));
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- Timer session state ----
let session = null; // { durationMinutes, remainingSeconds, state }
let timerInterval = null;
let currentPhase = 'work';
let currentCycle = 1;
let accumulatedWorkMinutes = 0;

function newSession(durationMinutes) {
  return { durationMinutes, remainingSeconds: durationMinutes * 60, state: 'running' };
}

function startSession() {
  if (study.method === 'standard') {
    session = newSession(study.selectedDuration);
  } else {
    currentCycle = 1; currentPhase = 'work'; accumulatedWorkMinutes = 0;
    session = newSession(study.pomodoroWork);
  }
  isStudyingNow = true;
  showTimerOverlay();
  startTicking();
}

function startTicking() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!session || session.state !== 'running') return;
    if (session.remainingSeconds > 0) {
      session.remainingSeconds -= 1;
      updateTimerUI();
    } else {
      session.state = 'completed';
      handlePhaseFinished();
    }
  }, 1000);
}

function handlePhaseFinished() {
  if (study.method === 'standard') {
    clearInterval(timerInterval);
    showCompletionScreen();
    return;
  }
  if (currentPhase === 'work') {
    accumulatedWorkMinutes += study.pomodoroWork;
    if (currentCycle >= study.pomodoroCycles) {
      clearInterval(timerInterval);
      showCompletionScreen();
      return;
    }
    const isLongBreak = currentCycle % GameConstants.defaultPomodoroCyclesBeforeLongBreak === 0;
    currentPhase = isLongBreak ? 'longBreak' : 'shortBreak';
    session = newSession(isLongBreak ? study.pomodoroLongBreak : study.pomodoroBreak);
  } else {
    currentCycle += 1;
    currentPhase = 'work';
    session = newSession(study.pomodoroWork);
  }
  updateTimerUI();
}

function minutesStudiedNow() {
  return study.method === 'standard' ? (session ? session.durationMinutes : 0) : accumulatedWorkMinutes;
}

const PHASE_LABEL = { work: 'Focus', shortBreak: 'Short Break', longBreak: 'Long Break' };

function showTimerOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'timer-overlay';
  overlay.id = 'timer-overlay';
  overlay.innerHTML = `
    ${study.method === 'pomodoro' ? `<div class="timer-phase">${PHASE_LABEL[currentPhase]}</div>` : ''}
    <div class="ring-wrap">
      <canvas id="ring-canvas" width="240" height="240"></canvas>
      <div class="ring-time" id="ring-time"></div>
    </div>
    ${study.method === 'pomodoro' ? `<div class="timer-cycle">Cycle ${currentCycle} of ${study.pomodoroCycles}</div>` : '<div class="timer-cycle">&nbsp;</div>'}
    <div class="timer-controls">
      <button class="btn-secondary" id="timer-pause">⏸ Pause</button>
      <button class="btn-secondary btn-danger" id="timer-cancel">✕ Cancel</button>
    </div>
  `;
  document.getElementById('app').appendChild(overlay);
  document.getElementById('timer-pause').addEventListener('click', togglePause);
  document.getElementById('timer-cancel').addEventListener('click', cancelSession);
  updateTimerUI();
}

function updateTimerUI() {
  const overlay = document.getElementById('timer-overlay');
  if (!overlay || !session) return;
  const phaseEl = overlay.querySelector('.timer-phase');
  if (phaseEl) phaseEl.textContent = PHASE_LABEL[currentPhase];
  const cycleEl = overlay.querySelector('.timer-cycle');
  if (cycleEl && study.method === 'pomodoro') cycleEl.textContent = `Cycle ${currentCycle} of ${study.pomodoroCycles}`;
  const mm = String(Math.floor(session.remainingSeconds / 60)).padStart(2, '0');
  const ss = String(session.remainingSeconds % 60).padStart(2, '0');
  document.getElementById('ring-time').textContent = `${mm}:${ss}`;
  const progress = 1 - session.remainingSeconds / (session.durationMinutes * 60);
  drawRing(document.getElementById('ring-canvas'), progress);
  document.getElementById('timer-pause').textContent = session.state === 'paused' ? '▶️ Resume' : '⏸ Pause';
}

function drawRing(canvas, progress) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width, r = size/2 - 10, cx = size/2, cy = size/2;
  ctx.clearRect(0,0,size,size);
  ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--card').trim() || '#eee';
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#e08';
  ctx.beginPath(); ctx.arc(cx,cy,r,-Math.PI/2, -Math.PI/2 + progress*Math.PI*2); ctx.stroke();
}

function togglePause() {
  if (!session) return;
  session.state = session.state === 'running' ? 'paused' : 'running';
  updateTimerUI();
}

function cancelSession() {
  const focusOn = localStorage.getItem(StorageKeys.focusModeEnabled) === 'true';
  if (focusOn && !confirm('Focus Mode is on. Leaving now will end this session early — are you sure?')) return;
  clearInterval(timerInterval);
  session = null;
  isStudyingNow = false;
  document.getElementById('timer-overlay')?.remove();
}

function showCompletionScreen() {
  isStudyingNow = false;
  const overlay = document.getElementById('timer-overlay');
  const minutes = minutesStudiedNow();
  const coins = GameConstants.coinsEarned(minutes);
  overlay.innerHTML = `
    <div class="complete-wrap">
      <div class="complete-emoji">${ic('party-popper')}</div>
      <h2 style="margin:0 0 4px;">Session Complete!</h2>
      <p style="color:var(--text2);font-size:13px;margin:0;">You studied for ${minutes} minutes.</p>
      <div class="reward-pill">${ic('coins','ic-inline')} +${coins} coins</div>
    </div>
    <button class="btn-primary" id="collect-btn" style="width:100%;">Collect</button>
  `;
  document.getElementById('collect-btn').addEventListener('click', () => {
    applyStudyReward(minutes, coins, study.method);
    session = null; currentCycle = 1; currentPhase = 'work'; accumulatedWorkMinutes = 0;
    document.getElementById('timer-overlay')?.remove();
    if (currentTab === 'home') renderHome();
  });
}

// ---------------------------------------------------------------
// GAMES
// ---------------------------------------------------------------
function gamesTemplate() {
  return `
    <div class="top-row">
      <div>
        <h2 style="margin:0 0 2px;font-size:20px;">Arcade</h2>
        <p style="margin:0;font-size:12px;color:var(--text2);">${GameConstants.gameCost} ${ic('coins','ic-inline')} per round</p>
      </div>
      <span class="chip">${ic('coins','ic-inline')} ${pet.coins}</span>
    </div>
    <div class="card game-card" id="play-pingpong">
      <div class="game-emoji">${ic('circle-dot')}</div>
      <div class="game-info">
        <div class="game-title">Ping Pong</div>
        <div class="game-desc">Keep the rally alive — don't let the ball drop.</div>
      </div>
      <span class="chip">${ic('coins','ic-inline')} ${GameConstants.gameCost}</span>
    </div>
    <div class="card game-card" id="play-tictactoe">
      <div class="game-emoji">${ic('grid-3x3')}</div>
      <div class="game-info">
        <div class="game-title">Tic Tac Toe</div>
        <div class="game-desc">Best your pet's pixel brain in a classic showdown.</div>
      </div>
      <span class="chip">${ic('coins','ic-inline')} ${GameConstants.gameCost}</span>
    </div>
    <div id="feedback-msg" class="feedback-msg hidden"></div>
  `;
}
function afterRenderGames() {
  document.getElementById('play-pingpong').addEventListener('click', () => { if (spendCoins(GameConstants.gameCost)) openPingPong(); else afterRenderGames(); });
  document.getElementById('play-tictactoe').addEventListener('click', () => { if (spendCoins(GameConstants.gameCost)) openTicTacToe(); else afterRenderGames(); });
}

// ---- Ping Pong ----
function openPingPong() {
  renderScreen(); // refresh coin chip behind
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay';
  overlay.id = 'game-overlay';
  const wins = parseInt(localStorage.getItem(StorageKeys.pingPongWins) || '0', 10);
  overlay.innerHTML = `
    <div class="game-header">
      <button class="icon-btn" id="pp-close">✕</button>
      <span class="score" id="pp-score">You 0 – 0 Pet</span>
      <span style="font-size:12px;color:var(--text2);">${ic('trophy','ic-inline')} ${wins}</span>
    </div>
    <canvas id="pong-canvas"></canvas>
    <p style="text-align:center;font-size:12px;color:var(--text2);margin-top:10px;">Drag, or use ←/→ / A/D, to move your paddle.</p>
    <button class="btn-secondary hidden" id="pp-again">Play Again (${GameConstants.gameCost} coins)</button>
  `;
  document.getElementById('app').appendChild(overlay);
  document.getElementById('pp-close').addEventListener('click', closePingPong);
  runPingPong();
  document.getElementById('pp-again').addEventListener('click', () => {
    if (spendCoins(GameConstants.gameCost)) {
      document.getElementById('pp-again').classList.add('hidden');
      runPingPong();
    }
  });
}
function closePingPong() {
  pongState.running = false;
  cancelAnimationFrame(pongState.raf);
  document.removeEventListener('keydown', pongKeyDown);
  document.removeEventListener('keyup', pongKeyUp);
  document.getElementById('game-overlay')?.remove();
  renderScreen();
}
const pongState = { running:false, raf:null, keys:{} };
function pongKeyDown(e){ pongState.keys[e.key.toLowerCase()] = true; }
function pongKeyUp(e){ pongState.keys[e.key.toLowerCase()] = false; }

function runPingPong() {
  const canvas = document.getElementById('pong-canvas');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  canvas.width = cssW * dpr; canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const W = cssW, H = cssH;
  const paddleW = 70, paddleH = 12, ballR = 8;
  let playerX = W/2 - paddleW/2, petX = W/2 - paddleW/2;
  let ball = { x: W/2, y: H/2, vx: 2.2, vy: 3.2 };
  let playerScore = 0, petScore = 0, suddenDeath = false, winner = null;
  const pointsToEnd = 10;
  let petAimError = 0;

  document.addEventListener('keydown', pongKeyDown);
  document.addEventListener('keyup', pongKeyUp);

  let dragging = false;
  function pointerX(e) { const rect = canvas.getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX); return cx - rect.left; }
  canvas.onpointerdown = (e) => { dragging = true; playerX = clamp(pointerX(e) - paddleW/2, 0, W-paddleW); };
  canvas.onpointermove = (e) => { if (dragging) playerX = clamp(pointerX(e) - paddleW/2, 0, W-paddleW); };
  window.addEventListener('pointerup', () => dragging = false);

  function resetBall(dir) {
    ball.x = W/2; ball.y = H/2;
    ball.vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random()*1.5);
    ball.vy = dir * (3 + Math.random());
    petAimError = (Math.random() - 0.5) * 60;
  }
  resetBall(1);

  function updateScoreLabel() {
    document.getElementById('pp-score').textContent = `You ${playerScore} – ${petScore} Pet`;
  }

  pongState.running = true;
  function loop() {
    if (!pongState.running) return;
    if (!winner) {
      // player keyboard
      if (pongState.keys['arrowleft'] || pongState.keys['a']) playerX -= 6;
      if (pongState.keys['arrowright'] || pongState.keys['d']) playerX += 6;
      playerX = clamp(playerX, 0, W - paddleW);

      // pet AI follows the ball with capped speed + aim error
      const target = clamp(ball.x - paddleW/2 + petAimError * 0.15, 0, W - paddleW);
      const petSpeed = 4.0;
      if (petX < target) petX = Math.min(target, petX + petSpeed);
      else if (petX > target) petX = Math.max(target, petX - petSpeed);

      ball.x += ball.vx; ball.y += ball.vy;
      if (ball.x < ballR || ball.x > W - ballR) { ball.vx *= -1; ball.x = clamp(ball.x, ballR, W-ballR); }

      // player paddle collision (bottom)
      if (ball.y > H - 40 - ballR && ball.y < H - 40 + ballR && ball.x > playerX && ball.x < playerX + paddleW && ball.vy > 0) {
        ball.vy *= -1; ball.vx += (ball.x - (playerX+paddleW/2)) * 0.05;
      }
      // pet paddle collision (top)
      if (ball.y < 40 + ballR && ball.y > 40 - ballR && ball.x > petX && ball.x < petX + paddleW && ball.vy < 0) {
        ball.vy *= -1; ball.vx += (ball.x - (petX+paddleW/2)) * 0.05;
        petAimError = (Math.random() - 0.5) * 60;
      }

      // scoring
      if (ball.y > H + ballR) { playerScore += 1; resetBall(-1); checkWin(); updateScoreLabel(); }
      else if (ball.y < -ballR) { petScore += 1; resetBall(1); checkWin(); updateScoreLabel(); }
    }

    ctx.clearRect(0,0,W,H);
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    const secondary = getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim();
    const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    // net
    ctx.strokeStyle = 'rgba(150,150,150,.3)'; ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke(); ctx.setLineDash([]);
    // paddles
    ctx.fillStyle = primary; roundRect(ctx, playerX, H-40, paddleW, paddleH, 6); ctx.fill();
    ctx.fillStyle = secondary; roundRect(ctx, petX, 40-paddleH, paddleW, paddleH, 6); ctx.fill();
    // ball
    ctx.fillStyle = text; ctx.beginPath(); ctx.arc(ball.x, ball.y, ballR, 0, Math.PI*2); ctx.fill();

    if (winner) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(winner === 'player' ? 'You win!' : 'Your pet wins!', W/2, H/2);
    }

    pongState.raf = requestAnimationFrame(loop);
  }

  function checkWin() {
    if (playerScore === 5 && petScore === 5) suddenDeath = true;
    if (suddenDeath && (playerScore > petScore || petScore > playerScore) && Math.abs(playerScore-petScore) >= 1 && (playerScore>5||petScore>5)) {
      winner = playerScore > petScore ? 'player' : 'pet';
    } else if (!suddenDeath && (playerScore >= pointsToEnd || petScore >= pointsToEnd) && playerScore !== petScore) {
      winner = playerScore > petScore ? 'player' : 'pet';
    }
    if (winner) {
      pongState.running = false;
      if (winner === 'player') {
        const wins = parseInt(localStorage.getItem(StorageKeys.pingPongWins) || '0', 10) + 1;
        localStorage.setItem(StorageKeys.pingPongWins, String(wins));
      }
      applyGamePlayReward(winner === 'player');
      document.getElementById('pp-again')?.classList.remove('hidden');
    }
  }

  loop();
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

// ---- Tic Tac Toe ----
function openTicTacToe() {
  renderScreen();
  const overlay = document.createElement('div');
  overlay.className = 'game-overlay';
  overlay.id = 'game-overlay';
  const wins = parseInt(localStorage.getItem(StorageKeys.tttWins) || '0', 10);
  overlay.innerHTML = `
    <div class="game-header">
      <button class="icon-btn" id="ttt-close">✕</button>
      <span class="score">Tic Tac Toe</span>
      <span style="font-size:12px;color:var(--text2);" id="ttt-wins">${ic('trophy','ic-inline')} ${wins}</span>
    </div>
    <p class="ttt-status" id="ttt-status">Your move (X)</p>
    <div class="ttt-board" id="ttt-board"></div>
    <button class="btn-secondary hidden" id="ttt-again">Play Again (${GameConstants.gameCost} coins)</button>
  `;
  document.getElementById('app').appendChild(overlay);
  document.getElementById('ttt-close').addEventListener('click', () => { document.getElementById('game-overlay')?.remove(); renderScreen(); });
  startTicTacToe();
  document.getElementById('ttt-again').addEventListener('click', () => {
    if (spendCoins(GameConstants.gameCost)) { document.getElementById('ttt-again').classList.add('hidden'); startTicTacToe(); }
  });
}
function startTicTacToe() {
  let board = Array(9).fill(null);
  let over = false;
  const boardEl = document.getElementById('ttt-board');
  const statusEl = document.getElementById('ttt-status');
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function winnerOf(b) {
    for (const l of lines) { const [a,c,d] = l; if (b[a] && b[a]===b[c] && b[a]===b[d]) return b[a]; }
    return b.every(Boolean) ? 'draw' : null;
  }
  function render() {
    boardEl.innerHTML = board.map((v,i) => `<button class="ttt-cell" data-i="${i}">${v||''}</button>`).join('');
    boardEl.querySelectorAll('.ttt-cell').forEach(c => c.addEventListener('click', () => onCell(parseInt(c.dataset.i,10))));
  }
  function onCell(i) {
    if (over || board[i]) return;
    board[i] = 'X';
    render();
    const w = winnerOf(board);
    if (w) return finish(w);
    setTimeout(petMove, 350);
  }
  function petMove() {
    if (over) return;
    const i = pickPetMove(board);
    if (i != null) board[i] = 'O';
    render();
    const w = winnerOf(board);
    if (w) finish(w);
    else statusEl.textContent = 'Your move (X)';
  }
  function pickPetMove(b) {
    const avail = b.map((v,i)=>v?null:i).filter(v=>v!==null);
    // try win
    for (const i of avail) { const t=[...b]; t[i]='O'; if (winnerOf(t)==='O') return i; }
    // block
    for (const i of avail) { const t=[...b]; t[i]='X'; if (winnerOf(t)==='X') return i; }
    if (b[4]==null) return 4;
    const corners = [0,2,6,8].filter(i=>avail.includes(i));
    if (corners.length) return corners[Math.floor(Math.random()*corners.length)];
    return avail[Math.floor(Math.random()*avail.length)];
  }
  function finish(w) {
    over = true;
    statusEl.textContent = w === 'draw' ? "It's a draw!" : (w === 'X' ? 'You win!' : 'Your pet wins!');
    if (w === 'X') {
      const wins = parseInt(localStorage.getItem(StorageKeys.tttWins) || '0', 10) + 1;
      localStorage.setItem(StorageKeys.tttWins, String(wins));
      const badge = document.getElementById('ttt-wins');
      if (badge) badge.innerHTML = `${ic('trophy','ic-inline')} ${wins}`;
    }
    applyGamePlayReward(w === 'X');
    document.getElementById('ttt-again').classList.remove('hidden');
  }
  render();
}

// ---------------------------------------------------------------
// OFFLINE AI — a real local language model running entirely in the
// browser via WebGPU (MLC-AI's WebLLM). Ported concept from
// QuizzimAIService.swift's on-device Foundation Models integration:
// same system prompt, same "one session stays alive for the chat"
// idea — just backed by a model downloaded once and cached by the
// browser (IndexedDB) instead of Apple Intelligence. No network calls
// after that first download; nothing here ever leaves the device.
// ---------------------------------------------------------------
const OFFLINE_MODEL_OPTIONS = {
  tiny:     { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Tiny',     size: '~0.5GB', desc: 'The mobile-safe default — fastest, lowest memory, weakest answers.' },
  light:    { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Light',    size: '~0.9GB', desc: 'A step up from Tiny. Fine on newer phones/tablets with good wifi; can still overload some devices.' },
  balanced: { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Balanced', size: '~1.9GB', desc: 'Noticeably smarter — best on a laptop/desktop with a discrete or Apple Silicon GPU.' },
};

// iOS Safari (and every other iOS browser — they're all WebKit under
// the hood) kills a tab outright when it uses too much memory, with no
// catchable error — the page just goes blank/reloads (that reload is
// what makes it look like the app "returns to Home": there's no crash
// handler to catch, the whole tab just restarts). Even Light (~0.9GB)
// has been reported overloading real hardware, likely worse on a spotty
// connection where a stalled/retried download inflates memory further
// — so Auto now defaults to Tiny on iOS/iPadOS. Settings > Quizzim
// still lets anyone override this manually.
function isAppleTouchDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS Safari reports as "Mac"
}
function offlineModelForDevice() {
  const choice = localStorage.getItem(StorageKeys.offlineModelChoice) || 'auto';
  if (choice !== 'auto' && OFFLINE_MODEL_OPTIONS[choice]) return OFFLINE_MODEL_OPTIONS[choice];
  return isAppleTouchDevice() ? OFFLINE_MODEL_OPTIONS.tiny : OFFLINE_MODEL_OPTIONS.balanced;
}
function setOfflineModelChoice(choice) {
  const prevId = offlineModelForDevice().id;
  localStorage.setItem(StorageKeys.offlineModelChoice, choice);
  // Switching models mid-session would otherwise keep chatting with the
  // old one until reload — unload it so the next chat/flashcard call
  // loads whichever model is now selected.
  if (offlineModelForDevice().id !== prevId && offlineEngine) {
    try { offlineEngine.unload?.(); } catch { /* best-effort */ }
    offlineEngine = null;
    offlineEngineState = 'idle';
  }
}

// A flaky connection during the first download can leave a corrupted
// or partial model cached (Cache Storage / IndexedDB) — every load
// after that fails or crashes the same way until the cache is wiped.
// This is the most likely fix for "sometimes it just breaks on load."
async function clearOfflineModelCache() {
  try { offlineEngine?.unload?.(); } catch { /* best-effort */ }
  offlineEngine = null;
  offlineEngineState = 'idle';
  offlineEngineError = '';
  try {
    if (window.caches?.keys) {
      const names = await caches.keys();
      await Promise.all(names.filter(n => /webllm|mlc|tvm/i.test(n)).map(n => caches.delete(n)));
    }
  } catch { /* best-effort */ }
  try {
    if (indexedDB?.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.filter(d => /webllm|mlc|tvm/i.test(d.name || '')).map(d => new Promise((res) => {
        const req = indexedDB.deleteDatabase(d.name);
        req.onsuccess = req.onerror = req.onblocked = () => res();
      })));
    }
  } catch { /* best-effort */ }
}

// Same persona/instructions as the Swift app's on-device Quizzim.
const QUIZZIM_INSTRUCTIONS = `You are Quizzim, the friendly on-device study buddy inside the StudyPet app. StudyPet is a Tamagotchi-style app where users earn coins by studying and use them to care for a pixel pet.


Your job:
- Quiz the user on whatever topic or notes they give you, one question at a time.
- Answer questions about their study material clearly and concisely.
- Help break down confusing topics into simple, step-by-step explanations.
- Offer quick memory tricks (mnemonics, analogies) when helpful.

Tone: warm, encouraging, upbeat — like a supportive study partner, never condescending. Keep replies short enough to read on a phone screen (a few sentences, or a short list) unless the user explicitly asks for more depth.

Stay strictly on studying and learning topics. If asked something unrelated to studying, gently steer the conversation back to the user's study goals.`;

// ---------------------------------------------------------------
// AI LANGUAGE — applies to chat, flashcards, and quizzes alike.
// Note: none of the bundled offline models (Llama 3.2 1B/3B, Qwen2.5
// 0.5B) officially list Afrikaans among their supported languages —
// their training data just isn't evaluated for it the way English (or
// even German/French/Spanish) is. It's closely related to Dutch/
// English so it often still comes out usable, but expect more mistakes
// than English. ChatGPT/Claude chat (opened as their own sites) aren't
// affected by this setting since they're not prompted by this app.
// ---------------------------------------------------------------
const AI_LANGUAGES = {
  en: { label: 'English', instruction: '' },
  af: { label: 'Afrikaans', instruction: '\n\nRespond entirely in Afrikaans, including all questions, answers, and choices.' },
};
function currentAiLanguage() { return AI_LANGUAGES[localStorage.getItem(StorageKeys.aiLanguage)] ? localStorage.getItem(StorageKeys.aiLanguage) : 'en'; }
function languageInstruction() { return AI_LANGUAGES[currentAiLanguage()].instruction; }

let offlineEngine = null;
let offlineEngineState = 'idle'; // idle | loading | ready | error | unsupported
let offlineEngineError = '';
let offlineChatHistory = [];

function offlineIsSupported() { return !!navigator.gpu; }

function offlineUnavailableMessage() {
  if (!offlineIsSupported()) {
    return "Quizzim's offline AI needs a browser with WebGPU — recent Chrome/Edge/Brave/Firefox, or Safari on iOS 26+/macOS 26+. Use ChatGPT or Claude instead for now.";
  }
  if (offlineEngineState === 'error') {
    return offlineEngineError || "Couldn't load the offline model. Try again, or use ChatGPT/Claude instead.";
  }
  return '';
}

// Loads (or returns the already-loaded) local model. `onProgress` gets
// WebLLM's own {progress: 0..1, text} reports so callers can show a
// real download/load bar the first time this runs.
async function ensureOfflineEngine(onProgress) {
  if (offlineEngine && offlineEngineState === 'ready') return offlineEngine;
  if (!offlineIsSupported()) { offlineEngineState = 'unsupported'; throw new Error(offlineUnavailableMessage()); }
  offlineEngineState = 'loading';
  try {
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');
    const engine = await webllm.CreateMLCEngine(offlineModelForDevice().id, {
      initProgressCallback: (report) => { if (onProgress) onProgress(report); },
    });
    offlineEngine = engine;
    offlineEngineState = 'ready';
    return engine;
  } catch (err) {
    offlineEngineState = 'error';
    offlineEngineError = "Couldn't load the offline model — check your connection for the first-time download, or try ChatGPT/Claude instead.";
    throw err;
  }
}

function startNewOfflineSession() {
  offlineChatHistory = [{ role: 'system', content: QUIZZIM_INSTRUCTIONS + languageInstruction() }];
}

async function sendOfflineMessage(userText) {
  const engine = await ensureOfflineEngine();
  if (!offlineChatHistory.length) startNewOfflineSession();
  offlineChatHistory.push({ role: 'user', content: userText });
  const reply = await engine.chat.completions.create({ messages: offlineChatHistory, temperature: 0.7 });
  const content = reply.choices?.[0]?.message?.content?.trim() || "…";
  offlineChatHistory.push({ role: 'assistant', content });
  return content;
}

// Runs a scoped flashcard-generation prompt through the same local
// model (mirrors AIFlashcardService.swift's instructions + Q:/A:
// output format) instead of the plain heuristic in generateFlashcards().
const FLASHCARD_INSTRUCTIONS = `You are Quizzim's flashcard generator, part of the StudyPet app. Given a topic or a block of study notes, produce concise question-and-answer flashcards a student could use to quiz themselves.

Rules:
- Each flashcard tests one clear fact, definition, or concept.
- Questions are short and specific. Answers are short — a phrase or one sentence, never a paragraph.
- Do not number the cards or add any extra commentary, headers, or preamble.
- Output ONLY the flashcards, one per pair of lines, in exactly this format:
Q: <question>
A: <answer>
(blank line between cards)`;

function parseFlashcardsFromText(raw) {
  const cards = [];
  let pendingQuestion = null;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (/^Q:/i.test(line)) {
      pendingQuestion = line.slice(2).trim();
    } else if (/^A:/i.test(line) && pendingQuestion) {
      const answer = line.slice(2).trim();
      if (pendingQuestion && answer) cards.push({ question: pendingQuestion, answer });
      pendingQuestion = null;
    }
  }
  return cards;
}

// Small local models are unreliable at "make N of X" as a single ask —
// they'll often write one solid item and stop, no matter what N was.
// So instead of one big request, ask for a few at a time and keep
// asking (with a hard attempt cap) until we actually hit the count the
// person picked, skipping any near-duplicate the model repeats.
async function generateFlashcardsOffline(text, count, onProgress, onBatchProgress) {
  const engine = await ensureOfflineEngine(onProgress);
  const cards = [];
  const seen = new Set();
  const maxAttempts = count + 12; // generous — small models fail to parse some attempts entirely
  for (let attempts = 0; cards.length < count && attempts < maxAttempts; attempts++) {
    const avoidNote = cards.length ? `\n\nDon't repeat these: ${cards.map(c => c.question).join(' | ')}` : '';
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: FLASHCARD_INSTRUCTIONS + languageInstruction() },
        { role: 'user', content: `Make exactly 1 flashcard about: ${text}${avoidNote}` },
      ],
      temperature: 0.7,
      max_tokens: 220,
    });
    const content = reply.choices?.[0]?.message?.content || '';
    for (const c of parseFlashcardsFromText(content)) {
      const key = c.question.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(c);
      break; // one card per attempt is the point — ignore any extra the model volunteers
    }
    if (onBatchProgress) onBatchProgress(cards.length, count);
  }
  if (!cards.length) throw new Error("Couldn't parse flashcards from the offline model's reply — try again.");
  return cards.slice(0, count);
}

// ---------------------------------------------------------------
// QUIZZIM — three real chat sources (ChatGPT, Claude, and a fully
// offline local model), plus flashcards and curated quizzes.
// ---------------------------------------------------------------
function loadThreads() {
  try { return JSON.parse(localStorage.getItem(StorageKeys.quizzimThreads) || '[]'); } catch { return []; }
}
function saveThreads(t) { localStorage.setItem(StorageKeys.quizzimThreads, JSON.stringify(t)); }

let offlineMessages = []; // {text, isFromUser, isError?}
let offlineThinking = false;
let offlineCurrentThreadId = null;

function autoTitleFromMessages(messages) {
  const firstUser = messages.find(m => m.isFromUser);
  if (!firstUser) return 'New Chat';
  return firstUser.text.length > 40 ? firstUser.text.slice(0, 40) + '…' : firstUser.text;
}

function persistOfflineThreadIfNeeded() {
  if (!offlineMessages.length) return;
  const threads = loadThreads();
  const id = offlineCurrentThreadId || crypto.randomUUID();
  offlineCurrentThreadId = id;
  const existingIdx = threads.findIndex(t => t.id === id);
  const thread = { id, title: autoTitleFromMessages(offlineMessages), updatedAt: Date.now(), model: 'ondevice', messages: offlineMessages };
  if (existingIdx >= 0) threads[existingIdx] = thread; else threads.push(thread);
  saveThreads(threads);
}

function quizzimTemplate() {
  const threads = loadThreads().sort((a,b) => b.updatedAt - a.updatedAt);
  const model = localStorage.getItem(StorageKeys.quizzimModel) || 'chatgpt';
  const modelMeta = {
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com', icon: 'message-circle' },
    claude: { name: 'Claude', url: 'https://claude.ai/new', icon: 'sparkle' },
    ondevice: { name: 'Offline AI', icon: 'cpu' },
  };
  return `
    <h2 style="margin:0 0 4px;font-size:20px;">${ic('brain','ic-inline')} Quizzim</h2>
    <p style="margin:0 0 16px;color:var(--text2);font-size:13px;">Your study chat companion.</p>

    <div class="quiz-model-row" data-model="chatgpt" style="${model==='chatgpt'?'':'opacity:.7;'}cursor:pointer;">
      <span class="qi">${ic('message-circle')}</span>
      <div style="flex:1;">
        <div class="qt">ChatGPT</div>
        <div class="qs">Your own ChatGPT account — no API key, no per-message cost</div>
      </div>
      <span class="badge-locked">${model==='chatgpt' ? 'ACTIVE' : 'SELECT'}</span>
    </div>
    <div class="quiz-model-row" data-model="claude" style="${model==='claude'?'':'opacity:.7;'}cursor:pointer;">
      <span class="qi">${ic('sparkle')}</span>
      <div style="flex:1;">
        <div class="qt">Claude</div>
        <div class="qs">Your own Claude account — no API key, no per-message cost</div>
      </div>
      <span class="badge-locked">${model==='claude' ? 'ACTIVE' : 'SELECT'}</span>
    </div>
    <div class="quiz-model-row" data-model="ondevice" style="${model==='ondevice'?'':'opacity:.7;'}cursor:pointer;">
      <span class="qi">${ic('cpu')}</span>
      <div style="flex:1;">
        <div class="qt">Offline AI</div>
        <div class="qs">Runs a real local model right in your browser — private, no account, works with no internet after the first download</div>
      </div>
      <span class="badge-locked">${model==='ondevice' ? 'ACTIVE' : 'SELECT'}</span>
    </div>
    <div class="quiz-model-row quiz-disabled-row">
      <span class="qi">${ic('cloud')}</span>
      <div style="flex:1;">
        <div class="qt">Cloud</div>
        <div class="qs">Disabled — Apple Private Cloud Compute isn't available on the web</div>
      </div>
      <span class="badge-locked">DISABLED</span>
    </div>

    <div id="quiz-active-area"></div>

    <div class="quiz-feature-row">
      <button class="quiz-feature-card" id="open-flashcards-btn">
        <span class="qi">${ic('layers')}</span>
        <div class="qt">Flashcards</div>
        <div class="qs">Turn a topic, your notes, or a photo into a quick self-quiz deck</div>
      </button>
      <button class="quiz-feature-card" id="open-curated-btn">
        <span class="qi">${ic('list-checks')}</span>
        <div class="qt">AI Quizzes</div>
        <div class="qs">Type any topic — the offline AI writes a multiple-choice quiz for you</div>
      </button>
    </div>

    <h3 style="font-size:14px;margin:20px 0 6px;">Recent sessions</h3>
    <div class="card" id="threads-card" style="padding:6px 14px;">
      ${threads.length === 0 ? '<p style="font-size:12px;color:var(--text2);padding:10px 4px;">No sessions yet — start a chat to create one.</p>' :
        threads.map(t => `
          <div class="quiz-thread" data-id="${t.id}">
            <div>
              <div class="qtt">${modelMeta[t.model||'chatgpt'].icon} ${escapeHtml(t.title)}</div>
              <div class="qtd">${new Date(t.updatedAt).toLocaleString()}</div>
            </div>
            <button data-del="${t.id}">🗑</button>
          </div>`).join('')}
    </div>
    <button class="btn-secondary" id="new-thread-btn">+ New Session Label</button>
  `;
}

function afterRenderQuizzim() {
  document.querySelectorAll('.quiz-model-row[data-model]').forEach(row => {
    row.addEventListener('click', () => {
      localStorage.setItem(StorageKeys.quizzimModel, row.dataset.model);
      renderScreen();
    });
  });
  document.getElementById('open-flashcards-btn').addEventListener('click', openFlashcards);
  document.getElementById('open-curated-btn').addEventListener('click', openCuratedQuizzes);
  document.getElementById('new-thread-btn').addEventListener('click', () => {
    const title = prompt('Label this session (e.g. the subject you\'re studying):', 'New Chat');
    if (!title) return;
    const threads = loadThreads();
    threads.push({ id: crypto.randomUUID(), title, updatedAt: Date.now(), model: localStorage.getItem(StorageKeys.quizzimModel) || 'chatgpt' });
    saveThreads(threads);
    renderScreen();
  });
  document.querySelectorAll('.quiz-thread').forEach(row => {
    row.addEventListener('click', () => {
      const t = loadThreads().find(t => t.id === row.dataset.id);
      if (!t) return;
      if (t.model === 'ondevice') {
        offlineMessages = t.messages || [];
        offlineCurrentThreadId = t.id;
        startNewOfflineSession();
        offlineMessages.forEach(m => offlineChatHistory.push({ role: m.isFromUser ? 'user' : 'assistant', content: m.text }));
        localStorage.setItem(StorageKeys.quizzimModel, 'ondevice');
        renderScreen();
        return;
      }
      const url = t.model === 'claude' ? 'https://claude.ai/new' : 'https://chatgpt.com';
      window.open(url, '_blank', 'noopener');
    });
  });
  document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = b.dataset.del;
    saveThreads(loadThreads().filter(t => t.id !== id));
    renderScreen();
  }));

  const model = localStorage.getItem(StorageKeys.quizzimModel) || 'chatgpt';
  const area = document.getElementById('quiz-active-area');
  if (model === 'ondevice') {
    renderOfflineChatArea(area);
  } else {
    const meta = model === 'claude' ? { name: 'Claude', url: 'https://claude.ai/new', icon: 'sparkle' } : { name: 'ChatGPT', url: 'https://chatgpt.com', icon: 'message-circle' };
    area.innerHTML = `
      <div class="card">
        <p style="font-size:13px;margin:0 0 12px;">${meta.name} can't be embedded directly on a regular web page — it blocks that. Tapping below opens your real ${meta.name} conversation in a new tab, signed in with your own account.</p>
        <button class="btn-primary" id="open-model-btn">Open ${meta.name} ${meta.icon} ↗</button>
      </div>`;
    document.getElementById('open-model-btn').addEventListener('click', () => window.open(meta.url, '_blank', 'noopener'));
  }
}

// MARK: Offline chat UI

function renderOfflineChatArea(area) {
  if (!offlineIsSupported()) {
    area.innerHTML = `
      <div class="card">
        <p style="font-size:13px;margin:0 0 10px;">${offlineUnavailableMessage()}</p>
        <div class="quiz-feature-row" style="margin:0;">
          <button class="btn-secondary" id="fallback-chatgpt">Switch to ChatGPT</button>
          <button class="btn-secondary" id="fallback-claude">Switch to Claude</button>
        </div>
      </div>`;
    document.getElementById('fallback-chatgpt').addEventListener('click', () => { localStorage.setItem(StorageKeys.quizzimModel, 'chatgpt'); renderScreen(); });
    document.getElementById('fallback-claude').addEventListener('click', () => { localStorage.setItem(StorageKeys.quizzimModel, 'claude'); renderScreen(); });
    return;
  }

  if (offlineEngineState !== 'ready') {
    const chosen = offlineModelForDevice();
    const errored = offlineEngineState === 'error';
    area.innerHTML = `
      <div class="card" id="offline-load-card">
        <p style="font-size:13px;margin:0 0 4px;font-weight:700;">${ic('cpu','ic-inline')} ${chosen.label}</p>
        <p style="font-size:12px;color:var(--text2);margin:0 0 12px;">Runs entirely on this device via WebGPU. First load downloads and caches the model (${chosen.size}) — after that it works fully offline.${(localStorage.getItem(StorageKeys.offlineModelChoice)||'auto')==='auto' && isAppleTouchDevice() ? ' Auto picked the lighter model for iOS/iPadOS to avoid Safari killing the tab for using too much memory.' : ''} You can change the model size in Settings.</p>
        ${errored ? `<p style="font-size:12px;color:var(--danger);margin:0 0 12px;font-weight:600;">⚠️ ${escapeHtml(offlineEngineError || 'Load failed.')} This is often a partial/corrupted download from a spotty connection — clearing the cache usually fixes it.</p>` : ''}
        <div id="offline-progress-wrap" class="hidden">
          <div class="offline-progress-track"><div class="offline-progress-fill" id="offline-progress-fill"></div></div>
          <p class="settings-footnote" id="offline-progress-text"></p>
        </div>
        <button class="btn-primary" id="offline-start-btn" style="width:100%;">${errored ? 'Retry' : 'Start Offline Chat'}</button>
        ${errored ? `<button class="btn-secondary" id="offline-clear-cache" style="width:100%;margin-top:8px;">🧹 Clear Cache &amp; Retry</button>` : ''}
      </div>`;
    document.getElementById('offline-start-btn').addEventListener('click', async () => {
      const btn = document.getElementById('offline-start-btn');
      const wrap = document.getElementById('offline-progress-wrap');
      btn.disabled = true; btn.textContent = 'Loading…';
      wrap.classList.remove('hidden');
      try {
        await ensureOfflineEngine((report) => {
          const pct = Math.round((report.progress || 0) * 100);
          document.getElementById('offline-progress-fill').style.width = pct + '%';
          document.getElementById('offline-progress-text').textContent = report.text || `Loading… ${pct}%`;
        });
        if (!offlineMessages.length) { startNewOfflineSession(); offlineCurrentThreadId = null; }
        renderScreen();
      } catch (err) {
        renderScreen();
      }
    });
    document.getElementById('offline-clear-cache')?.addEventListener('click', async () => {
      const btn = document.getElementById('offline-clear-cache');
      btn.disabled = true; btn.textContent = 'Clearing…';
      await clearOfflineModelCache();
      renderScreen();
    });
    return;
  }

  area.innerHTML = `
    <div class="offline-chat-card">
      <div class="offline-chat-messages" id="offline-messages"></div>
      <div class="offline-chat-input-row">
        <input class="field" id="offline-draft" style="margin:0;" placeholder="Ask Quizzim anything…" />
        <button class="btn-primary" id="offline-send-btn">${ic('send')}</button>
      </div>
    </div>`;
  renderOfflineMessages();
  const draftEl = document.getElementById('offline-draft');
  const send = () => sendOfflineDraft(draftEl.value);
  document.getElementById('offline-send-btn').addEventListener('click', send);
  draftEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

function renderOfflineMessages() {
  const wrap = document.getElementById('offline-messages');
  if (!wrap) return;
  const bubbles = offlineMessages.length
    ? offlineMessages.map(m => `<div class="chat-bubble ${m.isFromUser ? 'chat-bubble-user' : 'chat-bubble-pet'} ${m.isError ? 'chat-bubble-error' : ''}">${escapeHtml(m.text)}</div>`).join('')
    : `<div class="chat-bubble chat-bubble-pet">Ask me to quiz you on a topic, explain something confusing, or help you study — fully offline, right here.</div>`;
  wrap.innerHTML = bubbles + (offlineThinking ? `<div class="chat-bubble chat-bubble-pet chat-bubble-thinking">Thinking…</div>` : '');
  wrap.scrollTop = wrap.scrollHeight;
}

async function sendOfflineDraft(text) {
  const trimmed = (text || '').trim();
  if (!trimmed || offlineThinking) return;
  const draftEl = document.getElementById('offline-draft');
  if (draftEl) draftEl.value = '';
  offlineMessages.push({ text: trimmed, isFromUser: true });
  offlineThinking = true;
  renderOfflineMessages();
  try {
    const reply = await sendOfflineMessage(trimmed);
    offlineMessages.push({ text: reply, isFromUser: false });
  } catch (err) {
    offlineMessages.push({ text: err.message || 'Something went wrong — try again.', isFromUser: false, isError: true });
  }
  offlineThinking = false;
  renderOfflineMessages();
  persistOfflineThreadIfNeeded();
}

// ---------------------------------------------------------------
// FLASHCARDS — concept ported from AIFlashcardService.swift /
// FlashcardQuizView.swift. The Swift version generates cards with
// Apple's on-device Foundation Models; the web has no equivalent local
// model to call, so this uses a lightweight on-page generator instead
// of pretending to call a real AI. Two modes:
//  - Paste real notes → cloze ("fill in the blank") cards built from
//    your own sentences, so the answer is always something you wrote.
//  - Just a topic → self-recall prompt cards (no invented facts).
// A photo of notes can be OCR'd client-side (Tesseract.js) to fill the
// notes box instead of typing.
// ---------------------------------------------------------------
const STOPWORDS = new Set(['the','a','an','is','are','was','were','of','to','in','on','and','or','for','with','that','this','it','as','be','by','at','from','which']);

function generateFlashcards(rawText, count = 6) {
  const text = rawText.trim();
  if (!text) return [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length >= 25 && s.split(' ').length >= 5);

  if (sentences.length >= 2) {
    // Notes mode: cloze-delete the most "important" word (longest
    // non-stopword) out of each sentence. Works on notes in any
    // language — it just blanks a word out of your own sentence.
    const cards = [];
    for (const s of sentences) {
      const words = s.replace(/[.!?]$/, '').split(' ');
      let bestIdx = -1, bestLen = 0;
      words.forEach((w, i) => {
        const clean = w.replace(/[^a-zA-Z0-9]/g, '');
        if (clean.length > bestLen && !STOPWORDS.has(clean.toLowerCase()) && clean.length > 3) {
          bestLen = clean.length; bestIdx = i;
        }
      });
      if (bestIdx === -1) continue;
      const answer = words[bestIdx].replace(/[^a-zA-Z0-9'-]/g, '');
      const blanked = [...words];
      blanked[bestIdx] = '____';
      cards.push({ question: blanked.join(' '), answer });
      if (cards.length >= count) break;
    }
    if (cards.length) return cards;
  }

  // Topic mode: no source text to draw real facts from, so these are
  // self-recall prompts rather than scripted (and possibly wrong)
  // answers. Translated by hand for Afrikaans since this local
  // heuristic has no model to ask.
  const topic = text.length > 60 ? text.slice(0, 60) + '…' : text;
  const promptsByLanguage = {
    en: [
      `What is ${topic}, in your own words?`,
      `What's one key fact you know about ${topic}?`,
      `Why does ${topic} matter in what you're studying?`,
      `How would you explain ${topic} to a classmate?`,
      `What's a common misconception about ${topic}?`,
      `What question would you still want answered about ${topic}?`,
    ],
    af: [
      `Wat is ${topic}, in jou eie woorde?`,
      `Wat is een belangrike feit wat jy van ${topic} weet?`,
      `Waarom is ${topic} belangrik vir wat jy studeer?`,
      `Hoe sou jy ${topic} aan 'n klasmaat verduidelik?`,
      `Wat is 'n algemene wanopvatting oor ${topic}?`,
      `Watter vraag oor ${topic} wil jy nog steeds beantwoord hê?`,
    ],
  };
  const prompts = promptsByLanguage[currentAiLanguage()] || promptsByLanguage.en;
  return prompts.slice(0, count).map(q => ({ question: q, answer: '(self-recall — no scripted answer; say or type yours, then rate yourself)' }));
}

let ocrBusy = false;
function scanPhotoForText(file, onStatus) {
  return new Promise((resolve, reject) => {
    if (typeof Tesseract === 'undefined') {
      reject(new Error("OCR isn't available right now (couldn't load the on-device scanner). Type your notes instead."));
      return;
    }
    onStatus('Scanning photo…');
    Tesseract.recognize(file, 'eng')
      .then(({ data }) => resolve((data.text || '').trim()))
      .catch(() => reject(new Error("Couldn't read text from that photo. Try a clearer shot, or type your notes instead.")));
  });
}

function openFlashcards() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'flash-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header"><h3>${ic('layers','ic-inline')} Flashcards</h3><button id="flash-close">Close</button></div>
      <div id="flash-body"></div>
    </div>
  `;
  document.getElementById('app').appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.getElementById('flash-close').addEventListener('click', () => backdrop.remove());
  renderFlashSetup();
}

function renderFlashSetup() {
  const body = document.getElementById('flash-body');
  const canOffline = offlineIsSupported();
  const savedCount = localStorage.getItem(StorageKeys.flashcardCount) || '6';
  body.innerHTML = `
    <p class="settings-footnote" style="margin-top:-4px;">Paste your notes for cloze cards built from your own sentences, or just type a topic for self-recall prompts — generated instantly on this device. Or check the box below to have the offline AI write smarter, real-answer cards instead.</p>
    <textarea id="flash-input" class="field" style="min-height:110px;resize:vertical;" placeholder="Paste notes, or type a topic like &quot;Photosynthesis&quot;"></textarea>
    <label class="btn-secondary" style="display:block;text-align:center;margin-top:10px;cursor:pointer;">
      ${ic('camera','ic-inline')} Scan a photo of notes
      <input type="file" id="flash-photo" accept="image/*" capture="environment" class="hidden" />
    </label>
    <p id="flash-ocr-status" class="settings-footnote hidden"></p>
    <p style="font-size:12px;font-weight:700;margin:14px 0 6px;">How many cards?</p>
    ${chipRowHTML('flash-count-row', [4,6,8,10,12].map(n => ({ value: n, label: n })), savedCount)}
    <label class="offline-toggle-row" style="${canOffline ? '' : 'opacity:.5;'}">
      <input type="checkbox" id="flash-use-offline" ${canOffline ? '' : 'disabled'} />
      <span>Use offline AI for smarter cards${canOffline ? '' : ' (needs a WebGPU browser)'}</span>
    </label>
    <div id="flash-offline-progress" class="hidden">
      <div class="offline-progress-track"><div class="offline-progress-fill" id="flash-progress-fill"></div></div>
      <p class="settings-footnote" id="flash-progress-text"></p>
    </div>
    <button class="btn-primary" id="flash-generate" style="margin-top:14px;width:100%;">${ic('sparkles','ic-inline')} Generate Flashcards</button>
  `;
  wireChipRow('flash-count-row', (value) => localStorage.setItem(StorageKeys.flashcardCount, value));
  document.getElementById('flash-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('flash-ocr-status');
    status.classList.remove('hidden');
    try {
      const text = await scanPhotoForText(file, (msg) => { status.textContent = msg; });
      document.getElementById('flash-input').value = text || '(no text found in that photo)';
      status.textContent = 'Scan complete — review the text below before generating.';
    } catch (err) {
      status.textContent = err.message;
    }
  });
  document.getElementById('flash-generate').addEventListener('click', async () => {
    const raw = document.getElementById('flash-input').value;
    if (!raw.trim()) return;
    const count = parseInt(localStorage.getItem(StorageKeys.flashcardCount) || '6', 10);
    const useOffline = document.getElementById('flash-use-offline').checked;
    const btn = document.getElementById('flash-generate');

    if (useOffline) {
      const progressWrap = document.getElementById('flash-offline-progress');
      progressWrap.classList.remove('hidden');
      btn.disabled = true; btn.textContent = 'Generating…';
      try {
        const cards = await generateFlashcardsOffline(raw, count, (report) => {
          const pct = Math.round((report.progress || 0) * 100);
          document.getElementById('flash-progress-fill').style.width = pct + '%';
          document.getElementById('flash-progress-text').textContent = report.text || `Loading model… ${pct}%`;
        }, (done, total) => {
          document.getElementById('flash-progress-fill').style.width = Math.round((done / total) * 100) + '%';
          document.getElementById('flash-progress-text').textContent = `Generated ${done} of ${total} cards…`;
        });
        if (cards.length < count) showFeedback(`Only got ${cards.length} of ${count} — the offline model ran dry on this topic. Try again, or lower the count.`);
        runFlashDeck(cards);
        return;
      } catch (err) {
        showFeedback(err.message || 'Offline generation failed — using the quick generator instead.');
        btn.disabled = false; btn.innerHTML = `${ic('sparkles','ic-inline')} Generate Flashcards`;
        progressWrap.classList.add('hidden');
      }
    }

    const cards = generateFlashcards(raw, count);
    if (!cards.length) { showFeedback("Couldn't build cards from that — try adding more detail."); return; }
    runFlashDeck(cards);
  });
}

function runFlashDeck(cards) {
  let i = 0, showingAnswer = false, correct = 0;
  const body = document.getElementById('flash-body');
  function render() {
    if (i >= cards.length) {
      body.innerHTML = `
        <div style="text-align:center;padding:10px 0;">
          <div class="result-emoji">${ic('party-popper')}</div>
          <h3 style="margin:8px 0 4px;">Deck complete!</h3>
          <p class="settings-footnote">You knew ${correct} of ${cards.length} cards.</p>
          <div class="quiz-feature-row" style="margin-top:16px;">
            <button class="btn-secondary" id="flash-done">Done</button>
            <button class="btn-primary" id="flash-restart">New Topic</button>
          </div>
        </div>`;
      document.getElementById('flash-done').addEventListener('click', () => document.getElementById('flash-backdrop')?.remove());
      document.getElementById('flash-restart').addEventListener('click', renderFlashSetup);
      applyGamePlayReward(correct >= Math.ceil(cards.length / 2));
      return;
    }
    const card = cards[i];
    body.innerHTML = `
      <p class="settings-footnote" style="margin-top:-4px;">Card ${i+1} of ${cards.length}</p>
      <div class="card flashcard-face">
        <div class="settings-footnote" style="text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;">${showingAnswer ? 'Answer' : 'Question'}</div>
        <p style="font-size:17px;font-weight:600;margin:0;">${escapeHtml(showingAnswer ? card.answer : card.question)}</p>
      </div>
      ${showingAnswer
        ? `<div class="quiz-feature-row" style="margin-top:14px;">
             <button class="btn-secondary" id="flash-missed">Missed It</button>
             <button class="btn-primary" id="flash-knew">✅ Knew It</button>
           </div>`
        : `<button class="btn-primary" id="flash-reveal" style="margin-top:14px;width:100%;">👀 Show Answer</button>`}
    `;
    if (showingAnswer) {
      document.getElementById('flash-missed').addEventListener('click', () => { i++; showingAnswer = false; render(); });
      document.getElementById('flash-knew').addEventListener('click', () => { correct++; i++; showingAnswer = false; render(); });
    } else {
      document.getElementById('flash-reveal').addEventListener('click', () => { showingAnswer = true; render(); });
    }
  }
  render();
}

// ---------------------------------------------------------------
// AI QUIZZES — generated on the fly by the offline local model
// (same engine/plumbing as Quizzim chat and Flashcards). Needs the
// offline model, since there's no server/API-key backend to generate
// with otherwise; ChatGPT/Claude open as separate sites and can't
// hand structured data back into this app.
// ---------------------------------------------------------------
const QUIZ_INSTRUCTIONS = `You are Quizzim's quiz generator, part of the StudyPet app. Given a topic, write a multiple-choice quiz a student could use to test themselves.

Rules:
- Each question has exactly 4 answer choices, only one of which is correct.
- Keep questions and choices short and unambiguous.
- Do not add any commentary, headers, numbering, or preamble.
- Output ONLY the quiz, using exactly this format for each question, with a blank line between questions:
Q: <question>
A) <choice>
B) <choice>
C) <choice>
D) <choice>
CORRECT: <A, B, C, or D>`;

function parseQuizFromText(raw) {
  const questions = [];
  let current = null;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (/^Q:/i.test(line)) {
      if (current && current.q && current.choices.length === 4 && current.a != null) questions.push(current);
      current = { q: line.slice(2).trim(), choices: [], a: null };
    } else if (/^[A-D]\)/i.test(line) && current) {
      current.choices.push(line.slice(2).trim());
    } else if (/^CORRECT:/i.test(line) && current) {
      const letter = line.split(':')[1]?.trim().toUpperCase().replace(/[^A-D]/g, '');
      current.a = { A: 0, B: 1, C: 2, D: 3 }[letter] ?? null;
    }
  }
  if (current && current.q && current.choices.length === 4 && current.a != null) questions.push(current);
  return questions;
}

async function generateQuizOffline(topic, count, onProgress, onBatchProgress) {
  const engine = await ensureOfflineEngine(onProgress);
  const questions = [];
  const seen = new Set();
  const maxAttempts = count + 12; // generous — small models fail to parse some attempts entirely
  for (let attempts = 0; questions.length < count && attempts < maxAttempts; attempts++) {
    const avoidNote = questions.length ? `\n\nDon't repeat these: ${questions.map(q => q.q).join(' | ')}` : '';
    const reply = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: QUIZ_INSTRUCTIONS + languageInstruction() },
        { role: 'user', content: `Make exactly 1 multiple-choice quiz question about: ${topic}${avoidNote}` },
      ],
      temperature: 0.7,
      max_tokens: 260,
    });
    const content = reply.choices?.[0]?.message?.content || '';
    for (const q of parseQuizFromText(content)) {
      const key = q.q.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(q);
      break; // one question per attempt is the point — ignore any extra the model volunteers
    }
    if (onBatchProgress) onBatchProgress(questions.length, count);
  }
  if (!questions.length) throw new Error("Couldn't parse a quiz from the offline model's reply — try again, or try a different topic.");
  return questions.slice(0, count);
}

function loadQuizScores() {
  try { return JSON.parse(localStorage.getItem(StorageKeys.quizScores) || '{}'); } catch { return {}; }
}
function saveQuizScores(s) { localStorage.setItem(StorageKeys.quizScores, JSON.stringify(s)); }

function openCuratedQuizzes() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'curated-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header"><h3>${ic('list-checks','ic-inline')} AI Quizzes</h3><button id="curated-close">Close</button></div>
      <div id="curated-body"></div>
    </div>
  `;
  document.getElementById('app').appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.getElementById('curated-close').addEventListener('click', () => backdrop.remove());
  renderQuizSetup();
}

function renderQuizSetup() {
  const body = document.getElementById('curated-body');

  if (!offlineIsSupported()) {
    body.innerHTML = `
      <p class="settings-footnote" style="margin-top:-4px;">${offlineUnavailableMessage()}</p>
      <div class="quiz-feature-row" style="margin:0;">
        <button class="btn-secondary" id="quiz-fallback-flash">Try Flashcards instead</button>
      </div>`;
    document.getElementById('quiz-fallback-flash').addEventListener('click', () => { document.getElementById('curated-backdrop')?.remove(); openFlashcards(); });
    return;
  }

  const scores = Object.fromEntries(Object.entries(loadQuizScores()).filter(([, s]) => s && typeof s === 'object' && 'best' in s));
  const savedCount = localStorage.getItem(StorageKeys.quizCount) || '5';
  body.innerHTML = `
    <p class="settings-footnote" style="margin-top:-4px;">Type any topic and the offline AI will write a quiz on the spot — right on this device, no internet needed once the model's loaded.</p>
    <input id="quiz-topic" class="field" placeholder="e.g. World War II, Photosynthesis, Algebra" />
    <p style="font-size:12px;font-weight:700;margin:14px 0 6px;">How many questions?</p>
    ${chipRowHTML('quiz-count-row', [3,5,7,10].map(n => ({ value: n, label: n })), savedCount)}
    <div id="quiz-offline-progress" class="hidden">
      <div class="offline-progress-track"><div class="offline-progress-fill" id="quiz-progress-fill"></div></div>
      <p class="settings-footnote" id="quiz-progress-text"></p>
    </div>
    <button class="btn-primary" id="quiz-generate" style="margin-top:12px;width:100%;">${ic('sparkles','ic-inline')} Generate Quiz</button>
    ${Object.keys(scores).length ? `
      <h3 style="font-size:13px;margin:18px 0 6px;">Past topics</h3>
      <div class="card" style="padding:6px 14px;">
        ${Object.entries(scores).map(([topic, s]) => `
          <div class="quiz-thread" data-topic="${escapeHtml(topic)}" style="cursor:pointer;">
            <div><div class="qtt">${escapeHtml(topic)}</div><div class="qtd">Best: ${s.best}/${s.total}</div></div>
          </div>`).join('')}
      </div>` : ''}
  `;
  wireChipRow('quiz-count-row', (value) => localStorage.setItem(StorageKeys.quizCount, value));
  document.querySelectorAll('#curated-body .quiz-thread').forEach(row => {
    row.addEventListener('click', () => {
      document.getElementById('quiz-topic').value = row.dataset.topic;
    });
  });
  document.getElementById('quiz-generate').addEventListener('click', async () => {
    const topic = document.getElementById('quiz-topic').value.trim();
    if (!topic) return;
    const count = parseInt(localStorage.getItem(StorageKeys.quizCount) || '5', 10);
    const btn = document.getElementById('quiz-generate');
    const wrap = document.getElementById('quiz-offline-progress');
    wrap.classList.remove('hidden');
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const questions = await generateQuizOffline(topic, count, (report) => {
        const pct = Math.round((report.progress || 0) * 100);
        document.getElementById('quiz-progress-fill').style.width = pct + '%';
        document.getElementById('quiz-progress-text').textContent = report.text || `Loading model… ${pct}%`;
      }, (done, total) => {
        document.getElementById('quiz-progress-fill').style.width = Math.round((done / total) * 100) + '%';
        document.getElementById('quiz-progress-text').textContent = `Generated ${done} of ${total} questions…`;
      });
      if (questions.length < count) showFeedback(`Only got ${questions.length} of ${count} — the offline model ran dry on this topic. Try again, or lower the count.`);
      runGeneratedQuiz(topic, questions);
    } catch (err) {
      showFeedback(err.message || 'Failed to generate a quiz — try again.');
      btn.disabled = false; btn.innerHTML = `${ic('sparkles','ic-inline')} Generate Quiz`;
      wrap.classList.add('hidden');
    }
  });
}

function runGeneratedQuiz(topic, questions) {
  let i = 0, score = 0, answered = false;
  const body = document.getElementById('curated-body');
  function render() {
    if (i >= questions.length) {
      const scores = loadQuizScores();
      const prevBest = scores[topic]?.best ?? -1;
      scores[topic] = { best: Math.max(prevBest, score), total: questions.length };
      saveQuizScores(scores);
      body.innerHTML = `
        <div style="text-align:center;padding:10px 0;">
          <div class="result-emoji">${ic(score === questions.length ? 'trophy' : 'party-popper')}</div>
          <h3 style="margin:8px 0 4px;">${escapeHtml(topic)} — complete!</h3>
          <p class="settings-footnote">You scored ${score} of ${questions.length}.</p>
          <div class="quiz-feature-row" style="margin-top:16px;">
            <button class="btn-secondary" id="curated-back">New Topic</button>
            <button class="btn-primary" id="curated-retry">Try Again</button>
          </div>
        </div>`;
      document.getElementById('curated-back').addEventListener('click', renderQuizSetup);
      document.getElementById('curated-retry').addEventListener('click', () => runGeneratedQuiz(topic, questions));
      applyGamePlayReward(score >= Math.ceil(questions.length * 0.6));
      return;
    }
    const question = questions[i];
    answered = false;
    body.innerHTML = `
      <p class="settings-footnote" style="margin-top:-4px;">${escapeHtml(topic)} — Question ${i+1} of ${questions.length}</p>
      <p style="font-size:16px;font-weight:600;margin:6px 0 14px;">${escapeHtml(question.q)}</p>
      <div class="quiz-choices" id="quiz-choices">
        ${question.choices.map((c, idx) => `<button class="quiz-choice" data-i="${idx}">${escapeHtml(c)}</button>`).join('')}
      </div>
    `;
    document.querySelectorAll('#quiz-choices .quiz-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const idx = parseInt(btn.dataset.i, 10);
        const correct = idx === question.a;
        if (correct) score++;
        document.querySelectorAll('#quiz-choices .quiz-choice').forEach((b, bi) => {
          if (bi === question.a) b.classList.add('quiz-choice-correct');
          else if (bi === idx) b.classList.add('quiz-choice-wrong');
        });
        setTimeout(() => { i++; render(); }, 700);
      });
    });
  }
  render();
}

// ---------------------------------------------------------------
// PROGRESS
// ---------------------------------------------------------------
function progressTemplate() {
  const wins = parseInt(localStorage.getItem(StorageKeys.pingPongWins) || '0', 10);
  const tttWins = parseInt(localStorage.getItem(StorageKeys.tttWins) || '0', 10);
  return `
    <h2 style="margin:0 0 16px;font-size:20px;">${ic('bar-chart-3','ic-inline')} Progress</h2>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${ic('star','ic-inline')} ${pet.level}</div><div class="cap">Level</div></div>
      <div class="stat-card"><div class="num">${ic('coins','ic-inline')} ${pet.totalCoinsEarned}</div><div class="cap">Coins Earned</div></div>
      <div class="stat-card"><div class="num">${pet.totalMinutesStudied}</div><div class="cap">Minutes Studied</div></div>
      <div class="stat-card"><div class="num">${pet.sessionsCompleted}</div><div class="cap">Sessions</div></div>
      <div class="stat-card"><div class="num">${ic('flame','ic-inline')} ${pet.studyStreak}</div><div class="cap">Day Streak</div></div>
      <div class="stat-card"><div class="num">${ic('circle-dot','ic-inline')} ${wins}</div><div class="cap">Ping Pong Wins</div></div>
      <div class="stat-card"><div class="num">${ic('grid-3x3','ic-inline')} ${tttWins}</div><div class="cap">Tic Tac Toe Wins</div></div>
    </div>
  `;
}

// ---------------------------------------------------------------
// PET SHOP MODAL — ported from PetShopView.swift / PetShopConstants
// ---------------------------------------------------------------
function openPetShop() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'shop-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header"><h3>Pet Shop</h3><button id="shop-done">Done</button></div>
      <p class="settings-footnote" style="margin:-8px 0 14px;">Spend coins you've earned studying to unlock new pets.</p>
      <div class="top-row" style="margin-bottom:14px;">
        <span></span>
        <span class="chip">${ic('coins','ic-inline')} ${pet.coins}</span>
      </div>
      <div class="shop-grid" id="shop-grid">
        ${PET_SPECIES.map(s => shopCardHTML(s)).join('')}
      </div>
      <div id="shop-feedback" class="feedback-msg hidden"></div>
    </div>
  `;
  document.getElementById('app').appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.getElementById('shop-done').addEventListener('click', () => backdrop.remove());
  wireShopCards();
}

function shopCardHTML(species) {
  const owned = isSpeciesOwned(species.id);
  const active = pet.species === species.id;
  const art = species.img
    ? `<img src="${species.img}" alt="${species.name}" class="shop-pet-img" />`
    : `<span class="shop-pet-emoji">${species.emoji}</span>`;
  let status;
  if (active) status = `<span class="shop-status shop-status-active">✓ Active</span>`;
  else if (owned) status = `<span class="shop-status">Owned — tap to select</span>`;
  else status = `<span class="chip">${ic('coins','ic-inline')} ${species.cost}</span>`;
  return `
    <button class="shop-card ${active ? 'shop-card-active' : ''}" data-species="${species.id}" ${active ? 'disabled' : ''}>
      ${art}
      <div class="shop-pet-name">${species.name}</div>
      ${status}
    </button>`;
}

function wireShopCards() {
  document.querySelectorAll('#shop-grid .shop-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.species;
      if (isSpeciesOwned(id)) {
        selectActiveSpecies(id);
      } else if (!purchaseSpecies(id)) {
        const fb = document.getElementById('shop-feedback');
        fb.textContent = 'Not enough coins.';
        fb.classList.remove('hidden');
        setTimeout(() => fb.classList.add('hidden'), 2000);
        return;
      }
      document.getElementById('shop-backdrop')?.remove();
      openPetShop();
    });
  });
}

// ---------------------------------------------------------------
// SETTINGS MODAL
// ---------------------------------------------------------------
function openSettings() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'settings-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header"><h3>Settings</h3><button id="settings-done">Done</button></div>

      <div class="section-title">Account</div>
      <p style="font-size:13px;color:var(--text2);margin:0 0 8px;">${localStorage.getItem(StorageKeys.email) || 'Signed in'}</p>
      <button class="btn-secondary btn-danger" id="logout-btn">Log Out</button>

      <div class="section-title">Appearance</div>
      <div class="appearance-row" id="appearance-row">
        ${['system','light','dark'].map(m => `<button data-mode="${m}" class="${ (localStorage.getItem(StorageKeys.appearance)||'system')===m ? 'active':''}">${m[0].toUpperCase()+m.slice(1)}</button>`).join('')}
      </div>

      <div class="section-title">Theme Color</div>
      <div class="swatches" id="theme-swatches">
        ${Object.entries(THEMES).map(([key,t]) => `
          <button class="swatch-btn" data-theme="${key}">
            <span class="swatch-dot ${ (localStorage.getItem(StorageKeys.colorTheme)||'default')===key ? 'selected':''}" style="background:${t.bgL}">
              ${ (localStorage.getItem(StorageKeys.colorTheme)||'default')===key ? '✓' : '' }
            </span>
            <span class="lbl">${t.name}</span>
          </button>`).join('')}
      </div>

      <div class="section-title">Focus Mode</div>
      <div class="toggle-row">
        <span>👁️‍🗨️ Focus Mode</span>
        <label class="switch"><input type="checkbox" id="focus-toggle" ${localStorage.getItem(StorageKeys.focusModeEnabled)==='true'?'checked':''}><span class="slider-pill"></span></label>
      </div>
      <p class="settings-footnote">Locks in your study sessions with a distraction-minimal timer and requires confirmation to leave early. This does not block other apps or sites on your device.</p>

      <div class="section-title">Quizzim</div>
      <p class="settings-footnote">Quizzim supports ChatGPT, Claude, and a fully offline local AI (runs in-browser via WebGPU). Apple's Cloud model source has no web equivalent and stays disabled.</p>
      <p style="font-size:12px;font-weight:700;margin:10px 0 6px;">Offline AI model size</p>
      <div class="model-size-row" id="model-size-row">
        <button data-choice="auto" class="${(localStorage.getItem(StorageKeys.offlineModelChoice)||'auto')==='auto' ? 'active' : ''}">
          <span class="msn">Auto</span><span class="mss">Recommended</span>
        </button>
        ${Object.entries(OFFLINE_MODEL_OPTIONS).map(([key, m]) => `
          <button data-choice="${key}" class="${localStorage.getItem(StorageKeys.offlineModelChoice)===key ? 'active' : ''}">
            <span class="msn">${m.label}</span><span class="mss">${m.size}</span>
          </button>`).join('')}
      </div>
      <p class="settings-footnote" id="model-size-desc">${(() => {
        const choice = localStorage.getItem(StorageKeys.offlineModelChoice) || 'auto';
        if (choice === 'auto') return `Auto picks ${isAppleTouchDevice() ? 'Tiny' : 'Balanced'} for this device — the safest choice for most people.`;
        return OFFLINE_MODEL_OPTIONS[choice]?.desc || '';
      })()}</p>

      <p style="font-size:12px;font-weight:700;margin:14px 0 6px;">AI language</p>
      ${chipRowHTML('ai-language-row', Object.entries(AI_LANGUAGES).map(([key, l]) => ({ value: key, label: l.label })), currentAiLanguage())}
      <p class="settings-footnote">Applies to the offline AI's chat, flashcards, and quizzes. ${currentAiLanguage() === 'af' ? "Heads up — Afrikaans isn't an officially supported language for these small offline models, so expect more mistakes than you'd see in English. It's closely related to Dutch/English so it usually still comes out usable." : "ChatGPT/Claude open as their own sites and aren't affected by this setting."}</p>
      <button class="btn-secondary" id="clear-offline-cache-btn" style="width:100%;margin-top:6px;">🧹 Clear Offline AI Cache</button>
      <p class="settings-footnote">If the offline AI keeps failing to load or crashes the tab, a partial download from a bad connection is the usual cause — this wipes the cached model so the next load starts fresh.</p>

      <div class="section-title">About</div>
      <div class="version-row"><span>Version</span><span>${BuildInfo.versionName} (${BuildInfo.buildNumber})</span></div>
    </div>
  `;
  document.getElementById('app').appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.getElementById('settings-done').addEventListener('click', () => backdrop.remove());
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.setItem(StorageKeys.isLoggedIn, 'false');
    backdrop.remove();
    showLogin();
  });
  document.getElementById('appearance-row').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    localStorage.setItem(StorageKeys.appearance, b.dataset.mode);
    applyTheme();
    openSettings(); backdrop.remove();
  }));
  document.getElementById('theme-swatches').querySelectorAll('.swatch-btn').forEach(b => b.addEventListener('click', () => {
    localStorage.setItem(StorageKeys.colorTheme, b.dataset.theme);
    applyTheme();
    backdrop.remove(); openSettings();
  }));
  document.getElementById('focus-toggle').addEventListener('change', (e) => {
    localStorage.setItem(StorageKeys.focusModeEnabled, e.target.checked ? 'true' : 'false');
  });
  document.getElementById('model-size-row').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    setOfflineModelChoice(b.dataset.choice);
    backdrop.remove(); openSettings();
    if (currentTab === 'quizzim') renderScreen();
  }));
  wireChipRow('ai-language-row', (value) => {
    localStorage.setItem(StorageKeys.aiLanguage, value);
    // Update any already-started chat's system prompt in place rather
    // than losing the conversation so far.
    if (offlineChatHistory.length) offlineChatHistory[0] = { role: 'system', content: QUIZZIM_INSTRUCTIONS + languageInstruction() };
    backdrop.remove(); openSettings();
    if (currentTab === 'quizzim') renderScreen();
  });
  document.getElementById('clear-offline-cache-btn').addEventListener('click', async () => {
    const btn = document.getElementById('clear-offline-cache-btn');
    btn.disabled = true; btn.textContent = 'Clearing…';
    await clearOfflineModelCache();
    showFeedback('Offline AI cache cleared.');
    btn.disabled = false; btn.textContent = '🧹 Clear Offline AI Cache';
  });
}

// ---------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderTabbar();
  renderScreen();
  startBathroomLoop();
  startMoodDecayLoop();
}
function wireLogin() {
  const err = document.getElementById('login-error');
  function attempt(mode) {
    const email = document.getElementById('login-email').value.trim();
    const pw = document.getElementById('login-password').value.trim();
    if (!email || !pw) { err.textContent = mode === 'login' ? 'Please enter an email and password.' : 'Please enter an email and password to create an account.'; return; }
    err.textContent = '';
    localStorage.setItem(StorageKeys.email, email);
    localStorage.setItem(StorageKeys.isLoggedIn, 'true');
    showApp();
  }
  document.getElementById('login-btn').addEventListener('click', () => attempt('login'));
  document.getElementById('create-account-btn').addEventListener('click', () => attempt('create'));
}

// ---------------------------------------------------------------
// INIT
// ---------------------------------------------------------------
// On-screen error banner — since phones have no visible console, any
// uncaught error gets displayed right on the page instead of just
// silently freezing things.
window.addEventListener('error', (e) => {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b00020;color:#fff;font:12px monospace;padding:10px;white-space:pre-wrap;max-height:40vh;overflow:auto;';
  box.textContent = 'JS error: ' + e.message + '\n' + (e.filename||'') + ':' + (e.lineno||'') + ':' + (e.colno||'');
  document.body.appendChild(box);
});

try { applyTheme(); } catch (e) { console.error('applyTheme failed', e); }
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem(StorageKeys.appearance)||'system') === 'system') applyTheme();
  });
} catch (e) { console.error('theme listener failed', e); }

try { wireLogin(); } catch (e) { console.error('wireLogin failed', e); }

try {
  if (localStorage.getItem(StorageKeys.isLoggedIn) === 'true') showApp();
  else showLogin();
} catch (e) { console.error('initial screen failed', e); showLogin(); }
