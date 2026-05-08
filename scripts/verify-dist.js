const fs = require("fs");
const path = require("path");

const appJs = path.join(__dirname, "..", "dist", "app.js");
if (!fs.existsSync(appJs)) {
  console.error("[verify-dist] dist/app.js missing; run npm run build");
  process.exit(1);
}
const { size } = fs.statSync(appJs);
if (size < 8000) {
  console.error("[verify-dist] dist/app.js unexpectedly small:", size);
  process.exit(1);
}
console.log("[verify-dist] ok", path.basename(appJs), size, "bytes");
