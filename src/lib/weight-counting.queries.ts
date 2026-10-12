import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { readAllPages } from '@/lib/paged-read';

export const weightCountingOptions = queryOptions({
  queryKey: ['weight-counting'],
  staleTime: 5 * 60 * 1000,
  queryFn: async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error('Sessão expirada. Entre novamente.');
    const userId = auth.user.id;
    const [items, weightsResult] = await Promise.all([
      readAllPages((from, to) => supabase.from('itens').select('id, produto, part_number, designacao, quantidade_un, unidade_un, localizacao, preco_medio_pond').order('produto').order('id').range(from, to)),
      supabase.from('item_pesos').select('*').eq('user_id', userId),
    ]);
    const { data: weights, error } = weightsResult;
    if (error) throw new Error(error.message);
    return { items, weights, userId };
  },
});