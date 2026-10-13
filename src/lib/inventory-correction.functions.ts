import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const correctInventoryQuantity = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ inventoryId: z.string().uuid(), rowId: z.string().uuid(), quantity: z.number().finite().nonnegative(), updatedAt: z.string() }))
  .handler(async ({ data, context }) => {
    const inventory = await context.supabase.from('inventarios').select('id').eq('id', data.inventoryId).eq('user_id', context.userId).single();
    if (inventory.error) throw new Error('Inventário não encontrado.');
    const row = await context.supabase.from('inventario_itens').select('*').eq('id', data.rowId).eq('inventario_id', data.inventoryId).single();
    if (row.error) throw new Error('Item não encontrado.');
    const difference = data.quantity - Number(row.data.quantidade_un_sistema);
    const value = difference * Number(row.data.preco_medio_pond);
    if (!Number.isFinite(difference) || !Number.isFinite(value)) throw new Error('Quantidade inválida.');
    const saved = await context.supabase.from('inventario_itens').update({ quantidade_contada: data.quantity, diferenca: difference, valor_divergencia: value, contado: true })
      .eq('id', data.rowId).eq('inventario_id', data.inventoryId).eq('updated_at', data.updatedAt).select('*').maybeSingle();
    if (saved.error) throw new Error(saved.error.message);
    if (!saved.data) throw new Error('Este item foi alterado por outra contagem. Recarregue a página antes de editar.');
    return saved.data;
  });