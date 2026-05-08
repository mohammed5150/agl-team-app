import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const lines = fs.readFileSync(path.join(ROOT, "app.jsx"), "utf8").split("\n");

// 838-1556: App(); 1668-4163: ChPw … AnnCard
const appFn = lines.slice(837, 1556).join("\n");
const rest = lines.slice(1667, 4163).join("\n");

const header = `import {
  SECTIONS, LEAVE_TYPES, STATUS_COLORS, STATUS_LABELS, MONTHS, SHIFT_HOURS,
  DOC_TYPES, ANN_PRIORITIES, theme,
} from "./src/constants.js";
import { NE, NM } from "./src/nav.js";
import {
  RATING_KEYS, gradeFromRating, TIERS, TIER_COLORS, TIERS_CAP, TIER_CAP_COLORS,
} from "./src/rating.js";
import {
  ROLE_CODES, ROLE_ORDER, designationToRoleCode, TRAINING_CATALOG,
} from "./src/trainingCatalog.js";
import {
  INITIAL_EMPLOYEES, TEAMLEAD_USER, MANAGER_USER,
  INITIAL_LEAVE_REQUESTS, INITIAL_ANNOUNCEMENTS, nfId, INITIAL_NOTIFICATIONS,
} from "./src/seedData.js";
import {
  parseCSV, nextEmpId, cH, certSt, fmtDt, daysInRange,
} from "./src/helpers.js";
import {
  supa, subscribePush, unsubscribePush, sendPush,
  empToDb, empFromDb, lrToDb, lrFromDb, annToDb, annFromDb, nfToDb, nfFromDb,
  diffById, pushSupported,
} from "./src/supabasePortal.js";
import {
  Logo, ib, Bd, Bt, SC2, Sec, Fd, Modal, Empty,
} from "./src/uiPrimitives.jsx";
import { LoginPage } from "./src/LoginPage.jsx";
import { ErrorBoundary } from "./src/ErrorBoundary.jsx";

const { useState, useCallback, useMemo, useEffect, useRef, useId } = React;

`;

const render = `
/* ============================================================
   RENDER
   ============================================================ */

const reactRootEl = document.getElementById("root");
if (reactRootEl) {
  const root = ReactDOM.createRoot(reactRootEl);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

// Register service worker for PWA install capability
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
`;

const out = `${header}\n${appFn}\n\n${rest}\n\n${render}\n`;
fs.writeFileSync(path.join(ROOT, "app.jsx"), out);
console.log("assembled app.jsx, lines:", out.split("\n").length);
