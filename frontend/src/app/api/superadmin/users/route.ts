import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, role, tenantId } = body;

    if (!email || !role || !tenantId) {
      return NextResponse.json({ error: 'Faltan campos obligatorios (email, role, tenantId)' }, { status: 400 });
    }

    const authHeader = req.headers.get('authorization') || '';

    // Llamar al backend Express en servidor (Node.js interno 127.0.0.1:3001)
    let res = await fetch("http://127.0.0.1:3001/api/superadmin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify({ email, password, role, tenantId })
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch("http://localhost:3001/api/superadmin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        },
        body: JSON.stringify({ email, password, role, tenantId })
      }).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const errJson = res ? await res.json().catch(() => ({})) : {};
    return NextResponse.json({ error: errJson.error || 'Error conectando con el backend servidor.' }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
