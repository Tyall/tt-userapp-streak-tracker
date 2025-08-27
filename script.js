/* --------------------------
   Elements
-------------------------- */
const appWindow = document.getElementById("appWindow");
const titleBar = document.getElementById("titleBar");
const settingsPanel = document.getElementById("settings-panel");
const reopenBtn = document.getElementById("reopenBtn");
const expiresHeader = document.getElementById("expires-header");

// Job elements
const ffLastEl = document.getElementById("ff-last"),
  ffExpEl = document.getElementById("ff-expires");
const pmLastEl = document.getElementById("pm-last"),
  pmExpEl = document.getElementById("pm-expires");
const rtsGroundLastEl = document.getElementById("rts-ground-last"),
  rtsGroundExpEl = document.getElementById("rts-ground-expires");
const rtsAviatorLastEl = document.getElementById("rts-aviator-last"),
  rtsAviatorExpEl = document.getElementById("rts-aviator-expires");

// Settings controls
const darkModeToggleSettings = document.getElementById("dark-mode-toggle-settings");
const opacitySliderSettings = document.getElementById("opacity-slider-settings");
const timeFormatToggle = document.getElementById("time-format-toggle");
const timestampJobSelect = document.getElementById("timestamp-job-select");
const expiresFormatSelect = document.getElementById("expires-format-select");
const trackSOTDCheckbox = document.getElementById("track-sotd-checkbox");

/* --------------------------
   State + persistence
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
  visibleJobs: {
    Firefighter: true,
    "RTS Ground": true,
    "RTS Aviator": true,
    Paramedic: true,
  },
  expiresFormat: "countdown",
  rtsCooldown: null,
  rtsListening: false,
  rtsOffTimeout: null,
  trackSOTD: false,
};

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state = { ...state, ...saved };

    // ensure visibleJobs has defaults for any jobs missing from saved state
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

  const dayMonth =
    d.getDate().toString().padStart(2, "0") +
    "/" +
    (d.getMonth() + 1).toString().padStart(2, "0");

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");

  if (state.use24h) {
    hours = hours % 24;
    hours = hours.toString().padStart(2, "0");
    return `${dayMonth} ${hours}:${minutes}:${seconds}`;
  } else {
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${dayMonth} ${displayHour.toString().padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
  }
}

function formatDateTimeDDMM(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "-";

  const dayMonth =
    d.getDate().toString().padStart(2, "0") +
    "/" +
    (d.getMonth() + 1).toString().padStart(2, "0");

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const seconds = d.getSeconds().toString().padStart(2, "0");

  if (state.use24h) {
    // 24-hour format
    hours = hours % 24;
    hours = hours.toString().padStart(2, "0");
    return `${dayMonth} ${hours}:${minutes}:${seconds}`;
  } else {
    // 12-hour format
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    return `${dayMonth} ${displayHour.toString().padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
  }
}

function formatExpires(ts) {
  if (!ts) return "-";
  const lastUpdate = new Date(ts);
  if (isNaN(lastUpdate)) return "-";

  let expiry;
  if (state.trackSOTD) {
    const nextUTC0 = new Date(
      Date.UTC(
        lastUpdate.getUTCFullYear(),
        lastUpdate.getUTCMonth(),
        lastUpdate.getUTCDate() + 1,
        0,
        0,
        0
      )
    );
    expiry = new Date(nextUTC0.getTime() + 48 * 60 * 60 * 1000);
  } else {
    expiry = new Date(lastUpdate.getTime() + 48 * 60 * 60 * 1000);
  }

  if (state.expiresFormat === "timestamp") return formatDateTimeDDMM(expiry);

  const now = new Date();
  const diff = expiry - now;
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 1000 / 60 / 60);
  const m = Math.floor((diff / 1000 / 60) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `${h}h ${m}m ${s}s`;
}

/* --------------------------
   UI application
-------------------------- */
let countdownTimer = null;
let expirationWatcher = null;
let expirationDebounce = null;

function startCountdown() {
  if (countdownTimer) return;
  function tick() {
    if (state.expiresFormat !== "countdown") {
      clearTimeout(countdownTimer);
      countdownTimer = null;
      return;
    }
    updateCountdownLabels();
    countdownTimer = setTimeout(tick, 1000);
  }
  tick();
}

function stopCountdown() {
  if (countdownTimer) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
}

function updateCountdownLabels() {
  const jobs = [
    { name: "Firefighter", expEl: ffExpEl },
    { name: "RTS Ground", expEl: rtsGroundExpEl },
    { name: "RTS Aviator", expEl: rtsAviatorExpEl },
    { name: "Paramedic", expEl: pmExpEl },
  ];
  jobs.forEach((job) => {
    const ts = state.timestamps[job.name] || null;
    job.expEl.textContent = formatExpires(ts);
  });
}

function applyUI() {
  appWindow.style.height = "auto";

  const jobs = [
    { name: "Firefighter", lastEl: ffLastEl, expEl: ffExpEl },
    { name: "RTS Ground", lastEl: rtsGroundLastEl, expEl: rtsGroundExpEl },
    { name: "RTS Aviator", lastEl: rtsAviatorLastEl, expEl: rtsAviatorExpEl },
    { name: "Paramedic", lastEl: pmLastEl, expEl: pmExpEl },
  ];

  const now = Date.now();

  jobs.forEach((job) => {
    const tsRaw = state.timestamps[job.name];
    let ts = null;
    if (tsRaw) {
      const d = new Date(tsRaw);
      if (!isNaN(d.getTime())) ts = d;
    }

    if (job.lastEl) {
      job.lastEl.textContent = formatLastUpdated(tsRaw); // use the formatting function
    }

    if (job.expEl) job.expEl.textContent = formatExpires(tsRaw);

    const row = job.lastEl?.parentElement;
    if (row) {
      row.style.display = state.visibleJobs[job.name] ? "" : "none";

      // Remove previous classes
      row.classList.remove("warning", "critical");

      if (ts) {
        // Calculate expiry time
        let expiry;
        if (state.trackSOTD) {
          const nextUTC0 = new Date(
            Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate() + 1, 0, 0, 0)
          );
          expiry = new Date(nextUTC0.getTime() + 48 * 60 * 60 * 1000);
        } else {
          expiry = new Date(ts.getTime() + 48 * 60 * 60 * 1000);
        }

        const diff = expiry.getTime() - now;

        if (diff < 3600000) {
          // less than 1h
          row.classList.add("critical");
        } else if (diff < 12 * 3600000) {
          // less than 12h
          row.classList.add("warning");
        }
      }
    }
  });

  expiresHeader.textContent =
    state.expiresFormat === "timestamp" ? "Time of expiration" : "Time until expiration";

  document.body.classList.toggle("dark", state.darkMode);
  appWindow.classList.toggle("dark", state.darkMode);
  settingsPanel.classList.toggle("dark", state.darkMode);

  if (opacitySliderSettings) opacitySliderSettings.value = state.opacity ?? 1;
  if (darkModeToggleSettings) darkModeToggleSettings.checked = !!state.darkMode;
  if (timeFormatToggle) timeFormatToggle.checked = !!state.use24h;
  if (expiresFormatSelect) expiresFormatSelect.value = state.expiresFormat;
  appWindow.style.opacity = state.opacity ?? 1;

  updateReopenButton();

  if (state.expiresFormat === "countdown") startCountdown();
  else stopCountdown();
}

/* --------------------------
   Expiration watcher
-------------------------- */
const methodQueues = { message: [], popup: [] };
const methodCooldowns = { message: 0, popup: 0 };

function processQueue(method) {
  const now = Date.now();
  if (methodQueues[method].length === 0) return;
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
  window.parent.postMessage(
    {
      type: "message",
      title: "Streak Expiring Soon!",
      text: `Your Streak for ~y~${jobName}~w~ will expire in less than ~y~12 hours!`,
    },
    "*"
  );
}

function triggerPopup(jobName) {
  window.parent.postMessage(
    {
      type: "popup",
      title: "Critical - Streak Expiring Soon!",
      text: `Your Streak for ~r~${jobName}~w~ will expire in less than ~r~an hour!`,
    },
    "*"
  );
}

function getExpiryTime(ts) {
  if (!ts) return null;
  const lastUpdate = new Date(ts);
  if (isNaN(lastUpdate.getTime())) return null;

  if (state.trackSOTD) {
    const nextUTC0 = new Date(
      Date.UTC(
        lastUpdate.getUTCFullYear(),
        lastUpdate.getUTCMonth(),
        lastUpdate.getUTCDate() + 1,
        0,
        0,
        0
      )
    );
    return nextUTC0.getTime() + 48 * 3600 * 1000;
  } else {
    return lastUpdate.getTime() + 48 * 3600 * 1000;
  }
}

function clearExpiredTimestamps() {
  Object.keys(state.timestamps).forEach((job) => {
    const ts = state.timestamps[job];
    const expiryTime = getExpiryTime(ts);
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

/* --------------------------
   Expiration watcher loop
-------------------------- */
function startExpirationWatcher() {
  function checkExpirations() {
    const now = Date.now();
    const jobs = ["Firefighter", "RTS Ground", "RTS Aviator", "Paramedic"];

    jobs.forEach((job) => {
      const tsRaw = state.timestamps[job];
      if (!tsRaw) return;
      const lastUpdate = new Date(tsRaw);
      if (isNaN(lastUpdate.getTime())) return;

      let expiryTime;
      if (state.trackSOTD) {
        const nextUTC0 = new Date(
          Date.UTC(
            lastUpdate.getUTCFullYear(),
            lastUpdate.getUTCMonth(),
            lastUpdate.getUTCDate() + 1,
            0,
            0,
            0
          )
        );
        expiryTime = nextUTC0.getTime() + 48 * 60 * 60 * 1000;
      } else {
        expiryTime = lastUpdate.getTime() + 48 * 60 * 60 * 1000;
      }

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
  settingsPanel.style.display =
    settingsPanel.style.display === "none" || settingsPanel.style.display === ""
      ? "block"
      : "none";
  appWindow.style.height = "auto";
}

if (darkModeToggleSettings)
  darkModeToggleSettings.addEventListener("change", (e) => {
    state.darkMode = e.target.checked;
    applyUI();
    save();
  });

if (opacitySliderSettings)
  opacitySliderSettings.addEventListener("input", (e) => {
    state.opacity = parseFloat(e.target.value);
    applyUI();
    save();
  });

if (timeFormatToggle)
  timeFormatToggle.addEventListener("change", (e) => {
    state.use24h = e.target.checked;
    applyUI();
    save();
  });

if (expiresFormatSelect)
  expiresFormatSelect.addEventListener("change", (e) => {
    state.expiresFormat = e.target.value;
    applyUI();
    save();
  });

if (trackSOTDCheckbox) {
  trackSOTDCheckbox.checked = !!state.trackSOTD;
  trackSOTDCheckbox.addEventListener("change", (e) => {
    state.trackSOTD = e.target.checked;
    applyUI();
    save();
  });
}

document.querySelectorAll(".job-toggle").forEach((chk) => {
  chk.addEventListener("change", () => {
    state.visibleJobs[chk.dataset.job] = chk.checked;
    applyUI();
    save();
  });
});

function manualTimestampJob() {
  const job = timestampJobSelect.value;
  state.timestamps[job] = new Date().toISOString();
  applyUI();
  save();
}

function manualResetJob() {
  const job = timestampJobSelect.value;
  delete state.timestamps[job];
  delete state.lastStreaks[job];
  applyUI();
  save();
}

/* --------------------------
   Drag / window position
-------------------------- */
let drag = false,
  offsetX = 0,
  offsetY = 0;

titleBar.addEventListener("mousedown", (e) => {
  drag = true;
  offsetX = e.clientX - appWindow.offsetLeft;
  offsetY = e.clientY - appWindow.offsetTop;
  document.body.style.userSelect = "none";
});

document.addEventListener("mouseup", () => {
  if (drag) {
    drag = false;
    document.body.style.userSelect = "auto";
    try {
      localStorage.setItem("windowPos", JSON.stringify({ left: appWindow.offsetLeft, top: appWindow.offsetTop }));
    } catch (e) {}
  }
});

document.addEventListener("mousemove", (e) => {
  if (drag) {
    appWindow.style.left = e.clientX - offsetX + "px";
    appWindow.style.top = e.clientY - offsetY + "px";
  }
});

/* --------------------------
   Reopen / close
-------------------------- */
function openWindow() {
  appWindow.style.display = "block";
  const pos = JSON.parse(localStorage.getItem("windowPos") || "null");
  if (pos) {
    appWindow.style.left = pos.left + "px";
    appWindow.style.top = pos.top + "px";
  }
  updateReopenButton();
}

function closeWindow() {
  appWindow.style.display = "none";
  updateReopenButton();
}

function updateReopenButton() {
  reopenBtn.style.display = appWindow.style.display === "none" ? "block" : "none";
}

/* --------------------------
   Messaging + auto-tracking
-------------------------- */
let lastNotificationTimestamps = {};
let job = null;

window.addEventListener("message", (event) => {
  const payload = event.data;
  if (!(payload && payload.data)) return;

  try {
    if (typeof payload.data.status === "string") {
      let statusObj;
      try {
        statusObj = JSON.parse(payload.data.status);
      } catch {
        statusObj = null;
      }

      if (statusObj && typeof statusObj === "object") {
        const titleRaw = (statusObj.title || "-").replace(/~\w~+/g, "");
        state.title = titleRaw;
        const titleLC = titleRaw.toLowerCase();

        if (titleLC.includes("firefighter")) job = "Firefighter";
        else if (titleLC.includes("paramedic")) job = "Paramedic";
        else if (titleRaw.includes("R.T.S.")) job = "RTS Aviator";
        else if (titleRaw.includes("RTS")) job = "RTS Ground";
      }
    }

    if (job && typeof payload.data.notification === "string") {
      const notif = payload.data.notification;
      let relevant = false;

      if ((job === "RTS Ground" || job === "RTS Aviator") && /R\.T\.S\.?\s*Score:/i.test(notif)) relevant = true;
      else if (job === "Firefighter" && /Callout complete/i.test(notif)) relevant = true;
      else if (job === "Paramedic" && /Great job, earned/i.test(notif)) relevant = true;

      if (relevant) {
        const lastNotifTime = lastNotificationTimestamps[job] || 0;
        const now = Date.now();

        if (now - lastNotifTime > 1000) {
          lastNotificationTimestamps[job] = now;
          state.timestamps[job] = new Date().toISOString();
          state.lastStreaks[job] = (state.lastStreaks[job] || 0) + 1;

          const cellMap = {
            Firefighter: ffLastEl,
            Paramedic: pmLastEl,
            "RTS Ground": rtsGroundLastEl,
            "RTS Aviator": rtsAviatorLastEl,
          };
          const cell = cellMap[job];

          if (cell) {
            cell.classList.remove("highlight");
            void cell.offsetWidth;
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
      try {
        window.parent.postMessage({ type: "pin" }, "*");
      } catch {}
    }
  }

  document.removeEventListener("keydown", onKeyDown);
  document.addEventListener("keydown", onKeyDown);
}

/* --------------------------
   Boot
-------------------------- */
window.onload = () => {
  load();

  if (opacitySliderSettings && !opacitySliderSettings.value) opacitySliderSettings.value = state.opacity ?? 1;

  clearExpiredTimestamps();
  applyUI();
  setupPinShortcut();
  startExpirationWatcher();
  startCleanupLoop();

  const intervalSelect = document.getElementById("expirationInterval");
  if (intervalSelect) {
    intervalSelect.addEventListener("change", () => {
      if (expirationDebounce) clearTimeout(expirationDebounce);
      expirationDebounce = setTimeout(() => {
        startExpirationWatcher();
      }, 200);
    });
  }

  try {
    const pos = JSON.parse(localStorage.getItem("windowPos") || "null");
    if (pos) {
      appWindow.style.left = pos.left + "px";
      appWindow.style.top = pos.top + "px";
    }
  } catch {}
};
