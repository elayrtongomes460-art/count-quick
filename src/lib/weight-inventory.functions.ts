import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { countByWeight } from './weight-counting';
import { readAllPages } from './paged-read';

export const listWeightInventories = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ includeFinalized: z.boolean().default(false) }).default({ includeFinalized: false }))
  .handler(async ({ context, data: options }) => {
    const { data, error } = await context.supabase.from('inventarios').select('*').eq('user_id', context.userId).in('status', options.includeFinalized ? ['Em andamento', 'Finalizado'] : ['Em andamento']).order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    const profile = await context.supabase.from('profiles').select('nome').eq('id', context.userId).maybeSingle();
    return { inventories: data, responsible: profile.data?.nome ?? '' };
  });

export const getWeightInventory = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const inventory = await context.supabase.from('inventarios').select('*').eq('id', data.id).eq('user_id', context.userId).single();
    if (inventory.error) throw new Error('Inventário não encontrado.');
    const items = await readAllPages((from, to) => context.supabase.from('inventario_itens').select('*').eq('inventario_id', data.id).order('produto').order('id').range(from, to));
    return { inventory: inventory.data, items };
  });

export const startWeightInventory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1), responsible: z.string().trim().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), observation: z.string() }))
  .handler(async ({ data, context }) => {
    const { data: inventory, error } = await context.supabase.from('inventarios').insert({ nome_inventario: data.name, responsavel: data.responsible, data: data.date, observacao: data.observation.trim() || null, status: 'Em andamento', user_id: context.userId }).select('id').single();
    if (error) throw new Error(error.message);
    return inventory;
  });

export const saveWeightInventoryItem = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ inventoryId: z.string().uuid(), itemId: z.string().uuid(), grossG: z.number().finite().nonnegative(), replace: z.boolean().default(false) }))
  .handler(async ({ data, context }) => {
    const inventory = await context.supabase.from('inventarios').select('status,origem_itens').eq('id', data.inventoryId).eq('user_id', context.userId).single();
    if (inventory.error || !['Em andamento', 'Finalizado'].includes(inventory.data.status)) throw new Error('Selecione um inventário válido.');
    const finalized = inventory.data.status === 'Finalizado';
    const item = await context.supabase.from('itens').select('*').eq('id', data.itemId).single();
    if (item.error) throw new Error('Produto não encontrado.');
    const weight = await context.supabase.from('item_pesos').select('*').eq('user_id', context.userId).eq('item_id', data.itemId).single();
    if (weight.error) throw new Error('Cadastre a tara e o peso da peça antes de salvar.');
    const result = countByWeight(data.grossG, Number(weight.data.tara_recipiente_g), Number(weight.data.peso_unitario_g));
    if (!result || !Number.isSafeInteger(result.quantity)) throw new Error('Pesagem inválida.');
    const existing = await context.supabase.from('inventario_itens').select('*').eq('inventario_id', data.inventoryId).eq('produto', item.data.produto).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data && !finalized && !['legado', 'livre'].includes(inventory.data.origem_itens)) throw new Error('Este produto não foi selecionado para o inventário.');
    if (existing.data?.contado && !data.replace) return { needsConfirmation: true, quantity: result.quantity };
    const zeroReference = finalized || inventory.data.origem_itens === 'livre';
    const baseline = Number(existing.data?.quantidade_un_sistema ?? (zeroReference ? 0 : item.data.quantidade_un));
    const price = Number(existing.data?.preco_medio_pond ?? (zeroReference ? 0 : item.data.preco_medio_pond));
    const difference = result.quantity - baseline;
    const payload = { inventario_id: data.inventoryId, item_id: item.data.id, produto: item.data.produto, part_number: existing.data?.part_number ?? item.data.part_number, designacao: existing.data?.designacao ?? item.data.designacao, quantidade_un_sistema: baseline, unidade_un: existing.data?.unidade_un ?? item.data.unidade_un, localizacao: existing.data?.localizacao ?? (zeroReference ? '' : item.data.localizacao), preco_medio_pond: price, quantidade_contada: result.quantity, diferenca: difference, valor_divergencia: difference * price, contado: true };
    const saved = await context.supabase.from('inventario_itens').upsert(payload, { onConflict: 'inventario_id,produto' });
    if (saved.error) throw new Error(saved.error.message);
    return { needsConfirmation: false, quantity: result.quantity };
  });

export const finishWeightInventory = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), signatures: z.array(z.string().startsWith('data:image/png;base64,').max(1000000)).length(2) }))
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await context.supabase.from('inventarios').update({ status: 'Finalizado', finalized_at: new Date().toISOString(), assinatura: data.signatures[0], assinatura_supervisor: data.signatures[1] }).eq('id', data.id).eq('user_id', context.userId).eq('status', 'Em andamento').select('id').single();
    if (error) throw new Error('Não foi possível finalizar o inventário.');
    return saved;
  });