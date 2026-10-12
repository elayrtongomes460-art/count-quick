import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { readAllPages } from '@/lib/paged-read';

export const inventorySetupCatalog = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [items, profile] = await Promise.all([
    readAllPages((from, to) => context.supabase.from('itens').select('id,produto,part_number,designacao,especificacoes,unidade_un').order('produto').order('id').range(from, to)),
    context.supabase.from('profiles').select('nome').eq('id', context.userId).maybeSingle(),
  ]);
  return { items, responsible: profile.data?.nome ?? '' };
});

const rowSchema = z.object({
  produto: z.string().trim().min(1).max(200), part_number: z.string().max(200), designacao: z.string().max(2000), especificacoes: z.string().max(5000),
  quantidade_un: z.number().finite().nonnegative(), unidade_un: z.string().max(50), localizacao: z.string().max(500), preco_medio_pond: z.number().finite().nonnegative(), observacao: z.string().max(5000),
});
export const createInventoryWithItems = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(200), responsible: z.string().trim().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), observation: z.string().max(5000), source: z.enum(['manual', 'excel']), rows: z.array(rowSchema).max(10000), createMissing: z.boolean() }))
  .handler(async ({ data, context }) => {
    if (!data.rows.length) {
      const result = await context.supabase.from('inventarios').insert({ nome_inventario: data.name, responsavel: data.responsible, data: data.date, observacao: data.observation, status: 'Em andamento', user_id: context.userId, origem_itens: 'livre' }).select('id').single();
      if (result.error) throw new Error('Não foi possível iniciar o inventário.');
      return { id: result.data.id };
    }
    if (new Set(data.rows.map(row => row.produto)).size !== data.rows.length) throw new Error('Há códigos repetidos na seleção.');
    const result = await context.supabase.rpc('create_inventory_with_items', {
      p_inventory: { name: data.name, responsible: data.responsible, date: data.date, observation: data.observation, source: data.source },
      p_rows: data.rows, p_create_missing: data.createMissing,
    });
    if (result.error) throw new Error(result.error.message);
    return { id: result.data };
  });