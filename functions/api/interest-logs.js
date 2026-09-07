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
        // 1. GET: ดึงประวัติการต่อดอก
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

        // 2. POST: บันทึกรายการต่อดอกใหม่ (พร้อมบันทึก previous_due_date)
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

        // 4. DELETE: ลบประวัติการต่อดอก พร้อมย้อนวันครบกำหนด (Rollback due_date)
        if (method === "DELETE") {
            const url = new URL(request.url);
            const logId = url.searchParams.get("id");

            if (!logId) {
                return new Response(JSON.stringify({ error: "Missing log id" }), { status: 400 });
            }

            // 4.1 ค้นหารายละเอียดของประวัติรายการที่จะลบ
            const log = await env.DB.prepare("SELECT * FROM interest_logs WHERE id = ?").bind(parseInt(logId)).first();

            if (log) {
                // 4.2 ถ้ามี previous_due_date บันทึกไว้ ให้ย้อนวันครบกำหนดใน pawns กลับไปเป็นวันเดิม
                if (log.previous_due_date) {
                    await env.DB.prepare("UPDATE pawns SET due_date = ? WHERE id = ?").bind(log.previous_due_date, log.pawn_id).run();
                } else {
                    // กรณีเป็นข้อมูลเก่าที่ไม่มี previous_due_date ให้ดึง contract_days มาคำนวณย้อนกลับ
                    const pawn = await env.DB.prepare("SELECT contract_days FROM pawns WHERE id = ?").bind(log.pawn_id).first();
                    if (pawn && log.new_due_date) {
                        const parts = log.new_due_date.split('-');
                        const d = new Date(parts[0], parts[1] - 1, parts[2]);
                        d.setDate(d.getDate() - pawn.contract_days);
                        const fallbackDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        await env.DB.prepare("UPDATE pawns SET due_date = ? WHERE id = ?").bind(fallbackDate, log.pawn_id).run();
                    }
                }

                // 4.3 ทำการลบรายการประวัตินั้นออกจาก interest_logs
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
