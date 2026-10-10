import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const weightCountingOptions = queryOptions({
  queryKey: ['weight-counting'],
  queryFn: async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error('Sessão expirada. Entre novamente.');
    const userId = auth.user.id;
    const items = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('itens').select('id, produto, part_number, designacao').order('produto').order('id').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      items.push(...data);
      if (data.length < 1000) break;
    }
    const { data: weights, error } = await supabase.from('item_pesos').select('*').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return { items, weights, userId };
  },
});