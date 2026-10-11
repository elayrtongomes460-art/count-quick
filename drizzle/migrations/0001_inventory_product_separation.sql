ALTER TABLE public.itens ADD COLUMN IF NOT EXISTS especificacoes text NOT NULL DEFAULT '';
ALTER TABLE public.inventarios ADD COLUMN IF NOT EXISTS origem_itens text NOT NULL DEFAULT 'legado';
ALTER TABLE public.inventario_itens ADD COLUMN IF NOT EXISTS contado boolean NOT NULL DEFAULT true;
ALTER TABLE public.inventario_itens ADD COLUMN IF NOT EXISTS observacao text NOT NULL DEFAULT '';
COMMENT ON COLUMN public.itens.quantidade_un IS 'DEPRECATED for new inventories: reference quantities belong to inventario_itens; retained for compatibility and old workflows.';
COMMENT ON COLUMN public.itens.preco_medio_pond IS 'DEPRECATED for new inventories: prices belong to inventario_itens; retained for compatibility.';
COMMENT ON COLUMN public.itens.localizacao IS 'DEPRECATED for new inventories: locations belong to inventario_itens; retained for compatibility.';
CREATE OR REPLACE FUNCTION public.create_inventory_with_items(p_inventory jsonb, p_rows jsonb, p_create_missing boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid; r jsonb; p public.itens%ROWTYPE; v_code text; v_qty numeric; v_price numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1 OR jsonb_array_length(p_rows) > 10000 THEN RAISE EXCEPTION 'Selecione de 1 a 10000 produtos.'; END IF;
  IF length(trim(p_inventory->>'name')) = 0 OR length(trim(p_inventory->>'responsible')) = 0 OR p_inventory->>'source' NOT IN ('manual','excel') THEN RAISE EXCEPTION 'Identificação inválida.'; END IF;
  INSERT INTO public.inventarios(nome_inventario,responsavel,data,observacao,status,user_id,origem_itens)
  VALUES(trim(p_inventory->>'name'),trim(p_inventory->>'responsible'),(p_inventory->>'date')::date,p_inventory->>'observation','Em andamento',auth.uid(),p_inventory->>'source') RETURNING id INTO v_id;
  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_code := trim(r->>'produto');
    IF v_code IS NULL OR length(v_code) = 0 THEN RAISE EXCEPTION 'Código obrigatório.'; END IF;
    SELECT * INTO p FROM public.itens WHERE produto = v_code;
    IF NOT FOUND THEN
      IF NOT p_create_missing OR length(trim(coalesce(r->>'designacao',''))) = 0 THEN RAISE EXCEPTION 'Produto % não cadastrado: confirme o cadastro automático e informe a descrição.', v_code; END IF;
      INSERT INTO public.itens(produto,part_number,designacao,especificacoes,unidade_un,created_by)
      VALUES(v_code,coalesce(r->>'part_number',''),trim(r->>'designacao'),coalesce(r->>'especificacoes',''),coalesce(nullif(r->>'unidade_un',''),'UN'),auth.uid())
      ON CONFLICT (produto) DO NOTHING;
      SELECT * INTO p FROM public.itens WHERE produto = v_code;
    END IF;
    v_qty := coalesce((r->>'quantidade_un')::numeric,0); v_price := coalesce((r->>'preco_medio_pond')::numeric,0);
    IF v_qty < 0 OR v_price < 0 OR v_qty::text IN ('NaN','Infinity','-Infinity') OR v_price::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Quantidade e valor inválidos.'; END IF;
    INSERT INTO public.inventario_itens(inventario_id,item_id,produto,part_number,designacao,quantidade_un_sistema,unidade_un,localizacao,preco_medio_pond,quantidade_contada,diferenca,valor_divergencia,contado,observacao)
    VALUES(v_id,p.id,p.produto,p.part_number,p.designacao,v_qty,coalesce(nullif(r->>'unidade_un',''),p.unidade_un),coalesce(r->>'localizacao',''),v_price,0,0,0,false,coalesce(r->>'observacao',''));
  END LOOP;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_inventory_with_items(jsonb,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_inventory_with_items(jsonb,jsonb,boolean) TO authenticated;
