import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    let res = await fetch("http://127.0.0.1:3001/api/superadmin/tenants", {
      headers: { "Authorization": authHeader }
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch("https://api.chatbot.techtag.dev/api/superadmin/tenants", {
        headers: { "Authorization": authHeader }
      }).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: 'No se pudo cargar negocios desde el servidor' }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const authHeader = req.headers.get('authorization') || '';

    let res = await fetch("http://127.0.0.1:3001/api/superadmin/tenants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader
      },
      body: JSON.stringify(body)
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch("https://api.chatbot.techtag.dev/api/superadmin/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        },
        body: JSON.stringify(body)
      }).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const errJson = res ? await res.json().catch(() => ({})) : {};
    return NextResponse.json({ error: errJson.error || 'No se pudo crear el negocio' }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
