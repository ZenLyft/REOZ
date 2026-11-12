import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Founder sign-in required.' }, { status: 401 });
    }

    const body = await req.json();
    const admin = createAdminClient();
    const action = String(body.action || '');

    if (action === 'create_invoice') {
      const projectId = String(body.project_id || '');
      const amountInr = Math.round(Number(body.amount_inr) || 0);
      const dueDate = String(
        body.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      );

      if (!projectId || amountInr <= 0) {
        return NextResponse.json(
          { error: 'Valid project and positive invoice amount (INR) are required.' },
          { status: 400 }
        );
      }

      const { data: project, error: projErr } = await admin
        .from('projects')
        .select('id, client_id, name')
        .eq('id', projectId)
        .single();

      if (projErr || !project) {
        return NextResponse.json({ error: 'Selected project not found.' }, { status: 404 });
      }

      const invoiceNumber = `ZL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const { data: invoice, error: invErr } = await admin
        .from('invoices')
        .insert({
          client_id: project.client_id,
          project_id: project.id,
          invoice_number: invoiceNumber,
          amount_inr: amountInr,
          status: 'issued',
          due_date: dueDate,
        })
        .select('*, clients(organisation_name), projects(name, service_line), payments(*)')
        .single();

      if (invErr || !invoice) {
        return NextResponse.json({ error: invErr?.message || 'Failed to issue invoice' }, { status: 500 });
      }

      await logAuditEvent({
        actorType: 'user',
        actorId: user.id,
        action: 'invoice.issued',
        objectType: 'invoices',
        objectId: invoice.id,
        result: 'success',
        metadata: { invoice_number: invoiceNumber, amount_inr: amountInr, project_id: project.id },
      });

      revalidatePath('/dashboard/revenue');
      revalidatePath('/dashboard');

      return NextResponse.json({ success: true, invoice });
    }

    if (action === 'record_payment') {
      const invoiceId = String(body.invoice_id || '');
      const paymentReference = String(body.payment_reference || '').trim();
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!invoiceId || !paymentReference) {
        return NextResponse.json(
          { error: 'Invoice ID and bank/UPI transaction reference are required.' },
          { status: 400 }
        );
      }

      const { data: invoice, error: invErr } = await admin
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (invErr || !invoice) {
        return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
      }

      if (invoice.status === 'paid') {
        return NextResponse.json({ error: 'Invoice is already marked paid.' }, { status: 400 });
      }

      const amountReceivedInr = Math.max(1, Math.round(Number(body.amount_received_inr) || invoice.amount_inr));
      const nowIso = new Date().toISOString();

      const { data: payment, error: payErr } = await admin
        .from('payments')
        .insert({
          invoice_id: invoice.id,
          amount_received_inr: amountReceivedInr,
          received_at: nowIso,
          payment_reference: paymentReference,
          notes,
        })
        .select()
        .single();

      if (payErr) {
        return NextResponse.json({ error: payErr.message }, { status: 500 });
      }

      const { data: updatedInvoice, error: updErr } = await admin
        .from('invoices')
        .update({ status: 'paid', paid_at: nowIso })
        .eq('id', invoice.id)
        .select('*, clients(organisation_name), projects(name, service_line), payments(*)')
        .single();

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }

      await logAuditEvent({
        actorType: 'user',
        actorId: user.id,
        action: 'payment.verified_recorded',
        objectType: 'payments',
        objectId: payment.id,
        result: 'success',
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          amount_received_inr: amountReceivedInr,
          payment_reference: paymentReference,
        },
      });

      revalidatePath('/dashboard/revenue');
      revalidatePath('/dashboard');

      return NextResponse.json({ success: true, payment, invoice: updatedInvoice });
    }

    return NextResponse.json({ error: 'Unsupported revenue action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to process revenue request';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

