import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedModels = new Set([
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
]);

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed." },
      {
        status: 405,
        headers: corsHeaders,
      },
    );
  }

  const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  if (!geminiApiKey) {
    return Response.json(
      { error: "Missing GEMINI_API_KEY secret." },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }

  let payload: { model?: string; body?: unknown };

  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  const model = payload.model?.trim();

  if (!model || !allowedModels.has(model)) {
    return Response.json(
      { error: "Unsupported Gemini model." },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  if (!payload.body || typeof payload.body !== "object") {
    return Response.json(
      { error: "Missing Gemini request body." },
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify(payload.body),
      },
    );

    const responseText = await response.text();

    return new Response(responseText, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown proxy error.";

    return Response.json(
      { error: message },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
