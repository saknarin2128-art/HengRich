// ==========================================
// Cloudflare Pages Function: Interest Logs API
// File: functions/api/interest-logs.js
// ==========================================

export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;

    if (!env.DB) {
        return new Response(JSON.stringify({ success: false, error: "Database binding missing" }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }

    try {
        // 1. GET: ดึงประวัติการต่อดอกตาม pawn_id
        if (method === "GET") {
            const url = new URL(request.url);
            const pawnId = url.searchParams.get("pawn_id");

            if (!pawnId) {
                return new Response(JSON.stringify({ error: "Missing pawn_id" }), { status: 400 });
            }

            const { results } = await env.DB.prepare(
                "SELECT * FROM interest_logs WHERE pawn_id = ? ORDER BY id DESC"
            ).bind(pawnId).all();

            return new Response(JSON.stringify(results || []), {
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        // 2. POST: บันทึกรายการต่อดอกใหม่
        if (method === "POST") {
            const data = await request.json();
            const { pawn_id, paid_date, paid_time, interest_amount, fine_amount, total_paid, new_due_date } = data;

            await env.DB.prepare(`
                INSERT INTO interest_logs (pawn_id, paid_date, paid_time, interest_amount, fine_amount, total_paid, new_due_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(
                parseInt(pawn_id),
                paid_date,
                paid_time,
                parseFloat(interest_amount),
                parseFloat(fine_amount || 0),
                parseFloat(total_paid),
                new_due_date
            ).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        return new Response("Method Not Allowed", { status: 405 });
    } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" }
        });
    }
}
