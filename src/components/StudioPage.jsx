import { theme } from "../constants.js";
import { ib, Bt, Bd, Sec, Modal, Empty } from "../uiPrimitives.jsx";
import { blankChecklistItem, MAX_TITLE_LENGTH } from "../studioPages.js";
import { Ic } from "./icons.jsx";

const { useState } = React;

/* ============================================================
   TEAM STUDIO — shared wiki-style pages (SOP notes, shift
   handover notes). A page is a title plus an ordered list of
   small blocks (heading / text / checklist) rather than a full
   rich-text document.
   ============================================================ */

let blockKeySeq = 0;
const nextBlockKey = () => `b${Date.now()}-${blockKeySeq++}`;

const BLANK_FORM = () => ({ title:"", blocks:[], pinned:false });

export function StudioPg({ user, pages, onAdd, onUpdate, onDel }) {
  const canEdit = user.role === "manager" || user.role === "teamlead";
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM());
  const [errors, setErrors] = useState([]);
  const [viewing, setViewing] = useState(null);

  const pinned = pages.filter(p => p.pinned);
  const regular = pages.filter(p => !p.pinned);

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK_FORM());
    setErrors([]);
    setShowForm(true);
  };

  const openEdit = (page) => {
    setEditingId(page.id);
    setForm({
      title: page.title,
      blocks: page.blocks.map(b => ({
        ...b, _k: nextBlockKey(),
        items: b.items ? b.items.map(it => ({ ...it, _k: nextBlockKey() })) : undefined,
      })),
      pinned: page.pinned,
    });
    setErrors([]);
    setViewing(null);
    setShowForm(true);
  };

  const addBlock = (type) => {
    setForm(p => ({ ...p, blocks: [...p.blocks, type === "checklist"
      ? { _k: nextBlockKey(), type, items: [{ ...blankChecklistItem(), _k: nextBlockKey() }] }
      : { _k: nextBlockKey(), type, text: "" }] }));
  };
  const removeBlock = (k) => setForm(p => ({ ...p, blocks: p.blocks.filter(b => b._k !== k) }));
  const updateBlockText = (k, text) => setForm(p => ({ ...p, blocks: p.blocks.map(b => b._k === k ? { ...b, text } : b) }));
  const addChecklistItem = (k) => setForm(p => ({ ...p, blocks: p.blocks.map(b =>
    b._k === k ? { ...b, items: [...b.items, { ...blankChecklistItem(), _k: nextBlockKey() }] } : b) }));
  const updateChecklistItem = (k, ik, patch) => setForm(p => ({ ...p, blocks: p.blocks.map(b =>
    b._k === k ? { ...b, items: b.items.map(it => it._k === ik ? { ...it, ...patch } : it) } : b) }));
  const removeChecklistItem = (k, ik) => setForm(p => ({ ...p, blocks: p.blocks.map(b =>
    b._k === k ? { ...b, items: b.items.filter(it => it._k !== ik) } : b) }));

  const submit = () => {
    const result = editingId ? onUpdate(editingId, form) : onAdd(form);
    if (!result.ok) { setErrors(result.errors); return; }
    setShowForm(false);
    setForm(BLANK_FORM());
    setEditingId(null);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:22, fontWeight:700, color:theme.tx, margin:0 }}>Team Studio</h2>
        {canEdit && <Bt onClick={openCreate} bg={theme.or}><Ic name="plus" size={14} />New Page</Bt>}
      </div>

      {showForm && (
        <StudioForm
          form={form} setForm={setForm} errors={errors} editing={!!editingId}
          addBlock={addBlock} removeBlock={removeBlock} updateBlockText={updateBlockText}
          addChecklistItem={addChecklistItem} updateChecklistItem={updateChecklistItem} removeChecklistItem={removeChecklistItem}
          onSubmit={submit} onClose={() => setShowForm(false)}
        />
      )}

      {viewing && (
        <Modal title={viewing.title} onClose={() => setViewing(null)} width={680}>
          <div style={{ fontSize:11, color:theme.td, marginBottom:14 }}>
            {viewing.authorName || "Unknown"} • updated {fmtShort(viewing.updatedAt)}
          </div>
          <StudioBlockViewer blocks={viewing.blocks} />
          {canEdit && (
            <div style={{ display:"flex", gap:8, marginTop:18 }}>
              <Bt onClick={() => openEdit(viewing)}><Ic name="pencil" size={13} />Edit</Bt>
              <Bt outline={true} bg={theme.rd} onClick={() => { onDel(viewing.id); setViewing(null); }}>
                <Ic name="trash" size={13} />Delete
              </Bt>
            </div>
          )}
        </Modal>
      )}

      {pinned.length > 0 && (
        <Sec title="Pinned" icon={<Ic name="pin" size={15} />}>
          {pinned.map(p => <StudioCard key={p.id} page={p} onOpen={() => setViewing(p)} />)}
        </Sec>
      )}

      {regular.length > 0
        ? <Sec title="All Pages" icon={<Ic name="book" size={15} />}>
            {regular.map(p => <StudioCard key={p.id} page={p} onOpen={() => setViewing(p)} />)}
          </Sec>
        : pinned.length === 0 && <Empty icon={<Ic name="book" size={32} />} text="No pages yet" />}
    </div>
  );
}

const StudioCard = React.memo(function StudioCard({ page, onOpen }) {
  const preview = (page.blocks.find(b => b.type !== "checklist" && b.text)?.text || "").slice(0, 140);
  return (
    <button type="button" onClick={onOpen} style={{
      display:"block", width:"100%", textAlign:"left", background:theme.ch, border:"none",
      borderRadius:12, padding:16, marginBottom:10, cursor:"pointer", color:"inherit", font:"inherit"
    }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        {page.pinned && <Ic name="pin" size={12} />}
        <div style={{ fontSize:14, fontWeight:700, color:theme.tx }}>{page.title}</div>
        <Bd text={`${page.blocks.length} block${page.blocks.length === 1 ? "" : "s"}`} color={theme.pl} />
      </div>
      <div style={{ fontSize:10, color:theme.td, marginTop:4 }}>
        {page.authorName || "Unknown"} • updated {fmtShort(page.updatedAt)}
      </div>
      {preview && <div style={{ fontSize:12, color:theme.ts, marginTop:8, lineHeight:1.5 }}>{preview}</div>}
    </button>
  );
});

function StudioBlockViewer({ blocks }) {
  if (!blocks.length) return <Empty text="This page is empty" />;
  return (
    <div>
      {blocks.map((b, i) => {
        if (b.type === "heading") return <h4 key={i} style={{ fontSize:15, fontWeight:700, color:theme.tx, margin:"14px 0 6px" }}>{b.text}</h4>;
        if (b.type === "checklist") return (
          <div key={i} style={{ marginBottom:10 }}>
            {b.items.map((it, j) => (
              <label key={j} style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:13, color:theme.ts, marginBottom:6 }}>
                <input type="checkbox" checked={!!it.checked} disabled style={{ marginTop:3, width:16, height:16, accentColor:theme.or }} />
                <span style={{ textDecoration: it.checked ? "line-through" : "none", opacity: it.checked ? 0.6 : 1 }}>{it.text}</span>
              </label>
            ))}
          </div>
        );
        return <p key={i} style={{ fontSize:13, color:theme.ts, lineHeight:1.6, whiteSpace:"pre-wrap", margin:"0 0 10px" }}>{b.text}</p>;
      })}
    </div>
  );
}

function StudioForm({ form, setForm, errors, editing, addBlock, removeBlock, updateBlockText, addChecklistItem, updateChecklistItem, removeChecklistItem, onSubmit, onClose }) {
  return (
    <Modal title={editing ? "Edit Page" : "New Page"} onClose={onClose} width={680}>
      {errors.length > 0 && (
        <div style={{ background:"rgba(239,68,68,0.1)", borderRadius:8, padding:"8px 12px", marginBottom:12, color:theme.rd, fontSize:12 }}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      <div style={{ marginBottom:12 }}>
        <label style={{ display:"block", fontSize:10, color:theme.td, fontWeight:700, marginBottom:5 }}>TITLE</label>
        <input value={form.title} maxLength={MAX_TITLE_LENGTH}
          onChange={e => setForm(p => ({ ...p, title:e.target.value }))}
          placeholder="e.g. LVO Shift Handover — Night" style={ib} />
      </div>

      <div style={{ marginBottom:12 }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:theme.ts, cursor:"pointer" }}>
          <input type="checkbox" checked={form.pinned}
            onChange={e => setForm(p => ({ ...p, pinned:e.target.checked }))}
            style={{ width:16, height:16, accentColor:theme.or }} />
          Pin to top
        </label>
      </div>

      <div style={{ marginBottom:14 }}>
        {form.blocks.map(b => (
          <BlockEditor key={b._k} block={b}
            onText={t => updateBlockText(b._k, t)}
            onRemove={() => removeBlock(b._k)}
            onAddItem={() => addChecklistItem(b._k)}
            onItemChange={(ik, patch) => updateChecklistItem(b._k, ik, patch)}
            onItemRemove={ik => removeChecklistItem(b._k, ik)}
          />
        ))}
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
        <Bt small outline={true} onClick={() => addBlock("heading")}><Ic name="plus" size={12} />Heading</Bt>
        <Bt small outline={true} onClick={() => addBlock("text")}><Ic name="plus" size={12} />Text</Bt>
        <Bt small outline={true} onClick={() => addBlock("checklist")}><Ic name="plus" size={12} />Checklist</Bt>
      </div>

      <div style={{ display:"flex", gap:8 }}>
        <Bt onClick={onSubmit} bg={theme.gn}><Ic name="save" size={13} />Save</Bt>
        <Bt onClick={onClose} outline={true}>Cancel</Bt>
      </div>
    </Modal>
  );
}

function BlockEditor({ block, onText, onRemove, onAddItem, onItemChange, onItemRemove }) {
  return (
    <div style={{ background:theme.ch, borderRadius:10, padding:12, marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <Bd text={block.type.toUpperCase()} color={theme.pl} />
        <button type="button" aria-label="Remove block" onClick={onRemove} style={{
          background:"none", border:"none", color:theme.td, cursor:"pointer", padding:4
        }}><Ic name="trash" size={14} /></button>
      </div>

      {block.type === "checklist" ? (
        <div>
          {block.items.map(it => (
            <div key={it._k} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <input type="checkbox" checked={!!it.checked}
                onChange={e => onItemChange(it._k, { checked:e.target.checked })}
                style={{ width:16, height:16, accentColor:theme.or, flexShrink:0 }} />
              <input value={it.text} onChange={e => onItemChange(it._k, { text:e.target.value })}
                placeholder="Checklist item" style={{ ...ib, padding:"6px 10px" }} />
              <button type="button" aria-label="Remove item" onClick={() => onItemRemove(it._k)} style={{
                background:"none", border:"none", color:theme.td, cursor:"pointer", padding:4, flexShrink:0
              }}><Ic name="x" size={14} /></button>
            </div>
          ))}
          <Bt small outline={true} onClick={onAddItem}><Ic name="plus" size={11} />Item</Bt>
        </div>
      ) : block.type === "heading" ? (
        <input value={block.text} onChange={e => onText(e.target.value)}
          placeholder="Heading" style={{ ...ib, fontWeight:700 }} />
      ) : (
        <textarea value={block.text} onChange={e => onText(e.target.value)}
          placeholder="Write here..." rows={4} style={{ ...ib, resize:"vertical", fontFamily:"inherit" }} />
      )}
    </div>
  );
}

function fmtShort(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day:"2-digit", month:"short", year:"numeric" });
}
