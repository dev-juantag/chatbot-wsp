import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const OPENWA_API_URL = process.env.OPENWA_API_URL || 'http://localhost:2785/api';
    
    // Consultamos la API de sesiones de OpenWA
    const res = await fetch(`${OPENWA_API_URL}/sessions`, {
      headers: {
        'x-api-key': 'owa_k1_342430d11a4dc3573f73bf941ce0686676af09a8f29208cf50c12251eb32c1f9'
      }
    });

    if (!res.ok) {
      return NextResponse.json({ status: 'disconnected', error: `OpenWA devolvió ${res.status}` }, { status: 500 });
    }

    const sessions = await res.json();
    
    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ status: 'disconnected' });
    }

    // Usamos la primera sesión disponible
    const session = sessions[0];
    
    if (session.status === 'ready') {
      return NextResponse.json({
        status: 'ready',
        sessionId: session.id,
        phone: session.phone,
        pushName: session.pushName
      });
    }

    // Si está escaneando QR, podemos devolver el estado
    return NextResponse.json({
      status: session.status,
      sessionId: session.id
    });

  } catch (error: any) {
    console.error("Error consultando estado de OpenWA:", error);
    return NextResponse.json({ status: 'disconnected', error: error?.message || 'Error' }, { status: 500 });
  }
}
