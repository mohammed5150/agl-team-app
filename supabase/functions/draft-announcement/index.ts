// Supabase Edge Function: draft-announcement
// Generates an announcement draft with OpenAI for managers and team leads.
//
// Required secrets:
//   OPENAI_API_KEY  - server-side OpenAI API key
// Optional secrets:
//   OPENAI_MODEL    - defaults to gpt-4.1-mini if unset
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by the platform.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY is not configured" }, 500);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userEmail = getJwtEmail(authHeader);
    if (!userEmail) return json({ error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: employee, error: employeeError } = await sb
      .from("employees")
      .select("id, email, role, section")
      .ilike("email", userEmail)
      .maybeSingle();

    if (employeeError) throw employeeError;
    if (!employee) return json({ error: "employee not found" }, 403);
    if (employee.role !== "manager" && employee.role !== "teamlead") {
      return json({ error: "forbidden" }, 403);
    }

    const body = await req.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const target = typeof body?.target === "string" ? body.target.trim() : "all";
    const priority = typeof body?.priority === "string" ? body.priority.trim() : "info";

    if (!prompt) return json({ error: "prompt is required" }, 400);
    if (prompt.length > 1500) return json({ error: "prompt is too long" }, 400);

    const draft = await createDraft({
      prompt,
      target,
      priority,
      authorRole: employee.role,
      authorSection: employee.section || "",
    });

    return json({ draft });
  } catch (e: any) {
    console.error("[draft-announcement] fatal:", e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

async function createDraft({
  prompt,
  target,
  priority,
  authorRole,
  authorSection,
}: {
  prompt: string;
  target: string;
  priority: string;
  authorRole: string;
  authorSection: string;
}) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You draft internal workplace announcements for an airport maintenance team portal.",
            "Return strict JSON with only: title, message.",
            "Title must be concise and under 80 characters.",
            "Message must be practical, clear, and ready to post to staff.",
            "Do not invent critical facts that were not requested.",
            "If the prompt is vague, write a safe generic draft and avoid unsupported details.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Audience target: ${target}.`,
            `Priority: ${priority}.`,
            `Requester role: ${authorRole}.`,
            authorSection ? `Requester section: ${authorSection}.` : "",
            `Draft request: ${prompt}`,
          ].filter(Boolean).join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const parsed = parseDraft(content);
  if (!parsed.title || !parsed.message) throw new Error("OpenAI returned an invalid draft");
  return parsed;
}

function parseDraft(content: string) {
  let parsed: any = {};
  try {
    parsed = JSON.parse(content || "{}");
  } catch {
    parsed = {};
  }
  return {
    title: String(parsed.title || "").trim().slice(0, 80),
    message: String(parsed.message || "").trim().slice(0, 4000),
  };
}

function getJwtEmail(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return "";
  const parts = token.split(".");
  if (parts.length < 2) return "";
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    return String(payload?.email || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
