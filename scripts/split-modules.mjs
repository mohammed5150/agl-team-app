import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const appPath = path.join(ROOT, "app.jsx");
const lines = fs.readFileSync(appPath, "utf8").split("\n");
const srcDir = path.join(ROOT, "src");
fs.mkdirSync(srcDir, { recursive: true });

function grab(a, b) {
  return lines.slice(a - 1, b).join("\n");
}

fs.writeFileSync(
  path.join(srcDir, "trainingCatalog.js"),
  `// Extracted from app.jsx — AUH AFM Training Need Analysis Matrix 2026
${grab(383, 408)
  .replace(/^const ROLE_CODES/, "export const ROLE_CODES")
  .replace(/^const ROLE_ORDER/, "export const ROLE_ORDER")
  .replace(/^const designationToRoleCode/, "export const designationToRoleCode")
}

${grab(410, 463).replace(/^const TRAINING_CATALOG/, "export const TRAINING_CATALOG")}
`
);

console.log("ok: src/trainingCatalog.js");

const seedBody = grab(81, 285);
fs.writeFileSync(
  path.join(srcDir, "seedData.js"),
  `import { P12, P8, PHD, PSY, gR } from "./rosterPatterns.js";

${seedBody}
`
);

const navBody = grab(291, 314);
fs.writeFileSync(
  path.join(srcDir, "nav.js"),
  `${navBody.replace(/^const NE/, "export const NE").replace(/^const NM/, "export const NM")}
`
);

const ratingBody = grab(316, 340);
fs.writeFileSync(
  path.join(srcDir, "rating.js"),
  `${ratingBody.replace(/^const RATING_KEYS/, "export const RATING_KEYS").replace(/^const gradeFromRating/, "export const gradeFromRating").replace(/^const TIERS/, "export const TIERS").replace(/^const TIER_COLORS/, "export const TIER_COLORS").replace(/^const TIERS_CAP/, "export const TIERS_CAP").replace(/^const TIER_CAP_COLORS/, "export const TIER_CAP_COLORS")}
`
);

const helpersCore = grab(345, 380) + "\n\n" + grab(469, 509);
fs.writeFileSync(
  path.join(srcDir, "helpers.js"),
  `import { theme, SHIFT_HOURS } from "./constants.js";

${helpersCore.replace(/^function parseCSV/, "export function parseCSV").replace(/^function nextEmpId/, "export function nextEmpId").replace(/^const cH/, "export const cH").replace(/^const certSt/, "export const certSt").replace(/^const fmtDt/, "export const fmtDt").replace(/^const daysInRange/, "export const daysInRange")}
`
);

const supaBlock = grab(655, 832);
fs.writeFileSync(
  path.join(srcDir, "supabasePortal.js"),
  `${supaBlock.replace(/^const SUPABASE_URL/, "export const SUPABASE_URL").replace(/^const SUPABASE_KEY/, "export const SUPABASE_KEY").replace(/^const supa/, "export const supa").replace(/^const VAPID_PUBLIC_KEY/, "export const VAPID_PUBLIC_KEY").replace(/^function urlBase64ToUint8Array/, "export function urlBase64ToUint8Array").replace(/^const pushSupported/, "export const pushSupported").replace(/^async function subscribePush/, "export async function subscribePush").replace(/^async function unsubscribePush/, "export async function unsubscribePush").replace(/^async function sendPush/, "export async function sendPush").replace(/^const empToDb/, "export const empToDb").replace(/^const empFromDb/, "export const empFromDb").replace(/^const lrToDb/, "export const lrToDb").replace(/^const lrFromDb/, "export const lrFromDb").replace(/^const annToDb/, "export const annToDb").replace(/^const annFromDb/, "export const annFromDb").replace(/^const nfToDb/, "export const nfToDb").replace(/^const nfFromDb/, "export const nfFromDb").replace(/^function diffById/, "export function diffById")}
`
);

console.log("ok: seedData, nav, rating, helpers, supabasePortal");
