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
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS")
  || "https://auh-adb-portal.netlify.app,http://localhost:8080").split(",")
  .map(v => v.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null) {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (origin && !corsHeaders(origin)) return json(null, { error: "origin not allowed" }, 403);
  if (req.method === "OPTIONS") {
    const headers = corsHeaders(origin);
    return headers
      ? new Response("ok", { headers })
      : new Response("ok", { headers: { "Vary": "Origin" } });
  }
  if (req.method !== "POST") return json(origin, { error: "method not allowed" }, 405);
  if (!OPENAI_API_KEY) return json(origin, { error: "OPENAI_API_KEY is not configured" }, 500);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const token = getBearerToken(authHeader);
    if (!token) return json(origin, { error: "unauthorized" }, 401);
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    const userEmail = authData?.user?.email?.trim().toLowerCase() || "";
    if (authError || !userEmail) return json(origin, { error: "unauthorized" }, 401);

    const { data: employee, error: employeeError } = await sb
      .from("employees")
      .select("id, email, role, section")
      .ilike("email", userEmail)
      .maybeSingle();

    if (employeeError) throw employeeError;
    if (!employee) return json(origin, { error: "employee not found" }, 403);
    if (employee.role !== "manager" && employee.role !== "teamlead") {
      return json(origin, { error: "forbidden" }, 403);
    }

    const body = await req.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const target = typeof body?.target === "string" ? body.target.trim() : "all";
    const priority = typeof body?.priority === "string" ? body.priority.trim() : "info";

    if (!prompt) return json(origin, { error: "prompt is required" }, 400);
    if (prompt.length > 1500) return json(origin, { error: "prompt is too long" }, 400);

    const draft = await createDraft({
      prompt,
      target,
      priority,
      authorRole: employee.role,
      authorSection: employee.section || "",
    });

    return json(origin, { draft });
  } catch (e: any) {
    console.error("[draft-announcement] fatal:", e);
    return json(origin, { error: "Draft generation failed" }, 500);
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

function getBearerToken(authHeader: string) {
  if (!/^Bearer\s+/i.test(authHeader)) return "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function json(origin: string | null, obj: unknown, status = 200) {
  const cors = corsHeaders(origin);
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...(cors || { "Vary": "Origin" }),
      "Content-Type": "application/json",
    },
  });
}
