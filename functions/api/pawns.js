// โค้ด API /api/pawns พร้อมระบบจัดการ Error ให้ปลอดภัยยิ่งขึ้น
export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;

    // ตรวจสอบว่ามี Binding DB หรือไม่
    if (!env.DB) {
        return new Response(JSON.stringify({ error: "D1 Binding 'DB' not found" }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        // 1. ดึงรายการสัญญาทั้งหมด (GET)
        if (method === "GET") {
            const { results } = await env.DB.prepare("SELECT * FROM pawns ORDER BY id DESC").all();
            return new Response(JSON.stringify(results || []), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // 2. สร้างสัญญาใหม่ (POST)
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

        // 3. แก้ไขข้อมูลสัญญา / ต่อดอก / ไถ่ถอน (PUT)
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

        // 4. ลบสัญญา (DELETE)
        if (method === "DELETE") {
            const url = new URL(request.url);
            const id = url.searchParams.get("id");

            await env.DB.prepare("DELETE FROM pawns WHERE id = ?").bind(id).run();

            return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" }
            });
        }

        return new Response("Method not allowed", { status: 405 });

    } catch (err) {
        // หากเกิดข้อผิดพลาด ให้ส่งรายละเอียดกลับมาเพื่อตรวจสอบง่ายขึ้น
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
