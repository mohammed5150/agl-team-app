// Team Studio — shared wiki-style pages (SOP notes, shift handover notes).
//
// A page is a title plus an ordered list of small blocks instead of a single
// free-text body, so a page can hold a checklist next to a note without a
// rich-text editor or a markup language to parse and sanitize:
//   { type: "heading",   text }
//   { type: "text",      text }
//   { type: "checklist", items: [{ text, checked }] }
//
// sanitizeStudioPage is the one place that decides what is savable, so the
// same rule applies whether a page is created, edited, or arrives from a
// future bulk-import path.

export const STUDIO_BLOCK_TYPES = ["heading", "text", "checklist"];
export const MAX_TITLE_LENGTH = 200;
export const MAX_BLOCK_TEXT_LENGTH = 4000;
export const MAX_CHECKLIST_ITEMS = 50;
export const MAX_BLOCKS_PER_PAGE = 100;

export function blankChecklistItem(text = "") {
  return { text: text.trim().slice(0, MAX_BLOCK_TEXT_LENGTH), checked: false };
}

/**
 * Drop empty blocks and empty checklist items, and cap lengths so one page
 * cannot grow without bound. Unknown block types are dropped rather than
 * crashing the renderer on a future schema change.
 */
export function sanitizeStudioBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .slice(0, MAX_BLOCKS_PER_PAGE)
    .map(b => {
      if (!b || !STUDIO_BLOCK_TYPES.includes(b.type)) return null;
      if (b.type === "checklist") {
        const items = (Array.isArray(b.items) ? b.items : [])
          .slice(0, MAX_CHECKLIST_ITEMS)
          .map(it => ({
            text: String(it?.text || "").trim().slice(0, MAX_BLOCK_TEXT_LENGTH),
            checked: !!it?.checked,
          }))
          .filter(it => it.text);
        return items.length ? { type: "checklist", items } : null;
      }
      const text = String(b.text || "").trim().slice(0, MAX_BLOCK_TEXT_LENGTH);
      return text ? { type: b.type, text } : null;
    })
    .filter(Boolean);
}

/**
 * Validate a page before it is submitted.
 *
 * @param {object} form { title, blocks }
 */
export function validateStudioPage(form) {
  const errors = [];
  const title = (form?.title || "").trim();
  const blocks = sanitizeStudioBlocks(form?.blocks);

  if (!title) errors.push("Give the page a title");
  else if (title.length > MAX_TITLE_LENGTH) errors.push(`Keep the title under ${MAX_TITLE_LENGTH} characters`);

  if (!blocks.length) errors.push("Add at least one block with content");

  return { ok: errors.length === 0, errors, title, blocks };
}
