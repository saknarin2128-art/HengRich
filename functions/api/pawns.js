// ==========================================
// API Handling for Pawnshop Application
// File Path: functions/api/pawns.js
// ==========================================

export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;

    // ตรวจสอบว่า Binding ตัวแปร DB ถูกต้องหรือไม่
    if (!env.DB) {
        return new Response(JSON.stringify({ 
            success: false, 
            error: "D1 Database Binding 'DB' is missing. Please check Cloudflare Settings." 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        // 1. HTTP GET: ดึงสัญญาทั้งหมดเรียงจากรายการล่าสุด
        if (method === "GET") {
            const { results } = await env.DB.prepare("SELECT * FROM pawns ORDER BY id DESC").all();
            return new Response(JSON.stringify(results || []), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // 2. HTTP POST: เพิ่มสัญญาฝากสินค้าใหม่
        if (method === "POST") {
            const data = await request.json();
            const { customer_name, phone, item_name, principal, interest_rate, contract_days, start_date, due_date, grace_days } = data;

            await env.DB.prepare(`
                INSERT INTO pawns (customer_name, phone, item_name, principal, interest_rate, contract_days, start_date, due_date, grace_days, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'กำลังจำนำ')
            `).bind(
                customer_name || '',
                phone || '',
                item_name || '',
                parseFloat(principal || 0),
                parseFloat(interest_rate || 5),
                parseInt(contract_days || 10),
                start_date,
                due_date,
                parseInt(grace_days || 7)
            ).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // 3. HTTP PUT: อัปเดตข้อมูลสัญญา / ต่อดอกเบี้ย / ไถ่ถอน
        if (method === "PUT") {
            const data = await request.json();
            const { id, customer_name, phone, item_name, principal, interest_rate, contract_days, start_date, due_date, grace_days, status } = data;

            await env.DB.prepare(`
                UPDATE pawns 
                SET customer_name = ?, phone = ?, item_name = ?, principal = ?, interest_rate = ?, contract_days = ?, start_date = ?, due_date = ?, grace_days = ?, status = ?
                WHERE id = ?
            `).bind(
                customer_name,
                phone || '',
                item_name,
                parseFloat(principal),
                parseFloat(interest_rate),
                parseInt(contract_days),
                start_date,
                due_date,
                parseInt(grace_days || 7),
                status,
                id
            ).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // 4. HTTP DELETE: ลบสัญญา
        if (method === "DELETE") {
            const url = new URL(request.url);
            const id = url.searchParams.get("id");

            await env.DB.prepare("DELETE FROM pawns WHERE id = ?").bind(id).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Method Not Allowed", { status: 405 });

    } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
