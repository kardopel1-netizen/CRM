/**
 * Local SMS/WhatsApp webhook mock for NOTIFY_PROVIDER=http.
 *
 *   node scripts/sms-mock-server.mjs
 *   # listens on http://127.0.0.1:4099/sms
 *
 * Then in .env:
 *   NOTIFY_PROVIDER=http
 *   NOTIFY_WEBHOOK_URL=http://127.0.0.1:4099/sms
 *   NOTIFY_WEBHOOK_TOKEN=dev-sms-token
 *   NOTIFY_CHANNEL=SMS
 *
 * Restart `npm run dev` after changing .env.
 */

import http from "node:http";

const PORT = Number(process.env.SMS_MOCK_PORT || 4099);
const TOKEN = process.env.NOTIFY_WEBHOOK_TOKEN || process.env.SMS_MOCK_TOKEN || "dev-sms-token";
const log = [];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          ok: true,
          service: "sms-mock",
          post: "/sms",
          received: log.length,
          recent: log.slice(-20),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (req.method === "POST" && url.pathname === "/sms") {
    const auth = req.headers.authorization || "";
    const key = req.headers["x-api-key"];
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (TOKEN && bearer !== TOKEN && key !== TOKEN) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { raw };
    }

    const entry = {
      at: new Date().toISOString(),
      to: body.to || body.phone,
      kind: body.kind,
      channel: body.channel,
      body: body.body,
      id: body.id,
    };
    log.push(entry);
    console.log(`[sms-mock] → ${entry.to} | ${entry.kind} | ${String(entry.body || "").slice(0, 80)}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        messageId: `mock-${Date.now()}`,
        providerRef: `sms-mock:${log.length}`,
      }),
    );
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`SMS mock listening on http://127.0.0.1:${PORT}/sms`);
  console.log(`Token: ${TOKEN}`);
  console.log(`GET  http://127.0.0.1:${PORT}/  — recent messages`);
});
