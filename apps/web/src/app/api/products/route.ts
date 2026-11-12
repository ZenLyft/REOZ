import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ZENLYFT_PRODUCT_CATALOGUE } from '@/lib/crm/products';
import { logAuditEvent } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: rows } = await admin.from('products').select('*').order('minimum_approved_price_inr', { ascending: true });

    if (!rows || rows.length === 0) {
      // Seed authoritative catalogue into Supabase once so toggles persist cleanly
      const seedPayload = ZENLYFT_PRODUCT_CATALOGUE.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        category_label: p.category_label,
        description: p.description,
        target_customer: p.target_customer,
        problems_solved: p.problems_solved,
        features: p.features,
        deliverables: p.deliverables,
        pricing_model: p.pricing_model,
        minimum_approved_price_inr: p.minimum_approved_price_inr,
        recommended_price_inr: p.recommended_price_inr,
        maximum_approved_discount_percent: p.maximum_approved_discount_percent,
        implementation_time_days: p.implementation_time_days,
        payment_terms: p.payment_terms,
        maintenance_options: p.maintenance_options,
        demo_available: p.demo_available,
        is_active: p.is_active,
      }));
      await admin.from('products').upsert(seedPayload, { onConflict: 'id' });
      return NextResponse.json({ success: true, products: ZENLYFT_PRODUCT_CATALOGUE });
    }

    const dbById = new Map(rows.map((r) => [r.id, r]));
    const merged = ZENLYFT_PRODUCT_CATALOGUE.map((base) => {
      const dbRow = dbById.get(base.id);
      return dbRow ? { ...base, is_active: Boolean(dbRow.is_active) } : base;
    });

    return NextResponse.json({ success: true, products: merged });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load products';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const productId = String(body.id || '').trim();
    const isActive = Boolean(body.is_active);
    const catalogItem = ZENLYFT_PRODUCT_CATALOGUE.find((p) => p.id === productId);

    if (!catalogItem) {
      return NextResponse.json({ error: 'Unknown product ID' }, { status: 404 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('products').upsert(
      {
        id: catalogItem.id,
        name: catalogItem.name,
        category: catalogItem.category,
        category_label: catalogItem.category_label,
        description: catalogItem.description,
        target_customer: catalogItem.target_customer,
        problems_solved: catalogItem.problems_solved,
        features: catalogItem.features,
        deliverables: catalogItem.deliverables,
        pricing_model: catalogItem.pricing_model,
        minimum_approved_price_inr: catalogItem.minimum_approved_price_inr,
        recommended_price_inr: catalogItem.recommended_price_inr,
        maximum_approved_discount_percent: catalogItem.maximum_approved_discount_percent,
        implementation_time_days: catalogItem.implementation_time_days,
        payment_terms: catalogItem.payment_terms,
        maintenance_options: catalogItem.maintenance_options,
        demo_available: catalogItem.demo_available,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      actorType: 'user',
      actorId: user.id,
      action: isActive ? 'product.activated' : 'product.deactivated',
      objectType: 'products',
      objectId: productId,
      result: 'success',
      metadata: { is_active: isActive },
    });

    revalidatePath('/dashboard/products');
    return NextResponse.json({ success: true, id: productId, is_active: isActive });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update product';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

