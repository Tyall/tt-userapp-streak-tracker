/* ====================================================================
   STATUS TRACKER
   ==================================================================== */

/* --------------------------
   Elements
-------------------------- */
const appWindow = document.getElementById("appWindow");
const titleBar = document.getElementById("titleBar");
const tableContainer = document.getElementById("tableContainer");
const settingsFooter = document.getElementById("settingsFooter");
const settingsPanel = document.getElementById("settings-panel");
const reopenBtn = document.getElementById("reopenBtn");
const expiresHeader = document.getElementById("expires-header");

// Job cells map
const jobCells = {
  Firefighter: document.getElementById("ff-last"),
  Paramedic: document.getElementById("pm-last"),
  "RTS Ground": document.getElementById("rts-ground-last"),
  "RTS Aviator": document.getElementById("rts-aviator-last"),
  "Airline Pilot": document.getElementById("airline-pilot-last"),
  Cabbie: document.getElementById("cabbie-last"),
  Conductor: document.getElementById("conductor-last"),
  "Garbage Collector": document.getElementById("garbage-collector-last"),
  "Heli Pilot": document.getElementById("heli-pilot-last"),
  Mechanic: document.getElementById("mechanic-last"),
  Hunting: document.getElementById("hunting-last"),
  "Bus Driver": document.getElementById("bus-driver-last"),
  "Pot Fishing": document.getElementById("pot-fishing-last"),
};

const jobToggles = document.querySelectorAll(".job-toggle");

// Settings controls
const darkModeToggleSettings = document.getElementById("dark-mode-toggle-settings");
const opacitySliderSettings = document.getElementById("opacity-slider-settings");
const timeFormatToggle = document.getElementById("time-format-toggle");
const timestampJobSelect = document.getElementById("timestamp-job-select");
const expiresFormatSelect = document.getElementById("expires-format-select");
const trackSOTDCheckbox = document.getElementById("track-sotd-checkbox");
const alwaysOnTopCheckbox = document.getElementById("always-on-top-checkbox");

/* --------------------------
   State & persistence
-------------------------- */
const STORAGE_KEY = "statusTracker_final";
let state = {
  title: "-",
  currentStreak: null,
  lastStreaks: {},
  timestamps: {},
  darkMode: false,
  opacity: 1,
  use24h: true,
  visibleJobs: {},
  expiresFormat: "countdown",
  rtsCooldown: null,
  rtsListening: false,
  rtsOffTimeout: null,
  trackSOTD: false,
  alwaysOnTop: false,
  windowPos: { left: 100, top: 100 },
  windowSize: { width: 500, height: 300 },
  fontScale: 1,
};

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Save error:", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state = { ...state, ...saved };

    // Ensure defaults for visibleJobs
    state.visibleJobs = {
      Firefighter: true,
      "RTS Ground": true,
      "RTS Aviator": true,
      Paramedic: true,
      ...state.visibleJobs,
    };
  } catch (e) {
    console.error("Load error:", e);
  }
}

/* --------------------------
   Jobs helper
-------------------------- */
function getJobsList() {
  return Array.from(document.querySelectorAll("tr[data-job]")).map((row) => row.dataset.job);
}

function ensureVisibleJobs() {
  getJobsList().forEach((job) => {
    if (!(job in state.visibleJobs)) state.visibleJobs[job] = true;
  });
}

/* --------------------------
   Controls: save / restore
-------------------------- */
function saveControlsToState() {
  if (!settingsPanel) return;

  settingsPanel.querySelectorAll("input, select").forEach((el) => {
    if (el.type === "checkbox") state[el.id || el.dataset.job || el.name] = el.checked;
    else if (el.type === "radio") {
      if (el.checked) state[el.name] = el.value;
    } else if (el.type === "range") state[el.id] = parseFloat(el.value);
    else state[el.id] = el.value;
  });

  jobToggles.forEach((chk) => {
    state.visibleJobs[chk.dataset.job] = chk.checked;
  });

  save();
}

function restoreControlsFromState() {
  if (!settingsPanel) return;

  settingsPanel.querySelectorAll("input, select").forEach((el) => {
    if (el.type === "checkbox") el.checked = !!state[el.id || el.dataset.job || el.name];
    else if (el.type === "radio") el.checked = state[el.name] === el.value;
    else if (el.type === "range") el.value = state[el.id] ?? el.value;
    else el.value = state[el.id] ?? el.value;
  });

  jobToggles.forEach((chk) => {
    chk.checked = state.visibleJobs[chk.dataset.job];
  });
}

if (settingsPanel) {
  settingsPanel.querySelectorAll("input, select").forEach((el) => el.addEventListener("change", saveControlsToState));
  jobToggles.forEach((chk) => chk.addEventListener("change", saveControlsToState));
}

/* --------------------------
   Time formatting
-------------------------- */
function formatTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !state.use24h,
  });
}

function formatLastUpdated(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";

  const dayMonth = `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");

  if (state.use24h) {
    hours = (hours % 24).toString().padStart(2, "0");
    return `${dayMonth} ${hours}:${minutes}:${seconds}`;
  } else {
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${dayMonth} ${displayHour.toString().padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
  }
}

function formatDateTimeDDMM(ts) {
  return formatLastUpdated(ts);
}

function getExpiryFromTimestamp(ts) {
  if (!ts) return null;
  const lastUpdate = new Date(ts);
  if (isNaN(lastUpdate.getTime())) return null;

  if (state.trackSOTD) {
    const nextUTC0 = new Date(Date.UTC(lastUpdate.getUTCFullYear(), lastUpdate.getUTCMonth(), lastUpdate.getUTCDate() + 1, 0, 0, 0));
    return nextUTC0.getTime() + 48 * 3600 * 1000;
  } else {
    return lastUpdate.getTime() + 48 * 3600 * 1000;
  }
}

function formatExpires(ts) {
  if (!ts) return "-";
  const expiryMs = getExpiryFromTimestamp(ts);
  if (!expiryMs) return "-";

  if (state.expiresFormat === "timestamp") return formatDateTimeDDMM(expiryMs);

  const diff = expiryMs - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 1000 / 60 / 60);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `${h}h ${m}m ${s}s`;
}

/* --------------------------
   UI rendering & countdown
-------------------------- */
let countdownTimer = null;

function updateCountdownLabels() {
  getJobsList().forEach((jobName) => {
    const row = document.querySelector(`tr[data-job="${jobName}"]`);
    const expEl = row?.querySelector("td:nth-child(3)");
    if (expEl) expEl.textContent = formatExpires(state.timestamps[jobName]);
  });
}

function startCountdown() {
  if (countdownTimer) return;
  (function tick() {
    if (state.expiresFormat !== "countdown") {
      clearTimeout(countdownTimer);
      countdownTimer = null;
      return;
    }
    updateCountdownLabels();
    countdownTimer = setTimeout(tick, 1000);
  })();
}

function stopCountdown() {
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
}

function applyUI() {
  if (!document.body) return;
  ensureVisibleJobs();
  const now = Date.now();

  getJobsList().forEach((jobName) => {
    const tsRaw = state.timestamps[jobName];
    const ts = tsRaw ? new Date(tsRaw) : null;
    const row = document.querySelector(`tr[data-job="${jobName}"]`);
    if (!row) return;

    const lastEl = row.querySelector("td:nth-child(2)");
    const expEl = row.querySelector("td:nth-child(3)");

    if (lastEl) lastEl.textContent = formatLastUpdated(tsRaw);
    if (expEl) expEl.textContent = formatExpires(tsRaw);

    row.style.display = state.visibleJobs[jobName] ? "" : "none";
    row.classList.remove("warning", "critical");

    if (ts) {
      const expiryMs = getExpiryFromTimestamp(tsRaw);
      if (expiryMs) {
        const diff = expiryMs - now;
        if (diff < 3600000) row.classList.add("critical");
        else if (diff < 12 * 3600000) row.classList.add("warning");
      }
    }
  });

  if (expiresHeader) expiresHeader.textContent = state.expiresFormat === "timestamp" ? "Time of expiration" : "Time until expiration";

  document.body.classList.toggle("dark", state.darkMode);
  appWindow?.classList.toggle("dark", state.darkMode);
  settingsPanel?.classList.toggle("dark", state.darkMode);

  if (opacitySliderSettings) opacitySliderSettings.value = state.opacity ?? 1;
  if (darkModeToggleSettings) darkModeToggleSettings.checked = !!state.darkMode;
  if (timeFormatToggle) timeFormatToggle.checked = !!state.use24h;
  if (expiresFormatSelect) expiresFormatSelect.value = state.expiresFormat;

  if (appWindow) appWindow.style.opacity = state.opacity ?? 1;
  updateReopenButton();

  if (state.expiresFormat === "countdown") startCountdown();
  else stopCountdown();
}

/* --------------------------
   Expiration watcher + notification queue
-------------------------- */
const methodQueues = { message: [], popup: [] };
const methodCooldowns = { message: 0, popup: 0 };

function processQueue(method) {
  const now = Date.now();
  if (!methodQueues[method] || methodQueues[method].length === 0) return;
  if (now < methodCooldowns[method]) {
    setTimeout(() => processQueue(method), methodCooldowns[method] - now);
    return;
  }

  const fn = methodQueues[method].shift();
  if (fn) fn();
  methodCooldowns[method] = Date.now() + 10000;
  if (methodQueues[method].length > 0) setTimeout(() => processQueue(method), 10000);
}

function safeTrigger(fn, method, jobName) {
  methodQueues[method].push(() => fn(jobName));
  processQueue(method);
}

function triggerMessage(jobName) {
  window.parent.postMessage({ type: "message", title: "Streak Expiring Soon!", text: `Your Streak for ~y~${jobName}~w~ will expire in less than ~y~12 hours!` }, "*");
}

function triggerPopup(jobName) {
  window.parent.postMessage({ type: "popup", title: "Critical - Streak Expiring Soon!", text: `Your Streak for ~r~${jobName}~w~ will expire in less than ~r~an hour!` }, "*");
}

function clearExpiredTimestamps() {
  Object.keys(state.timestamps).forEach((job) => {
    const expiryTime = getExpiryFromTimestamp(state.timestamps[job]);
    if (expiryTime && Date.now() > expiryTime) {
      delete state.timestamps[job];
      delete state.lastStreaks[job];
    }
  });
}

let cleanupTimer = null;
function startCleanupLoop() {
  if (cleanupTimer) clearInterval(cleanupTimer);

  function cleanupTick() {
    clearExpiredTimestamps();
    applyUI();
    save();
  }

  cleanupTick();
  cleanupTimer = setInterval(cleanupTick, 5000);
}

let expirationWatcher = null;
function startExpirationWatcher() {
  function checkExpirations() {
    const now = Date.now();
    Object.keys(state.visibleJobs).forEach((job) => {
      if (!state.visibleJobs[job]) return;
      const tsRaw = state.timestamps[job];
      if (!tsRaw) return;
      const lastUpdate = new Date(tsRaw);
      if (isNaN(lastUpdate.getTime())) return;

      const expiryTime = getExpiryFromTimestamp(tsRaw);
      if (!expiryTime) return;

      const diff = expiryTime - now;
      if (diff < 12 * 3600000) safeTrigger(triggerMessage, "message", job);
      if (diff < 3600000) safeTrigger(triggerPopup, "popup", job);
    });
  }

  if (expirationWatcher) clearInterval(expirationWatcher);

  const intervalSelect = document.getElementById("expirationInterval");
  if (!intervalSelect) return;
  const minutes = parseInt(intervalSelect.value || "10", 10);
  if (minutes > 0) {
    checkExpirations();
    expirationWatcher = setInterval(checkExpirations, minutes * 60 * 1000);
  }
}

/* --------------------------
   Settings / manual controls
-------------------------- */
function toggleSettings() {
  if (!settingsPanel || !appWindow) return;

  if (settingsPanel.style.display === "block") {
    settingsPanel.style.display = "none";
    appWindow.style.height = "";
  } else {
    settingsPanel.style.display = "block";

    const totalRequiredHeight = titleBar.offsetHeight + tableContainer.offsetHeight + settingsFooter.offsetHeight + settingsPanel.scrollHeight + 20;
    if (totalRequiredHeight > appWindow.clientHeight) appWindow.style.height = totalRequiredHeight + "px";
    updateSettingsMaxHeight();
    settingsPanel.scrollTop = 0;
  }
}

if (darkModeToggleSettings) darkModeToggleSettings.addEventListener("change", (e) => { state.darkMode = e.target.checked; applyUI(); save(); });
if (opacitySliderSettings) opacitySliderSettings.addEventListener("input", (e) => { state.opacity = parseFloat(e.target.value); applyUI(); save(); });
if (timeFormatToggle) timeFormatToggle.addEventListener("change", (e) => { state.use24h = e.target.checked; applyUI(); save(); });
if (expiresFormatSelect) expiresFormatSelect.addEventListener("change", (e) => { state.expiresFormat = e.target.value; applyUI(); save(); });

if (trackSOTDCheckbox) {
  trackSOTDCheckbox.checked = !!state.trackSOTD;
  trackSOTDCheckbox.addEventListener("change", (e) => { state.trackSOTD = e.target.checked; applyUI(); save(); });
}
if (alwaysOnTopCheckbox) {
  alwaysOnTopCheckbox.checked = !!state.alwaysOnTop;
  alwaysOnTopCheckbox.addEventListener("change", (e) => { state.alwaysOnTop = e.target.checked; applyUI(); save(); });
}
if (timestampJobSelect) {
  timestampJobSelect.value = state.timestampJob || timestampJobSelect.value;
  timestampJobSelect.addEventListener("change", (e) => { state.timestampJob = e.target.value; save(); });
}

// Job toggles - set initial and persist
document.querySelectorAll(".job-toggle").forEach((chk) => {
  chk.checked = state.visibleJobs[chk.dataset.job] ?? true;
  chk.addEventListener("change", () => {
    state.visibleJobs[chk.dataset.job] = chk.checked;
    save();
    updateSettingsMaxHeight();
    applyUI();
  });
});

function manualTimestampJob() {
  const job = timestampJobSelect?.value;
  if (!job) return;
  state.timestamps[job] = new Date().toISOString();
  applyUI();
  save();
}

function manualResetJob() {
  const job = timestampJobSelect?.value;
  if (!job) return;
  delete state.timestamps[job];
  delete state.lastStreaks[job];
  applyUI();
  save();
}

/* --------------------------
   Drag / window position
-------------------------- */
let drag = false, offsetX = 0, offsetY = 0;
if (titleBar && appWindow) {
  titleBar.addEventListener("mousedown", (e) => {
    drag = true;
    offsetX = e.clientX - appWindow.offsetLeft;
    offsetY = e.clientY - appWindow.offsetTop;
    document.body.style.userSelect = "none";
  });
}

document.addEventListener("mouseup", () => {
  if (drag) {
    drag = false;
    document.body.style.userSelect = "auto";
    if (appWindow) {
      state.windowPos.left = appWindow.offsetLeft;
      state.windowPos.top = appWindow.offsetTop;
      save();
    }
  }
});

document.addEventListener("mousemove", (e) => {
  if (drag && appWindow) {
    appWindow.style.left = e.clientX - offsetX + "px";
    appWindow.style.top = e.clientY - offsetY + "px";
  }
});

/* --------------------------
   Reopen / close
-------------------------- */
function openWindow() {
  if (!appWindow) return;
  appWindow.style.display = "block";
  restoreAppState();
  updateReopenButton();
  appWindow.style.height = "auto";
}

function restoreAppState() {
  load();
  ensureVisibleJobs();

  if (!appWindow) return;

  // Restore position
  if (state.windowPos) {
    appWindow.style.left = state.windowPos.left + "px";
    appWindow.style.top = state.windowPos.top + "px";
  }

  // Restore size
  if (state.windowSize) {
    appWindow.style.width = state.windowSize.width + "px";
    appWindow.style.height = state.windowSize.height + "px";
  }

  // Restore controls from state
  restoreControlsFromState();

  // Apply UI: timestamps, dark mode, countdown, etc
  applyUI();

  // Force scale/font adjustments
  adjustFontSize();
  updateSettingsMaxHeight();
}
function closeWindow() {
  if (!appWindow) return;
  appWindow.style.display = "none";
  updateReopenButton();
}

function updateReopenButton() {
  if (!reopenBtn || !appWindow) return;
  reopenBtn.style.display = appWindow.style.display === "none" ? "block" : "none";
}
if (reopenBtn) reopenBtn.addEventListener("click", openWindow);

/* --------------------------
   Messaging + auto-tracking
-------------------------- */
let lastNotificationTimestamps = {};
let currentJobCandidate = null;
function logDebug(...args) {
  const logEl = document.getElementById("debug-log");
  if (!logEl) return;
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" | ");
  logEl.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

let busNotificationChainRelevant = false;
let potsNotificationChainRelevant = false;
const busRegex = /\[(\d+)\/(\d+)\]/;
const potsRegex = /^Received.*?Fish:\s*(Crab|Lobster)(~[a-z]~)?\.$/i;

window.addEventListener("message", (event) => {
  const payload = event.data;
  if (!(payload && payload.data)) return;

  const alwaysOnTop = alwaysOnTopCheckbox?.checked ?? false;
  const canAutoShow = reopenBtn?.style.display !== "block";
  if (typeof payload.data.tabbed === "boolean" && !alwaysOnTop && canAutoShow) {
    if (appWindow) appWindow.style.display = payload.data.tabbed ? "block" : "none";
  }

  try {
    if (typeof payload.data.status === "string") {
      let statusObj;
      try { statusObj = JSON.parse(payload.data.status); } catch { statusObj = null; }

      if (statusObj && typeof statusObj === "object") {
        const titleRaw = (statusObj.title || "-").replace(/~\w~+/g, "");
        state.title = titleRaw;
        const titleLC = titleRaw.toLowerCase();

        // job detection
        if (titleRaw.includes("R.T.S.")) currentJobCandidate = "RTS Aviator";
        else if (titleRaw.includes("RTS")) currentJobCandidate = "RTS Ground";
        else if (titleLC.includes("firefighter")) currentJobCandidate = "Firefighter";
        else if (titleLC.includes("paramedic")) currentJobCandidate = "Paramedic";
        else if (titleLC.includes("train")) currentJobCandidate = "Conductor";
        else if (titleLC.includes("airline")) currentJobCandidate = "Airline Pilot";
        else if (titleLC.includes("collins")) currentJobCandidate = "Cabbie";
        else if (titleLC.includes("garbage")) currentJobCandidate = "Garbage Collector";
        else if (titleLC.includes("heli")) currentJobCandidate = "Heli Pilot";
        else if (titleLC.includes("mechanic")) currentJobCandidate = "Mechanic";
        else if (titleLC.includes("bus route")) {
          currentJobCandidate = "Bus Driver";
          // attempt to detect chain behaviour
          const firstLine = statusObj.lines && statusObj.lines[0] ? statusObj.lines[0] : "";
          const match = firstLine.match(busRegex);
          if (match) {
            const first = parseInt(match[1], 10);
            const second = parseInt(match[2], 10);
            if (!isNaN(first) && !isNaN(second) && second - first === 0) {
              busNotificationChainRelevant = true; // set correct flag
              setTimeout(() => { //Timeout to avoid false flags
                busNotificationChainRelevant = false;
              }, 1000);
            }
          }
        }
      }
    }

    if (typeof payload.data.notification === "string") {
      const notif = payload.data.notification;
      let relevant = false;

      // Common job notifications
      if (((currentJobCandidate === "RTS Ground" || currentJobCandidate === "RTS Aviator") && /R\.T\.S\.?\s*Score:/i.test(notif)) ||
          (currentJobCandidate === "Firefighter" && /Callout complete/i.test(notif)) ||
          (currentJobCandidate === "Paramedic" && /Great job, earned/i.test(notif)) ||
          (currentJobCandidate === "Conductor" && /Route Complete/i.test(notif)) ||
          (currentJobCandidate === "Airline Pilot" && /Delivery Successful/i.test(notif)) ||
          (currentJobCandidate === "Cabbie" && /Delivery Successful/i.test(notif)) ||
          (currentJobCandidate === "Garbage Collector" && /Finished Route/i.test(notif)) ||
          (currentJobCandidate === "Heli Pilot" && /Bonus Check/i.test(notif)) ||
          (currentJobCandidate === "Mechanic" && /Delivery successful/i.test(notif))) {
        relevant = true;
      }

      // Bus driver chain logic
      if (currentJobCandidate === "Bus Driver" && busNotificationChainRelevant && /fare/i.test(notif)) {
        busNotificationChainRelevant = false;
        relevant = true;
      }

      // Pot fishing logic (two-step)
      if (!relevant && !potsNotificationChainRelevant && potsRegex.test(notif)) {
        potsNotificationChainRelevant = true;
        setTimeout(() => { //Timeout to avoid false flags
          potsNotificationChainRelevant = false;
        }, 350);
      } else if (potsNotificationChainRelevant && /Fishing/i.test(notif)) {
        relevant = true;
        potsNotificationChainRelevant = false;
        currentJobCandidate = "Pot Fishing";
      }

      if (relevant) {
        const job = currentJobCandidate;
        const lastNotifTime = lastNotificationTimestamps[job] || 0;
        const now = Date.now();
        if (now - lastNotifTime > 1000) {
          lastNotificationTimestamps[job] = now;
          state.timestamps[job] = new Date().toISOString();
          state.lastStreaks[job] = (state.lastStreaks[job] || 0) + 1;

          const cell = jobCells[job];
          if (cell) {
            cell.classList.remove("highlight");
            void cell.offsetWidth; // force reflow
            cell.classList.add("highlight");
          }

          clearExpiredTimestamps();
          save();
          applyUI();
        }
      }
    }
  } catch (e) {
    console.error("Message handler error:", e);
  }
});

/* --------------------------
   Pin shortcut
-------------------------- */
function setupPinShortcut() {
  function onKeyDown(e) {
    const tgt = e.target || e.srcElement;
    const tag = tgt && tgt.tagName && tgt.tagName.toUpperCase();
    const isEditable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt?.isContentEditable;
    if (isEditable) return;
    if (e.key === "Escape" || e.key === "Esc") {
      if (e.repeat) return;
      e.preventDefault();
      try { window.parent.postMessage({ type: "pin" }, "*"); } catch {}
    }
  }

  document.removeEventListener("keydown", onKeyDown);
  document.addEventListener("keydown", onKeyDown);
}

/* --------------------------
   Scaling logic
-------------------------- */
const contentContainer = document.querySelector(".content");
function adjustFontSize() {
  if (!appWindow || !contentContainer) return;
  const scale = Math.min(appWindow.clientWidth / 500, appWindow.clientHeight / 100);
  const fontSize = Math.max(0.8, scale);
  contentContainer.style.fontSize = `${fontSize}em`;

  document.querySelectorAll("input, select").forEach((el) => {
    if (el.type === "checkbox" || el.type === "radio") {
      el.style.transform = `scale(${fontSize})`;
      el.style.transformOrigin = "top left";
      el.style.margin = `${2 * fontSize}px`;
    } else if (el.type === "range") {
      el.style.height = `${20 * fontSize}px`;
    } else {
      el.style.fontSize = `${fontSize}em`;
    }
  });
}

function updateSettingsMaxHeight() {
  if (!settingsPanel || !appWindow || !titleBar || !tableContainer || !settingsFooter) return;

  settingsPanel.style.height = "auto";
  const windowHeight = appWindow.clientHeight;
  const titleHeight = titleBar.offsetHeight;
  const tableContainerHeight = tableContainer.offsetHeight;
  const settingsFooterHeight = settingsFooter.offsetHeight;
  const padding = 20;
  const availableHeight = windowHeight - titleHeight - tableContainerHeight - settingsFooterHeight - padding;

  settingsPanel.style.height = Math.max(availableHeight, 50) + "px";
}

let settingsResizeTimeout = null;
try {
  const resizeObserver = new ResizeObserver(() => {
    adjustFontSize();
    if (!appWindow) return;
    state.windowSize.width = appWindow.offsetWidth;
    state.windowSize.height = appWindow.offsetHeight;
    if (settingsPanel && settingsPanel.style.display === "block") {
      if (settingsResizeTimeout) clearTimeout(settingsResizeTimeout);
      settingsResizeTimeout = setTimeout(() => updateSettingsMaxHeight(), 50);
    }
  });
  if (appWindow) resizeObserver.observe(appWindow);
} catch (e) {
  // ResizeObserver may not be supported in some contexts
}

// Initial adjustments
adjustFontSize();
updateSettingsMaxHeight();

/* --------------------------
   Boot
-------------------------- */
let expirationDebounce = null;
window.onload = () => {
  restoreAppState();
  setupPinShortcut();
  startExpirationWatcher();
  startCleanupLoop();

  const intervalSelect = document.getElementById("expirationInterval");
  if (intervalSelect) {
    intervalSelect.addEventListener("change", () => {
      if (expirationDebounce) clearTimeout(expirationDebounce);
      expirationDebounce = setTimeout(() => { startExpirationWatcher(); }, 200);
    });
  }

  // Always auto-close settings on init
  if (settingsPanel) settingsPanel.style.display = "none";
  if (appWindow) appWindow.style.height = "auto";
};

