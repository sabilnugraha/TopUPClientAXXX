import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const FUNCTION_NAMES: Record<string, string> = {
  APLL: 'fn_daily_topup_leave_apll',
  CORI: 'fn_topup_AL_Corinthian_daily',
};

// GET /api/function-def?company=APLL|CORI
export async function GET(req: NextRequest) {
  const company = req.nextUrl.searchParams.get('company') ?? 'APLL';
  const fnName  = FUNCTION_NAMES[company];

  if (!fnName) {
    return NextResponse.json({ error: `Unknown company: ${company}` }, { status: 400 });
  }

  try {
    const rows = await query<{ def: string; lang: string; args: string }>(
      `SELECT
         pg_get_functiondef(p.oid)            AS def,
         l.lanname                             AS lang,
         pg_get_function_arguments(p.oid)     AS args
       FROM pg_proc p
       JOIN pg_language l ON l.oid = p.prolang
       WHERE p.proname = $1
       LIMIT 1`,
      [fnName]
    );

    if (!rows.length) {
      return NextResponse.json({ error: `Function "${fnName}" not found` }, { status: 404 });
    }

    return NextResponse.json({
      company,
      functionName: fnName,
      language: rows[0].lang,
      args:     rows[0].args,
      definition: rows[0].def,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
