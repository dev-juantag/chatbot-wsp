import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ssmmjezafbtopkpwmazz.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function PUT(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const body = await req.json();
    const { role, password } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
    }

    // Update role in public.users
    if (role) {
      const { error: dbError } = await supabaseAdmin
        .from('users')
        .update({ role })
        .eq('id', userId);
      if (dbError) throw new Error(dbError.message);

      // Update role in auth.users metadata
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role }
      });
    }

    // Update password if provided
    if (password && password.length >= 6) {
      const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password
      });
      if (pwError) throw new Error(pwError.message);
    }

    return NextResponse.json({ success: true, message: 'Usuario actualizado correctamente.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error actualizando usuario' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
    }

    // 1. Delete from public.users first (FK constraint)
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);
    if (dbError) throw new Error(dbError.message);

    // 2. Delete from Supabase Auth (cascades identity/session)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) throw new Error(authError.message);

    return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente.' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error eliminando usuario' }, { status: 500 });
  }
}
