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
        // 1. GET: ดึงข้อมูลประวัติการต่อดอก
        if (method === "GET") {
            const url = new URL(request.url);
            const pawnId = url.searchParams.get("pawn_id");

            let query = "";
            let results = [];

            if (pawnId) {
                // กรณีดึงเฉพาะสัญญาหนึ่ง (ใช้ใน History Modal)
                query = "SELECT * FROM interest_logs WHERE pawn_id = ? ORDER BY id DESC";
                const res = await env.DB.prepare(query).bind(pawnId).all();
                results = res.results || [];
            } else {
                // กรณีดึงประวัติทั้งหมดของร้านสำหรับหน้า Dashboard (JOIN ข้อมูลลูกค้าและสินค้า)
                query = `
                    SELECT 
                        interest_logs.*,
                        pawns.customer_name,
                        pawns.item_name,
                        pawns.principal
                    FROM interest_logs
                    LEFT JOIN pawns ON interest_logs.pawn_id = pawns.id
                    ORDER BY interest_logs.id DESC
                `;
                const res = await env.DB.prepare(query).all();
                results = res.results || [];
            }

            return new Response(JSON.stringify(results), {
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        // 2. POST: บันทึกรายการต่อดอกใหม่
        if (method === "POST") {
            const data = await request.json();
            const { pawn_id, paid_date, paid_time, interest_amount, fine_amount, total_paid, previous_due_date, new_due_date } = data;

            await env.DB.prepare(`
                INSERT INTO interest_logs (pawn_id, paid_date, paid_time, interest_amount, fine_amount, total_paid, previous_due_date, new_due_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                parseInt(pawn_id),
                paid_date,
                paid_time,
                parseFloat(interest_amount),
                parseFloat(fine_amount || 0),
                parseFloat(total_paid),
                previous_due_date || '',
                new_due_date
            ).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        // 3. PUT: แก้ไขยอดเงินในประวัติ
        if (method === "PUT") {
            const data = await request.json();
            const { id, interest_amount, fine_amount, total_paid } = data;

            await env.DB.prepare(`
                UPDATE interest_logs
                SET interest_amount = ?, fine_amount = ?, total_paid = ?
                WHERE id = ?
            `).bind(
                parseFloat(interest_amount),
                parseFloat(fine_amount || 0),
                parseFloat(total_paid),
                parseInt(id)
            ).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json; charset=utf-8" }
            });
        }

        // 4. DELETE: ลบประวัติการต่อดอก พร้อม Rollback วันครบกำหนด
        if (method === "DELETE") {
            const url = new URL(request.url);
            const logId = url.searchParams.get("id");

            if (!logId) {
                return new Response(JSON.stringify({ error: "Missing log id" }), { status: 400 });
            }

            const log = await env.DB.prepare("SELECT * FROM interest_logs WHERE id = ?").bind(parseInt(logId)).first();

            if (log) {
                if (log.previous_due_date) {
                    await env.DB.prepare("UPDATE pawns SET due_date = ? WHERE id = ?").bind(log.previous_due_date, log.pawn_id).run();
                } else {
                    const pawn = await env.DB.prepare("SELECT contract_days FROM pawns WHERE id = ?").bind(log.pawn_id).first();
                    if (pawn && log.new_due_date) {
                        const parts = log.new_due_date.split('-');
                        const d = new Date(parts[0], parts[1] - 1, parts[2]);
                        d.setDate(d.getDate() - pawn.contract_days);
                        const fallbackDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        await env.DB.prepare("UPDATE pawns SET due_date = ? WHERE id = ?").bind(fallbackDate, log.pawn_id).run();
                    }
                }

                await env.DB.prepare("DELETE FROM interest_logs WHERE id = ?").bind(parseInt(logId)).run();
            }

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
